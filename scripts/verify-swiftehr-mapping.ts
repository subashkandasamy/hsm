/**
 * What the importer actually makes of a real SwiftEHR export.
 *
 *   npm run verify:swiftehr-mapping -- "<path to the export>"
 *
 * The question this answers: does the file the hospital downloads carry a
 * minimum-quantity column at all? It does not — and that is why a 456-medicine
 * opening stock loaded with every alert threshold at 0. This script proves the
 * absence against the real header rather than asserting it, and shows what each
 * column IS mapped to, so a future export that adds the column is noticed.
 */

import fs from 'node:fs'
import { parseDelimited, detectHeader, readRows, INVOICE_FIELDS } from '../src/lib/pharmacy/invoiceFile'
import { defaultMinQty, minQtyForLine } from '../src/lib/pharmacy/minQty'

const file = process.argv[2]
if (!file) { console.error('Pass the export file path.'); process.exit(2) }

const rows = parseDelimited(fs.readFileSync(file, 'utf8'))
const { headerIndex, map } = detectHeader(rows)
const header = rows[headerIndex] ?? []

console.log(`\nFile    ${file.split('/').pop()}`)
console.log(`Header  row ${headerIndex + 1} of ${rows.length}\n`)

console.log('Column in the file                 →  mapped to')
console.log('─'.repeat(62))
const byIndex = new Map<number, string>()
for (const [k, i] of Object.entries(map)) if (i != null) byIndex.set(i as number, k)
header.forEach((h, i) => {
  const f = byIndex.get(i)
  console.log(`  ${(h || '(blank)').slice(0, 32).padEnd(32)}  ${f ? '→  ' + f : '·  ignored'}`)
})

console.log('\nFields the importer wants, and whether this file has one')
console.log('─'.repeat(62))
let missingMin = false
for (const f of INVOICE_FIELDS) {
  const i = map[f.key]
  const where = i != null ? `column ${i + 1} — "${header[i]}"` : 'NOT IN THIS FILE'
  console.log(`  ${f.label.padEnd(14)} ${f.needed ? '(required)' : '          '}  ${where}`)
  if (f.key === 'minQty' && i == null) missingMin = true
}

const parsed = readRows(rows, headerIndex, map)
console.log(`\nData rows read: ${parsed.length}`)

if (missingMin) {
  console.log('\n  No minimum-quantity column in this export.')
  console.log('  Every line therefore falls back to the default. Worked example:')
  for (const r of parsed.slice(0, 5)) {
    const min = minQtyForLine(r.minQty, null, r.packSize)
    console.log(`    ${r.name.slice(0, 30).padEnd(30)} pack ${(r.packSize || '—').padEnd(4)} → alert below ${min}`)
  }
  const nonDefault = parsed.filter((r) => r.minQty !== '').length
  console.log(`\n  Lines carrying their own minimum: ${nonDefault} of ${parsed.length}`)
  console.log(`  Lines on the default:             ${parsed.length - nonDefault} of ${parsed.length}`)
} else {
  const own = parsed.filter((r) => r.minQty !== '')
  console.log(`\n  Minimum column found. ${own.length} of ${parsed.length} rows carry a value.`)
}

// The one hard assertion: no row may end up at 0 unless the file said 0.
const silent = parsed.filter((r) => r.minQty === '' && minQtyForLine(r.minQty, null, r.packSize) === 0)
console.log(silent.length === 0
  ? '\nPASS  no row lands on a silent 0 — every imported line will alert.\n'
  : `\nFAIL  ${silent.length} row(s) would import with alerts off.\n`)
process.exit(silent.length === 0 ? 0 : 1)
