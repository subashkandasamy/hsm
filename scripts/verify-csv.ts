/**
 * CSV quoting for the report exports (src/lib/csv.ts).
 *
 *   npm run verify:csv
 *
 * A register exported to Excel must open with every value in its own column.
 * Names carry commas ("Paracetamol 500 mg, strip of 10"), addresses carry line
 * breaks, and a stray quote must not swallow the rest of the row.
 */

import { toCsv } from '../src/lib/csv'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

check(toCsv(['a', 'b'], [[1, 'x']]) === 'a,b\n1,x', 'plain values stay plain')
check(toCsv(['n'], [['Dolo 650, strip of 15']]) === 'n\n"Dolo 650, strip of 15"', 'a comma is quoted')
check(toCsv(['n'], [['12" scale']]) === 'n\n"12"" scale"', 'a quote is doubled and quoted')
check(toCsv(['addr'], [['Main St\nKarur']]) === 'addr\n"Main St\nKarur"', 'a line break is quoted')
check(toCsv(['a', 'b', 'c'], [[null, undefined, 0]]) === 'a,b,c\n,,0', 'null and undefined are empty, 0 stays 0')
check(toCsv(['Patient, name'], []) === '"Patient, name"', 'headers are quoted too')

console.log(failed === 0 ? '\nExports open with every value in its column.\n' : `\n${failed} check(s) FAILED.\n`)
process.exit(failed === 0 ? 0 : 1)
