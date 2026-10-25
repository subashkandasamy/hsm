# Connecting a hospital's analyzers

Written 24 Oct 2026, from a site visit to a hospital in Karur whose machines are
photographed below in spirit if not in file. Every specification here was checked
against the manufacturer's own brochure, not a distributor's listing, except
where the table says otherwise.

Keep this current. The next hospital will have six different machines and the
only thing that transfers is the method.

---

## 1. What we found, and why it is the normal case

Eleven instruments. **None of them connected to anything.** Each sits on a bench
with a power lead, prints to its own paper roll, and a technician retypes the
numbers into whatever system the hospital uses.

This is not a backward hospital. It is the ordinary condition of a small Indian
laboratory, because nothing has ever asked these machines for their data. The
ports are on the back and have never been used.

Two consequences worth holding on to:

- **There is no wiring to inherit and no PC in the lab.** Cabling is part of the
  job, not a precondition somebody else has met.
- **The machines are already capable.** We are not asking anyone to buy an
  instrument. Every one of these can transmit; it has simply never been asked.

---

## 2. The instruments, verified

| Instrument | What it does | Data ports | LIS protocol | Source |
|---|---|---|---|---|
| **Erba H360** | Haematology, **3-part** diff | **4 USB + 1 LAN**. No RS-232 | **HL7 over TCP/IP** | [brochure](https://product.erbamannheim.com/upload/docs/1019059489-H%20360%204%20page%20Brochure%20(05-2019).pdf), [Erba India](https://erba.velocitabrandconsultants.com/product/by-product-segment/hematology/h-360/) |
| **Boditech iChroma II** | Immunoassay (TSH, troponin, HbA1c, CRP) | USB + **Ethernet** + SD. **Wi-Fi/Bluetooth dongle optional** | "LIS/HIS compatible", protocol unstated | [spec sheet](https://ethitech.co.za/wp-content/uploads/2019/05/iChroma-II.pdf) |
| **Erba ECL 105** | Coagulation — PT/INR, APTT, D-dimer | **RJ45 Ethernet**, COM (DB9), USB A + B — *back panel photographed 24 Oct 2026* | Bidirectional TCP/IP & RS-232 | [spec](https://product.erbamannheim.com/upload/docs/1408391036-Erba%20ECL%20105%20_%20V02.pdf) + the unit itself |
| **Erba Chem 5x** | Semi-auto biochemistry | `PC` = **USB-B**, EXT PRINTER (USB-A), EXT K/B (PS/2). **No DB9 on the unit** | Bidirectional LIS, almost certainly over a USB-to-serial bridge | [Erba India](https://erba.velocitabrandconsultants.com/product/clinical-chemistry/chem-5x-semi-automated-clinical-chemistry-analyzer/) + the unit itself |
| **Erba Laura Smart** | Urine strips | `HOST` = **DB9**, USB-B, `BCR` = **2 × USB-A** for barcode readers | LIS/HIS | [Erba](https://www.erbalachema.com/en/products-and-solutions/urine-analysis/urine-analyzer-laura-smart/) + the unit itself |
| **Aspen BG Plus** | Blood gas + electrolytes, cartridge | **RJ45 Ethernet**, DB9, 4 × USB-A — *back panel photographed 24 Oct 2026* | Not stated anywhere; the ports exist | the unit itself |
| **Electrolyte analyzer** | Na, K, iCa, pH, HCO₃, Cl | Unknown | Unknown | — |
| **Bionet CardioTouch 3000** | 12-channel ECG, **movable** | **RJ45 confirmed on the unit**, USB, Wi-Fi optional | BMS-Plus → JPEG/BMP/XML/**PDF**. Has a **`NETWORK` button on the front panel** and lists a barcode reader — built to push somewhere, so better than a watched folder may suggest | [Bionet](https://bionetus.com/medical/ecg-spirometer/cardiotouch-3000-12-channel-electrocardiograph/) + the unit itself |
| **ADONIS + ECORAD/DROP/MediLite** | X-ray generator + DR panel PC | PC on a network | **DICOM — confirmed working 24 Oct 2026.** The console is `DROCConfig`; worklist settings are under Networks → Worklist | site visit |
| **RMS Helios** | Spirometry (PFT) | Windows PC | PDF export | — |
| **RMS TMT** | Treadmill test | Windows PC | PDF export | — |

### Notes that cost us time to learn

**The electrolyte analyzer is badged Chem-leon.** The service sticker reads
"Serviced & maintained by Chem-leon Diagnostics Pvt. Ltd.", which looked like
a service company obscuring a manufacturer — but **the instrument's own display
says `Chem-leon`** above `Ready for Analysis / Na K iCa pH HCO3 Cl`. They brand
the firmware, so they are a rebrander, not merely a maintainer. The OEM behind
it is still unknown, and the sticker's own *Instrument Model* and *Instrument
Serial Number* fields are **both blank**.

Two phone routes, both photographed in the laboratory and faster than any
search:

- **Chem-leon Diagnostics** — +91 8098103833, serviceatcdpl@gmail.com
- **Shamruthi Diagnosticss**, Karur — the local stockist, carrying Transasia,
  Chemleon, Arkray among others — 98421 57774

**It has no data ports at all** — checked at the hospital on 25 Oct 2026.
No DB9, no USB, no LAN. These ISE analyzers are near-universally RS-232, and
this one is the exception. **It cannot be connected and should not be promised
to anybody.** It stays a paper instrument.

**But the same results have another way in.** The Aspen BG Plus measures the
identical panel — Na, K, iCa, pH, HCO₃, Cl — and it has both RJ45 and DB9. So
electrolytes are not blocked by this machine; they are blocked only if the
laboratory insists on running them *here*. **Ask the technologist which machine
they actually run a Na/K order on.** If the answer is "either", connect the
Aspen and the Chem-leon stops mattering.

That question is worth asking at every hospital. An instrument that cannot
talk is only a problem when nothing else in the building measures the same
thing, and a laboratory usually has more overlap than its equipment list
suggests.

**~~The Aspen BG Plus may have no LIS output at all.~~ Wrong, and a good lesson.**
Every online listing showed USB and nothing else, so this note said the machine
might have no way out. The back panel has an **RJ45 socket and a DB9** beside
the USB ports. A distributor's listing is an advertisement, not a specification,
and **the only reliable source for what a machine can do is the back of the
machine.** Photograph it before writing anything down.

**Four back panels, four corrections.** Every one of these instruments differed
from what the paperwork implied:

- **ECL 105** — has Ethernet. An earlier reading of this table assumed its
  "TCP/IP" claim was unreachable because the ports column listed only RS-232.
  It was the ports column that was wrong.
- **Chem 5x** — has no DB9 at all. Its LIS port is `PC`, a USB-B socket, which
  on this class of instrument is a USB-to-serial bridge: it should appear on
  Windows as an ordinary COM port over a plain USB printer cable, with no
  adapter and no null modem. Confirm with `--ports` before and after plugging
  it in.
- **Laura Smart** — `HOST` is a true DB9, and it has **two `BCR` ports** for
  barcode readers, so it can read our tube labels directly.
- **Aspen BG Plus** — above.

**So only one instrument in this laboratory actually needs RS-232 hardware**,
the Laura Smart, and two more can be reached with the cable already in the
building. The serial-to-Ethernet device server is a smaller purchase than §Phase 2
assumed, and less urgent.

**The H360's only data port is the LAN port.** This was counter-intuitive — a
machine of this class would historically be serial — and it is the single most
useful fact in this document. See §4.

---

## 3. What our connector can do today

`connector/` is a program the hospital runs on one of its own PCs. It is built
and published (**v1.0.7**). The architecture that matters:

```
analyzer → handshake → DISK → uploader → Uyirly
                        ▲
                  before anything is sent
```

A result is written to disk the moment it is complete and **before** any network
attempt, because an analyzer transmits once and forgets. Everything after the
disk write is retry logic and can fail safely.

| Transport | State | Notes |
|---|---|---|
| **TCP** (port 5150) | Works | Several analyzers concurrently, one link per connection, records never interleaved |
| **MLLP** (HL7 framing) | Works, added 24 Oct 2026 | `<VT> message <FS><CR>`, released on the end marker, HL7 `MSA\|AA` sent back |
| **Serial (RS-232)** | **Ships** since v1.0.2 | `serialport` is a native module and cannot be baked into a single file, so it travels *beside* the exe and the installer copies it. One COM port per machine, added with `--add-serial COM3 --baud 9600` |
| **Watched folder** | Works | Waits until a file stops growing |
| **DICOM** | Works, **proved on real hardware 24 Oct 2026** | C-STORE, C-FIND worklist, C-ECHO. See §4 Phase 4 for the three things only a real console revealed |

Server side: raw stored before parsing, idempotent by message hash, tenant from
the connector token. Analyzers move `discovered → quarantine → live → paused`.

**ASTM and HL7 are both parsed** as of 24 Oct 2026. `npm run verify:hl7` checks
the parser against a realistic H360 message and the ways a real instrument
misbehaves; pass it a captured file to inspect a new machine's traffic.

**The device library holds exactly one machine**, a Mindray BC-5130, and it is
not yet verified against a real unit. The H360's vocabulary was mapped by hand
against a real transmission on 24 Oct 2026 and should be promoted into the
library so the second hospital with one configures nothing.

### Where each of this hospital's machines stands

One connector on one PC serves all of these at once — different protocols and
different transports do not conflict.

| Machine | Route | State |
|---|---|---|
| Erba H360 | LAN, HL7/MLLP → 5150 | **Proved on the real instrument, 24 Oct 2026** |
| ADONIS / DROC | DICOM → 11112 | **Worklist proved on the real console, 24 Oct 2026** |
| Erba ECL 105 | **Ethernet** → 5150 | Cable reaches it today. Next to test |
| Aspen BG Plus | **Ethernet** → 5150 | Cable reaches it today. Protocol unknown |
| Erba Chem 5x | USB-B `PC` → likely a COM port | Plain USB printer cable, no adapter. Confirm with `--ports` |
| Erba Laura Smart | **True RS-232** (`HOST` DB9) | The only instrument here needing an adapter and a null modem |
| Chem-leon electrolyte | **None — no data ports at all** | Cannot be connected. The Aspen BG Plus measures the same panel; route electrolytes through it |
| Boditech iChroma II | Ethernet | Has the port and an IP screen, but the destination is not on it — see below |
| Bionet CardioTouch 3000 | LAN/USB | Exports PDF/XML, not a result stream → watched folder |
| RMS Helios, RMS TMT | Windows PC | PDF → watched folder |

**The catch was thought to be serial ports; it is not.** Only the Laura Smart
needs an adapter and a null modem cable. The rest are reachable with a network
cable or a USB cable that costs nothing.

### On the iChroma II

Its *Communication* menu offers PC, Bluetooth, Ethernet, WIFI and Online. The
**Ethernet** screen sets only the analyzer's own address — DHCP or manual IP,
netmask, DNS, gateway — and has an *Ethernet Test* button. **There is no host
address on it.** The destination is most likely under *PC*; that screen has not
been photographed yet.

Two further things from the manual (OPM-IR2-EN Rev.08): across 60 pages there
is no host IP field, no port and no protocol named, and results are sent
**when an operator selects them and taps send**, not automatically. The second
point changes the workflow — a failed send is visible to a person standing
there, which makes this the one instrument where Wi-Fi is reasonably safe.

---

## 4. The plan

Ordered by what unblocks the most for the least work, which is not the order
anyone expects.

### Phase 1 — HL7 ingest *(no hardware)* — **done 24 Oct 2026**

The H360 is the highest-volume instrument in the building and its only data port
is Ethernet speaking HL7 over TCP/IP. It needs a network cable and nothing else.
What blocked it was our parser.

- `src/lib/lab/hl7.ts` parses ORU^R01: MSH, PID, OBR, SPM, OBX.
- The instrument is identified from MSH-3 and MSH-4, the same fingerprint shape
  ASTM produces, so one device library serves both protocols.
- Everything downstream — mapping, quarantine, idempotency, sample matching —
  is unchanged and shared.
- `connector/src/astm-link.ts` gained MLLP framing (below).
- Replay already exists per message (`retryMessage`, from Settings → Analyzers),
  which is what would have rescued any HL7 stored before the parser landed.
  There are none to rescue: `analyzer_messages` is empty, because no analyzer
  has ever connected.

**Three things learned the hard way, worth keeping:**

1. **MSH is numbered differently from every other segment.** MSH-1 *is* the
   field separator, so after splitting, MSH-3 is index 2 while PID-5 is index 5.
   Reading MSH-3 as index 3 returns the receiver instead of the sender and looks
   like it works. There is a test for this.

2. **Haematology analyzers send histograms as OBX segments**, typed `NA` or
   `ED`. They are waveform payloads, not measurements. Treating them as results
   fills a patient's report with hundreds of numbers, and on a real H360 it
   would happen on the very first sample.

3. **MLLP framing is not optional.** Without it an HL7 stream falls through to
   the unframed path, where nothing marks where a message ends — so it is only
   released on the 15-second idle timeout, and two samples sent inside that
   window are **concatenated into one message**. Two patients' results in one
   envelope is the worst thing the link layer could do, and it is the reason
   that class exists. Fixed, with tests.

**On acknowledgements:** the H360's own *Communication Acknowledgement* setting
is normally turned **off**, because it cannot read a standard HL7 ACK. We send
`MSA|AA` regardless — an instrument that cannot read it ignores it, and an
instrument waiting for one that never comes stalls.

### Phase 2 — the serial machines

**Revised 24 Oct 2026, after photographing the back panels.** This section was
written believing four instruments were RS-232. One is: the **Laura Smart**.
The **ECL 105** and the **Aspen BG Plus** have Ethernet, the **Chem 5x** has a
USB-B `PC` port rather than a DB9, and the electrolyte analyzer is still
unidentified. See §2.

That reorders the work. The cable already in the building reaches two more
instruments, and the device server below is a convenience rather than a
prerequisite. Two ways in, and they are not exclusive:

**(a) A serial-to-Ethernet device server.** One box, 4–8 serial ports in, one
network port out, each port opening a TCP connection to the connector. It makes
serial machines arrive through the door that already works, survives a knocked
cable, and does not care that Windows renumbers COM ports after a reboot.
≈ ₹3,000–15,000 per lab.

**(b) Ship the native serial module alongside the exe.** Removes the hardware
dependency for the hospital that will not buy a box. More packaging work and a
larger installer.

**(b) shipped in v1.0.2** — the serial driver travels beside the exe and the
installer copies it, so no hospital is blocked on buying a box. **(a) is still
the recommendation for this hospital**: four adapters on one PC is four cables
to knock and four COM numbers Windows may reshuffle on a reboot, where a device
server makes all four arrive through the TCP door that is already proved.

### Phase 3 — the device library

**Mapping made survivable, 24 Oct 2026.** A new haematology analyzer arrives
with two dozen unknown codes at once, and answering each from a dropdown — in a
laboratory, on a computer that is not yours — is how a five minute job becomes
an afternoon and a mis-click. Each row now opens with a guess already in the
box, labelled with how sure it is, and one button confirms every code the
machine and the catalogue spell identically.

The line it does not cross: **only identical codes are offered in bulk.** An
alias (HB, TLC, PCV) is shown and still agreed to one at a time, because "CA"
is calcium on an electrolyte analyzer and a tumour marker on an immunoassay,
and only the person beside the machine knows which sent it. Nothing is ever
written without somebody pressing Confirm.

`npm run verify:analyte-suggestions`. Against a real H360 vocabulary: 9 codes,
5 exact and bulk-confirmable, 3 flagged as guesses, 1 left alone.

Each instrument needs its codes mapped to our analytes once, globally. The second
hospital with an H360 then configures nothing.

This does **not** require being on site. The connector stores raw messages before
parsing, so the sequence is:

1. Connect, let it collect for a week. Results sit in quarantine. The hospital
   keeps working on paper.
2. Build the mapping from that traffic, remotely.
3. Switch to live.

### Phase 4 — radiology

If the DR panel software speaks DICOM, this works today with no new code: point
it at the connector's DICOM port. Confirm first, because it may be the cheapest
win in the building.

**Proved 24 Oct 2026, not assumed.** The claim had been made twice before
anybody checked it. `connector/test/dicom-worklist.test.ts` stands up the real
server and queries it with a real DICOM client: C-ECHO answered, the full
worklist returned, a CT console correctly not shown the X-ray list, an empty
list returned as a success rather than a failure (a machine that gets an error
here often stops asking until somebody restarts it), and every field a console
writes into the image present — accession, hospital number, name, sex, date of
birth, and the modality and start time **inside the scheduled step sequence**,
which is where a console reads them. Putting those at the top level instead
shows an empty worklist on the machine while the query itself looks successful.

It also turned up that `associationReleaseRequested` was not implemented, so
the library logged an ERROR every time a machine hung up — which, for a
department polling the worklist every few seconds, is a log full of errors
produced by nothing going wrong. Fixed.

**Images proved too** (`connector/test/dicom-store.test.ts`). Four images across
two series, each sent on its own association the way a scanner sends them,
arrive as **one study** — not four. That is the property that matters: a
connector that counted them separately would give the hospital forty entries for
one chest X-ray and nothing would match the order. The study is reported with
its accession number, instance count, both series and their descriptions, the
sending machine's AE title and model, and the disk it occupies.

It also demonstrates the gap in §6: the images are on the connector's disk and
**only the description travels**. That is the design, and it is the thing with
no second copy.

**Proved against the hospital's own X-ray console, 24 Oct 2026.** An E-COM
DROC console queried the connector and the worklist came back with both
patients — correct names, UHIDs and accession numbers. Three defects showed
themselves that every test had passed over:

1. **Modality is not a top-level key in a worklist query.** It lives inside
   `ScheduledProcedureStepSequence`. We read the top level, found nothing, and
   treated every query as unfiltered — so the X-ray console was handed an
   obstetric ultrasound two rows above the chest it was waiting for.
2. **The console's grid reads `StudyDescription`, `StudyDate` and `StudyTime`
   from the top level**, not from the scheduled step. With only the copies
   inside the step it listed two patients and no examination: the technologist
   could see who, but had to go back to the paper slip to learn which scan.
   Send both.
3. **It queries by several things in turn, its own AE title among them** —
   "all worklist items assigned to this modality: DROC". Once the filter
   actually worked, taking that literally would have emptied the department's
   list behind a screen that looks like it is working. An unrecognised code is
   a misunderstanding, not a filter, and must hide nobody.

**Why the test suite missed all three:** it sent `Modality` in *both* places at
once, asking more politely than any real console does. A test that is gentler
than the world verifies nothing. It now queries the way DROC does and fails
without the fix.

**Two things worth knowing on the next site visit:**

- **`Verify Connection` writes a log file** (`Diagnosis_Worklist<date>.log`)
  that echoes back the IP, port and both AE titles it actually used. Read that
  before anything else — it caught a `192.168.2.106` where only the third octet
  was wrong, which had been invisible on the settings screen.
- **The connector has no heartbeat.** `connectors.last_seen_at` moves only when
  it uploads a result, uploads a study, or answers a worklist query, so a stale
  timestamp is positive proof that no query arrived. It was how we established
  the console was never reaching us at all.

A machine now appears in Uyirly the moment it *asks* for its worklist, rather
than when it first sends an image — the query is the earliest proof it can
reach us, and an installation is exactly when somebody wants to know.

### Phase 5 — the PC-based and movable devices

Spirometry, TMT and ECG produce PDFs rather than results. Watched folder, filed
against the patient as a document. The ECG is movable and speaks its own
protocol, so it is last and may never be more than a PDF.

### Phase 6 — lab host query

Showing the patient's name and ordered tests on the analyzer. See §5 for why
this is later than it sounds: the barcode already solves the half that affects
patient safety, and this is the half that saves a technician reading a screen.

---

---

## 4b. How this is done elsewhere, and what it tells us

Researched 24 Oct 2026, because it is worth knowing whether we are solving a
solved problem badly.

**The standard shape is middleware on a PC in the lab.** A program sits between
the instruments and the information system, speaks ASTM or HL7 down to the
machines over RS-232 or TCP, and whatever the system wants upwards. That is
exactly what `connector/` is. Nothing about our architecture is unusual; the
disk-before-send rule is the part worth defending.

**Per-instrument support is a library, not a protocol.** ASTM and HL7 say how
bytes are arranged, not what `GRAN%` means or which field holds the barcode.
Every vendor deviates. So the work is one mapping per model, accumulated — which
is why `device_library` is global and keyed on the instrument's self-declared
identity, and why the second hospital with an H360 should configure nothing.

**Indian competitors advertise 330+ analyzers.** That is the bar for a mature
LIS here, and it is a bar made of years of captured traffic, not of cleverness.
It also tells us the sales claim to avoid: we have one verified instrument.

**Offline-first is a selling point here, not an edge case.** At least one Indian
LIS leads with the lab continuing to work with no internet and syncing later.
Our connector already behaves this way for results; the application does not.

**The barcode is how results find patients everywhere.** Nobody relies on the
analyzer's own running sample number. Confirmation that §5's conclusion is the
ordinary one.

### On the H360 specifically

A published open-source gateway built for this exact instrument reports:

- it sends **HL7 over MLLP/TCP**, so the framing is `<VT> message <FS><CR>`;
- the **sample barcode is in OBR-3**, which is what our parser prefers;
- in the analyzer's LIS menu you set **host IP and port**, confirm the protocol
  is HL7 (TCP/IP), and turn **Communication Acknowledgement off** — the H360
  cannot read a standard ACK;
- the gateway sends `MSA|AA` anyway, to stop the instrument stalling.

Every one of those matches what we have now built, which is the most reassuring
thing in this document. Source:
[lims-instrument-gateway](https://github.com/AdityaKalmekh/lims-instrument-gateway).

---

## 5. Patient details — getting them *to* the machine

Everything above is about results coming back. The other direction matters just
as much, and the two halves are at completely different stages.

### Radiology: already built

The connector answers a scanner's **DICOM Modality Worklist** query (C-FIND)
from `GET /api/device/radiology/worklist`, which serves pending radiology orders
with the patient's name, UHID, date of birth, sex and the accession number.

This is the single most valuable thing in radiology integration and it has
nothing to do with images. Today a technologist types the patient's name and
hospital number into the console by hand, and a typo files the study against the
wrong patient — the most dangerous routine error in a radiology department, and
one nobody catches until somebody reads the wrong chest. With a worklist the
names appear on the machine and they pick from the list, so every image is born
carrying the right identifiers.

**Confirm the DR software supports MWL** — on this hospital's X-ray PC that means
asking whether ECORAD or MediLite has worklist settings. If it does, this works
with no new code.

### Lab: not built, and only half needed

There is no equivalent lab endpoint. `/api/device/lab/` has `results` and
nothing else. But the lab problem decomposes into two separate things that are
usually confused:

**(a) Matching the result to the right patient.** Solved by the barcode alone.
Our tube labels already carry the accession number as Code 128. An analyzer with
a barcode reader reads it off the tube, puts it in the message, and the result
lands on the right order with no conversation at all. **This needs nothing new.**

For an analyzer without a reader, the technician types our accession number into
the machine as the sample id. Tedious but reliable, and far less error-prone
than typing the results themselves. Worth knowing which of this hospital's
instruments have a reader — the Laura Smart has a barcode port, and the Aspen BG
Plus lists a barcode scanner as an input device.

**(b) Showing the patient's name and the ordered tests on the machine.** This is
what needs host query, and it is a convenience rather than a correctness
requirement. The analyzer reads the tube, asks "what am I running for
2610240017?", and the LIS answers with the name and the test list.

If we build it, it mirrors radiology exactly:

```
GET /api/device/lab/worklist   →  connector caches it  →  answers the analyzer
```

**The cache is the point, not an optimisation.** An analyzer gives the host a
few seconds to answer a query before giving up; a round trip to our servers over
a hospital's broadband will sometimes miss that window. The connector must hold
the pending worklist locally and answer from memory, refreshing in the
background — the same shape as radiology, and for the same reason the result
path writes to disk first.

**Priority: after results flow.** Bidirectional ordering is worth nothing until
one-way delivery is reliable, and the barcode already solves the half that
affects patient safety.

---

## 6. Not losing anything, and backups

### What already protects a result

| Where | What it does |
|---|---|
| **Connector queue** | One file per unsent message, written to disk **before** any network attempt. Survives a power cut, a broadband outage, a crashed uploader. Deliberately one JSON file each rather than a database, so a bad night is recoverable with a text editor. |
| **Raw before parsed** | The server stores the message before anything tries to understand it. A parser bug loses a debugging trail, not a patient's result — and the message can be replayed once fixed. |
| **Idempotent by hash** | Analyzers retransmit freely — on a timeout, on a reconnect, when a technician presses send again. A duplicate is a no-op, never a second result. |
| **Delivery means acknowledged** | A message is only removed from the queue when the server says it has it. |
| **Database** | Supabase managed Postgres, `ap-south-1`. |

**First real traffic, 24 Oct 2026.** `analyzer_messages` holds its first stored
message: a complete CBC from the hospital's own H360, caught while the lab PC
had no internet, held on disk, and uploaded when the line came back. The whole
chain has now been exercised once, end to end, on real hardware — install,
pair, receive offline, upload, map 24 unknown codes, and check every value
against the analyzer's own screen.

Once, on one instrument. That is the honest claim: the mechanism is proved, the
*library* is not. Say it that way to a hospital.

### The three gaps

**1. ~~Nothing tells anyone an analyzer went quiet.~~ Done 24 Oct 2026.** A bar
on the laboratory worklist names any `live` analyzer that has sent nothing for
four hours — on the worklist rather than in settings, because it is a message
for whoever is running the bench and nobody opens settings until something has
already gone wrong. It says what to do about it, too: anything measured while
the link was down is in the machine's own memory and must be sent again.

Silent outside 08:00–21:00 IST. A lab that closes at eight has every analyzer
quiet by midnight, and a warning that is always on is a warning nobody reads.

The rule lives in `src/lib/lab/silent.ts`, apart from the query, so it can be
tested without a hospital or a clock: `npm run verify:lab-alerts`.

**2. DICOM images never leave the lab PC.** The connector sends the study's
details to the server and tells the hospital *"the images are on this computer
and nothing is lost"*. That is true until that computer's disk fails. There is no
second copy anywhere. A hospital that loses that PC loses its images, and the
report that quotes them will outlive them.

**3. Database backup policy is unconfirmed.** Supabase takes managed backups, but
what retention and whether point-in-time recovery is enabled depends on the
project's plan. **Check it in the dashboard and write the answer here** — "we have
backups" is not a sentence anybody should say about a hospital's data without
knowing the retention.

### What a hospital should be told

Be specific rather than reassuring. A small hospital asking "is my data safe?"
is really asking three questions, and they have different answers:

- *If the internet drops?* Nothing is lost. The connector holds results on its
  own disk and sends them when the line returns.
- *If the lab PC dies?* Lab results already delivered are safe on our servers.
  **Radiology images on that PC are not** — until gap 2 is closed.
- *If your servers die?* Managed Postgres backups — with the retention confirmed
  in gap 3, not assumed.

## 7. Wiring, and the wireless question

The lab is small, some instruments live outside it, and the ECG moves. Cable runs
would be ugly and partly impossible.

**Wireless is viable, with one caveat that matters more than the convenience.**

- **Serial-to-Wi-Fi bridges** (Elfin-EW11, USR-W610 class, ≈ ₹1,500–3,000) turn
  any RS-232 machine into a Wi-Fi TCP client. Matchbox-sized, 5V power.
- **The iChroma II has a manufacturer Wi-Fi dongle**, which is a supported route
  rather than a third-party one.
- With bridges, **the connector PC need not be in the lab at all** — reception or
  the billing PC will do.

**The caveat.** Our disk-first guarantee begins only when the message *reaches*
the connector. If a Wi-Fi link is down at the moment an analyzer transmits, the
result is gone — recoverable from the instrument's own memory, but only if
somebody notices. We record `last_message_at` and show it on a settings page.
**We do not alert.**

> Over a cable that is a nice-to-have. Over Wi-Fi it is essential, and it should
> ship before the first wireless hospital goes live.

**Non-negotiable either way:** the connector PC needs a static or reserved IP.
Analyzers store that address in their keypads, and a DHCP change on a Sunday
stops everything silently.

---

## 8. What to collect on the next visit

1. **Photograph every back panel.** It answers more than any datasheet — and
   on 24 Oct 2026 it corrected *four* instruments at once, in both directions:
   two machines had Ethernet that no listing mentioned, and one had no serial
   port at all where the paperwork promised one. Do this before planning
   anything or buying anything.
2. **Find the LIS menu** on each — *Setup → Communication / Host / LIS*. A machine
   can have a serial socket that is only for service. Note the baud rate.
3. **Capture an hour of traffic** with a laptop and a ₹500 USB-to-serial adapter:

   ```
   uyirly-connector --capture                          # network machines
   uyirly-connector --capture --serial COM3 --baud 9600
   ```

   Needs no account and uploads nothing. Every message is saved to its own file;
   bring the files home and run `npm run verify:hl7 <file>` to see what the
   machine actually said. That turns unknown instruments into library entries
   and the rest can be done remotely.
4. ~~Identify the electrolyte analyzer.~~ **Done, and the answer was "no ports
   at all".** Which is worth knowing as a possible outcome: ask early whether
   another instrument in the building measures the same analytes, because that
   is the thing that decides whether a dead end matters.
5. ~~Ask whether the DR software has DICOM settings.~~ **Answered: DROCConfig →
   Networks → Worklist.** Photograph the tab before changing it, and read the
   `Diagnosis_Worklist` log after pressing Verify Connection.
6. **Daily volume per machine**, which decides everything about order.

---

## 9. What not to promise

Analyzer connectivity should stay off the pricing page until several machines are
in the library and verified. One hospital fully connected is worth more as a
reference than five half-wired ones, and a hospital that bought on a promise will
be waiting while we do unpaid integration engineering.

What is sellable to a lab like this one today, with no cable at all: barcoded
samples, a worklist, verified results, PDF reports, portal delivery. The typing
stays; everything around it improves.
