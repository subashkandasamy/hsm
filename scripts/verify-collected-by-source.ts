/**
 * Collected-by-department arithmetic (src/lib/billing/collectedBySource.ts).
 *
 *   npm run verify:collected-by-source
 *
 * The rule that matters: the departments of a payment add up to the payment,
 * to the paisa, so the day's split reconciles to the money that arrived.
 */

import { collectedBySource } from '../src/lib/billing/collectedBySource'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}
const amt = (r: ReturnType<typeof collectedBySource>, s: string) => r.bySource.find((x) => x.source === s)?.amount ?? 0
const sum = (r: ReturnType<typeof collectedBySource>) => Math.round((r.bySource.reduce((t, x) => t + x.amount, 0) + r.unattributed) * 100) / 100

console.log('\nOne department per bill — exact')
const a = collectedBySource(
  [{ bill_id: 'b1', amount: 300 }, { bill_id: 'b2', amount: 550 }],
  [{ bill_id: 'b1', source: 'consultation', amount: 300 }, { bill_id: 'b2', source: 'lab', amount: 550 }])
check(amt(a, 'consultation') === 300 && amt(a, 'lab') === 550, 'consultation ₹300 and lab ₹550, as paid')

console.log('\nA mixed bill is shared in proportion')
const b = collectedBySource([{ bill_id: 'm', amount: 850 }],
  [{ bill_id: 'm', source: 'consultation', amount: 300 }, { bill_id: 'm', source: 'lab', amount: 550 }])
check(amt(b, 'consultation') === 300 && amt(b, 'lab') === 550, 'a full payment of a mixed bill splits by its lines')
const c = collectedBySource([{ bill_id: 'm', amount: 425 }],
  [{ bill_id: 'm', source: 'consultation', amount: 300 }, { bill_id: 'm', source: 'lab', amount: 550 }])
check(amt(c, 'consultation') === 150 && amt(c, 'lab') === 275, 'a half payment splits half of each')

console.log('\nRounding never loses or invents a paisa')
const d = collectedBySource([{ bill_id: 'x', amount: 100 }],
  [{ bill_id: 'x', source: 'lab', amount: 1 }, { bill_id: 'x', source: 'radiology', amount: 1 }, { bill_id: 'x', source: 'consultation', amount: 1 }])
check(sum(d) === 100, '₹100 over three equal lines still totals ₹100.00', d)
const e = collectedBySource([{ bill_id: 'y', amount: 0.01 }],
  [{ bill_id: 'y', source: 'lab', amount: 2 }, { bill_id: 'y', source: 'radiology', amount: 1 }])
check(sum(e) === 0.01, 'one paisa is placed somewhere, not lost', e)

console.log('\nWhat cannot be placed is said, not guessed')
const f = collectedBySource([{ bill_id: 'none', amount: 75 }], [])
check(f.unattributed === 75 && f.bySource.length === 0, 'a payment on a bill with no lines is unattributed')
const g = collectedBySource([{ bill_id: 'z', amount: 40 }], [{ bill_id: 'z', source: 'manual', amount: 0 }])
check(g.unattributed === 40, 'a bill whose lines are all zero is unattributed')

console.log('\nSame department twice on a bill counts once')
const h = collectedBySource([{ bill_id: 'p', amount: 200 }],
  [{ bill_id: 'p', source: 'pharmacy', amount: 120 }, { bill_id: 'p', source: 'pharmacy', amount: 80 }])
check(amt(h, 'pharmacy') === 200 && h.bySource[0].lines === 1, 'two pharmacy lines → one pharmacy share of ₹200')

console.log(failed === 0 ? '\nEvery payment reconciles to its departments.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
