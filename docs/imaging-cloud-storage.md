# Cloud storage for scan images, and who pays for it

Written 29 Oct 2026. **Analysis only — nothing here is built.** Supersedes the
economics paragraph in the radiology notes of 25 Sep 2026, which reached the
opposite conclusion on two points and said so with more confidence than it had.

Every price below came from a vendor or reseller page on 29 Oct 2026. They
contradict each other, sometimes within one site. Treat them as a shortlist, not
a quote, and get the two finalists in writing.

---

## 1. The problem this exists to solve

A 100-bed hospital generates roughly 5 GB of imaging a day — about 1.8 TB a year.
By year three, storing that costs more per month than the ₹7,999 plan the
hospital is paying. **Unlimited cloud imaging destroys flat pricing**, and no
amount of provider shopping fixes it, because the cost grows and the price does
not.

A second, separate problem: today the connector PC's disk is the only copy of
anything. If it dies the images are gone, because the scanner console deletes as
it fills. Cloud storage is the fix for that, which means it cannot be purely a
paid add-on — a hospital on the cheapest plan would have no second copy at all,
and that is a data-loss story with our name on it.

---

## 2. The decision: the hospital brings its own bucket

The hospital picks a provider, pays that provider directly, and we read and write
against it. This reverses the September conclusion, which rejected
bring-your-own-cloud for small hospitals. Four reasons it is right anyway:

- **Our margin stops depending on their modality mix.** 40 GB or 40 TB, our cost
  is the same.
- **It removes a liability we cannot discharge.** Medical records cannot be
  deleted when credit runs out — MCI requires three years for inpatient records
  and medico-legal until the case is disposed. If the bucket is theirs, the data
  was always theirs. No prepaid blocks, no metering, no credit-exhaustion policy,
  no retention clause to negotiate, no bulk-export obligation.
- **Residency becomes a per-tenant answer.** One hospital needs India; another
  wants free egress. They choose; we do not have to be right for everyone.
- **Same principle as the UPI decision.** Do not sit in the middle of someone
  else's money, and do not sit in the middle of someone else's medical archive.

### The two-tier shape

| Tier | Whose bucket | What goes in it | Who pays |
|---|---|---|---|
| 1 | **Ours** | report + key images, ~3 MB/study | included in the plan (~₹7/hospital/month) |
| 2 | **Theirs** | full studies, every instance | they do, directly |

Tier 1 is what makes the portal, the remote doctor and the second copy work on
day one for a hospital that configures nothing. It is not optional.

---

## 3. India-resident providers

Only these can answer "where is my patient data" with "India".

**Hyperscalers**

| Provider | Regions | Storage | Egress |
|---|---|---|---|
| Oracle OCI | Mumbai, Hyderabad | ~₹2.27/GB-mo | **first 10 TB/region/mo free** |
| Azure Blob (Hot) | Pune, Chennai, Mumbai | ~₹1.60/GB-mo | metered |
| Google Cloud Storage | Mumbai, Delhi | ~₹1.72/GB-mo | metered |
| AWS S3 | Mumbai, Hyderabad | ~₹2.10/GB-mo | **~₹8–9/GB** |

**Indian providers**

| Provider | Storage | Egress |
|---|---|---|
| AceCloud | ₹0.85–1.10/GB-mo | 100 GB/mo free, then **₹4.30/GB** |
| Yotta | ₹1.16/GB-mo | ₹1.50/GB |
| E2E Networks | **₹625 flat to 250 GB**, then ₹2.50/GB | ₹3/GB |
| Shakti Cloud | ₹2.50/GB-mo | ₹0.80/GB |
| CloudPe | not published | not published |

### Ruled out — no India region exists

| Provider | Why |
|---|---|
| **Cloudflare R2** | Guaranteed jurisdictions are only `eu`, `fedramp`, `us`. The `apac` hint is documented as "a best effort and **not a guarantee**" |
| **Backblaze B2** | US and EU only |
| **Wasabi** | No India region. ZNet in India is a **reseller channel**, not local storage — easy to mistake for residency |

**India residency turns out to be cheap.** B2 works out to ~₹0.62/GB; AceCloud
at ₹0.85 is only ~37% more. The premium is not punitive, which removes most of
the argument for storing Indian patients' scans abroad.

### What a small clinic would pay

X-ray plus ultrasound, no CT — roughly 430 GB/year.

| Provider | Year 1 (~215 GB) | Year 3 (~1.3 TB) |
|---|---|---|
| AceCloud | ₹183/mo | ₹1,105/mo |
| Yotta | ₹249/mo | ₹1,508/mo |
| Azure Hot | ₹344/mo | ₹2,080/mo |
| GCP Mumbai | ₹370/mo | ₹2,236/mo |
| AWS S3 Mumbai | ₹452/mo | ₹2,730/mo |
| Oracle OCI | ₹488/mo | ₹2,951/mo |
| Shakti | ₹538/mo | ₹3,250/mo |
| E2E Networks | ₹625/mo | ₹3,250/mo |

**Add a CT scanner and it is roughly 10×.** A CT at ~300 MB × 20/day is 6 GB/day
on its own. The ₹7,000/month figure from September is a CT problem, not a
storage problem.

---

## 4. AceCloud in detail

The cheapest, so it was priced out properly.

**Storage, per GB-month**

| Class | Rate | Minimum duration |
|---|---|---|
| Standard 0–50 GB | ₹1.10 | none |
| Standard 50–500 GB | ₹1.05 | none |
| Standard >500 GB | ₹1.00 | none |
| Standard-IA | ₹0.60 | 30 days |
| **Glacier Instant Retrieval** | **₹0.20** | 90 days |
| Glacier Flexible | ₹0.17 | 90 days |
| Deep Archive | ₹0.05 | 180 days |

**Requests, per 1,000** — Standard: write ₹0.17, read ₹0.01. DELETE free.

**Requests are not a cost factor for imaging.** A 300-slice CT is 300 writes =
**₹0.05**. A clinic at ~360 instances/day pays **₹1.84/month** in writes.
100,000 reads/month is ₹1. Stop thinking about them.

**Egress ₹4.30/GB after 100 GB/month free** is the real read cost, and it is
AceCloud's weak spot — Shakti is ₹0.80, Yotta ₹1.50, Oracle gives 10 TB free.
Cheap to hold, expensive to look at:

| Viewing load | Egress/month | Cost |
|---|---|---|
| Small clinic, ~20 views/day | ~90 GB | ₹0 (under free tier) |
| Busy hospital, ~100 views/day @ 200 MB | ~600 GB | **₹2,150/month** |

**Lifecycle tiering beats the provider choice.** Imaging is written once and
barely re-read once the report is signed. Keep ~90 days in Standard, then
transition to Glacier Instant Retrieval:

| Year 3, 1.3 TB | Cost |
|---|---|
| All Standard | ₹1,105/mo |
| 90 days Standard → Glacier IR | **~₹354/mo** |

A 68% cut, with ₹1.02/GB retrieval when someone does open an old study.

---

## 5. Architecture

- **One bucket, prefix per tenant** — `t/<tenant_id>/<study_uid>/<series>/<sop>`.
  Not bucket-per-tenant: R2 allows a million buckets but only **500 account API
  tokens**, so per-tenant scoped credentials hit a wall at 500 tenants.
- **Presigned URLs in both directions, and this is load-bearing.** The connector
  asks our API for a short-lived PUT per object (it already authenticates with a
  device token) and uploads **direct**. Downloads are short-TTL GETs. If bytes
  pass through Next.js route handlers we pay **Vercel bandwidth on top of
  storage** — a mistake that would quietly cost more than the storage itself.
- **Metering already exists.** `radiology_studies.size_bytes` is there. Sum per
  tenant from our own rows at upload; reconcile monthly against the bucket total.
  Do not try to read per-prefix usage from the provider — R2 does not expose it.
- **One adapter covers almost everything.** S3, R2, B2, Wasabi, Yotta, AceCloud,
  E2E, Oracle, and GCS via its S3 XML API with HMAC keys. **Azure Blob is the
  exception** — a different API entirely. "All major platforms" honestly means
  "all except Azure", and Azure is common in Indian enterprise IT.
- **Do not use Supabase Storage for images.** ~$0.021/GB plus $0.09/GB egress is
  S3 pricing. Fine for the tenant logos it holds; wrong for DICOM.

### Validate on save, including the check nobody thinks of

When a hospital pastes credentials, prove the whole path before storing them:

1. PUT a small probe object
2. GET it back and compare bytes
3. **HEAD it with no credentials and require 403** — proves the bucket is not public
4. check CORS if the browser viewer will fetch directly
5. delete the probe, and say plainly what failed if anything did

Step 3 matters most. A hospital that makes its bucket public puts patient scans
on the open internet inside our product. Re-run this periodically, not once.

### Credentials

The same pattern as the payment gateway keys: encrypted app-side with an env
master key, write-only in the UI, masked tail on display, never hydrated into a
client component. Ask for a **bucket-scoped** key, not an account key — R2 tokens
scope per bucket natively; S3 needs an IAM policy, which means we supply the JSON
for them to paste.

---

## 6. Traps

**Leave `delete` out of v1.** A bug that wipes a hospital's imaging archive is
unrecoverable and legally catastrophic, and we would have written it. Let their
own lifecycle rules expire objects. Recommend versioning and object lock on their
bucket.

**Do not use Glacier Flexible or Deep Archive for per-instance DICOM.** Those
classes carry **40 KB of metadata per object**. At 300,000 instances that is 12 GB
of pure overhead — more than some of the images. Glacier Instant Retrieval is the
right archive tier. For Deep Archive's ₹0.05, tar each study into one object
first and keep key images separate.

**Watch the 128 KB minimum billable object size** on IA and Glacier IR. Fine for
CT slices (~512 KB); rounds up for small ultrasound frames and thumbnails.

**Small clinics cannot create a bucket.** This objection from September has not
moved. A clinic owner will not sign up, create a bucket, generate a scoped token
and set CORS. Realistically we or a partner do it on a call — so "cloud setup"
becomes an onboarding step with a written guide **per provider**. Support two
properly rather than nine badly.

**We get the support call either way.** When images do not load it could be their
bucket, their expired card, their firewall, or our code. The DROC console lesson
applies: a diagnostics panel that says which side failed, in words, beats
guessing. Store the last successful read and write timestamp per tenant.

---

## 7. Open questions

1. **AceCloud: does an India-region bucket replicate only within India?** Their
   own page says "triple replication across **India and US** regions". If
   replication crosses into the US, the residency is gone and they leave the
   list. **Blocking question — ask first.**
2. **Which region do AceCloud's INR figures apply to?** The rate card does not
   say, and Mumbai is "contact us".
3. **₹1.10 or ₹0.85?** The table says one, the banner the other.
4. **A numeric durability and uptime SLA** from whoever is chosen. "Triple
   replication" is not eleven nines, and we would be holding records that must be
   kept three years by law. This is the wrong place to save 37%.
5. **DPDP Rule 15.** No destination is restricted as of Aug 2026 and there is no
   health-data localisation mandate, but Rule 15 expressly contemplates a
   sector-specific order and the published example is *health data*. Commentary
   puts its commencement at **13 May 2027** (single vendor source — verify
   against the Gazette).

---

## 8. What we do not know

**`radiology_studies` has zero rows.** Real C-STORE of images has never run, so
we have never measured a single study. Every figure in this document is derived
from typical DICOM sizes, not from our hospitals, and the modality mix moves
these numbers more than the provider choice does.

Pick the provider after a week of real studies from Karur. `size_bytes` is
already there to collect it.

---

## 9. Shortlist

- **Yotta** for the best balance — ₹1.16 storage, ₹1.50 egress, an Indian entity
  billing in rupees.
- **Oracle OCI Mumbai** if a hospital's IT auditor needs a name they recognise —
  higher per-GB, hyperscaler durability, free egress at any volume we will reach.
- **AceCloud is cheapest, and that is the reason for caution** — settle question 1
  above before considering them at all.

Write the adapter before the first tenant's data lands. After that it is a
migration, not a config change.
