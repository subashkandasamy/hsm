# SwiftEHR → Uyirly: collecting KMCH's data

SwiftEHR refuses requests that do not come from a signed-in browser, so every
step runs **inside your own signed-in SwiftEHR tab** (F12 → Console → paste).
Nothing here logs in, and no password is ever typed into Uyirly or a chat.

| Step | What | Who | Holds patient data? |
|---|---|---|---|
| 1 | **Map** — record which addresses the SwiftEHR screens call | you click, recorder notes | **No** — names, phones, ids are never kept |
| 2 | **Extract** — page through every record those addresses hold | script built from the map | **Yes** — saved only on this computer |
| 3 | **Check** — counts per kind of record, fields we can and cannot carry | Uyirly reads the files | stays here |
| 4 | **Import** — demo hospital first, then KMCH after your approval | separate plan | — |

Files with patient data go in `migration/swiftehr/raw/` — git-ignored, never
committed, never uploaded.

## Step 1 — the map

### 1a. Recorded so far (13 Nov 2026)

Two recorder files (`map-1-patients-op.json`, `map-2-billing.json`, git-ignored)
show these SwiftEHR addresses. All live under
`https://app.swiftehr.com:9090/swiftehr-v2/`, `locationId=18`.

| Data | Address | How to page through it |
|---|---|---|
| Patients (3,174) | `POST getAllPatient?locationId&pageSize&pageNo` | `pageNo` from 0 |
| A patient's visits (OP + IP) | `GET getPatientViewHistory?patientId&locationId` | one call per patient |
| OP case sheet — complaint, vitals, diagnosis, advice, ICD | `GET answers/v2-caseSheet/{encounterId}` | per visit |
| OP examination answers | `POST questions/getQuestions` | per visit |
| OP prescription | `GET getMedication?encounterId` | per visit |
| OP lab requests → results → report | `GET op-lab-test-request`, `GET selected-lab-test`, `POST view-lab-report-group` | per visit |
| OP scans | `POST scan/prescription-items` | per visit |
| Appointments | `POST appointments/searchAppointment` | `fromDate`/`toDate`, `pageNo` |
| Current inpatients | `POST v2/current-admission` (`type: admission`) | `pageNo` |
| Bills — IP, OP, Lab, Scan, Pharmacy | `POST bills?type=ip\|op\|lab\|scan` | `startDate`/`endDate`, `pageNo` |
| IP bill lines + summary | `GET billDetails?billId` | per bill |
| OP / Lab / Scan bill lines | `GET bill-details/op/{id}`, `GET lab/getLabListByEncounterId`, `GET bill-items?billId&type=scan` | per bill |
| Receipts (mode, amount, number) | `GET billReceipts?billId` | per bill |
| Printed bill (PDF) | `GET bill-pdf?billId&type&action` | per bill |
| Doctors, charge items, categories | `GET people/getDoctors`, `GET item/getCharges`, `GET getItemCategory` | once |

The rest — inpatient tabs, discharge summaries, attachments, pharmacy,
purchases — came from SwiftEHR's own code (1b).

**Careful:** moving an OP case sheet on to its *Summary* makes SwiftEHR itself
save the visit again (`createER`, `answers/saveAnswer`). Use View History's
view/print icons instead of the case sheet's Next/Summary.

### 1b. The full address list

SwiftEHR **V2.10.9** runs at `app.swiftehr.com/swiftehr_v2/`; its program code
is public there (the copy at `app.swiftehr.com/` is an older V1.0.4.0). Read on
13 Nov 2026: **782 kinds of data call — 531 reads, 251 writes**. Every call
goes through one helper that adds two headers from the tab's own storage:
`Authorization: <localStorage token>` and `x-login-history-id`.
The list is kept locally in `swiftehr-v2-addresses.json` (git-ignored).

Facts the extractor relies on, all from that code:
- In View History, an **IP visit's `visitId` is the admission id**; an OP
  visit's is the encounter id.
- Inpatient **medication chart and IO records are per day** (`date` as
  DD-MM-YYYY), so each day of a stay is fetched.
- Bill lists filter by status (`PAID`, `UNPAID`, …) — asked both with and
  without the filter, merged by bill id.

### 1c. Recorder (only if something is missing later)

`recorder.js` — paste, click through screens, press **Save** on the green
badge. Only **look**: do not press Save, Initiate Discharge or edit any box.

## Step 2 — copy the data (`extract.js`)

**Read-only by construction:** it may call only the 53 read addresses on its
list (33 GET, 20 POST); anything else is refused before it is sent.
3 requests at a time. Files save into Downloads as it goes.

| Part | What | File |
|---|---|---|
| 1 | Doctors, staff, charges, lab tests & packages, insurance, rooms/wards/beds, suppliers, medicines | `swiftehr-masters-NNN.json` |
| 2 | Every patient, oldest first: details, visit history, attached-file list; each **OP visit** (case sheet, prescription, lab results + report, scans); each **admission** (details, discharge summary, progress notes, chart, prescriptions, discharge medicines, labs, radiology, scans, services, returns, bill + receipts, and the medication chart and IO for every day) | `swiftehr-patients-NNN.json` |
| 3 | Bills month by month — IP, OP, Lab, Scan, Pharmacy — with lines and receipts | `swiftehr-bills-NNN.json` |
| 4 | Appointments month by month | `swiftehr-appointments-NNN.json` |
| 5 | Purchase invoices with items, purchase payments | `swiftehr-purchases-NNN.json` |
| 6 | Hospital-wide admitted/discharged and insurance lists, to cross-check | `swiftehr-checks-NNN.json` |
| — | Counts and errors | `swiftehr-summary-001.json` |

**How to run (from this computer)**

    npx tsx migration/swiftehr/run.ts all          # everything
    npx tsx migration/swiftehr/run.ts pharmacy     # one part only (any part name)
    npx tsx migration/swiftehr/run.ts ippharmacy   # inpatient pharmacy, per saved admission
    npx tsx migration/swiftehr/run.ts all redo-patients   # patients again, skipping saved ones

A Chrome window opens on SwiftEHR; sign in there by hand (the script never sees
the password). Files go straight into `raw/`, never overwriting one. The window
keeps its own profile in `raw/.chrome-profile` (holds the SwiftEHR sign-in —
delete it when the migration is over). Pasting `extract.js` into your own tab
also works; files then land in Downloads.

**What SwiftEHR needed (found the hard way, 13 Nov 2026)**
- Patient list: `filterData: ["ACTIVE","INACTIVE"]` (an empty list matches
  nobody, `"none"` is refused) and **10 a page** — with a bigger page the next
  page still moves on only 10 rows, so pages overlap.
- Discharge date: on the admission's bill (`dischargeDate`) and bed-stay record
  (`endDate`), not in the discharge summary.
- Pharmacy sales: bill type `"op pharmacy"`; `"pharmacy"` returns nothing.
  `"ip pharmacy"` gives one total per stay — the medicines are per admission
  (`ip-prescriptionByStatus` → each bill's lines).

## Result — copied 13 Nov 2026 (150 MB in `raw/`)

| Part | Count |
|---|---|
| Patients (details, visit history, attached-file list) | 3,174 of 3,174 |
| OP visits (case sheet, prescription, labs + report, scans) | 5,432 |
| Admissions (discharge summary, notes, chart, Rx, labs, radiology, services, bill + receipts, daily medication chart) | 421 |
| Bills — OP / Lab / Scan (lines + receipts) | 5,765 / 1,474 / 229 |
| Pharmacy — OP bills with medicine lines | 4,734 |
| Pharmacy — inpatient bills with medicine lines | 865 (364 admissions) |
| Appointments | 5,475 |
| Purchase invoices with items | 1,362 |
| Hospital lists | 2 doctors, 6 staff, 269 lab tests, 40 lab packages, 1,200 medicines, 36 suppliers, charges |

Cross-check: SwiftEHR's own admission reports count 243 (2025) + 179 (2026)
= 422 admissions against 421 copied — one to find in Step 3.

**Not copied yet:** attached documents' content (the list is), purchase
payments (came back 0 — filter to check), rooms/wards/beds lists (empty),
insurance master (refused). Duplicates to drop at import: 7 bills saved twice.
