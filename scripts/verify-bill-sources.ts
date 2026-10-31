/**
 * verify:bill-sources — the source→table map must not drift.
 *
 * A bill item's `source` names which table owns the underlying charge.
 * generateBill flips those rows to 'billed'; cancel_bill reverts them to
 * 'unbilled'. The two lists have to agree, and until now nothing tied them:
 * they were an object literal in billing.ts and an if/else chain a couple of
 * hundred lines below it. A source added to one and not the other strands
 * charges as 'billed' against a bill that no longer exists — which the comment
 * on the bill_items read in that very function names as the outcome to avoid.
 *
 * cancel_bill is now SQL (migration 0243), so this compares the TypeScript map
 * against the UPDATE statements in the migration.
 *
 * Sources with no source row to revert are declared here and must appear in
 * neither map: 'manual' (typed by hand), 'nursing' and 'icu' (auto-bill lines —
 * neither table even has a billing_status column, and every icu line has a null
 * ref_id), and the daily 'bed' auto-bill, whose source table IS mapped because
 * an admission-level bed charge does carry a status.
 *
 * Run: npm run verify:bill-sources
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const NO_SOURCE_ROW = new Set(['manual', 'nursing', 'icu'])

// ── The TypeScript map in generateBill ──────────────────────────────────────
const billing = readFileSync('src/app/actions/billing.ts', 'utf8')
const mapBlock = /const TABLE_MAP: Record<string, string> = \{([\s\S]*?)\}/.exec(billing)
if (!mapBlock) {
  console.error('FAIL  could not find TABLE_MAP in src/app/actions/billing.ts')
  process.exit(1)
}
const tsMap = new Map<string, string>()
for (const m of mapBlock[1].matchAll(/(\w+)\s*:\s*'([a-z_]+)'/g)) tsMap.set(m[1], m[2])

// ── The SQL statements in the cancel_bill migration ─────────────────────────
const migDir = 'supabase/migrations'
const migName = readdirSync(migDir).find((f) => f.includes('cancel_bill'))
if (!migName) {
  console.error(`FAIL  no cancel_bill migration found in ${migDir}`)
  process.exit(1)
}
const sql = readFileSync(join(migDir, migName), 'utf8')
const sqlMap = new Map<string, string>()
for (const m of sql.matchAll(
  /UPDATE (\w+) SET billing_status = 'unbilled'[\s\S]*?source = '([a-z_]+)'/g,
)) sqlMap.set(m[2], m[1])

// ── Compare ─────────────────────────────────────────────────────────────────
let bad = 0
const fail = (msg: string) => { console.log('FAIL  ' + msg); bad++ }

console.log(`TABLE_MAP (generateBill, TypeScript) : ${tsMap.size} sources`)
console.log(`cancel_bill (${migName})             : ${sqlMap.size} sources\n`)

for (const [source, table] of tsMap) {
  const sqlTable = sqlMap.get(source)
  if (!sqlTable) fail(`source '${source}' is billed into '${table}' but cancel_bill never reverts it`)
  else if (sqlTable !== table) fail(`source '${source}': generateBill uses '${table}', cancel_bill uses '${sqlTable}'`)
}
for (const [source, table] of sqlMap) {
  if (!tsMap.has(source)) fail(`cancel_bill reverts source '${source}' (${table}) that generateBill never bills`)
}
for (const source of NO_SOURCE_ROW) {
  if (tsMap.has(source)) fail(`'${source}' has no source row to flip, but TABLE_MAP lists it`)
  if (sqlMap.has(source)) fail(`'${source}' has no source row to revert, but cancel_bill updates it`)
}

if (bad) {
  console.log(`\n${bad} problem(s). The two maps must list the same sources and tables.`)
  process.exit(1)
}
console.log(`both maps agree on all ${tsMap.size} sources, and the ${NO_SOURCE_ROW.size} auto-bill sources appear in neither`)
