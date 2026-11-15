// Read-only check of every lab test and measurement: the Uyirly master and the
// hospitals' catalogues. Used by the lab-catalog flow and by the report page.
import type { SupabaseClient } from '@supabase/supabase-js'
import { all } from './db'

export interface CatalogReport { generated: string; master: any[]; masterIssues: Issue[]; hospitals: Record<string, { name: string; active: number; orderable: number; tests: any[]; issues: Issue[] }> }

export type Issue = { level: 'error' | 'warn' | 'info'; where: string; what: string }
const ADULT = 30 * 365

// Lines left without a range on purpose (0301 header): not flagged as errors.
const NO_RANGE_BY_DESIGN = new Set(['PDW_CV', 'P_LCC', 'MENTZER', 'RDWI', 'PO2', 'SO2'])
// Graded lines that carry no verdict by design.
const NO_NORMAL_BY_DESIGN = new Set(['BG_ABO', 'BG_RH'])
// Unitless numeric lines.
const UNITLESS = new Set(['INR', 'BG_PH', 'UR_PH', 'UR_SG', 'MENTZER', 'RDWI', 'TC_HDL', 'LDL_HDL', 'AG_RATIO', 'APOB_A1'])

export async function checkCatalogs(db: SupabaseClient): Promise<CatalogReport> {
  const tenants = (await db.from('tenants').select('id, slug, name')).data ?? []
  const T = (slug: string) => tenants.find((t) => t.slug === slug)!
  const analytes = await all<any>((f, t) => db.from('lab_analytes').select('id, code, name, short_name, unit_ucum, value_type, allowed_values, normal_values, is_active').order('code').range(f, t))
  const A = new Map(analytes.map((a) => [a.id, a]))
  const links = await all<any>((f, t) => db.from('lab_test_analytes').select('lab_master_id, analyte_id, display_order, retired_at').order('lab_master_id').range(f, t))
  const master = await all<any>((f, t) => db.from('lab_tests_master').select('id, name, code, category, unit, ref_low, ref_high, reference_range, is_active, package_only, panel_only').order('name').range(f, t))
  const M = new Map(master.map((m) => [m.id, m]))
  const ranges = await all<any>((f, t) => db.from('lab_reference_ranges').select('analyte_id, tenant_id, sex, age_min_days, age_max_days, ref_low, ref_high, crit_low, crit_high, normal_text, source, source_note').order('analyte_id').range(f, t))
  const linesOf = (masterId: string) => links.filter((l) => l.lab_master_id === masterId && !l.retired_at).sort((a, b) => a.display_order - b.display_order)

  /** The range a report would use for an adult man / woman at this hospital (mirrors resolve_reference_range). */
  const resolve = (analyteId: string, tenantId: string | null, sex: 'male' | 'female') => {
    const rows = ranges.filter((r) => r.analyte_id === analyteId && (r.tenant_id === null || r.tenant_id === tenantId)
      && (r.sex === 'any' || r.sex === sex) && ADULT >= r.age_min_days && ADULT <= r.age_max_days)
    rows.sort((a, b) =>
      Number(b.tenant_id !== null) - Number(a.tenant_id !== null)
      || Number(b.sex !== 'any') - Number(a.sex !== 'any')
      || (a.age_max_days - a.age_min_days) - (b.age_max_days - b.age_min_days)
      || Number(b.ref_low != null || b.ref_high != null || !!b.normal_text) - Number(a.ref_low != null || a.ref_high != null || !!a.normal_text))
    return rows[0] ?? null
  }
  const fmt = (r: any) => !r ? '—' : r.normal_text ? r.normal_text
    : r.ref_low != null && r.ref_high != null ? `${r.ref_low}–${r.ref_high}` : r.ref_high != null ? `< ${r.ref_high}` : r.ref_low != null ? `> ${r.ref_low}` : '—'

  const lineReport = (masterId: string, tenantId: string | null, where: string, issues: Issue[], optional = new Set<string>()) =>
    linesOf(masterId).map((l) => {
      const a = A.get(l.analyte_id)
      const men = resolve(l.analyte_id, tenantId, 'male'), women = resolve(l.analyte_id, tenantId, 'female')
      const normal = a.value_type === 'ordinal' ? (a.normal_values ?? []).join(' / ') : null
      const rowMen = a.value_type === 'numeric' || a.value_type === 'text' ? fmt(men) : normal || '—'
      const rowWomen = a.value_type === 'numeric' || a.value_type === 'text' ? fmt(women) : normal || '—'
      const opt = optional.has(l.analyte_id)
      const w = `${where} › ${a.short_name ?? a.name} (${a.code})`
      if (!a.is_active) issues.push({ level: 'error', where: w, what: 'measurement is switched off but still on the test' })
      if (a.value_type === 'numeric') {
        if (rowMen === '—' && !NO_RANGE_BY_DESIGN.has(a.code)) issues.push({ level: opt ? 'info' : 'warn', where: w, what: `no adult normal range${opt ? ' (line is optional here)' : ''}` })
        if (!a.unit_ucum && !UNITLESS.has(a.code)) issues.push({ level: 'warn', where: w, what: 'number with no unit' })
        for (const r of [men, women]) if (r && r.ref_low != null && r.ref_high != null && Number(r.ref_low) >= Number(r.ref_high)) issues.push({ level: 'error', where: w, what: `range low ≥ high (${r.ref_low}–${r.ref_high})` })
      }
      if (a.value_type === 'ordinal' && !a.normal_values?.length && !NO_NORMAL_BY_DESIGN.has(a.code)) issues.push({ level: 'warn', where: w, what: 'graded line with no normal answer' })
      if (a.value_type === 'ordinal' && !a.allowed_values?.length) issues.push({ level: 'error', where: w, what: 'graded line with no answers to pick from' })
      if (a.value_type === 'text' && rowMen === '—') issues.push({ level: 'info', where: w, what: 'written line with no written normal' })
      const src = (men?.tenant_id ? (men.source === 'analyzer' ? 'analyzer' : 'hospital') : men ? 'uyirly' : '-')
      return { code: a.code, name: a.short_name ?? a.name, unit: a.unit_ucum, type: a.value_type, men: rowMen, women: rowWomen, source: src, optional: opt }
    })

  const report: CatalogReport = { generated: new Date().toISOString(), master: [], masterIssues: [], hospitals: {} }
  const masterIssues: Issue[] = []
  // ── Master ──
  const activeMaster = master.filter((m) => m.is_active)
  const nameCount = new Map<string, number>()
  for (const m of activeMaster) nameCount.set(m.name.toLowerCase(), (nameCount.get(m.name.toLowerCase()) ?? 0) + 1)
  // A hospital's codes are unique, so two master tests sharing a code can never both be added (0303).
  const codeOwners = new Map<string, string[]>()
  for (const m of master) if (m.code) codeOwners.set(String(m.code).toUpperCase(), [...(codeOwners.get(String(m.code).toUpperCase()) ?? []), m.name])
  for (const m of activeMaster) {
    const where = `Master › ${m.name}`
    if ((nameCount.get(m.name.toLowerCase()) ?? 0) > 1) masterIssues.push({ level: 'error', where, what: 'name offered twice in the master' })
    const sharing = m.code ? (codeOwners.get(String(m.code).toUpperCase()) ?? []) : []
    if (sharing.length > 1) masterIssues.push({ level: 'error', where, what: `code ${m.code} shared with ${sharing.filter((n) => n !== m.name).join(', ')} — a hospital can add only one of them` })
    const ls = lineReport(m.id, null, where, masterIssues)
    const oneBox = ls.length === 0
    if (oneBox && m.ref_low == null && m.ref_high == null && !(m.reference_range ?? '').trim() && !m.panel_only)
      masterIssues.push({ level: 'warn', where, what: 'single-result test with no normal range' })
    if (oneBox && m.ref_low != null && m.ref_high != null && Number(m.ref_low) >= Number(m.ref_high)) masterIssues.push({ level: 'error', where, what: `range low ≥ high (${m.ref_low}–${m.ref_high})` })
    if (m.category === 'General') masterIssues.push({ level: 'info', where, what: 'still filed under "General"' })
    report.master.push({ name: m.name, category: m.category, partOfPanel: m.package_only, lines: ls,
      single: oneBox ? (m.reference_range || (m.ref_low != null || m.ref_high != null ? `${m.ref_low ?? ''}–${m.ref_high ?? ''} ${m.unit ?? ''}`.trim() : '—')) : null })
  }
  report.masterIssues = masterIssues

  // ── Hospitals ──
  for (const slug of ['vrhospital', 'karur']) {
    const t = T(slug)
    const issues: Issue[] = []
    const cat = await all<any>((f, tt) => db.from('lab_tests_catalog').select('id, name, code, category, price, unit, ref_low, ref_high, reference_range, lab_master_id, is_active, package_only').eq('tenant_id', t.id).order('name').range(f, tt))
    const optRows = await all<any>((f, tt) => db.from('lab_optional_analytes').select('test_id, analyte_id').eq('tenant_id', t.id).order('test_id').range(f, tt))
    const tests: any[] = []
    const active = cat.filter((c) => c.is_active)
    const byMaster = new Map<string, any[]>(), byName = new Map<string, any[]>()
    for (const c of active.filter((c) => !c.package_only)) {
      if (c.lab_master_id) byMaster.set(c.lab_master_id, [...(byMaster.get(c.lab_master_id) ?? []), c])
      const k = c.name.toLowerCase().replace(/[^a-z0-9]/g, ''); byName.set(k, [...(byName.get(k) ?? []), c])
    }
    for (const [, v] of [...byMaster, ...byName]) if (v.length > 1) issues.push({ level: 'error', where: `${t.name} › ${v[0].name}`, what: `orderable twice: ${v.map((x) => `${x.name} ₹${x.price}`).join(' vs ')}` })
    for (const c of active) {
      const where = `${t.name} › ${c.name}`
      const m = c.lab_master_id ? M.get(c.lab_master_id) : null
      const opt = new Set(optRows.filter((o) => o.test_id === c.id).map((o) => o.analyte_id))
      const ls = m ? lineReport(m.id, t.id, where, issues, opt) : []
      if (!c.package_only && !(Number(c.price) > 0)) issues.push({ level: 'error', where, what: `orderable at ₹${c.price}` })
      if (m && !m.is_active && !c.package_only) issues.push({ level: 'info', where, what: 'linked to a master test that is switched off (still works; hidden from "Add from Master")' })
      if (!ls.length && c.ref_low == null && c.ref_high == null && !(c.reference_range ?? '').trim() && !c.package_only)
        issues.push({ level: 'warn', where, what: 'orderable single-result test with no normal range' })
      if (!ls.length && c.ref_low != null && c.ref_high != null && Number(c.ref_low) >= Number(c.ref_high)) issues.push({ level: 'error', where, what: `range low ≥ high (${c.ref_low}–${c.ref_high})` })
      if (m && ls.length && opt.size === ls.length) issues.push({ level: 'error', where, what: 'every line is optional — the test can be released empty' })
      tests.push({ name: c.name, price: Number(c.price), category: c.category, partOfPanel: c.package_only, master: m?.name ?? null, masterActive: m?.is_active ?? null, lines: ls,
        single: ls.length ? null : (c.reference_range || (c.ref_low != null || c.ref_high != null ? `${c.ref_low ?? ''}–${c.ref_high ?? ''} ${c.unit ?? ''}`.trim() : '—')) })
    }
    report.hospitals[slug] = { name: t.name, active: active.length, orderable: active.filter((c) => !c.package_only).length, tests, issues }
  }
  return report

}
