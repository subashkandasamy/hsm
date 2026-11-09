# Local file server for hospitals ("Uyirly Box")

Written 9 Nov 2026. **Research and analysis only. Nothing here is built.**
It follows on from `docs/imaging-cloud-storage.md` and the radiology notes, and
changes one assumption in them (see section 9).

---

## 1. What the user asked for

- **Typed data stays in the cloud:** patients, visits, bills, lab values, pharmacy.
- **Every upload or image goes to a server inside the hospital:** scans,
  scanned papers, photos, consent forms and outside reports.
- **The hospital box keeps a copy of blood reports** too.
- **The box serves those files to the internet** (a doctor at home, the patient
  portal), not only inside the hospital.
- **Setup is one click on a PC the hospital already has**, "WSL kind of setup".

Why: hospitals like KMCH push back on cloud storage, and cloud storage cost
grows every year. That growth is almost entirely images. Typed records stay
small.

---

## 2. What already exists in the code (do not rebuild it)

The box is roughly half built already. It is called the **Connector**.

| Already built | Where |
|---|---|
| A native Windows program (single exe), installed by `install.cmd` and `install.ps1`, upgraded in place | `connector/`, `connector/build.mjs` |
| Starts at boot through a Windows scheduled task (`UyirlyLabConnector`), not WSL | `connector/build.mjs:476-583` |
| Pairs to a hospital with a one-time code from Settings | `connector/src/pair.ts` |
| Receives scanner images over DICOM (port 11112) and saves them to `ProgramData\Uyirly\Connector\dicom` | `connector/src/dicom/` |
| Disk guard: warns at 20 GB free, refuses at 5 GB | `connector/src/dicom/disk.ts` |
| **A scan viewer served by the box itself** (port 5152), with **HMAC-signed links that expire after 8 hours** | `connector/src/viewer/` |
| An offline-safe queue: writes to disk first, then uploads | `connector/src/queue.ts`, `uploader.ts` |
| Proven on real hardware at Karur (E-COM DROC X-ray console worklist) | radiology notes |

So the "box" already receives, stores, signs links and shows scans. What it
**cannot** do today:

1. **Be reached from outside the hospital.** The viewer opens only on the
   hospital network (`http://192.168.x.x:5152/...`).
2. **Take ordinary uploads.** Documents, IPD declarations, insurance papers and
   report images all go to Supabase Storage.
3. **Keep any copy of blood reports.** Lab PDFs are drawn on demand
   (`src/lib/pdf/LabReportPdf.tsx`) and never saved anywhere.
4. **Survive a disk failure.** There is one copy.
5. **Report its health to the admin.** The 15-second poll is the nearest thing
   to a heartbeat.

### Every place a file is uploaded today

| Upload | Screen | Server action | Supabase bucket |
|---|---|---|---|
| Patient documents (incl. camera photo) | `patients/[id]/_components/DocumentsTab.tsx` | `documents.ts` `getUploadUrl` | `documents` |
| IPD declaration / consent | `ipd/_components/UploadDeclarationModal.tsx` | `documents.ts` `getUploadUrl` | `documents` |
| Insurance claim papers | `insurance/[patientId]/[claimId]/_components/ClaimStepperView.tsx` | `documents.ts` `getUploadUrl` | `documents` |
| Radiology report image | `radiology/_components/ReportEntryModal.tsx` | `radiology.ts` (signed upload) | `radiology` |
| Scan images (DICOM) | from the scanner, no screen | connector C-STORE | **already local** |
| Hospital logo | `settings/profile/.../TenantProfileForm.tsx` | `tenantProfile.ts` | `tenant-logos` (public, **keep in cloud**) |
| Pharmacy invoice CSV | `pharmacy/receive/.../ImportInvoicePanel.tsx` | parsed, not stored | none |

All PHI uploads go through **two functions**: `getUploadUrl` (documents) and the
radiology signed upload. Rerouting those two covers every patient file. The
type and size rules already live in one place (`src/lib/upload/allowedFiles.ts`)
and can be reused by the box unchanged.

---

## 3. WSL: what the research found

WSL (Windows Subsystem for Linux) runs a real Linux in a light virtual machine
on Windows. It works, but on an already-running hospital PC it is the weakest
of the available options.

| Issue | Finding |
|---|---|
| **Needs virtualization switched on in BIOS** | The most common install failure (`0x80370102`). Many office PCs ship with it off. Turning it on means someone entering the BIOS, which cannot be done by a one-click installer. |
| **Does not start until someone signs in** | WSL is not launched by default until a user logs in. Starting it at boot through Task Scheduler gets mixed reports, because tasks run in "session zero"; people do it with an admin-account task, a delay and a retry. |
| **Shuts itself down when idle** | `vmIdleTimeout` in `.wslconfig` (default 60 s after the last process; `-1` = never; reported to work only on Windows 11). |
| **Networking** | By default WSL sits behind its own NAT. "Mirrored" mode, which lets the LAN reach it, needs **Windows 11 22H2+**, and there are open bugs (interfaces vanishing, the host failing to reach the service). |
| **Packaging is good** | A custom `.wsl` file (a tar of a prepared Linux) installs with one command, `wsl --install --from-file`, on WSL 2.4.8+. But installing as SYSTEM through deployment tools was reported to skip silently. |
| **Memory** | The WSL VM reserves a share of the PC's RAM, on a PC staff are also using for billing. |
| **Windows 10** | Many hospital PCs still run it. Support ended Oct 2025; consumer ESU now runs to 12 Oct 2027, and a hospital is normally a commercial customer, not a consumer. |

**Verdict:** WSL adds a virtual machine, a BIOS requirement and boot-time
fragility, all to run Linux software that **already has native Windows
versions**: our connector is a Windows exe, Cloudflare's tunnel runs as a
Windows service, and Orthanc ships a Windows installer. Use WSL only if we ever
need a Linux-only component. None is needed today.

---

## 4. Serving files to the internet: the options

All of these work with no open port and no public IP. That matters because
**Jio and Airtel home/SME lines are behind CGNAT** (no public IPv4). Airtel sells
a static IP for about ₹100–200/month; Jio only on business lines. Forum
sources only; confirm with the ISP.

| Option | What it is | Fit for patient files |
|---|---|---|
| **Cloudflare Tunnel** (`cloudflared`) | The box dials out to Cloudflare, which gives it a public HTTPS address. Has a Windows service with a single token install (`cloudflared service install <token>`, needs admin once). | **Good for small files and previews.** Two limits: **uploads over 100 MB are refused** on Free/Pro (error 413), and tunnel traffic on Free/Pro/Business falls under the CDN terms, which **restrict serving video and large files hosted outside Cloudflare**. Full CT studies through a free tunnel risk breaking those terms. |
| **Tailscale Funnel** | Similar public sharing from Tailscale | **No.** Tailscale's own docs warn against using Funnel for sensitive data, and its bandwidth limits are unpublished. |
| **Tailscale (private, not Funnel)** | A private network: only enrolled devices can reach the box | Good for **staff** (the doctor's phone or home laptop). Useless for the patient portal. |
| **Our own relay** (Pangolin, frp or rathole on a small Indian VPS) | Same idea as Cloudflare Tunnel, but we run the middle | No size limits or third-party terms, and data can stay in India. We pay the relay's bandwidth and run one more server. |
| **Peer-to-peer (WebRTC)** | The doctor's browser and the box connect directly, using the relay only to meet | The futuristic option: large files never pass through a relay we pay for. It falls back to a relay when direct connection fails, and is complex to build. |

### Recommendation

- **Phase 1:** Cloudflare Tunnel, remotely managed. Uyirly creates the tunnel and
  a hostname per hospital (`files-<slug>.uyirly.com`) through Cloudflare's API and
  sends the token to the box during pairing. Serve **only small files and
  previews** through it: documents, photos, report PDFs, key images.
- **Full scan studies from outside:** go through our own India relay, or later
  peer-to-peer. Decide after measuring real study sizes at Karur
  (`radiology_studies` still has zero rows).

---

## 5. Security: the rules that cannot bend

1. **No file is ever served without Uyirly's permission.** Every outside link is
   minted by Uyirly after its own access check, carries an expiry and is
   HMAC-signed. `connector/src/viewer/link.ts` already does exactly this; extend
   it from studies to all files. Use a **short expiry for outside links**
   (minutes, not the current 8-hour in-hospital link).
2. **Encrypt files on the box's disk.** A stolen PC, or a staff member browsing
   `ProgramData`, must see nothing readable. BitLocker exists only on Windows Pro,
   so the connector should encrypt its own files rather than rely on it.
3. **Never let the box delete on Uyirly's command** in v1 (same rule as
   `imaging-cloud-storage.md` section 6).
4. **Ransomware.** Hospital PCs get hit. The offsite copy must be one the box
   itself **cannot delete**: object lock / immutable retention on the backup bucket.
   rclone's "immutable" flag is client-side and protects nothing; only the
   bucket-level lock counts.
5. **Patch level.** Refuse, or warn loudly, on unpatched Windows 10.

---

## 6. The one-click setup: what "one click" can honestly cover

**Flow:**
1. Admin opens **Settings → Hospital file server → Set up this PC**.
2. Uyirly downloads an installer with a one-time pairing code built in.
3. The installer runs.
4. A green tick appears on the settings page.

**What the installer does by itself** (it already does the first three):

| Step | Status |
|---|---|
| Copy the connector and register the startup task | exists |
| Firewall rule for the hospital network | exists |
| Pair with the hospital using the one-time code | exists |
| **Pre-flight check**, reported in plain words: Windows version and patch level, free disk, RAM, whether it is a laptop on battery, sleep settings | new |
| **Set power plan to never sleep** while on mains power | new |
| **Install `cloudflared` as a Windows service** with the token Uyirly minted at pairing | new |
| **Choose the data folder on the biggest drive**, and offer a second drive or second PC as a mirror | new |
| **Send a heartbeat every minute** (disk free, last backup, tunnel up, version) to a status card in Settings | new |
| **Self-update**, so we do not visit each hospital | new; in-place upgrade already exists |

**What one click cannot do** (each needs a person, once):
- **Grant admin rights:** Windows asks once for the service install.
- **Plug in a UPS and a second disk:** hardware.
- **Get a better upload plan from the ISP**, if outside viewing is slow.

---

## 7. How the pieces fit once built

```
                      ┌──────────────── Cloud (Uyirly) ────────────────┐
  typed data ───────▶ │ patients, bills, lab values, pharmacy          │
                      │ + small preview / key image per scan (tier 1)  │
                      │ + mints signed links, checks every permission  │
                      └───────▲────────────────────────────┬───────────┘
                    heartbeat │ metadata                    │ signed link
                              │                             ▼
  ┌──────── Hospital ─────────┴──────┐         Doctor at home / patient portal
  │ Uyirly Box (connector)           │◀──── tunnel ────── (small files: direct;
  │  • scans from scanners (DICOM)   │                     full scans: relay)
  │  • uploaded docs and photos      │
  │  • copy of every lab report PDF  │──── encrypted, locked ───▶ offsite backup
  │  • nightly copy of the hospital's│                           (their or our
  │    own records                   │                            bucket)
  └───────────────▲──────────────────┘
       hospital network: opens instantly, works with the internet down
```

### Smart link (idea)
When someone clicks "open scan", Uyirly compares the visitor's public IP with
the box's public IP, which the box reports in its heartbeat.
- **Same IP:** the visitor is inside the hospital, so hand out the fast local
  link (`192.168.x.x`, a plain navigation, so Chrome's Local Network Access
  rule does not apply).
- **Different IP:** hand out the tunnel link.

Staff never choose, and hospital traffic never goes out to the internet and
back in.

### Uploads while the box is off
`getUploadUrl` checks the box's last heartbeat.
- **Box online:** upload straight to the box.
- **Box offline:** upload to Supabase as today, marked "move to box"; the
  connector pulls it later and deletes the cloud copy.

Nothing is lost, and no screen has to change.

### Copy of blood reports
When a lab result is authorised, the box renders and saves the PDF (the code
is already in `LabReportPdf.tsx`). A report is about 100–200 KB, so a few GB a
year. While the internet is down, staff can still print any finished report
from the box's local page.

### Nightly copy of the hospital's records
The box pulls an encrypted export of its own tenant's data every night. This
answers "our data must be in our building" while the cloud stays the main
system. A per-tenant export through our API is needed, not `pg_dump`, because
the database is shared.

---

## 8. Hardware: three tiers to sell

| Tier | What | Rough cost | When |
|---|---|---|---|
| **A. Existing PC** (what was asked for) | Connector + tunnel on a PC already in use | ₹0 + UPS | Small clinics, no CT. Pilot at KMCH. |
| **B. Uyirly Box** | A mini PC we pre-install and courier; the hospital plugs in power and network | ₹15–25k one-time | Hospitals that want it reliable; the easiest to support. |
| **C. NAS** (Synology or similar, two mirrored disks) | Storage appliance running our software in a container | ₹35–60k | Hospitals with CT/MRI. Mirroring built in. |

Tier A is the on-ramp; B and C remove "staff switched it off" and "disk died".

---

## 9. What this changes in earlier decisions

- `imaging-cloud-storage.md` chose **"hospital brings its own bucket"** for full
  studies (tier 2). The box makes **"hospital keeps full studies on its own
  disk"** the default instead. A bucket becomes the box's **offsite backup**
  rather than the primary store. Tier 1 (key images in our cloud) stays exactly
  as decided.
- The radiology notes' **"biggest risk: no second copy"** is answered by mirror +
  locked offsite backup, not by the box alone. A box with one disk is the
  same single copy in a nicer form.

---

## 10. What competitors do

- **MocDoc** markets itself as 100% cloud on Indian servers; no local server
  found.
- **Veracle** sells offline-only and hybrid versions that sync when the
  connection returns.
- **HealthPlix EMR** offers offline work with automatic sync.
- **Healthray and KareXpert:** nothing reliable found.

A hybrid "records in cloud, images in your building" offer is uncommon in this
market, and it answers both objections at once.

---

## 11. Futuristic ideas (not for v1)

- **Offline records:** a local copy of the hospital's records that keeps
  billing and OPD working with no internet, then syncs back. Sync engines exist
  for Supabase (PowerSync has a self-hosted edition; check its licence, which is
  FSL per its GitHub). Conflict handling for bills is the hard part. A large
  project.
- **Peer-to-peer scan delivery** (section 4): the doctor's browser pulls
  directly from the box, with no bandwidth bill.
- **Disk health prediction:** read SMART data and warn the admin weeks before
  a disk dies.
- **Two-PC mirror inside the hospital:** the connector on a second PC keeps a
  live copy, with no extra hardware purchase.
- **Local AI on the box:** OCR of scanned papers, handwriting-to-text, with
  nothing leaving the building.
- **Standard viewer:** Orthanc (open source, Windows installer, DICOMweb) with
  the OHIF or Stone viewer, if our own renderer stops being enough. Orthanc's
  Stone viewer is not CE-marked or FDA-approved; fine for viewing, not
  diagnosis claims.
- **MinIO is no longer an option** for local S3-style storage. Community
  edition binaries stopped in Oct 2025 and the repo was later archived.
  Alternatives: Garage, SeaweedFS, Ceph RGW. Probably unnecessary: the
  connector's own folder store is enough.

---

## 12. Open questions before building

1. **What does KMCH actually object to:** the yearly cost, or the data
   leaving the building? Cost → tier A is enough. Data location → add the
   nightly records copy.
2. **What PC would run it at KMCH:** Windows version, RAM, disk, does it get
   switched off at night? (The connector already runs on `192.168.1.106`.)
3. **KMCH's internet:** ISP, upload speed, CGNAT? This decides whether outside
   viewing of full scans is realistic at all.
4. **Who pays for the hardware** in tiers B and C: sold, rented, or bundled
   into a plan?
5. **Cloudflare terms:** confirm in writing whether serving key images and
   documents (not video) through a free tunnel is acceptable, or budget for a
   paid plan or our own relay.

---

## 13. Suggested phases (each needs its own go-ahead)

| Phase | What | Size |
|---|---|---|
| 1 | Heartbeat + status card in Settings; pre-flight checks; never-sleep power plan | small |
| 2 | Uploads go to the box (`getUploadUrl` + radiology), with cloud fallback and "move to box" | medium |
| 3 | Tunnel: Uyirly mints a per-hospital tunnel, box serves signed links from outside; smart link | medium |
| 4 | Lab report PDF copy on the box + offline print page | small |
| 5 | Mirror (second disk or second PC) + encrypted, locked offsite backup | medium |
| 6 | Nightly per-tenant records copy | medium |
| later | Full-scan delivery via own relay or peer-to-peer; offline records; Uyirly Box hardware | large |

Test every phase on the `demo` tenant first. Nothing touches KMCH without
explicit approval.

---

## 14. Built: internet access through Cloudflare (9 Nov 2026)

First slice, chosen by the user ("build with cloudflare first"). X-ray-first
hospitals make Cloudflare's 100 MB upload cap and large-file terms a non-issue.

- **Off by default, per computer; only an admin switches it on** (Settings →
  Devices → the computer's card). Confirm dialog says what it means.
- **Hostnames live on a separate domain** on a free Cloudflare account
  (`UYIRLY_FILES_DOMAIN`), because uyirly.com's DNS is at Vercel. Names are
  opaque (`c-<12 hex of connector id>`), so DNS does not list our customers.
- **Server:** `src/lib/cloudflare/tunnel.ts` creates a remotely managed tunnel,
  ingress `hostname → http://localhost:5152` (the signed-link viewer only) plus
  a 404 catch-all, and a proxied CNAME. Each step is saved before the next can
  fail. The run token is never stored; `GET /api/device/tunnel` fetches it
  from Cloudflare for the connector holding the right bearer token.
- **Heartbeat:** connector 1.0.8 calls `/api/device/ping` every minute with
  `x-connector-tunnel`; the server records `public_ip` and tunnel state and
  replies `internetAccess`. Switching on/off reaches the PC within a minute.
  Switching off deletes the DNS record, which shuts the door at Cloudflare at
  once whatever the PC is doing; revoking a computer does the same.
- **Smart link:** `src/lib/radiology/viewerRoute.ts`. Same public IP as the
  heartbeat means inside → local link (8 h). Otherwise, the tunnel when on,
  reported up and fresh (< 3 min) → `https://…` (1 h). Otherwise the old local
  link, so nothing changes for a hospital that has not switched it on.
- **Connector:** `connector/src/tunnel.ts` supervises cloudflared (token in
  `TUNNEL_TOKEN` env, never argv; health from `/ready` on 127.0.0.1:5153;
  restart with backoff; kills only its own stray copy on Windows).
  `cloudflared.exe` 2026.10.7 ships in the zip, SHA-256-checked at build time.
  Status page and `--check` show the link only when it is switched on.
- **Security fix in the same change:** `connectors` was readable and writable
  by every signed-in staff member (viewer_key, token_hash, pairing_code). It is
  now server-only (`0274`), all access via `src/app/actions/devices.ts` with a
  role check first.
- **Tests:** `npm run verify:tunnel` (31 checks, Cloudflare recorded, not
  called) and `connector/test/tunnel.test.ts` (fake cloudflared: token not on
  the command line, switch-off really stops it, missing, crash and restart).

**Order to ship:** apply `0273` (columns only) → push the code → apply `0274`
(lockdown; the old code would break under it). Then the four Vercel env vars
`CLOUDFLARE_API_TOKEN` (Account · Cloudflare Tunnel · Edit, Zone · DNS · Edit),
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `UYIRLY_FILES_DOMAIN`, then
publish connector 1.0.8.

**Not tested yet:** a real tunnel end to end. That needs the Cloudflare account,
and opening even a throwaway public tunnel from this machine was blocked.

---

## 15. Built: uploads kept on the hospital computer (9 Nov 2026)

User's scope: **patient-profile documents, IPD declaration uploads, radiology
report images.** Insurance papers and the logo stay in the cloud. Decisions:
upload **via the cloud, then moved** (a secure page cannot upload to a local
http address, and an upload must never fail because a PC is off); the portal
shows report images **only through the hospital computer** (no cloud copy).

- **Switch:** "Keep uploaded files on this computer", per connector, admin
  only, one per hospital (`connectors.keep_uploads`, unique per tenant).
  Off only stops new moves; files already there stay.
- **Ledger:** `local_files` (0275, server-only), keyed by the same storage path
  the records already hold, so no other table changed. waiting → on_computer
  (or failed, retried up to 10 times).
- **Move:** `queueForHospitalComputer` on save (documents.saveDocumentRecord,
  ipdDeclaration.attachSignedUpload, radiology.uploadReport). The heartbeat
  reply carries `keepUploads`; the connector GETs `/api/device/files` (signed
  download links), writes `.part` → fsync → rename → re-reads and hashes, then
  POSTs size + SHA-256. The server checks the size against the cloud object,
  marks on_computer **first**, then deletes the cloud copy.
- **Opening:** `hospitalFileLink` → `chooseFileRoute`: the internet link when
  it is up (pages can embed https), else the local link (staff: new tab, "on
  the hospital network"), else "cannot be reached right now". Portal and
  server-side PDF printing use only the internet link.
- **Drive:** connector 1.0.8 picks the local **fixed** drive with the most free
  space once (`<drive>:\Uyirly`), remembers it in config.json, locks the folder
  to SYSTEM + Administrators. Scans go there too; studies already in
  ProgramData still open. Removable/network drives are never chosen.
- **Never deletes:** nothing asks the computer to delete a kept file. A
  document deleted in Uyirly leaves its file on the computer.
- **Not yet:** encryption of kept files at rest; mirror/backup of the drive.
- **Re-pairing (1.0.9):** `install.ps1 -Repair` keeps the machine's own
  settings (chosen drive, serial cables, watched folders, DICOM port/AE). When
  the hospital address changes, results still waiting for the old hospital
  are moved to `ProgramData\Uyirly\Connector\set-aside\<old host>-<time>`
  with a README, never sent to the new one, and put back if pairing fails.

---

## Sources (checked 9 Nov 2026)

- WSL startup without login: [Prismatic on-prem agent guide](https://prismatic.io/docs/on-prem-agent-windows), [WSL discussion #14261](https://github.com/microsoft/WSL/discussions/14261), [ElevenForum thread](https://www.elevenforum.com/t/how-to-properly-start-wsl2-services-on-windows-startup.4275/)
- WSL networking: [Microsoft WSL networking docs](https://learn.microsoft.com/en-us/windows/wsl/networking), [WSL Sept 2023 update](https://devblogs.microsoft.com/commandline/windows-subsystem-for-linux-september-2023-update/), [issue #11034](https://github.com/microsoft/WSL/issues/11034), [issue #11002](https://github.com/microsoft/WSL/issues/11002)
- WSL packaging: [Build a custom distro](https://learn.microsoft.com/windows/wsl/build-custom-distro), [Canonical: new WSL format](https://ubuntu.com/blog/ubuntu-wsl-new-format-available), [WSL enterprise](https://learn.microsoft.com/en-us/Windows/wsl/enterprise), [PSADT forum report](https://discourse.psappdeploytoolkit.com/t/start-adtprocess-with-wsl-exe-install-from-file-returns-success-but-doesn-t-install-distro-in-intune-deployment/6607)
- WSL install errors: [Microsoft Q&A 0x80370102](https://learn.microsoft.com/en-us/answers/questions/1402834/wsl2-0x80370102), [WSL issue #7068](https://github.com/microsoft/WSL/issues/7068)
- Cloudflare: [Goodbye section 2.8](https://blog.cloudflare.com/updated-tos/), [Delivering videos with Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/), [Upload limits](https://fast.io/resources/cloudflare-upload-limit/), [cloudflared as a Windows service](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/tunnel-guide/local/as-a-service/windows/), [Remotely managed tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/remote-management)
- Tailscale Funnel: [official docs](https://tailscale.com/kb/1223/funnel), [SSD Nodes on limits](https://www.ssdnodes.com/learn/tailscale-funnel-limits-and-ports)
- Self-hosted tunnels: [Pangolin vs Cloudflare](https://pangolin.net/news/pangolin-v-cloudflare), [Pinggy alternatives list](https://pinggy.io/blog/best_cloudflare_tunnel_alternatives/), [ossalt Pangolin guide](https://ossalt.com/guides/pangolin-self-hosted-tunnel-platform-2026)
- MinIO: [It's FOSS](https://itsfoss.com/news/minio-moves-away-from-open-source/), [InfoQ](https://infoq.com/news/2025/12/minio-s3-api-alternatives/), [MinIO CE in 2026](https://glukhov.org/data-infrastructure/object-storage/minio-dead/)
- Orthanc: [Windows quick start](https://orthanc.uclouvain.be/hg/orthanc-book/file/default/Sphinx/source/users/quick-start-windows.rst), [Stone Web Viewer](https://book.orthanc-server.com/plugins/stone-webviewer.html)
- Windows 10 ESU: [Help Net Security, 26 Jun 2026](https://www.helpnetsecurity.com/2026/06/26/microsoft-windows-10-free-security-updates-esu-program/), [TechRepublic ESU cheat sheet](https://www.techrepublic.com/article/news-windows-10-esu-cheat-sheet/)
- India ISPs and CGNAT (forum-grade): [TechEnclave Jio port forwarding](https://techenclave.com/t/help-required-port-forwarding-from-jio-fibre/264272), [TelecomTalk BSNL static IP](https://telecomtalk.info/bsnl-to-offer-static-ip-on-request-with-broadband-plans/61282/)
- Offline sync: [PowerSync + Supabase](https://powersync.com/blog/offline-first-apps-made-simple-supabase-powersync), [PowerSync GitHub](https://github.com/powersync-ja)
- Competitors: [MocDoc cloud page](https://mocdoc.com/india/tn/cloud-hospital-software-kanyakumari), [Veracle](https://veracle.com/?p=1772), [HealthPlix offline](https://healthcare-digital.com/digital-healthcare/healthplixs-emr-offline-capability-to-help-doctors-in-india)
- Immutable backups: [Retrospect B2 object lock guide](https://www.retrospect.com/support/kb/immutable_backups_on_backblaze_b2), [restic forum: B2 + object lock](https://forum.restic.net/t/anyone-using-restic-with-b2-backblaze-and-object-locks/4277), [StackHarbor rclone](https://stackharbor.com/en/knowledge-base/rclone-offsite-backup/)
