/**
 * A UPI or bank-transfer payment must carry its UTR (src/lib/schemas).
 *
 *   npm run verify:payment-reference
 *
 * There is no payment gateway, so "paid" is a person's word; the UTR is what
 * matches a bill to the bank statement. Cash and card are not held to it.
 */

import { RecordPaymentSchema, RecordGroupPaymentSchema } from '../src/lib/schemas'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}
const BILL = '11111111-1111-4111-8111-111111111111'
const one = (method: string, reference?: string | null) => RecordPaymentSchema.safeParse({ bill_id: BILL, amount: 100, method, reference })
const many = (method: string, reference?: string | null) => RecordGroupPaymentSchema.safeParse({ bill_ids: [BILL], amount: 100, method, reference })

for (const [name, parse] of [['single bill', one], ['several bills', many]] as const) {
  console.log(`\n${name}`)
  const r = parse('upi', null)
  check(!r.success && r.error.issues[0].path[0] === 'reference', 'UPI with no UTR is refused, on the reference field')
  check(!parse('upi', '   ').success, 'a UTR of spaces is no UTR')
  check(!parse('bank_transfer', 'abc').success, 'a bank transfer needs a real reference too')
  check(parse('upi', '412345678901').success, 'UPI with a 12-digit UTR is accepted')
  check(parse('upi', 'T2311081234567890123456').success, 'a longer app transaction id is accepted (no format check)')
  check(parse('cash', null).success, 'cash needs no reference')
  check(parse('card', undefined).success, 'card needs no reference')
}
check(one('insurance', null).success, 'insurance (single bill) is not held to it — a settlement records its claim')

console.log(failed === 0 ? '\nUPI and bank payments carry their UTR.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
