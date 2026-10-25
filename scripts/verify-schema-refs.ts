/**
 * Does every column these files name actually exist?
 *
 *   npm run verify:schema-refs
 *
 * Five of the thirteen defects found in Billing and the Dashboard on 25 Oct
 * 2026 were the same mistake: a query naming a column that is not there.
 * `payments.created_at`, `drug_batches.qty_remaining`, `prescriptions.status`,
 * `lab_orders.test_name`, `emergency_cases.created_at`. PostgREST rejects the
 * request, the caller destructures `{ data }` without reading `error`, and
 * null becomes a zero on a tile or a CSV with nothing under the header.
 *
 * Nothing throws, so no test catches it and no log records it. The only way
 * this class of bug is found is by somebody noticing a number is wrong — and
 * a tile reading 0 looks exactly like a quiet day.
 *
 * So: read the schema, read the queries, and compare. Static and offline —
 * it needs no database connection and runs in a second.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const SCHEMA = path.join(ROOT, 'supabase/baseline/01_schema.sql')

// ── What the database actually has ─────────────────────────────────────────
// Postgres types as this schema writes them. Missing one here silently drops
// a column and produces a false alarm later — `TIME` was absent at first, and
// doctor_availability.start_time was reported missing when it is right there.
const TYPE = String.raw`(?:uuid|text|numeric|integer|int[248]?|int|bigint|smallint|boolean|bool`
  + String.raw`|date|timestamptz|timestamp|time|interval|jsonb|json|real|double|decimal`
  + String.raw`|char|varchar|citext|bytea|inet|tsvector|serial|bigserial|money|\w+\[\])`

const colOf = (line: string): string | null => {
  const m = new RegExp(String.raw`^\s*"?(\w+)"?\s+${TYPE}\b`, 'i').exec(line)
  return m ? m[1] : null
}

const sql = readFileSync(SCHEMA, 'utf8')
const tables = new Map<string, Set<string>>()
for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/g)) {
  const [, name, body] = m
  const cols = new Set<string>()
  for (const line of body.split('\n')) {
    const c = colOf(line)
    if (c) cols.add(c)
  }
  if (cols.size) tables.set(name, cols)
}

// Later migrations add columns; fold those in so the baseline is not the whole truth.
const migDir = path.join(ROOT, 'supabase/migrations')
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql'))) {
  const text = readFileSync(path.join(migDir, f), 'utf8')
  // One ALTER TABLE can add several columns in a single statement, and 0218
  // does exactly that. Matching only the first left `first_printed_at`
  // invisible and the checker called a real column missing.
  for (const m of text.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
    const t = tables.get(m[1]) ?? new Set<string>()
    for (const a of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) t.add(a[1])
    tables.set(m[1], t)
  }
  for (const m of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/g)) {
    const cols = tables.get(m[1]) ?? new Set<string>()
    for (const line of m[2].split('\n')) {
      const c = colOf(line)
      if (c) cols.add(c)
    }
    tables.set(m[1], cols)
  }
}

// ── What the code asks for ─────────────────────────────────────────────────
// Deliberately narrow: `.from('x')` followed by `.eq/gte/lte/lt/gt/order('col'`.
// Select lists carry embedded joins and aliases and are not worth guessing at;
// filters are plain column names and are where every one of the five sat.
const FILTERS = /\.(?:eq|neq|gt|gte|lt|lte|like|ilike|order|is)\(\s*'([a-z_][a-z0-9_]*)'/g

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

/**
 * The method chain that belongs to one `.from(...)`, and not a character more.
 *
 * Getting this boundary wrong is the whole difficulty. A first attempt split
 * on blank lines and leaked filters from the *next* query into the previous
 * table's chunk, reporting five `bills` columns as missing from `admissions`.
 * A second attempt walked balanced parentheses and ran away entirely,
 * attributing a line four hundred lines later to the wrong table.
 *
 * So: line-anchored, and deliberately conservative. A query chain in this
 * codebase is either all on one line, or continues on lines that begin with
 * `.`. The moment a line starts with anything else, the chain is over. That
 * is a rule about formatting rather than about JavaScript, which makes it
 * both simple and — for this repository — exactly right. Anything it cannot
 * be sure of, it does not report: a checker that cries wolf gets switched off,
 * and then it protects nothing.
 */
function chainAfter(text: string, start: number): string {
  const rest = text.slice(start)
  const lines = rest.split('\n')
  const out: string[] = [lines[0]]            // remainder of the .from(...) line
  for (let i = 1; i < lines.length; i++) {
    if (!/^\s*\./.test(lines[i])) break      // a line not continuing the chain
    out.push(lines[i])
  }
  return out.join('\n')
}

let failed = 0
const checked = { files: 0, refs: 0 }

function report(file: string, line: number, table: string, col: string, cols: Set<string>) {
  failed++
  console.log(`  FAIL  ${path.relative(ROOT, file)}:${line}`)
  console.log(`        ${table}.${col} does not exist`)
  const near = [...cols].filter((c) => c.includes(col.split('_')[0]) || col.includes(c.split('_')[0]))
  if (near.length) console.log(`        did you mean: ${near.slice(0, 4).join(', ')}`)
}

for (const file of walk(path.join(ROOT, 'src'))) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes('.from(')) continue
  checked.files++
  const lineAt = (idx: number) => text.slice(0, idx).split('\n').length

  // ── Filters in the chain itself ────────────────────────────────────────
  for (const m of text.matchAll(/\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) {
    const table = m[1]
    const cols = tables.get(table)
    if (!cols) continue                     // view, RPC or unknown — not our business
    const chain = chainAfter(text, m.index! + m[0].length)
    for (const f of chain.matchAll(FILTERS)) {
      checked.refs++
      if (!cols.has(f[1])) report(file, lineAt(m.index! + (f.index ?? 0)), table, f[1], cols)
    }
  }

  // ── Filters added to a query held in a variable ────────────────────────
  //
  // Not an edge case — it is where the real one hid:
  //
  //   let q = supabase.from('dispenses').select(...)
  //   if (admissionId) q = q.eq('admission_id', admissionId)
  //   else if (visitId) q = q.eq('visit_id', visitId)   // no such column
  //
  // A chain-only check sees nothing wrong, which is exactly why medicines
  // went unbilled on OPD bills for as long as they did. So: remember what
  // table a variable was built from, and check what is later asked of it.
  for (const d of text.matchAll(/(?:let|const)\s+(\w+)\s*=\s*(?:await\s+)?\w+\s*\n?\s*\.from\(\s*'([a-z_][a-z0-9_]*)'\s*\)/g)) {
    const [, varName, table] = d
    const cols = tables.get(table)
    if (!cols) continue
    // Until the variable is reassigned from another table, or the block ends.
    const after = text.slice(d.index! + d[0].length)
    const stop = after.search(new RegExp(String.raw`(?:let|const)\s+${varName}\s*=|^\s*\}\s*$`, 'm'))
    const scope = stop > 0 ? after.slice(0, stop) : after
    const uses = new RegExp(String.raw`\b${varName}\s*(?:=\s*${varName}\s*)?\.(?:eq|neq|gt|gte|lt|lte|like|ilike|order|is)\(\s*'([a-z_][a-z0-9_]*)'`, 'g')
    for (const u of scope.matchAll(uses)) {
      checked.refs++
      if (!cols.has(u[1])) report(file, lineAt(d.index! + d[0].length + (u.index ?? 0)), table, u[1], cols)
    }
  }
}

console.log(`\n  ${checked.refs} column references across ${checked.files} files, `
  + `against ${tables.size} tables.`)
console.log(failed === 0
  ? '  All of them exist.\n'
  : `\n  ${failed} reference(s) to columns that do not exist.\n`)
process.exit(failed ? 1 : 0)
