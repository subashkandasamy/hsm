/*
 * Step 5 — optional lines (owner's decision: "make the other lines optional").
 *
 * For each panel test the old reports used, the Uyirly lines SwiftEHR never
 * reported for it (a 3-part analyser has no monocytes or basophils; the old
 * RFT had no sodium) become optional lines for this hospital: printed when a
 * value is entered, left off the report when not. This changes the hospital's
 * NEW reports too, which is the point — the same analyser is still in use.
 *
 * Lines the hospital had already made optional are left alone and never
 * undone by this step.
 */
import { db, all, loggedIds, SOURCE, type Tenant } from '../lib'
import { plan as labPlan } from './lab'

const STEP = 'labopt'

async function planned(t: Tenant) {
  const { usedLines, rowFor, linesOf } = await labPlan(t)
  const testIds = await loggedIds(t, 'lab_tests_catalog')
  const rows: { test_id: string; analyte_id: string; test: string; code: string }[] = []
  for (const row of rowFor.values()) {
    const used = usedLines.get(row.id)
    if (!used?.size || !row.lab_master_id) continue // not a panel the old reports filled
    const testId = row.id.startsWith('labtest:') ? testIds.get(row.id) : row.id
    if (!testId) throw new Error(`Run the lab step first (${row.name} is not in the catalogue yet).`)
    for (const l of (linesOf.get(row.lab_master_id) ?? []).filter((x) => x.active && !used.has(x.code))) {
      rows.push({ test_id: testId, analyte_id: l.analyte_id, test: row.name, code: l.code })
    }
  }
  const have = await all<{ test_id: string; analyte_id: string }>((f, to) => db().from('lab_optional_analytes')
    .select('test_id, analyte_id').eq('tenant_id', t.id).order('test_id').range(f, to))
  const already = new Set(have.map((h) => `${h.test_id}:${h.analyte_id}`))
  return { add: rows.filter((r) => !already.has(`${r.test_id}:${r.analyte_id}`)), kept: rows.filter((r) => already.has(`${r.test_id}:${r.analyte_id}`)).length }
}

export async function run(t: Tenant, write: boolean): Promise<void> {
  const { add, kept } = await planned(t)
  const byTest = new Map<string, string[]>()
  for (const r of add) byTest.set(r.test, [...(byTest.get(r.test) ?? []), r.code])
  console.log(`optional lines to add: ${add.length} (${kept} already optional)`)
  for (const [test, codes] of byTest) console.log(`  ${test}: ${codes.join(', ')}`)
  if (!write) { console.log('dry run — nothing written. Add --write to write.'); return }
  for (const r of add) {
    // Logged first, keyed by test + line; the row itself has no id of its own.
    const { error: le } = await db().from('import_log').upsert({
      tenant_id: t.id, source: SOURCE, table_name: 'lab_optional_analytes', source_key: `optional:${r.test_id}:${r.analyte_id}`,
      row_id: r.test_id, step: STEP,
    }, { onConflict: 'tenant_id,source,table_name,source_key', ignoreDuplicates: true })
    if (le) throw new Error(`import_log write failed: ${le.message}`)
    const { error } = await db().from('lab_optional_analytes')
      .upsert({ tenant_id: t.id, test_id: r.test_id, analyte_id: r.analyte_id }, { onConflict: 'tenant_id,test_id,analyte_id', ignoreDuplicates: true })
    if (error) throw new Error(`lab_optional_analytes write failed: ${error.message}`)
  }
  console.log(`optional lines written: ${add.length}`)
}

export async function undo(t: Tenant): Promise<void> {
  const logged = await all<{ source_key: string }>((f, to) => db().from('import_log').select('source_key')
    .eq('tenant_id', t.id).eq('source', SOURCE).eq('step', STEP).order('source_key').range(f, to))
  for (const l of logged) {
    const [, testId, analyteId] = l.source_key.split(':')
    const { error } = await db().from('lab_optional_analytes').delete().eq('tenant_id', t.id).eq('test_id', testId).eq('analyte_id', analyteId)
    if (error) throw new Error(`undo lab_optional_analytes failed: ${error.message}`)
    await db().from('import_log').delete().eq('tenant_id', t.id).eq('source', SOURCE).eq('table_name', 'lab_optional_analytes').eq('source_key', l.source_key)
  }
  console.log(`  undone lab_optional_analytes: ${logged.length} rows`)
}
