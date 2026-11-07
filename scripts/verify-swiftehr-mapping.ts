/**
 * What the importer actually makes of a real SwiftEHR export.
 *
 *   npm run verify:swiftehr-mapping -- "<path to the export>"
 *
 * The question this answers: does the file the hospital downloads carry a
 * minimum-quantity column at all? It does not — which is why a 456-medicine
 * opening stock loaded with every alert threshold at 0, and why nothing here
 * tries to make one up. This proves the absence against the real header rather
 * than asserting it, and shows what each column IS mapped to, so an export
 * that later adds the column is noticed instead of silently ignored.
 */

import fs from 'node:fs'
import { parseDelimited, detectHeader, readRows, INVOICE_FIELDS } from '../src/lib/pharmacy/invoiceFile'
import { minQtyForLine } from '../src/lib/pharmacy/minQty'

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
  console.log('\n  No minimum-quantity column in this export, so nothing is imported')
  console.log('  into the field and no figure is invented for it. Worked example:')
  for (const r of parsed.slice(0, 5)) {
    const min = minQtyForLine(r.minQty, null)
    console.log(`    ${r.name.slice(0, 30).padEnd(30)} → alert below ${min === 0 ? 'off' : min}`)
  }
  console.log('\n  The pharmacist sets these on the stock screen, or on the next')
  console.log('  invoice line — after which "same as last time" carries it forward.')
} else {
  const own = parsed.filter((r) => r.minQty !== '')
  console.log(`\n  Minimum column found: ${own.length} of ${parsed.length} rows carry a value.`)
  for (const r of own.slice(0, 5)) {
    console.log(`    ${r.name.slice(0, 30).padEnd(30)} → alert below ${minQtyForLine(r.minQty, null)}`)
  }
}

// What this script asserts: the required columns were found, and no row was
// given a minimum the file did not contain.
const missingRequired = INVOICE_FIELDS.filter((f) => f.needed && map[f.key] == null)
const invented = parsed.filter((r) => r.minQty === '' && minQtyForLine(r.minQty, null) !== 0)
const bad = missingRequired.length > 0 || invented.length > 0
if (missingRequired.length) console.log(`\nFAIL  required column(s) not found: ${missingRequired.map((f) => f.label).join(', ')}`)
if (invented.length) console.log(`\nFAIL  ${invented.length} row(s) given a minimum the file did not contain`)
if (!bad) console.log('\nPASS  every required column mapped, and no minimum invented.\n')
process.exit(bad ? 1 : 0)
