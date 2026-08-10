// GST calculation helpers for Indian tax invoices.
//
// Model: each bill line carries a `gstRate` (%) and a `taxInclusive` flag
// (true for pharmacy MRP, where GST is already baked into the price). Tax is
// computed per line, then split equally into CGST + SGST for intra-state supply
// (the place of supply for healthcare is the hospital, so IGST rarely applies).

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
  let taxTotal = 0

  for (const it of items) {
    const { taxableValue, taxAmount } = computeLineGst(it.amount, it.gst_rate, it.tax_inclusive)
    subtotal += taxableValue
    taxTotal += taxAmount
    const cur = byRate.get(it.gst_rate) ?? { taxable: 0, tax: 0 }
    cur.taxable += taxableValue
    cur.tax += taxAmount
    byRate.set(it.gst_rate, cur)
  }

  subtotal = round2(subtotal)
  taxTotal = round2(taxTotal)

  const rateSummary: RateSummaryRow[] = [...byRate.entries()]
    .filter(([rate]) => rate > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({
      rate,
      taxableValue: round2(v.taxable),
      cgst: round2(v.tax / 2),
      sgst: round2(v.tax / 2),
      total: round2(v.tax),
    }))

  return { subtotal, taxTotal, cgst: round2(taxTotal / 2), sgst: round2(taxTotal / 2), rateSummary }
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
