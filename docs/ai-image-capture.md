# Reading paper with a model

Written 26 Oct 2026. Two requests, deliberately kept apart because they carry
very different risk: a supplier invoice typed into stock, and a result typed
onto a patient's chart.

---

## 1. The short answer

**Pharmacy invoices: yes, and most of it is already built.** The work is a
third input to a screen that already exists, not a new feature.

**Lab results: yes, but narrowly** — only for an instrument that genuinely
cannot be connected, never as a shortcut past one that can, and never without
a person checking each number against the picture it came from.

**Before either: ask the distributor for the file.** A large share of Indian
pharma distributors will send an invoice as CSV or Excel, and the AIOCD CSV is
the structure the whole trade already uses. That path is free, exact, and
**already works in Uyirly today** — `ImportInvoicePanel` parses a delimited
file, guesses the columns, and matches the names. Reading a photograph is the
fallback for the distributor who only hands over paper.

---

## 2. Pharmacy invoices

### What is already there

`src/lib/pharmacy/invoiceFile.ts` defines exactly the fields a pharma invoice
carries, and they line up with the AIOCD structure almost one to one:

```
name · batch · expiry · packs · free · rate · mrp · packSize · hsn · gst · manufacturer
```

It also knows the synonyms real invoices use (`b no`, `exp dt`, `sch`,
`particulars`), detects the header row, works out whether MRP is per pack or
per unit, and hands the rows to a matching screen where a human confirms each
medicine against the hospital's own catalogue before anything moves.

**So the model's job is small and well-bounded**: turn a photograph into the
same `ParsedInvoiceRow[]` the CSV parser produces. Everything after that —
review, name matching, GRN, batch, expiry — is untouched.

### Why the risk is low

Nothing is believed. Four checks catch a misread before it reaches stock, and
the first two are pure arithmetic:

- **The GST must add up.** `taxable × rate` has to equal the tax, and the
  lines have to sum to the printed invoice total. A digit read wrong almost
  always breaks one of them.
- **The expiry must be a plausible date** — in the future, in a format the
  trade uses (`MM/YY`, `MM-YYYY`).
- **The medicine must match the catalogue**, which is already a human step.
- **A human confirms every line** before the GRN is posted.

And the worst case is an inventory count being wrong, which the next physical
stock check corrects. Nobody is treated on the strength of an invoice.

### What it would cost

Rough, and worth measuring on real invoices rather than trusting: a page image
is on the order of a couple of thousand input tokens and the extracted rows a
similar number out. On **Claude Haiku 5.5** ($0.10 / $0.50 per MTok) that is
well under a rupee per invoice; on **Claude Sonnet 5.5** ($2 / $10) a couple
of rupees.

Start on Haiku 5.5 and measure. An invoice is a dense table with small print
and that is where a smaller model struggles, so if the field accuracy is not
there, step up rather than engineer around it — the whole bill is rupees a
day either way.

**Use structured outputs** (`output_config.format`) so the response is
schema-valid rows rather than prose to be parsed.

---

## 3. Lab results — the careful one

### Where it belongs, and where it does not

The hospital in Karur has eleven instruments. Ten of them have a data port.
**One does not**: the Chem-leon electrolyte analyzer, checked at the back
panel, has no DB9, no USB, no LAN. Its results are read off a screen and
written on paper, today and for ever.

**That machine is the case for this feature.** Not the H360, which is already
connected. Not the ECL 105 or the Aspen, which have Ethernet and are a cable
away. An instrument that can be connected should be connected: the data is
exact, it carries units and flags, and it costs nothing per sample.

The second real case is an **outside laboratory's report** for a test this
hospital sends away. `lab_tests_catalog.referral_lab_id` already models that,
and what comes back is a PDF or a photograph either way.

### What the evidence actually says

The honest comparison is not against perfection. It is against a human
retyping numbers, which is what happens now, and which is measurably bad:

- A JAMIA study of outpatient point-of-care testing found staff-entered result
  flags disagreed with the laboratory system in **73.9%** of paired records,
  and that **14.2% of transcription errors were out by more than 20%** —
  described by the authors as potentially dangerous.
- An ICU study found an **8.8%** transcription error rate for laboratory
  results.
- Double-key entry roughly **halved** error in a questionnaire study (2.02% →
  1.01%), which is the strongest available evidence for "two independent reads
  beat one".
- An ICU study of OCR-assisted entry cut time per patient from **6.0 to 3.4
  minutes** — but reported *no* accuracy comparison, which is exactly the thing
  that would matter here.

So: a model-read value that a person then checks is very likely better than a
person typing from a screen. That is the bar, and it is a low one.

### The failure mode that is different

A human typo looks like a typo — transposed digits, a missing decimal. It is
often obvious.

A model misread can be **plausible**: 8.4 where the paper says 3.4. Nothing
about it looks wrong. That is why the controls below are not optional
politeness.

### How it has to work

1. **It lands as `source = 'analyzer'`-style evidence, not as a verified
   result.** The existing flow already withdraws verification on every write
   and requires a person to authorise release. AI-read values go through that
   same gate — never around it.
2. **Show each number beside its own crop of the image.** Do not ask somebody
   to proofread twenty-eight values against a photograph on another screen.
   Put the cropped region next to the field. This is the single most valuable
   part of the design and it is what makes checking fast enough to actually
   happen.
3. **Range-check everything automatically.** The product already resolves
   reference and critical ranges per analyte, by age and sex. A value outside
   the plausible range for that analyte is flagged for a second look before a
   human even starts.
4. **Delta-check against the patient's own previous result** where there is
   one. `idx_lab_result_analytes_delta` exists for exactly this.
5. **Never auto-release.** No configuration should allow an AI-read result to
   reach a patient without a person having looked at it. ISO 15189 requires a
   person to authorise release; that control already exists and must not be
   weakened for this.
6. **Record that it was read from an image**, with the image kept. An amended
   result later needs to show where the original number came from.

### What not to build

- **No auto-verification.** The feature saves typing, not judgement.
- **Not for connectable instruments.** It would be a worse version of a cable.
- **Not for handwriting.** A technician's handwritten worksheet is a different
  and much harder problem, and the error cost is the same.

---

## 4. What it would take

| | Pharmacy invoice | Lab result image |
|---|---|---|
| New screen | No — a third input to the existing import panel | Yes — crop-and-confirm |
| New schema | No | Store the image + provenance on the result |
| Model | Haiku 5.5, step up if accuracy demands | Sonnet 5.5 or better — the cost of a misread is not symmetric with the cost of a token |
| Checks before trust | GST arithmetic, totals, date sanity, name match, human confirm | Reference range, critical range, delta check, crop-beside-value, human verify |
| Worst case | A stock count is wrong | **A patient is treated on a wrong number** |
| Build order | **First** | After, and only for the unconnectable |

---

## 5. Recommendation

1. **Ask the hospital's distributors for CSV first.** It costs nothing and it
   is exact. This may remove most of the problem.
2. **Build the invoice photograph path** into the existing import panel. Low
   risk, real drudgery removed, and the review screen already exists.
3. **Then the lab path, scoped to the Chem-leon and outside reports.** With
   the crop-beside-value screen, the range checks, and the existing
   verification gate untouched.
4. **Measure both on the hospital's own paper** before promising anything. No
   published accuracy figure for Indian pharma invoices survived scrutiny —
   every number found was a vendor's own claim with no method behind it.

**Sources:** [Manual transcription error in point-of-care testing, JAMIA](https://academic.oup.com/jamia/article/26/3/269/5287977) ·
[OCR-assisted recording in ICUs](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11917072/) ·
[Indian pharma distributor invoice fields](https://invoicedataextraction.com/blog/india-pharma-distributor-invoice-batch-expiry-extraction) ·
[AIOCD CSV import](https://edocsmart.com/industries/pharma-invoice-aiocd-csv/) ·
[Purchase CSV import in Indian pharmacy software](https://pharma247.in/blogs/purchase-csv-import-add-thousands-of-medicines-in-one-click)
