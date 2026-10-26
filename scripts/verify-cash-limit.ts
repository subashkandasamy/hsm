/**
 * The ₹2,00,000 cash rule, at its edges.
 *
 *   npm run verify:cash-limit
 *
 * A threshold out of an Act is worth testing to the rupee. The Act says "two
 * lakh rupees or more", so ₹2,00,000 exactly is already a contravention —
 * writing that as `>` rather than `>=` would let through the single most
 * likely round number a family actually hands over.
 *
 * It is also an aggregate, per person per day. The failure this guards is not
 * one large payment; it is two ordinary ones.
 */

import { cashPosition, cashWarning, CASH_LIMIT } from '../src/lib/billing/cashLimit'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nThe boundary')
check(CASH_LIMIT === 200_000, 'the limit is two lakh')
check(cashPosition(0, 199_999).breaches === false, '₹1,99,999 in one go is allowed')
check(cashPosition(0, 200_000).breaches === true, '₹2,00,000 exactly already breaches — "or more"')
check(cashPosition(0, 200_001).breaches === true, 'and anything above it')
check(cashPosition(199_999.99, 0.01).breaches === true, 'reached a paisa at a time, it still breaches')

console.log('\nIt aggregates — which is the whole point')
check(cashPosition(150_000, 100_000).breaches === true,
  '₹1.5 lakh for surgery then ₹1 lakh for the room, same day, same patient')
check(cashPosition(150_000, 100_000).wouldBe === 250_000, 'and the exposure is the full ₹2.5 lakh',
  cashPosition(150_000, 100_000).wouldBe)
check(cashPosition(50_000, 50_000).breaches === false, 'two ordinary payments are not a problem')

console.log('\nHeadroom')
check(cashPosition(0, 0).headroom === 200_000, 'a fresh day has the whole limit')
check(cashPosition(180_000, 0).headroom === 20_000, 'after ₹1.8 lakh, ₹20,000 is left')
check(cashPosition(250_000, 0).headroom === 0, 'past the limit there is no headroom, not a negative one')

console.log('\nWhat the counter is told')
const over = cashWarning(cashPosition(150_000, 100_000))
check(!!over && over.includes('2,50,000'), 'a breach names the exposure, not just the limit', over)
check(!!over && over.includes('269ST'), 'and the section, so a manager can look it up')
check(!!over && /UPI|card|bank/.test(over), 'and says what to do instead')
check(cashWarning(cashPosition(185_000, 0))?.includes('15,000') === true,
  'approaching, it says how much cash is still possible',
  cashWarning(cashPosition(185_000, 0)))
check(cashWarning(cashPosition(1_000, 500)) === null, 'an ordinary payment says nothing at all')
check(cashWarning(cashPosition(0, 0)) === null, 'and neither does an empty box')

console.log('\nRubbish in')
check(cashPosition(-5, 100).alreadyToday === 0, 'a negative total cannot create headroom')
check(cashPosition(0, -100).adding === 0, 'nor a negative payment')

console.log(failed === 0 ? '\nAll cash-limit checks passed.\n' : `\n${failed} FAILED\n`)
process.exit(failed ? 1 : 0)
