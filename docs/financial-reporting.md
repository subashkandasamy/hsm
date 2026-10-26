# What the owner asked for, and what it would take

Written 25 Oct 2026, from a hospital owner's own words during the Karur visit.
Analysis only — nothing here is built.

The request, as given:

> daily collection — consultation, doctor-wise, pharmacy, lab, radiology — and
> the same list overall; an analytics page, downloadable; how much collected by
> cash, UPI, everything separately; this helps the auditor for tax submission.
> And an expenses page where all expenses are tracked daily.

---

## 0. Decided, 25 Oct 2026

Answers from the owner, which settle the open questions in §8 and narrow the
build considerably.

**Collected and pending are both wanted, as separate figures.** Not one blended
number — "collected today" beside "billed but not yet collected". That resolves
§3 in the simplest possible direction: show both, never mix them.

**Expenses are out of scope for now, and on the waiting list.** The shape is
confirmed as petty cash — petrol, travel, tea and coffee, food, staff
reimbursements. That is option 1 in §6 and nothing larger. Do not design for
vendor payables or payroll until asked.

**An `accountant` role already exists** (`src/lib/rbac.ts`) with
`billing:read/write/manage`, `billing:advance`, `insurance:*` and
`inventory:*`. New reports can gate on `billing:read` without inventing a role.

**The export must not assume one accounting package.** The owner's own auditor
uses Tally, but this is a product for the whole country and the next hospital's
CA will use something else — or nothing but a spreadsheet. See §6a.

**Per-bill and daily-consolidated are both offered**, chosen at export time
rather than decided for the hospital. Costs almost nothing if the register
stays granular — see §6a.

**It must be readable inside Uyirly, not only downloadable.** Today the only
way to see any of this is a Download button on the Admin Dashboard. That is
also precisely how the defect in §4 survived: nothing on screen showed the same
numbers, so an export that returned an empty file looked no different from one
that worked. **What you download is what you are looking at** — one query
behind both, so a broken export becomes a visibly broken screen.

**Two pages, not one.** A dashboard for the owner and a separate Accounts &
Reports page for the accountant. See §0a.

---

## 0a. Why it splits into two pages

Agreed 25 Oct 2026. They look like one feature and are two products, because
they serve two people with different jobs and different rhythms.

| | Dashboard | Accounts & Reports |
|---|---|---|
| Who | The owner | The accountant |
| When | Glances, daily | Sits down, monthly |
| Question | *Is today normal?* | *What exactly happened?* |
| Shape | Visual, comparative, no filters | Tabular, filtered, exportable |

Built as one page it becomes a dashboard carrying fourteen filter dropdowns the
owner never touches, attached to a report less capable than the accountant
needs. The CSV dropdown currently on the Admin Dashboard is reports-page
furniture standing in the wrong room, and should move.

**The trap: do not make the dashboard a smaller version of the report.** If it
shows the same totals with fewer rows it has earned nothing. A dashboard's job
is the question a table cannot answer:

> ₹48,000 today means nothing on its own.
> ₹48,000 today against ₹41,000 for an average Saturday is a fact he can act on.

Comparison and trend belong to the dashboard — this month against last, a
doctor up, a department down, collections sliding away from billing. Totals
belong to the report.

**Day, month and year are groupings, not stored shapes** — the same principle
as per-bill versus consolidated. The register stays per-bill and the period is
applied on the way out, so adding "year" later costs nothing.

**Both must read `getCollectionSummary`.** It already exists so that Billing,
the Dashboard and the Cash Book never disagree. The day the dashboard says
₹48,000 and the report says ₹47,300, neither number is ever trusted again, and
that cannot be undone by fixing it afterwards.

**And the accountant should land on the Accounts page.** Today
`dashboard/page.tsx` routes `role === 'admin' || role === 'accountant'` to the
same `AdminDashboard`, so an accountant is shown bed occupancy and footfall.
They have `billing:read` and no use for either.

---

## 0b. What the owner's dashboard should hold

Asked for 25 Oct 2026: every bill variety separately with its own total,
patients consulted per day, OP and IP, admissions, discharges — for a chosen
day. This is the operating picture, and it is a legitimate dashboard rather
than the shrunken report §0a warns about: it answers *how did the hospital run
today*, which no range-filtered table answers well.

Everything needed exists. `bill_items.source` already carries all ten
varieties — `consultation`, `lab`, `radiology`, `pharmacy`, `ipd_pharmacy`,
`bed`, `nursing`, `icu`, `ot`, `manual`. Counts come from
`admissions.admitted_at` and `.discharged_at`, `visits`, `appointments` and
`emergency_cases`. Already computed: collection total and mode split, bed
occupancy, footfall, pending bills, low stock.

### The trap that will produce the first support call

**Per-variety figures are *billed*. The collection figure is *collected*. They
do not add up, and the owner will add them up.** A payment attaches to a bill,
not to a bill item (§3), so revenue splits by department exactly and money does
not. Three bands, never one column:

```
COLLECTED TODAY   ₹48,200   cash 31,400 · UPI 14,800 · insurance 2,000
BILLED TODAY      ₹61,500   consultation 8,400 · lab 12,300 · pharmacy 9,800
                            bed 18,000 · nursing 6,200 · radiology 4,100 ...
OUTSTANDING       ₹13,300   billed, not yet collected
```

Each is true on its own. A single blended number would be wrong in a way
nobody could see.

### Every number carries a comparison

Otherwise it is a digit, not a dashboard (§0a):

```
Consultations    34      ▲ average Saturday 28
Admissions        6      ▬ average 6
Collected   ₹48,200      ▼ average Saturday ₹51,000
```

### The day must be selectable

Today by default, but yesterday and last Monday will be wanted. Cheap designed
in, awkward retrofitted.

### Landmine: `mv_daily_revenue_by_tenant`

```sql
SELECT tenant_id, (received_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
       sum(amount) AS total_amount FROM payments GROUP BY ...
```

It sums **every** payment including `method = 'advance'`, which
`getCollectionSummary` excludes on purpose — applying an advance is not new
money. Nothing uses it today, because the dashboard computes live. But it sits
there looking fast and authoritative, and the day something reaches for it for
speed, the dashboard and the report disagree. **Fix it to match the shared
definition, or drop it.** Do not leave a second definition of revenue lying
around in the database.

---

## 1. It is four requests, not one

They arrive in one sentence and have almost nothing in common.

| # | Ask | Nature |
|---|---|---|
| **A** | Collection split by payment mode | Reconciliation — *where is the money* |
| **B** | Revenue split by department and doctor | Management — *where does it come from* |
| **C** | Downloadable, for the auditor | Compliance — *what must be filed* |
| **D** | Daily expense tracking | **A new subsystem that does not exist** |

A and B look alike and are not. C constrains the format of both. D is most of
the work and has no foundation in the schema at all.

---

## 2. What already exists

More than the owner realises, which is itself the finding: the data is being
captured and simply has nowhere to be read.

**`payments`** — `amount`, `method`, `received_at`, `received_by`, `bill_id`.
Methods in live use: `cash`, `upi`, `insurance`, `advance`. Payment mode is
**already recorded on every payment**; ask A is a reporting gap, not a data gap.

**`bill_items.source`** — the department attribution, already populated:
`consultation`, `lab`, `radiology`, `pharmacy`, `ipd_pharmacy`, `bed`,
`nursing`, `icu`, `ot`, `manual`. Ask B's department half is a query away.

**Doctor is reachable** from `visits.doctor_id`, `appointments.doctor_id`,
`admissions.admitting_doctor_id`, `lab_orders.ordered_by` and
`radiology_orders.ordered_by` — but by different routes per revenue type, which
is the work in it.

**`lib/billing/collections.ts`** — one shared definition of "money collected",
used by the Billing page, the Dashboard and the Cash Book so the three always
agree. Net cash-in = bill payments (excluding `advance`, which only applies a
deposit already counted) + advance deposits − advance refunds − credit notes.
**Any new report must use this, or the hospital will be given two different
answers to the same question.**

**Cash Book** (`/billing/cash-book`) — per day, by method, per cashier, with
shift closes (`cash_shift_closes`: expected vs counted cash, variance, card/UPI/
bank totals). This is already most of ask A for a single day.

**GST fields exist** — `bills.cgst/sgst/igst/tax/round_off`, and on each item
`gst_rate`, `hsn_sac`, `taxable_value`, `tax_amount`.

### What does not exist

- **Any expense, vendor-payment, payroll or ledger table.** `purchase_orders`
  records what was ordered; nothing records what was *paid*. Ask D is greenfield.
- Any report over a **date range** — the Cash Book is one day at a time.
- Any **department or doctor** dimension on a money report.
- Any **exempt vs taxable** split for GST.

---

## 3. The distinction that will cause an argument

**"Collected" and "earned" are different numbers, and the owner asked for both
in one sentence.** This has to be settled before anything is built, because the
first question after delivery will be *why don't these two totals match?*

- A **payment** is attached to a *bill*, not to a bill *item*. A consolidated
  IPD bill carries bed + nursing + pharmacy + lab together. One ₹10,000 cash
  payment against it cannot be split by department without apportioning it.
- An **advance** is worse: `admission_advances` has no department at all. It is
  a deposit against an admission, taken before anybody knows what will be used.
  It is real cash in the drawer attributable to nothing.

So three honest reports, not one:

| Report | Question | Exactness |
|---|---|---|
| **Collection by mode** | Where is the money? | **Exact.** Reconciles to the drawer |
| **Revenue by department / doctor** | Where did it come from? | **Exact**, but it is *billed*, not *banked* |
| **Collection by department** | Both at once | **Apportioned** for consolidated bills |

Most bills are single-source today — of 427 bills, only one is `consolidated` —
so the third is nearly exact in practice right now. That changes the moment IPD
volume grows, and the report must say which rows were apportioned rather than
quietly blending the two.

**Recommendation: build the first two, and label them plainly.** "Collected
₹X" and "Billed ₹Y" side by side, with the difference being outstanding. An
owner who sees both learns more than one who is given a single blended number
that is wrong in a way nobody can see.

---

## 4. What a review of these pages actually found — **fixed, 25 Oct 2026 (`683ff79`)**

A review of Billing, Dashboard, the Cash Book and their actions (~7,600 lines)
on 25 Oct 2026, before planning any new work. Thirteen findings. **Every schema
claim below was re-checked against the live database**, not taken from the
review.

They share one shape, and it is the reason this section exists: **almost all of
them return a wrong answer that looks like a right answer.** A query naming a
column that does not exist is rejected by PostgREST, the code destructures
`{ data }` without reading `error`, and the caller gets `null` — which becomes
zero, or an empty file. Nothing throws. Nothing logs. The tile reads 0 and the
hospital believes it.

Building a dashboard on top of this would make the lying prettier.

### Severe — a bill that cannot be raised

**1. A multi-test lab order can never be billed.** `billing.ts:479`.
`buildCharges` emits one line per test, all carrying the same `ref_id`:

```ts
for (const item of items) lines.push({ source: 'lab', ref_id: o.id, ... })
```

so a CBC + LFT order produces `refs = [X, X]`. `flipToBilled` then runs
`.in('id', refs)`, which matches **one** row, and checks
`ids.length < refs.length` — 1 < 2 — concluding *"Some lab_orders charges were
already billed"*. The bill fails. It will fail every time, for ever, for any
order with more than one test.

Worse: each attempt **burns a GST invoice number** before failing, and those
are a legally sequential series.

Fix is `[...new Set(refs)]`. The guard was right; the input was not deduped.

### Severe — wrong numbers shown as fact

| # | Where | What it shows | Why |
|---|---|---|---|
| **3** | Pharmacist dashboard | Low stock **always 0** | `drug_batches` has `qty_available`/`expiry`; the query asks for `qty_remaining`/`expiry_date` |
| **4** | Pharmacist dashboard | Pending prescriptions **always 0** | `prescriptions` has no `status` column at all |
| **5** | Daily Collection CSV | **Header row only** | `payments` has `received_at`, not `created_at` |
| **6** | Test Volumes CSV | **Header row only** | `lab_orders`/`radiology_orders` have `ordered_at`, not `created_at`; no `test_name`/`study_type` |
| **7** | Footfall CSV | **0 emergency cases**, always | `emergency_cases` has `arrived_at`, not `created_at` |

The Pharmacist dashboard has two tiles and **both of them are broken**. The
Admin dashboard's export dropdown has four options and **three return empty
files**.

**11. Consolidated bills are double-counted.** Seven readers in `billing.ts`
filter `bill_source !== 'consolidated'`. `getBillingStats` and the dashboard's
pending-bills query do not — so a consolidated IPD bill is counted alongside the
bills it consolidates, inflating both billed and outstanding on the two screens
an owner looks at.

### Wrong day boundaries

**8.** `dashboard.ts:11` — `todayRange()` builds a day from server-local time,
which on Vercel is UTC, while the rest of the app and migration 0133 define the
day as IST. Doctor and receptionist counts are wrong for everything between
00:00 and 05:30 IST — the night shift.

**10.** `BillingClient.tsx:606` compares a UTC `created_at` prefix against
`istToday()`, so early-morning bills drop into the collapsed History section and
look missing.

### Correctness and safety

**2.** `billing.ts:216` — a dead `if (admissionId) { /* no direct link */ }` in
the OT block, although `ot_schedules.admission_id` exists and is populated. OT
charges are not scoped to the encounter, so an OPD bill can silently pull in and
link to an unrelated admission's surgery.

**9.** `cancelBill` has no status guard. A second cancel — stale tab, a retry —
re-runs the revert and un-bills charges that another bill now owns.

**13.** `CombinedBillView.tsx:60` — `advanceAdjusted` is never set on the
admission-missing fallback, so a fully adjusted advance prints *"Advance Not Yet
Applied"* on a patient's bill.

### Convention

**12.** `window.confirm` / `alert` in `BillDetailClient.tsx:191, 194, 238` and
`BillingClient.tsx:296, 307`, against the project's own no-browser-popups rule.

### A fourteenth, found by looking for more of the same

The five silent zeros were all one mistake, so the schema was swept for others.
One more came back, and it is the one that costs money.

**`dispenses` has no `visit_id`.** The link from a dispense to a visit runs
through the prescription. Building an **OPD** bill filtered on it directly, the
query was rejected, the error was not read, and the result was an empty list —
so **medicines dispensed to an outpatient were silently left off their bill**,
every time. The hospital gave them away.

It is also the one a chain-only check would never have found, because the
filter is applied to a variable several lines later:

```ts
let q = supabase.from('dispenses').select(...)
if (admissionId) q = q.eq('admission_id', admissionId)
else if (visitId) q = q.eq('visit_id', visitId)   // no such column
```

### The guard that stops this class coming back

`npm run verify:schema-refs` reads the schema, reads every Supabase filter in
`src/`, and compares — statically, with no database connection. It follows
filters applied to a query held in a variable, for the reason above. Both the
`payments.created_at` and `dispenses.visit_id` bugs were put back to confirm it
fails on them.

Getting it **quiet** mattered as much as getting it working. The first version
reported fourteen missing columns of which one was real, and a checker that
cries wolf gets switched off and then protects nothing. It now reads several
`ADD COLUMN`s in one `ALTER TABLE`, knows the `TIME` type, and bounds a query
chain by indentation instead of guessing at statement ends.

### What this changes about the plan

The reports and the dashboard were going to be built on these same actions. So
the fixes are not a separate chore to be done later — **they are Phase 0, and
Phase 0 blocks everything.** There is no value in a beautiful dashboard reading
from `getBillingStats` while it double-counts.

It also argues for one habit in the new code: **never destructure `{ data }`
without reading `error`.** Every single silent-zero above is that one omission.

---

## 5. What the auditor actually needs

The owner's framing — "this helps the auditor for tax submission" — is the most
useful sentence in the request, because it narrows the design. An auditor does
not want a dashboard. They want a few specific registers that tie out.

Researched 25 Oct 2026; **every point below is for the hospital's own CA to
confirm against current notifications, not to be stated as fact to a customer.**

**Healthcare is largely GST-exempt.** Services by a clinical establishment are
exempt under Entry 74 of Notification 12/2017-CT(R) — consultation, surgery,
diagnostics. So most of a hospital's turnover carries no GST at all.

**But not all of it.** The taxable edges are the ones that need separating:

- **Pharmacy to outpatients** — taxable; medicines supplied as part of inpatient
  treatment are generally treated as part of the exempt composite supply.
  Sources disagree on the boundary, which is exactly why the report must
  *separate inpatient from outpatient pharmacy* and let the CA decide.
  `bill_items.source` already distinguishes `pharmacy` from `ipd_pharmacy`.
- **Room rent above ₹5,000/day, non-ICU** — reported as taxable at 5% with no
  ITC; ICU generally exempt. We hold `wards.daily_rate`, `wards.ward_type` and
  `admissions.is_critical_care`, so the test is computable — but sources
  conflict on whether the tax falls on the whole amount or the excess.
- **Cosmetic and elective work, canteen** — taxable.

**Income tax matters more than GST for a hospital this size**, and the registers
are simpler: total receipts, mode-wise, against expenses. Which is precisely
what the owner asked for, and why ask D is not an afterthought — without
expenses, the collection report is one side of a ledger.

### Section 269ST — worth surfacing in the product

No person may receive **₹2,00,000 or more in cash** from one person in a day,
or for a single transaction, or for transactions relating to one event.
Penalty under 271DA is **100% of the amount received**, and it falls on the
*receiver* — the hospital, not the patient.

Hospitals are not exempt. The COVID-era relaxation (cash accepted with PAN or
Aadhaar) **lapsed on 31 May 2021**. Splitting across several bills does not
help: the limit aggregates per person per day.

A hospital taking cash for a surgery can cross this without anyone noticing.
**We already have every number needed to warn them** — `payments` filtered to
`method = 'cash'`, grouped by patient and IST day.

This is the most valuable thing in the whole request and nobody asked for it.
A competitor's 150 reports do not include a warning that the hospital is
accruing a penalty equal to the money it just took.

---

## 6. Expenses — the part that needs scoping, not building

"An expenses page where all expenses are tracked daily, and something like
that" is not yet a requirement. It could be any of:

1. **A petty-cash book** — date, head, amount, paid by, note. A day's outgoings
   against a day's takings. One table, one screen.
2. **Vendor payables** — what was bought, from whom, what is owed, what is paid.
   Needs to meet `purchase_orders` and pharmacy GRN, which already exist.
3. **Payroll** — salaries, advances, PF, TDS. A module of its own; `hr` exists
   but holds no money.
4. **A general ledger** — chart of accounts, double entry, trial balance.

**Do not build 4.** A hospital that wants a trial balance already has an
accounting package and an accountant who will not move off it. The job is to
hand that accountant clean data, not to become their software.

**Build 1 when it comes back off the waiting list.** It is a day's work, it answers the owner's sentence
literally, and it makes the daily collection report double-entry-ish at a glance:
*collected ₹48,000, spent ₹6,200, net ₹41,800.* That single line is what an
owner looks at, and no competitor dashboard shows it because they are built
around revenue.

Then ask whether 2 is wanted before assuming it.

---

## 6a. Export: one dataset, several renderings

The temptation is to build a Tally integration, because the first hospital's
auditor uses Tally and Tally is genuinely dominant — directional figures put it
around 70–75% of computerised books in India, though no independent survey
exists and every number comes from a vendor or consultant blog.

**That is still the wrong thing to build.** Tally is the biggest share of a
split market, not the market. Zoho Books is the growing cloud option, Vyapar
holds the micro-business tier, Busy has a following among North Indian traders,
Marg is strong in pharma distribution — and a large number of small-town CAs
keep books for a nursing home in **Excel and nothing else**. A hospital in
Karur and a hospital in Indore will not have the same auditor using the same
tool, and we sell to both.

So the architecture is **one canonical dataset, several renderings**:

```
    sales & receipts register          ← computed once, the single source
        │
        ├── CSV / Excel                ← primary. Universal.
        ├── Tally XML                  ← convenience for the common case
        └── anything else              ← only when a customer actually asks
```

**CSV is the primary deliverable, not the fallback.** Every package on that
list imports a spreadsheet, every CA can open one, and it is the only format
that works for the accountant who has no package at all. A well-shaped CSV is
worth more than a perfect integration with one vendor.

**Tally XML is worth adding second**, because it is a large minority and the
format is known: `ENVELOPE > HEADER > BODY > DESC > DATA > TALLYMESSAGE >
VOUCHER`, dates as `YYYYMMDD`, `VOUCHERTYPENAME` matching a type that already
exists in their company (`Sales`, `Receipt`, `Payment`, `Journal`), debit and
credit by `ISDEEMEDPOSITIVE`, and debits must equal credits or the whole voucher
is rejected into an Exceptions report.

### Consolidation is a rendering, not a dataset

Per-bill or daily-consolidated is offered as a choice at export time (§0), and
it is cheap **provided the register itself always stays per-bill**. Consolidation
is then a grouping applied on the way out, by the renderer, and never a second
stored dataset that can drift from the first.

The default should be consolidated for same-day OPD, for the ledger-count reason
below. An accountant who wants every bill as its own voucher — usually for an
audit year rather than a routine month — ticks the box.

One detail there is unusually well aligned with §0's decision.
`BILLALLOCATIONS.LIST` carries a `BILLTYPE` — `New Ref` opens an outstanding
against a bill, `Agst Ref` closes it. **A Sales voucher with `New Ref` and a
Receipt voucher with `Agst Ref` reproduces "collected separately, pending
separately" inside the accountant's own software**, maintained by Tally's
bill-wise outstanding rather than by us. Where we export to a tool that cannot
do that, the CSV still carries both columns.

### Two things that are needed whatever the tool

**Ledger mapping is per-hospital configuration.** Every chart of accounts is
different: one hospital posts lab income to "Diagnostic Income", another to
"Lab Receipts". We cannot guess, and hardcoding "Sales" guarantees a rejected
import. A small settings screen mapping our sources — consultation, lab,
radiology, pharmacy, bed, nursing, icu, ot — plus each payment mode, to names
the hospital types in. **This is required for Tally, Busy, Marg and Zoho
alike**, so it belongs in the core and not in any one exporter.

**Patients must not become ledgers.** A hospital with ten thousand patients
would otherwise create ten thousand Tally ledgers and make the accountant's
file unusable. The shape that works:

- **OPD bills settled the same day** — no debtor exists. One consolidated daily
  Sales voucher per income head, against Cash or Bank. This is most of the
  volume.
- **Credit bills** — insurance, pending IPD — a party ledger with a bill
  reference, cleared by a Receipt when the money arrives. Only these need
  naming, and there are few of them.

---

## 7. Proposed order

Ordered by value per unit of work, which is not the order the request implies.

**~~Phase 0 — the fourteen (§4).~~ Done 25 Oct 2026, `683ff79`.** All of them,
plus `npm run verify:schema-refs` so the silent-zero class cannot return.
Phase 1 is now unblocked.

**~~Phase 1 — one honest day.~~ Done 25 Oct 2026, `d7f4f9d`.** `/accounts`:
collected by payment mode, billed by department reconciling line by line down
to the bill total, and yet-to-collect split by whether the bill was raised that
day. Any day selectable, printable, and the accountant lands there instead of
the clinical dashboard. Every figure checked against an independent SQL query
rather than against a green build.

**~~Phase 2 — the register, on screen.~~ Done 25 Oct 2026.** `/accounts` →
**Register**, two books over any range: **Sales** (every bill, with patient,
doctor, departments, billed / received / owed) and **Receipts** (every payment,
advance and refund). Filters by department, doctor and settled-or-owed, built
from the range itself so a hospital is never offered a department it does not
run. Receipts are not recomputed — they come from the Cash Book's own
`getMovementsInRange`, so the two screens cannot drift.

**One gap it exposed, which is data and not reporting.** A bill built by hand
has no `visit_id`, no `appointment_id`, no `admission_id` and no `ref_id` on
its lines, so there is nowhere a doctor could be recorded — two consultation
bills in the demo tenant show "—" and that is the honest answer. Lab and
radiology walk-ins were rescued by falling back to the order's `ordered_by`,
but a typed-in consultation cannot be. **Doctor-wise revenue will have holes
wherever a bill was built by hand**, and the fix belongs in the bill builder:
capture the doctor when a consultation line is added by hand. Until then the
register should keep showing "—" rather than guessing.

~~**Phase 2 — the register, on screen.**~~ The canonical **sales & receipts
register** of §6a — the dataset every export is rendered from — shown in Uyirly
over any date range, filterable by department, doctor, payment mode and
collected-versus-pending, with the totals above the table. Doctor-wise revenue
lands here, because it needs a different join per revenue type and should not
hold up Phase 1. Must reuse `getCollectionSummary` so the numbers never
disagree with the Cash Book.

This is the phase that matters most, and not for the reason it looks. A number
somebody can see is a number somebody will check — §4's export was wrong for an
unknown length of time because no screen anywhere showed what it should have
contained.

**~~Phase 3 — CSV / Excel download.~~ Done 25 Oct 2026.** The register the
accountant is looking at, as a file — same functions, same filters, no second
code path. Plus **Ledger names**, a third tab mapping each income head and
payment method to what the hospital's own books call it. Blank leaves the
column empty rather than guessing, because a wrong ledger name fails at the
import rather than in the file.

The byte-order mark had to be written as bytes client-side: a leading U+FEFF
added server-side does not survive the trip, which was established by logging
the first code point on arrival rather than assumed. Without it Excel on
Windows mojibakes every ₹ and every Tamil name.

~~**Phase 3 — CSV / Excel download.**~~ The register the user is currently looking
at, as a file — same query, same filters, no second code path. Universal, and
the only format that serves a CA with no package at all. Includes the ledger
mapping screen, since that is needed by every exporter and not just one.

**~~Phase 4 — Tally XML.~~ Done 25 Oct 2026.** Sales and Receipt vouchers off
the same register, with the per-bill / consolidated toggle. `New Ref` and
`Agst Ref` carry the hospital's outstanding into Tally's own bill-wise
tracking; consolidated writes no references rather than pretending to. One
sundry-debtors ledger, never one per patient. An unmapped head stops the
export and says which. `npm run verify:tally`, plus a real export parsed with
an XML parser: 24 vouchers, none unbalanced, totals matching the register.

~~**Phase 4 — Tally XML.**~~ The common case, built on Phase 3's dataset and
mapping. Sales with `New Ref`, Receipt with `Agst Ref`, and the per-bill /
daily-consolidated toggle from §0, defaulting to consolidated for same-day OPD
so patients never become ledgers.

**Phase 5 — the tax pack.** Exempt vs taxable split, inpatient vs outpatient
pharmacy, room rent against the ₹5,000 test, HSN summary. Built *with* a real
CA looking at it, not from blog posts — including this document's §5.

**~~Phase 6 — the owner's dashboard.~~ Done 25 Oct 2026.** Collected, billed and
outstanding as three headlines, a thirty-day trend, department and payment
bars, bed occupancy, activity counts — each against the same weekday averaged
over the four before it. Money comes from `getDayEndSheet`, so the two screens
cannot disagree.

**`mv_daily_revenue_by_tenant` is reconciled** to the shared definition and is
now what the trend reads. Two warnings earned the hard way, both worth keeping:
rebuilding a materialized view **resets its grants** and silently undid the
0133 lockdown, exposing every tenant's collections until 0226 put it back; and
because a materialized view cannot carry RLS, anything reading one must use the
service-role client **and filter `tenant_id` itself**.

~~**Phase 6 — the owner's dashboard.**~~ The operating picture of §0b for a
chosen day — collected by mode, billed by variety, outstanding, and the activity
counts — every figure against its own comparison. Replaces the four flat tiles
and takes the CSV dropdown off that screen. Reconcile or drop
`mv_daily_revenue_by_tenant` first; it is a second definition of revenue.

**~~Phase 7 — the 269ST warning.~~ Done 26 Oct 2026.** Cash is totalled across
every bill and deposit for that patient's IST day and shown in the payment box
**before** the money is taken. It warns, it does not block — 273B allows for
reasonable cause and a counter that cannot complete a payment is its own harm.
₹2,00,000 exactly already breaches, which `npm run verify:cash-limit` pins to
the rupee. `listCashLimitBreaches` gives the month-after view.

~~**Phase 7 — the 269ST warning.**~~ Cash per patient per IST day, flagged before
the receipt is printed rather than after.

**Waiting list — petty cash.** §0. One table, one screen, daily. Picked up when
the owner comes back to it.

**Not planned: a general ledger**, and **not planned: an integration with any
single accounting vendor**. We produce clean data; their software consumes it.

## 8. Still open

The three questions this document opened with were answered on 25 Oct 2026 and
are recorded in §0. What remains:

1. **Which other package, first?** Nothing beyond CSV and Tally should be built
   speculatively. The second format is decided by the second hospital that asks,
   not by market-share estimates — and the estimates we have are all from vendor
   blogs anyway.
2. **What does the hospital call its income heads?** The ledger-mapping screen
   needs a sensible default list, and the fastest way to get one that is not
   invented is to look at their existing Tally chart of accounts.

Question 2 is the one to ask while there is still a hospital visit in progress.
A photograph of their chart of accounts is worth more than any amount of
guessing at what to call a default.
