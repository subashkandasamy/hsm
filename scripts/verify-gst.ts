/**
 * The arithmetic a GST tax invoice has to survive being audited on.
 *
 *   npm run verify:gst
 *
 * One invariant matters more than any rounding preference: CGST + SGST must
 * equal the tax charged. It is printed on the invoice in two places — the
 * bill-level CGST/SGST line and the rate-wise summary table — and a GST audit
 * reads both. Rounding each half independently breaks it for every odd-paisa
 * total, which is roughly half of them.
 *
 * So this does not test "the numbers look right". It asserts the identities,
 * then sweeps a few thousand bills looking for a counter-example, because a
 * paisa is exactly the size of error that no one notices by reading.
 */

import { summarizeBillGst, computeLineGst, computeRoundOff, round2, rupeesInWords } from '../src/lib/gst'
import { roomRentGstRate, ROOM_RENT_GST_RATE, ROOM_RENT_GST_THRESHOLD } from '../src/lib/billing/gst'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

// ── The case named in the finding ────────────────────────────────────────────
// A 5% exclusive line of ₹201 gives tax 10.05, whose halves are 5.025 each.
// Rounded independently: 5.03 + 5.03 = 10.06, a paisa more than was charged.
console.log('\nThe odd paisa (F-29)')
{
  const g = summarizeBillGst([{ amount: 201, gst_rate: 5, tax_inclusive: false }])
  check(g.taxTotal === 10.05, 'tax on ₹201 at 5% is ₹10.05', g.taxTotal)
  check(round2(g.cgst + g.sgst) === g.taxTotal,
    'CGST + SGST equals the tax charged', { cgst: g.cgst, sgst: g.sgst, tax: g.taxTotal })
  check(round2(Math.abs(g.cgst - g.sgst)) <= 0.01,
    'and the two halves still differ by at most a paisa', { cgst: g.cgst, sgst: g.sgst })
}

// ── The identities, on every shape of bill ───────────────────────────────────
const shapes: { label: string; items: { amount: number; gst_rate: number; tax_inclusive: boolean }[] }[] = [
  { label: 'a single exempt consultation', items: [{ amount: 500, gst_rate: 0, tax_inclusive: false }] },
  { label: 'pharmacy at MRP (inclusive)', items: [{ amount: 123.45, gst_rate: 12, tax_inclusive: true }] },
  { label: 'an OT consumable at 12% on top', items: [{ amount: 1750, gst_rate: 12, tax_inclusive: false }] },
  { label: 'exempt + taxable together', items: [
    { amount: 500, gst_rate: 0, tax_inclusive: false },
    { amount: 201, gst_rate: 5, tax_inclusive: false },
  ] },
  { label: 'three different slabs on one bill', items: [
    { amount: 201, gst_rate: 5, tax_inclusive: false },
    { amount: 999.99, gst_rate: 12, tax_inclusive: true },
    { amount: 4500.55, gst_rate: 18, tax_inclusive: false },
  ] },
  { label: 'many small odd-paisa lines in one slab', items:
    Array.from({ length: 17 }, (_, i) => ({ amount: 20.01 + i * 3.33, gst_rate: 5, tax_inclusive: false })) },
  { label: 'an empty bill', items: [] },
]

console.log('\nThe identities that must hold on every bill')
for (const { label, items } of shapes) {
  const g = summarizeBillGst(items)

  const halvesTie = round2(g.cgst + g.sgst) === g.taxTotal
  const rowsTieToBill =
    round2(g.rateSummary.reduce((s, r) => s + r.cgst, 0)) === g.cgst &&
    round2(g.rateSummary.reduce((s, r) => s + r.sgst, 0)) === g.sgst
  const rowsTieInternally = g.rateSummary.every((r) => round2(r.cgst + r.sgst) === r.total)

  check(halvesTie && rowsTieToBill && rowsTieInternally, label, {
    tax: g.taxTotal, cgst: g.cgst, sgst: g.sgst,
    halvesTie, rowsTieToBill, rowsTieInternally,
  })
}

// ── A sweep, because one paisa hides well ────────────────────────────────────
// Every rate the app can apply, against amounts that land on every paisa.
console.log('\nSweep: every slab × 2,400 amounts, inclusive and exclusive')
{
  const rates = [0, 5, 12, 18, 28]
  let worstTax = 0
  let worstRows = 0
  let n = 0
  for (const rate of rates) {
    for (const inclusive of [false, true]) {
      for (let paise = 1; paise <= 2400; paise++) {
        const amount = round2(paise * 1.37)  // walks all 100 paise endings
        const g = summarizeBillGst([{ amount, gst_rate: rate, tax_inclusive: inclusive }])
        n++
        worstTax = Math.max(worstTax, Math.abs(round2(g.cgst + g.sgst) - g.taxTotal))
        const rowCgst = round2(g.rateSummary.reduce((s, r) => s + r.cgst, 0))
        worstRows = Math.max(worstRows, Math.abs(rowCgst - g.cgst))
      }
    }
  }
  check(worstTax === 0, `CGST + SGST never drifts from tax (${n} bills)`, { worstTax })
  check(worstRows === 0, 'the rate rows never drift from the bill totals', { worstRows })
}

// ── Multi-line sweep, where the per-slab grouping does the rounding ──────────
console.log('\nSweep: multi-line bills, where grouping rounds twice')
{
  let worst = 0
  let worstCase: unknown = null
  for (let seed = 1; seed <= 3000; seed++) {
    const items = Array.from({ length: 1 + (seed % 7) }, (_, i) => ({
      amount: round2(((seed * 7 + i * 13) % 9999) / 3 + 0.01),
      gst_rate: [0, 5, 12, 18, 28][(seed + i) % 5],
      tax_inclusive: (seed + i) % 3 === 0,
    }))
    const g = summarizeBillGst(items)
    const drift = Math.abs(round2(g.cgst + g.sgst) - g.taxTotal)
    if (drift > worst) { worst = drift; worstCase = { items, g } }
  }
  check(worst === 0, 'CGST + SGST equals tax across 3,000 mixed-slab bills', worstCase)
}

// ── What the old code did, kept as the reason this script exists ─────────────
console.log('\nThe behaviour this replaced')
{
  const tax = 10.05
  const bothRounded = round2(round2(tax / 2) + round2(tax / 2))
  check(bothRounded === 10.06,
    'rounding both halves gave ₹10.06 against ₹10.05 of tax — the defect, reproduced', bothRounded)
  const oneDerived = round2(round2(tax / 2) + round2(tax - round2(tax / 2)))
  check(oneDerived === tax, 'deriving the second half ties exactly', oneDerived)
}

// ── Neighbouring arithmetic the invoice also depends on ──────────────────────
console.log('\nThe rest of the invoice')
{
  const line = computeLineGst(112, 12, true)
  check(round2(line.taxableValue + line.taxAmount) === 112,
    'an inclusive line splits back into exactly the MRP', line)
  const { roundOff, total } = computeRoundOff(1234.49)
  check(total === 1234 && roundOff === -0.49, 'round-off is to the nearest rupee and signed', { roundOff, total })
  check(computeRoundOff(1234.50).total === 1235, 'a half rupee rounds up')
  check(rupeesInWords(1234.5) === 'Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only',
    'the words match the figures', rupeesInWords(1234.5))
  check(rupeesInWords(0) === 'Rupees Zero Only', 'and zero reads as zero', rupeesInWords(0))
}

// ── Room rent (F-30) ────────────────────────────────────────────────────────
// 5% on a non-ICU room above Rs 5,000/day. The threshold is the part most
// easily got wrong, and a live ward sits on exactly Rs 5,000.
console.log('\nRoom rent above Rs 5,000 (F-30)')
{
  const nonIcu = (dailyRate: number) => roomRentGstRate({ dailyRate, isIcu: false })

  check(ROOM_RENT_GST_THRESHOLD === 5000 && ROOM_RENT_GST_RATE === 5,
    'the rule is 5% above Rs 5,000')
  check(nonIcu(5000) === 0,
    'a room at exactly Rs 5,000 is EXEMPT — the rule says "above"', nonIcu(5000))
  check(nonIcu(5000.01) === 5, 'a paisa above the threshold is taxable', nonIcu(5000.01))
  check(nonIcu(4500) === 0, 'Rs 4,500 is exempt', nonIcu(4500))
  check(nonIcu(25000) === 5, 'Rs 25,000 is taxable', nonIcu(25000))

  check(roomRentGstRate({ dailyRate: 25000, isIcu: true }) === 0,
    'an ICU is exempt at any rate — Rs 25,000 ICU included')
  check(roomRentGstRate({ dailyRate: 9000, isIcu: true }) === 0, 'and at Rs 9,000')

  // Unknown room type: exempt on purpose. Over-taxing an ICU bill takes money
  // from a family and is printed on the invoice they are handed; omitting it is
  // the hospital's own exposure and recoverable.
  check(roomRentGstRate({ dailyRate: 25000, isIcu: null }) === 0,
    'an unknown room type is treated as exempt, not taxed on a guess')
  check(roomRentGstRate({ dailyRate: 25000, isIcu: undefined }) === 0,
    'same when the embed is missing entirely')

  // The 5% applies to the WHOLE charge, not the part above Rs 5,000.
  const g = summarizeBillGst([{ amount: 6000, gst_rate: nonIcu(6000), tax_inclusive: false }])
  check(g.taxTotal === 300,
    'a Rs 6,000 room is taxed Rs 300 on the full charge, not Rs 50 on the excess', g.taxTotal)
  check(round2(g.cgst + g.sgst) === g.taxTotal, 'and the halves still tie', g)

  // A week in a taxable room, which is how it actually appears on a bill.
  const week = summarizeBillGst([{ amount: 7 * 6000, gst_rate: nonIcu(6000), tax_inclusive: false }])
  check(week.taxTotal === 2100 && week.cgst === 1050 && week.sgst === 1050,
    'seven nights at Rs 6,000: Rs 2,100 tax, split Rs 1,050 / Rs 1,050', week)

  // An ICU stay and a ward stay on one bill: only the ward line is taxed.
  const mixed = summarizeBillGst([
    { amount: 3 * 25000, gst_rate: roomRentGstRate({ dailyRate: 25000, isIcu: true }), tax_inclusive: false },
    { amount: 2 * 6000,  gst_rate: nonIcu(6000), tax_inclusive: false },
  ])
  check(mixed.taxTotal === 600 && mixed.subtotal === 87000,
    'three ICU nights plus two ward nights: tax only on the ward', mixed)
}

console.log(failed === 0
  ? '\nAll GST invariants hold.\n'
  : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
