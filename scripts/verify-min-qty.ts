/**
 * The minimum stock quantity that drives the low-stock alert.
 *
 *   npm run verify:min-qty
 *
 * The rule is small on purpose. 0 means "no alert", which is a real answer for
 * the things a hospital stocks once and never reorders, so the figure is never
 * invented — it comes from the field, or from what the medicine was last
 * stocked at, or it stays off.
 *
 * Deriving a default from pack size was built and then removed. KMCH's export
 * carries no pack size, so all 1,127 batches would have been written at 1 — an
 * alert that fires when the last unit is gone, and 456 medicines that look
 * configured when nobody chose anything. The cases below pin that out.
 */

import { minQtyForLine, minQtyField } from '../src/lib/pharmacy/minQty'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nWhat the counter typed is what gets stored')
check(minQtyForLine('30', 50) === 30, 'typed 30 beats last time', minQtyForLine('30', 50))
check(minQtyForLine('30', null) === 30, 'typed 30 with nothing else to go on')
check(minQtyForLine(' 45 ', 50) === 45, 'spaces are trimmed')
check(minQtyForLine('7.9', null) === 7, 'a fraction floors')
check(minQtyForLine('1000', null) === 1000, 'a large figure is kept')

console.log('\nA typed 0 is an instruction — it turns the alert off')
check(minQtyForLine('0', 50) === 0, 'typed 0 overrides last time\'s 50', minQtyForLine('0', 50))
check(minQtyForLine('0', null) === 0, 'and stands on its own')

console.log('\nBlank → what this medicine was last stocked at')
check(minQtyForLine('', 50) === 50, 'last time said 50', minQtyForLine('', 50))
check(minQtyForLine(null, 50) === 50, 'a null field is blank, not a zero')
check(minQtyForLine(undefined, 50) === 50, 'so is undefined')
check(minQtyForLine('  ', 50) === 50, 'so is whitespace')

console.log('\nNothing to go on → off, and never a number nobody chose')
check(minQtyForLine('', null) === 0, 'never bought before → 0, no alert', minQtyForLine('', null))
check(minQtyForLine('', 0) === 0, 'last time was 0 → still 0')
check(minQtyForLine('', undefined) === 0, 'undefined last time → 0')

console.log('\nNothing silly')
check(minQtyForLine('-5', null) === 0, 'a negative is not a figure', minQtyForLine('-5', null))
check(minQtyForLine('abc', null) === 0, 'nor is text', minQtyForLine('abc', null))
check(minQtyForLine('abc', 50) === 50, 'text falls through to last time', minQtyForLine('abc', 50))
check(minQtyForLine('', NaN) === 0, 'a NaN last time is not a figure either')
check(minQtyForLine('', Infinity) === 0, 'nor is Infinity')
check(Number.isInteger(minQtyForLine('2.5', null)), 'the result is always a whole number')

console.log('\nThe box shows a figure, never a 0 dressed up as one')
check(minQtyField(50) === '50', '50 → "50"', minQtyField(50))
check(minQtyField(0) === '', '0 → blank, so the box reads "off"', minQtyField(0))
check(minQtyField(null) === '', 'null → blank')
check(minQtyField(undefined) === '', 'undefined → blank')
check(minQtyField(2.7) === '2', 'a fraction floors')

console.log('\nThe import this was written for — no pack size, no guessing')
check(minQtyForLine('', null) === 0,
  '1,127 SwiftEHR batches carry no minimum, so none is invented', minQtyForLine('', null))
check(minQtyField(null) === '',
  'and the field is blank for the pharmacist to fill, not pre-filled with 1')

console.log(failed === 0
  ? '\nThe figure is stored when given, carried when known, and off otherwise.\n'
  : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
