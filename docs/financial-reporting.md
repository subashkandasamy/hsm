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

## 4. Confirmed defect: the one export that exists is broken

`src/app/actions/dashboard.ts` — Admin Dashboard → **Daily Collection** → CSV:

```ts
.from('payments')
.select('created_at, amount, method, bill_id')   // payments has no created_at
.gte('created_at', from)
```

**`payments` has no `created_at` column.** It has `received_at`. PostgREST
rejects the query, the code destructures `{ data }` without checking `error`,
`data` is null, and the file downloads **with a header row and nothing else**.

The owner's single most-wanted report already exists as a button and silently
produces an empty file.

`src/app/actions/insurance.ts:1167` (`listClaimSettlementPayments`) has the same
bug and returns an empty list for every claim.

Both are a one-word fix. Worth doing immediately and separately from any of the
work below — it is the difference between "not built yet" and "appears built and
lies".

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

**Phase 0 — the lie.** Fix the `created_at` bug in `exportReport` and
`listClaimSettlementPayments`. Hours. Do it first and alone.

**Phase 1 — one honest day**, on the new Accounts page (§0a).  A day-end sheet: collected by mode, collected by
department, billed by department, outstanding, and — once Phase 3 lands —
expenses and net. Printable on a letterhead. This is what the owner hands the
accountant each evening, and the thing he was actually describing.

**Phase 2 — the register, on screen.** The canonical **sales & receipts
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

**Phase 3 — CSV / Excel download.** The register the user is currently looking
at, as a file — same query, same filters, no second code path. Universal, and
the only format that serves a CA with no package at all. Includes the ledger
mapping screen, since that is needed by every exporter and not just one.

**Phase 4 — Tally XML.** The common case, built on Phase 3's dataset and
mapping. Sales with `New Ref`, Receipt with `Agst Ref`, and the per-bill /
daily-consolidated toggle from §0, defaulting to consolidated for same-day OPD
so patients never become ledgers.

**Phase 5 — the tax pack.** Exempt vs taxable split, inpatient vs outpatient
pharmacy, room rent against the ₹5,000 test, HSN summary. Built *with* a real
CA looking at it, not from blog posts — including this document's §5.

**Phase 6 — the owner's dashboard.** Comparison and trend, per §0a: this
period against the last, by department and doctor, collections against billings.
Replaces the four flat tiles and takes the CSV dropdown off that screen.

**Phase 7 — the 269ST warning.** Cash per patient per IST day, flagged before
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
