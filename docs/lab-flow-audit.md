# The laboratory, end to end

Written 26 Oct 2026, reading the code rather than the intention, and checking
every claim against the live demo database. Covers ordering, billing, sample
collection, tube labels, the analyzer link, result entry, verification, release
and the report.

Bugs are in §3. Things that are not bugs but are worth doing are in §4, kept
separate on purpose.

---

## 1. The flow, as built

```
  DOCTOR                LAB BENCH                 ANALYZER            PATIENT
    │
    ├─ orders N tests ──► ONE lab_order
    │                     ONE accession no (2610230002)
    │                     N lab_order_items
    │                          │
    │                     bill raised immediately, bill_source 'lab'
    │                          │
    │                     ┌────┴─────────────────────────┐
    │                     │ OPD: collection is BLOCKED   │
    │                     │ until that bill is paid      │
    │                     │ IPD: not blocked — settles   │
    │                     │ into the discharge bill      │
    │                     └────┬─────────────────────────┘
    │                          ▼
    │                     COLLECT  ──► ensure_lab_samples()
    │                                   splits into tubes by tube type,
    │                                   in NABL draw order, each with
    │                                   its own barcode
    │                                   2610230002 → …0201 Lavender
    │                                              → …0202 Grey
    │                          │
    │                     print labels  ─────────────►  tube on the rack
    │                                                        │
    │                                                   analyzer runs it,
    │                                                   sends HL7/ASTM with
    │                                                   the TUBE barcode
    │                                                        │
    │                     connector stores raw ◄─────────────┘
    │                          │
    │                     processMessage():
    │                       barcode → lab_samples → order
    │                       analyzer code → analyte (per-hospital map)
    │                       save_lab_analyte_results()
    │                          │
    │                     status → 'processing', any prior
    │                     verification WITHDRAWN
    │                          │
    │                     VERIFY   (a person; lab:verify)
    │                          │
    │                     RELEASE  (status 'reported')
    │                          └──────────────────────────────► report visible
```

### The four tabs

| Tab | Holds | Action |
|---|---|---|
| **To Collect** | `ordered` | Collect — payment-gated for OPD |
| **Result Entry** | `collected` + `processing` | Enter results · Verify |
| **To Release** | `verified` | View · Release |
| **Reported** | `reported` | View |

### One report, not several

A full body check-up — blood, urine, vitamins — is **one order, one accession,
one report**, printed in two halves:

- **Panels** (CBC, LFT, KFT) from `lab_result_analytes`, grouped by the NABL
  discipline that performed them.
- **Single tests** from `lab_order_items`, grouped by sample type.

A test is never printed twice: anything with analyte rows is excluded from the
singles list. The number of *tubes* has nothing to do with the number of
*reports* — the split is physical, the report is per order.

### Where results actually live

Two tables, and the difference matters everywhere:

- `lab_order_items.result_value` — a **single** test's one number.
- `lab_result_analytes` — one row per measurement of a **panel**. A CBC's
  twenty-eight numbers are here and the item row stays empty.

Analyzers only ever write to the second. Manual entry writes to whichever
applies, through two different functions.

---

## 2. What is already right

Worth recording, because several of these are the fix for a defect that is
easy to reintroduce.

- **The order is billed at order time and collection is gated on payment** for
  OPD, with an explicit hold when a chargeable order has *no* bill at all —
  "a billing failure at order time used to arrive here as silence and the test
  was run free".
- **Every write withdraws verification.** A corrected value drops the order
  back to `processing`, including one already released. A re-checked result is
  not a checked result.
- **A correction replaces rather than accumulates.** `save_lab_analyte_results`
  deletes the prior row before inserting, because the only unique index
  partitioning allows includes `created_at` — so `ON CONFLICT` could not do it
  and a retyped potassium would have printed twice.
- **A corrected-down critical withdraws its alert** (`withdraw_stale_critical`),
  so nobody is left telephoning a doctor about a number no longer in the record.
- **Tenant is checked inside the database** on the analyzer write path, because
  barcodes repeat across hospitals by design.
- **Result entry is scoped to the order**, not just the item id, so a crafted
  call cannot write onto another patient's order.
- **Raw messages are stored before they are understood**, which is what makes a
  failed message replayable once a human maps a code.
- **Cancelling is refused after verification** and removes only its own bill
  lines.

---

## 3. Bugs — **all four fixed 26 Oct 2026 (`49788e6`)**

### 3.1 ~~An incomplete panel is released as a final report, silently~~ FIXED

**Severity: high.** This one is already in the demo data, on reports marked
released.

`verifyOrder` decides a test is answered if **any one** of its analytes has a
value:

```ts
const testsWithAnalyteValues = new Set(
  analyteRows.filter(r => r.value_num != null || r.value_text).map(r => r.test_id))
const pending = items.filter(i => ... && !testsWithAnalyteValues.has(i.test_id))
```

So a CBC with one of twenty-eight numbers passes verification exactly as a
complete one does.

The report then says nothing, because its interim marker counts only single
tests:

```tsx
const pending = singles.filter(i => i.result_value == null && !i.result_text).length
```

Missing **analytes** are not counted — and an analyte never written has no row
at all, so it simply does not print. The table is shorter and nothing says why.

**In the demo database right now:**

| Accession | Panel | Defined | Filled | Status |
|---|---|---|---|---|
| 2610220002 | Complete Blood Count | 28 | **14** | `reported` |
| 2610230003 | Urine Routine & Microscopy | 18 | **14** | `reported` |

Confirmed released rather than merely unfinished: `2610220002`'s CBC item row
carries `result_value = NULL, flag = 'pending'`, and the order is `reported`.
Half a CBC went out as a final report.

ISO 15189:2022 §7.4.1.7 requires a preliminary result to be flagged as
preliminary and a final report to follow it. This is the opposite: incomplete
and unflagged.

**Fix:** count missing analytes into `pending`; mark the report interim when
any are; and make `verifyOrder` say how many analytes are missing rather than
treating one as all.

### 3.2 ~~A single test can never raise a critical alert~~ FIXED

**Severity: high, but latent — it depends on the hospital's own catalogue.**

Critical escalation is a trigger on `lab_result_analytes` alone:

```
trg_log_critical_result  →  lab_result_analytes (and every partition)
                            lab_order_items — no trigger
```

And the single-test path cannot produce a critical flag even in principle:
`enterResults` computes only `normal | high | low | pending` from the
catalogue's `ref_low`/`ref_high`, and **`lab_tests_catalog` has no critical
columns at all** — no `crit_low`, no `crit_high`.

So a test a hospital adds itself, which is exactly what `createLabTest` and the
"tests with no analytes behind them" path exist for, produces a result that can
be high but never critical. A potassium of 7.0 entered that way raises nothing,
appears in no critical queue, and telephones nobody.

Every active test in the demo tenant happens to come from the master catalogue
with analytes attached, which is why this has never shown. The first hospital
to add its own test is the one it bites.

**Fix:** either give `lab_tests_catalog` critical bounds and trigger on
`lab_order_items`, or route every test through an analyte — even a panel of
one. The second is less code and makes one path instead of two.

### 3.3 ~~The payment gate is bypassed by the analyzer path~~ FIXED — now checked at release

**Severity: medium. Possibly deliberate; it is undocumented either way.**

`collectSample` refuses an unpaid OPD order. But:

- printing tube labels calls `ensure_lab_samples` with **no status or payment
  check**, so barcodes exist as soon as somebody prints;
- `save_lab_analyte_results` moves an order from `ordered` straight to
  `processing` when the source is not manual — *"a machine only reports on a
  tube that was drawn and run, so its word is enough"*;
- neither `verifyOrder` nor `reportOrder` re-checks payment.

So an unpaid OPD order can be labelled, run, resulted, verified and released
without the money ever being taken. The charge stays outstanding, so nothing is
lost — but the gate reads as enforcement and is not.

**Fix, if it should be enforced:** check at release rather than collection,
which is the point the hospital actually loses leverage.

---

### 3.4 ~~A panel's flag never reaches the item row~~ FIXED

Found while explaining the flow rather than auditing it. `lab_order_items.flag`
is what the patient's EMR timeline reads, and for a panel it kept the
`'pending'` it was created with for ever — so every panel a patient had ever
had showed in their history as though the laboratory had not started. A trigger
now rolls the worst analyte flag up to the item, and the backfill corrected
every panel already resulted.

---

## 4. Suggestions — not bugs

### 4.1 A correction destroys the value it replaced

`save_lab_analyte_results` deletes the prior row before inserting. That is the
right call for the report — the alternative printed the analyte twice — but it
means the superseded value is gone from the database entirely.

ISO 15189:2022 §7.4.1.8 expects an amended result to be traceable, the original
retained, and the reason recorded. The code already knows: *"Full amendment
history — keeping the superseded value and marking the report amended — is the
next piece of work. This is the gate, not the trail."*

The shape that satisfies both: keep every row, add `superseded_at`, and have
the report read only live rows.

### 4.2 No preliminary → final reissue

Related to §3.1 but larger. ISO 15189 expects a preliminary report to be
followed by a final one that states which report it replaces. Today there is
one status, `reported`, and a re-release is indistinguishable from the first.

### 4.3 A test with no analytes cannot carry a reference range by age or sex

The analyte path resolves ranges through `resolve_reference_range(analyte,
tenant, sex, age_days)`. The single-test path compares against two flat
columns. A haemoglobin range that differs for a man, a woman and a child is
right on one path and wrong on the other — another argument for 3.2's second fix.

### 4.4 Codes discovered from traffic are recorded as `source: 'library'`

In `processMessage`, codes seen for the first time are upserted with
`source: 'library'` although nothing came from a library. Cosmetic, but it
makes "where did this mapping come from" unanswerable later.

### 4.5 Nothing records who collected which tube, or when

`lab_samples` has `collected_at`, `collected_by` and `received_at`. The collect
action sets the order's status and none of these. Chain of custody is the one
thing an accreditation assessor asks about first.

---

## 5. How other systems do it

Researched 26 Oct 2026. Sources are vendor and standards material; the ISO
clauses should be read in the paid text before any compliance claim.

**The sequence is the same everywhere** — order, accession and label,
instrument interface, review, release. Ours matches it. Where mature systems
differ is in what sits between *review* and *release*:

- **Auto-verification rules.** QC state, delta checks against the patient's own
  previous result, and reflex ordering decide what a human need not look at.
  We verify everything by hand, which is defensible for a small hospital and
  does not scale past a few hundred tests a day.
- **Preliminary / intermediate / final as distinct, separately visible
  states.** We have one released state (§4.2).
- **Bidirectional interfaces** — ASTM E1394 and HL7 v2 — where the instrument
  *asks* the LIS what to run on a barcode. We are one-way; the technologist
  keys the test selection on the analyzer. This is the lab equivalent of the
  DICOM worklist already built for radiology, and worth the same treatment.

The ISO 15189 material is the more useful half of the research, because it
names two specific things we are missing: §7.4.1.7 on flagging preliminary
results, which §3.1 breaches outright, and §7.4.1.8 on amendment traceability,
which §4.1 does not meet.

**Sources:** [LIS workflow](https://www.softcomputer.com/2024/03/31/what-is-the-lis-workflow-process/) ·
[IVD–LIS connectivity analysis](https://umbrex.com/resources/industry-analyses/how-to-analyze-a-medical-devices-company/in-vitro-diagnostic-ivd-connectivity-with-laboratory-information-systems-lis-workflow-analysis/) ·
[ISO 15189 post-analytical practice](https://pmc.ncbi.nlm.nih.gov/articles/PMC10197272) ·
[ISO 15189:2022 overview](https://www.labdecoded.org/p/iso-15189.html) ·
[NABL/India LIS notes](https://onecity.biz/blog/hospital-laboratory-information-system-nabl-india/)
