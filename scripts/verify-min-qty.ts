/**
 * The minimum quantity that drives the low-stock alert.
 *
 *   npm run verify:min-qty
 *
 * The cases below are the shapes that actually reached this code: a 456-medicine
 * opening stock where every pack_size was 1, the strips and bottles a distributor
 * invoice carries, and the empty and malformed cells a spreadsheet produces.
 *
 * The second half is the one that matters. A default that is merely non-zero is
 * not an improvement — it has to stay out of the way of a figure a pharmacist
 * typed, including a deliberate 0, which is how a hospital silences the alert on
 * a device it will never restock.
 */

import { defaultMinQty, minQtyForLine } from '../src/lib/pharmacy/minQty'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nOne pack is the minimum, because one pack is what you can buy')
for (const [size, want] of [[10, 10], [15, 15], [1, 1], [100, 100], [1000, 1000]] as [number, number][]) {
  const got = defaultMinQty(size)
  check(got === want, `pack of ${size} → ${want}`, got)
}

console.log('\nNo pack size, no nonsense — fall back to 1, never 0')
for (const bad of [null, undefined, 0, -5, NaN, Infinity, '', '  ', 'abc', 'ten'] as const) {
  const got = defaultMinQty(bad as never)
  check(got === 1, `${JSON.stringify(bad)} → 1`, got)
}
check(defaultMinQty(2.7) === 2, 'a fractional pack floors to 2', defaultMinQty(2.7))
check(defaultMinQty('10') === 10, 'a numeric string is read', defaultMinQty('10'))
check(defaultMinQty(' 15 ') === 15, 'whitespace is trimmed', defaultMinQty(' 15 '))
check(defaultMinQty(0.4) === 1, 'a pack under 1 still yields 1', defaultMinQty(0.4))

console.log('\nWhat the counter typed always wins')
check(minQtyForLine('30', 50, 10) === 30, 'typed 30 beats last time and the pack', minQtyForLine('30', 50, 10))
check(minQtyForLine('30', null, null) === 30, 'typed 30 with nothing else to go on')
check(minQtyForLine(' 45 ', 50, 10) === 45, 'typed with spaces')
check(minQtyForLine('7.9', null, 10) === 7, 'a typed fraction floors')

console.log('\nA typed 0 is an instruction, not a blank')
check(minQtyForLine('0', 50, 10) === 0,
  'typed 0 silences the alert, even when the pack would say 10', minQtyForLine('0', 50, 10))
check(minQtyForLine('0', null, 1000) === 0, 'and even against a 1,000-unit pack')

console.log('\nNothing typed → what this medicine was bought at last time')
check(minQtyForLine('', 50, 10) === 50, 'last time said 50', minQtyForLine('', 50, 10))
check(minQtyForLine(null, 50, 10) === 50, 'a null field is blank, not a zero')
check(minQtyForLine(undefined, 50, 10) === 50, 'so is undefined')
check(minQtyForLine('', 0, 10) === 10,
  'last time was 0 — that is the old silence, so use the pack instead', minQtyForLine('', 0, 10))
check(minQtyForLine('', null, 10) === 10, 'never bought before → one pack')

console.log('\nThe shelf this was written for — 1,027 batches, every pack_size 1')
check(minQtyForLine('', null, 1) === 1, 'a pack of 1 gives a minimum of 1, not 0')
check(minQtyForLine('', 0, 1) === 1, 'and the existing zeros do not win')

console.log('\nNothing silly')
check(minQtyForLine('-5', null, 10) === 10, 'a negative is not a figure — fall through', minQtyForLine('-5', null, 10))
check(minQtyForLine('abc', null, 10) === 10, 'nor is text', minQtyForLine('abc', null, 10))
check(Number.isInteger(minQtyForLine('', null, 2.5)), 'the result is always a whole number')

console.log(failed === 0
  ? '\nEvery received line gets a minimum, and a typed one is never overruled.\n'
  : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
