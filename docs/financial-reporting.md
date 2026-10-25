# What the owner asked for, and what it would take

Written 25 Oct 2026, from a hospital owner's own words during the Karur visit.
Analysis only — nothing here is built.

The request, as given:

> daily collection — consultation, doctor-wise, pharmacy, lab, radiology — and
> the same list overall; an analytics page, downloadable; how much collected by
> cash, UPI, everything separately; this helps the auditor for tax submission.
> And an expenses page where all expenses are tracked daily.

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

**Do not build 4.** A hospital that wants a trial balance already has Tally and
an accountant who will not move. MocDoc's answer here is a **Tally integration**,
not a ledger of their own — which is the right read of the market and worth
copying rather than fighting.

**Build 1 first.** It is a day's work, it answers the owner's sentence
literally, and it makes the daily collection report double-entry-ish at a glance:
*collected ₹48,000, spent ₹6,200, net ₹41,800.* That single line is what an
owner looks at, and no competitor dashboard shows it because they are built
around revenue.

Then ask whether 2 is wanted before assuming it.

---

## 7. Proposed order

Ordered by value per unit of work, which is not the order the request implies.

**Phase 0 — the lie.** Fix the `created_at` bug in `exportReport` and
`listClaimSettlementPayments`. Hours. Do it first and alone.

**Phase 1 — one honest day.** A day-end sheet: collected by mode, collected by
department, billed by department, outstanding, and — once Phase 3 lands —
expenses and net. Printable on a letterhead. This is what the owner hands the
accountant each evening, and the thing he was actually describing.

**Phase 2 — the range and the download.** Everything in Phase 1 over any date
range, as CSV. Doctor-wise revenue lands here, because it needs a different
join per revenue type and should not hold up Phase 1. Must reuse
`getCollectionSummary` so the numbers never disagree with the Cash Book.

**Phase 3 — petty cash.** One table, one screen, daily. Closes the ledger.

**Phase 4 — the tax pack.** Exempt vs taxable split, inpatient vs outpatient
pharmacy, room rent against the ₹5,000 test, HSN summary. Built *with* a real
CA looking at it, not from blog posts — including this document's §5.

**Phase 5 — the 269ST warning.** Cash per patient per IST day, flagged before
the receipt is printed rather than after.

**Not planned: a general ledger.** If accounting integration is ever wanted, it
is a Tally export, not a chart of accounts.

---

## 8. What to go back to the owner with

Three questions, because the answers change the build and he is the only one
who can give them:

1. **Collected or billed?** When he says "how much did the lab bring in today",
   does he mean the money taken at the counter, or the value of the tests
   ordered? (§3. Almost everyone means the first and asks for the second.)
2. **Which expenses?** Petty cash only, or supplier payments and salaries too?
   (§6. The difference is a day versus a month.)
3. **Who is the auditor and what do they use?** If the answer is Tally — and it
   usually is — then the target is a file that imports cleanly, and a beautiful
   analytics page is not what is being asked for at all.

Question 3 is the one worth asking first. It can make most of this unnecessary.
