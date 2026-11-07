// GST calculation helpers for Indian tax invoices.
//
// Model: each bill line carries a `gstRate` (%) and a `taxInclusive` flag
// (true for pharmacy MRP, where GST is already baked into the price). Tax is
// computed per line, then split equally into CGST + SGST for intra-state supply
// (the place of supply for healthcare is the hospital, so IGST rarely applies).

// ── Which document is this, and may the hospital tax at all? ─────────────────
//
// Three states, not two. The one that is easy to miss is the middle row: a
// composition taxpayer (s.10 CGST Act) holds a GSTIN but may NOT collect tax
// from the patient — they pay a flat percentage of turnover themselves. Issuing
// them a tax invoice is the violation, not the compliance.
//
//   registered?  composition?  →  document            tax charged
//   no           –                BILL                 none
//   yes          yes              BILL OF SUPPLY       never, at any rate
//   yes          no               TAX INVOICE          per line
//                                 (BILL OF SUPPLY when nothing on it is taxable)
//
// Every bill surface asks these helpers rather than reading the flags itself,
// because the rule was previously spelt out at four render sites and a fifth
// place decided the rate — which is how a per-drug GST rate could have put tax
// back on a composition dealer's bill.

/** The only parts of a tenant profile these rules depend on. */
export interface GstStatus {
  gst_enabled?: boolean | null
  gst_composition?: boolean | null
}

/** Composition dealers are registered too — they just cannot charge tax. */
export function isGstRegistered(p?: GstStatus | null): boolean {
  return !!(p?.gst_enabled || p?.gst_composition)
}

export function isCompositionDealer(p?: GstStatus | null): boolean {
  return !!p?.gst_composition
}

/** True when the hospital may put tax on a bill at all. */
export function mayChargeGst(p?: GstStatus | null): boolean {
  return !!p?.gst_enabled && !p?.gst_composition
}

export type BillDocKind = 'tax_invoice' | 'bill_of_supply' | 'plain'

/**
 * What this bill is, as a document. `taxed` is whether any line actually
 * carries tax; it is ignored for a composition dealer, whose bill is a Bill of
 * Supply even if a stray taxed line somehow reached it — the wording follows
 * the registration, not the arithmetic.
 */
export function billDocKind(p: GstStatus | null | undefined, taxed: boolean): BillDocKind {
  if (isCompositionDealer(p)) return 'bill_of_supply'
  if (!isGstRegistered(p)) return 'plain'
  return taxed ? 'tax_invoice' : 'bill_of_supply'
}

/**
 * The declaration a composition taxpayer must carry on every bill of supply,
 * as worded in the CGST Rules. Defined once: it is a legal string that appears
 * on a patient's bill, so it is changed here and nowhere else.
 */
export const COMPOSITION_DECLARATION =
  'Composition taxable person, not eligible to collect tax on supplies'

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface GstLineResult {
  /** Pre-tax value of the line. */
  taxableValue: number
  /** GST charged on the line (CGST + SGST combined). */
  taxAmount: number
}

/**
 * Splits a line's gross `amount` into its taxable value and GST.
 * - Exempt (rate ≤ 0): whole amount is taxable value, no GST.
 * - Inclusive (pharmacy MRP): GST is extracted from the amount.
 * - Exclusive (services/consumables billed net): GST is added on top, so the
 *   taxable value equals the amount and the caller adds `taxAmount` to the total.
 */
export function computeLineGst(amount: number, gstRate: number, taxInclusive: boolean): GstLineResult {
  if (!gstRate || gstRate <= 0) return { taxableValue: round2(amount), taxAmount: 0 }
  if (taxInclusive) {
    const taxable = amount / (1 + gstRate / 100)
    return { taxableValue: round2(taxable), taxAmount: round2(amount - taxable) }
  }
  return { taxableValue: round2(amount), taxAmount: round2((amount * gstRate) / 100) }
}

export interface GstBillItem {
  amount: number
  gst_rate: number
  tax_inclusive: boolean
}

export interface RateSummaryRow {
  rate: number
  taxableValue: number
  cgst: number
  sgst: number
  total: number
}

export interface BillGstSummary {
  /** Σ taxable value across all lines (net, pre-discount). */
  subtotal: number
  /** Σ GST across all lines. */
  taxTotal: number
  cgst: number
  sgst: number
  /** Taxable value + GST grouped by rate slab — the HSN/rate-wise tax summary. */
  rateSummary: RateSummaryRow[]
}

/** Aggregates GST across a bill's items, including a rate-wise summary table. */
export function summarizeBillGst(items: GstBillItem[]): BillGstSummary {
  const byRate = new Map<number, { taxable: number; tax: number }>()
  let subtotal = 0

  for (const it of items) {
    const { taxableValue, taxAmount } = computeLineGst(it.amount, it.gst_rate, it.tax_inclusive)
    subtotal += taxableValue
    const cur = byRate.get(it.gst_rate) ?? { taxable: 0, tax: 0 }
    cur.taxable += taxableValue
    cur.tax += taxAmount
    byRate.set(it.gst_rate, cur)
  }

  // One half is rounded, the other is derived — never both rounded. Rounding
  // each independently makes them overshoot on an odd-paisa total (tax 10.05 →
  // CGST 5.03 + SGST 5.03 = 10.06), and on a tax invoice CGST + SGST must equal
  // the tax charged. The odd paisa lands on SGST, consistently.
  const rateSummary: RateSummaryRow[] = [...byRate.entries()]
    .filter(([rate]) => rate > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => {
      const total = round2(v.tax)
      const cgst = round2(total / 2)
      return { rate, taxableValue: round2(v.taxable), cgst, sgst: round2(total - cgst), total }
    })

  // Summed FROM the rate rows rather than computed alongside them. The two must
  // agree because an invoice shows both: BillPdf prints the stored bill.cgst
  // (which comes from here) directly above a rate-wise table it recomputes from
  // the line items, so a paisa of drift between them is visible on the invoice
  // itself. Deriving one from the other removes the possibility rather than
  // making it unlikely.
  const cgst = round2(rateSummary.reduce((s, r) => s + r.cgst, 0))
  const sgst = round2(rateSummary.reduce((s, r) => s + r.sgst, 0))

  return { subtotal: round2(subtotal), taxTotal: round2(cgst + sgst), cgst, sgst, rateSummary }
}

/** Nearest-rupee round-off. Returns the signed adjustment and the final total. */
export function computeRoundOff(preRoundTotal: number): { roundOff: number; total: number } {
  const rounded = Math.round(preRoundTotal)
  return { roundOff: round2(rounded - preRoundTotal), total: rounded }
}

// ── Amount in words (Indian numbering: crore / lakh / thousand) ───────────────

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigit(n: number): string {
  if (n < 20) return ONES[n]
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`
}

function threeDigit(n: number): string {
  const hundred = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundred) parts.push(`${ONES[hundred]} Hundred`)
  if (rest) parts.push(twoDigit(rest))
  return parts.join(' ')
}

/** Converts a number into Indian-format words for the whole-rupee part. */
function wholeInWords(num: number): string {
  if (num === 0) return 'Zero'
  const crore = Math.floor(num / 10000000)
  const lakh = Math.floor((num % 10000000) / 100000)
  const thousand = Math.floor((num % 100000) / 1000)
  const hundred = num % 1000
  const parts: string[] = []
  if (crore) parts.push(`${wholeInWords(crore)} Crore`)
  if (lakh) parts.push(`${twoDigit(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigit(thousand)} Thousand`)
  if (hundred) parts.push(threeDigit(hundred))
  return parts.join(' ')
}

/** e.g. 1234.50 → "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only". */
export function rupeesInWords(amount: number): string {
  const rounded = round2(Math.abs(amount))
  const rupees = Math.floor(rounded)
  const paise = Math.round((rounded - rupees) * 100)
  let words = `Rupees ${wholeInWords(rupees)}`
  if (paise > 0) words += ` and ${twoDigit(paise)} Paise`
  return `${words} Only`
}
