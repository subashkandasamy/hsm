/**
 * Three GST registrations, not two — and a composition dealer may never tax.
 *
 *   npm run verify:gst-composition
 *
 * KMCH's own SwiftEHR pharmacy bill prints "GST Composition Dealer". Under
 * s.10 CGST Act such a hospital holds a GSTIN but may NOT collect tax from the
 * patient; the document is a Bill of Supply carrying a declaration, and a tax
 * invoice would be the breach rather than the compliance.
 *
 * The cases that matter are the leak paths. Every bill line resolves its rate
 * through `resolveLineGst`, which prefers the charge's OWN rate over the
 * per-source default — a pharmacy line inherits its batch's 5% or 12% from the
 * goods receipt, and room rent arrives the same way. Those rates exist on the
 * data whatever the hospital's registration is, so each one is a way tax could
 * land on a bill that must not carry any.
 */

import {
  billDocKind, isGstRegistered, isCompositionDealer, mayChargeGst,
  COMPOSITION_DECLARATION, computeLineGst,
} from '../src/lib/gst'
import { gstForSource, resolveLineGst, canTax, isRegistered, roomRentGstRate, type GstConfig } from '../src/lib/billing/gst'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

const NONE: GstConfig        = { enabled: false, composition: false, pharmacyRate: 12 }
const COMPOSITION: GstConfig = { enabled: false, composition: true,  pharmacyRate: 12 }
const REGULAR: GstConfig     = { enabled: true,  composition: false, pharmacyRate: 12 }
/** Should not occur, but must not charge tax if it ever does. */
const BOTH: GstConfig        = { enabled: true,  composition: true,  pharmacyRate: 12 }

console.log('\nWho is registered, and who may charge')
for (const [name, cfg, reg, tax] of [
  ['not registered', NONE,        false, false],
  ['composition',    COMPOSITION, true,  false],
  ['regular',        REGULAR,     true,  true],
  ['both flags set', BOTH,        true,  false],
] as [string, GstConfig, boolean, boolean][]) {
  check(isRegistered(cfg) === reg, `${name.padEnd(15)} registered → ${reg}`, isRegistered(cfg))
  check(canTax(cfg) === tax,       `${name.padEnd(15)} may charge → ${tax}`, canTax(cfg))
}

console.log('\nA composition dealer is taxed 0% on every source')
for (const src of ['pharmacy', 'ipd_pharmacy', 'pharmacy_sale_item', 'vaccine', 'ot_consumable', 'bed', 'lab', 'consultation'] as const) {
  const r = gstForSource(src as never, COMPOSITION)
  check(r.rate === 0, `${src.padEnd(20)} → 0%`, r)
}
console.log('  …while a regular hospital is not:')
check(gstForSource('pharmacy' as never, REGULAR).rate === 12, 'pharmacy → 12%')
check(gstForSource('ot_consumable' as never, REGULAR).rate === 12, 'ot_consumable → 12%')

console.log("\nThe leak path: a charge's OWN rate must not override composition")
for (const [label, src, override] of [
  ["a batch's 12% on a pharmacy line", 'pharmacy', 12],
  ["a batch's 5% on a device line",    'pharmacy', 5],
  ['a drug rate on a counter sale',    'pharmacy_sale_item', 18],
  ['room rent at 5%',                  'bed', 5],
  ['a consumable at 18%',              'ot_consumable', 18],
] as [string, string, number][]) {
  const r = resolveLineGst(src as never, COMPOSITION, { gst_rate: override, hsn_sac: '30049099' })
  check(r.rate === 0, `${label.padEnd(34)} → 0%`, r.rate)
}
check(resolveLineGst('pharmacy' as never, BOTH, { gst_rate: 12 }).rate === 0,
  'and still 0 when both flags are set', resolveLineGst('pharmacy' as never, BOTH, { gst_rate: 12 }).rate)
check(resolveLineGst('pharmacy' as never, REGULAR, { gst_rate: 5 }).rate === 5,
  "but a regular hospital's own 5% is honoured", resolveLineGst('pharmacy' as never, REGULAR, { gst_rate: 5 }).rate)

console.log('\nRoom rent: the rate still computes, the hospital just cannot charge it')
check(roomRentGstRate({ dailyRate: 6000, isIcu: false }) === 5, 'a ₹6,000 ward room is a 5% rate')
check(resolveLineGst('bed' as never, COMPOSITION, { gst_rate: roomRentGstRate({ dailyRate: 6000, isIcu: false }) }).rate === 0,
  '…but 0% reaches a composition dealer\'s bill')

console.log('\nHSN still prints on a bill of supply (it follows registration, not tax)')
check(resolveLineGst('pharmacy' as never, COMPOSITION, { hsn_sac: '30049099' }).hsn === '30049099', 'composition keeps HSN')
check(resolveLineGst('pharmacy' as never, NONE, { hsn_sac: '30049099' }).hsn === null, 'unregistered drops it')

console.log('\nWhat the document is called')
check(billDocKind({ gst_enabled: false, gst_composition: false }, false) === 'plain', 'unregistered → plain Bill')
check(billDocKind({ gst_enabled: false, gst_composition: false }, true) === 'plain', 'unregistered stays plain even if a line is taxed')
check(billDocKind({ gst_enabled: true, gst_composition: false }, true) === 'tax_invoice', 'regular + tax → Tax Invoice')
check(billDocKind({ gst_enabled: true, gst_composition: false }, false) === 'bill_of_supply', 'regular, nothing taxable → Bill of Supply')
check(billDocKind({ gst_enabled: true, gst_composition: true }, false) === 'bill_of_supply', 'composition → Bill of Supply')
check(billDocKind({ gst_enabled: true, gst_composition: true }, true) === 'bill_of_supply',
  'composition → Bill of Supply even if a taxed line somehow got through')
check(billDocKind(null, false) === 'plain', 'no profile → plain')
check(billDocKind(undefined, true) === 'plain', 'undefined profile → plain')

console.log('\nThe declaration exists and is not empty')
check(/composition/i.test(COMPOSITION_DECLARATION), 'it names the scheme')
check(/not eligible to collect tax/i.test(COMPOSITION_DECLARATION), 'and says tax cannot be collected')
check(isCompositionDealer({ gst_composition: true }), 'isCompositionDealer reads the flag')
check(!isCompositionDealer({ gst_enabled: true }), 'a regular registration is not composition')
check(isGstRegistered({ gst_composition: true }), 'a composition dealer IS registered')

console.log('\nThe money: a ₹112 pharmacy line, same MRP, three registrations')
for (const [name, cfg, wantTax] of [
  ['not registered', NONE,        0],
  ['composition',    COMPOSITION, 0],
  ['regular @12%',   REGULAR,     12],
] as [string, GstConfig, number][]) {
  const { rate, inclusive } = resolveLineGst('pharmacy' as never, cfg, { gst_rate: 12 })
  const { taxableValue, taxAmount } = computeLineGst(112, rate, inclusive)
  const ok = Math.abs(taxAmount - wantTax) < 0.01 && Math.abs(taxableValue + taxAmount - 112) < 0.01
  check(ok, `${name.padEnd(15)} patient pays ₹112 · taxable ${taxableValue.toFixed(2)} · tax ${taxAmount.toFixed(2)}`)
}

console.log(failed === 0
  ? '\nA composition dealer cannot be taxed by any route, and their bill says what it is.\n'
  : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
