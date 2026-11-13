/**
 * verify:package-price — a package's shares always add up to its price, follow
 * each test's own price, and give women-only / men-only tests to the right
 * patient.
 *
 * Run: npm run verify:package-price
 */
import { appliesToPatient, sharePackagePrice } from '../src/lib/lab/packagePrice'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}
const sum = (m: Map<string, number>) => Math.round([...m.values()].reduce((s, x) => s + x, 0) * 100) / 100

// KMCH's Basic Health Check-Up: ₹5,000 for tests worth ₹4,460 on their own.
const basic = [
  { key: 'cbc', price: 300 }, { key: 'group', price: 150 }, { key: 'sugar', price: 120 }, { key: 'hba1c', price: 600 },
  { key: 'rft', price: 750 }, { key: 'lipid', price: 750 }, { key: 'lft', price: 800 }, { key: 'elec', price: 600 },
  { key: 'urine', price: 200 }, { key: 'ecg', price: 200 },
]
const b = sharePackagePrice(5000, basic)
check('shares add up to the package price (above the separate total)', sum(b) === 5000, `₹${sum(b)}`)
check('a dearer test gets a bigger share', (b.get('lft') ?? 0) > (b.get('cbc') ?? 0))
check('shares follow the tests\' own prices', Math.abs((b.get('lft') ?? 0) / (b.get('cbc') ?? 1) - 800 / 300) < 0.01)

const cheaper = sharePackagePrice(3000, basic)
check('shares add up when the package is cheaper than the tests', sum(cheaper) === 3000, `₹${sum(cheaper)}`)

const thirds = sharePackagePrice(100, [{ key: 'a', price: 50 }, { key: 'b', price: 50 }, { key: 'c', price: 50 }])
check('rounding paise go somewhere — 100 over three is 33.34 + 33.33 + 33.33',
  sum(thirds) === 100 && thirds.get('a') === 33.34 && thirds.get('b') === 33.33, JSON.stringify([...thirds]))

const free = sharePackagePrice(500, [{ key: 'a', price: 0 }, { key: 'b', price: 0 }])
check('tests free on their own share the price equally', free.get('a') === 250 && free.get('b') === 250)

const one = sharePackagePrice(1234.5, [{ key: 'only', price: 10 }])
check('a single test carries the whole price', one.get('only') === 1234.5)

const odd = sharePackagePrice(5340, [
  { key: 'a', price: 300 }, { key: 'b', price: 199.99 }, { key: 'c', price: 0 }, { key: 'd', price: 4860 },
])
check('awkward prices still add up exactly', sum(odd) === 5340, `₹${sum(odd)}`)
check('a test free on its own gets no share when others are priced', odd.get('c') === 0)
check('no share is negative', [...odd.values()].every((x) => x >= 0))

check('women-only test goes to a woman', appliesToPatient('female', 'female'))
check('women-only test does not go to a man', !appliesToPatient('female', 'male'))
check('men-only test goes to a man', appliesToPatient('male', 'male'))
check('men-only test does not go to a woman', !appliesToPatient('male', 'female'))
check('sex not recorded: both are kept', appliesToPatient('female', null) && appliesToPatient('male', null))
check("sex 'other': both are kept", appliesToPatient('female', 'other') && appliesToPatient('male', 'other'))
check('everyone means everyone', appliesToPatient('all', 'male') && appliesToPatient('all', null))

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll package price checks passed')
process.exit(failed ? 1 : 0)
