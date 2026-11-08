/**
 * Which account each rupee is owed to (src/lib/billing/collectionAccounts.ts).
 *
 *   npm run verify:collection-accounts
 *
 * The rules that matter: a department with no account set goes to main; an
 * account's dues always add up to the bill's balance; money paid into one
 * account never shows as paid to another.
 */

import {
  billDueByAccount, dueByAccount, allocateToAccount, departmentOf, MAIN, type PlanBill,
} from '../src/lib/billing/collectionAccounts'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}
const obj = (m: Map<string, number>) => Object.fromEntries([...m].sort())
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const r2 = (n: number) => Math.round(n * 100) / 100
const sumMap = (m: Map<string, number>) => r2([...m.values()].reduce((s, v) => s + v, 0))

const PHARMA = 'acct-pharma', LABRAD = 'acct-labrad'
const active = new Set([PHARMA, LABRAD])
const bill = (id: string, total: number, items: Array<[string, number]>, payments: PlanBill['payments'] = []): PlanBill =>
  ({ id, total, items: items.map(([source, amount]) => ({ source, amount })), payments })

console.log('\nThe user\'s three examples')
{
  const b = bill('b1', 1000, [['consultation', 300], ['pharmacy', 500], ['lab', 200]])
  check(same(obj(billDueByAccount(b, {}, active)), { [MAIN]: 1000 }), 'only main set: everything to main')
  check(same(obj(billDueByAccount(b, { pharmacy: PHARMA }, active)), { [PHARMA]: 500, [MAIN]: 500 }),
    'main + pharma: pharmacy to pharma, lab falls back to main')
  check(same(obj(billDueByAccount(b, { pharmacy: PHARMA, lab: LABRAD }, active)), { [LABRAD]: 200, [PHARMA]: 500, [MAIN]: 300 }),
    'all three: each to its own')
}

console.log('\nFalling back to main')
{
  const b = bill('b1', 500, [['pharmacy', 500]])
  check(same(obj(billDueByAccount(b, { pharmacy: 'acct-gone' }, active)), { [MAIN]: 500 }), 'an inactive / removed account → main')
  check(same(obj(billDueByAccount(bill('b2', 250, []), { pharmacy: PHARMA }, active)), { [MAIN]: 250 }), 'a bill with no lines → main')
  check(departmentOf('something_new') === 'other' && departmentOf(null) === 'other', 'an unknown source is "other", not dropped')
  check(departmentOf('ipd_pharmacy') === 'pharmacy' && departmentOf('pharmacy_sale_item') === 'pharmacy', 'ward and counter pharmacy are pharmacy')
}

console.log('\nGST and round-off are shared in proportion; dues add up to the balance')
{
  // lines are pre-tax; the total carries GST + round-off
  const b = bill('b1', 1181, [['consultation', 333.33], ['pharmacy', 666.67]])
  const d = billDueByAccount(b, { pharmacy: PHARMA }, active)
  check(sumMap(d) === 1181, 'sum of dues = bill total', obj(d))
  check(d.get(PHARMA)! > d.get(MAIN)!, 'larger line, larger share', obj(d))
}

console.log('\nPayments already made')
{
  const routes = { pharmacy: PHARMA }
  const base: Array<[string, number]> = [['consultation', 300], ['pharmacy', 500]]
  const upiMain = billDueByAccount(bill('b', 800, base, [{ amount: 300, method: 'upi', account_id: null }]), routes, active)
  check(same(obj(upiMain), { [PHARMA]: 500 }), 'UPI with no account went to main — main is cleared, pharma untouched', obj(upiMain))
  const upiPharma = billDueByAccount(bill('b', 800, base, [{ amount: 200, method: 'upi', account_id: PHARMA }]), routes, active)
  check(same(obj(upiPharma), { [PHARMA]: 300, [MAIN]: 300 }), 'part UPI to pharma reduces only pharma', obj(upiPharma))
  const cash = billDueByAccount(bill('b', 800, base, [{ amount: 400, method: 'cash', account_id: null }]), routes, active)
  check(same(obj(cash), { [PHARMA]: 250, [MAIN]: 150 }), 'cash is shared in proportion', obj(cash))
  const spill = billDueByAccount(bill('b', 800, base, [{ amount: 600, method: 'upi', account_id: PHARMA }]), routes, active)
  check(same(obj(spill), { [MAIN]: 200 }), 'more paid to pharma than its share spills over to the rest', obj(spill))
  const cashThenLab = billDueByAccount(bill('b', 200, [['lab', 150], ['consultation', 50]],
    [{ amount: 100, method: 'cash', account_id: null }, { amount: 75, method: 'upi', account_id: PHARMA }]), { lab: PHARMA }, active)
  check(same(obj(cashThenLab), { [MAIN]: 25 }), 'cash first, then the other account pays its part — main still owes its own 25, not less', obj(cashThenLab))
  const labThenCash = billDueByAccount(bill('b', 200, [['lab', 150], ['consultation', 50]],
    [{ amount: 75, method: 'upi', account_id: PHARMA }, { amount: 100, method: 'cash', account_id: null }]), { lab: PHARMA }, active)
  check(same(obj(labThenCash), obj(cashThenLab)), 'the order the payments came in does not change who is owed what', obj(labThenCash))
  const spill3 = billDueByAccount(bill('b', 1000, [['consultation', 300], ['lab', 300], ['pharmacy', 400]],
    [{ amount: 600, method: 'upi', account_id: PHARMA }]), { pharmacy: PHARMA, lab: LABRAD }, active)
  check(same(obj(spill3), { [LABRAD]: 200, [MAIN]: 200 }), 'an overpaid account\'s excess is shared fairly between the other two', obj(spill3))
  const paid = billDueByAccount(bill('b', 800, base, [{ amount: 800, method: 'cash', account_id: null }]), routes, active)
  check(paid.size === 0, 'a paid bill owes nobody')
  const mixed = bill('b', 999.99, [['consultation', 333.33], ['pharmacy', 333.33], ['lab', 333.33]],
    [{ amount: 100.01, method: 'card', account_id: null }, { amount: 50, method: 'upi', account_id: LABRAD }])
  const md = billDueByAccount(mixed, { pharmacy: PHARMA, lab: LABRAD }, active)
  check(sumMap(md) === r2(999.99 - 150.01), 'awkward paise still add up to the balance', obj(md))
}

console.log('\nA visit: several bills, one QR per account')
{
  const routes = { pharmacy: PHARMA }
  const bills = [
    bill('consult', 300, [['consultation', 300]]),
    bill('mixed', 700, [['consultation', 200], ['pharmacy', 500]]),
    bill('pharm', 400, [['pharmacy', 400]]),
  ]
  const plan = dueByAccount(bills, routes, active)
  check(plan[0].account === MAIN, 'main listed first')
  check(same(plan.map((p) => [p.account, p.due]), [[MAIN, 500], [PHARMA, 900]]), 'main ₹500, pharma ₹900', plan)
  const pharma = plan.find((p) => p.account === PHARMA)!
  check(same(allocateToAccount(pharma, 900), [{ bill_id: 'mixed', amount: 500 }, { bill_id: 'pharm', amount: 400 }]),
    'pharma money lands only on pharmacy lines — never on the consultation')
  check(same(allocateToAccount(pharma, 600), [{ bill_id: 'mixed', amount: 500 }, { bill_id: 'pharm', amount: 100 }]), 'part payment fills bills in order')
  check(allocateToAccount(pharma, 901) === null, 'more than the account is owed is refused')
  check(allocateToAccount(pharma, 0) === null, 'nothing is refused')
}

console.log(failed ? `\n${failed} FAILED\n` : '\nEvery rupee goes to the account its department is set to.\n')
process.exit(failed ? 1 : 0)
