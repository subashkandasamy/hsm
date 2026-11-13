'use server'

/**
 * A hospital's own normal ranges for the measurements inside a test.
 *
 * Ranges live per measurement (lab_reference_ranges), not per test: a
 * hospital's WBC range applies in the CBC and in a stand-alone WBC count alike.
 * Which one applies is decided by resolve_reference_range (0252): the
 * hospital's own row first — set here, or learned from its analyzer (0276) —
 * then Uyirly's standard. Saving here replaces both of the hospital's kinds
 * for that measurement; "Use Uyirly standard" removes them — or, where the
 * hospital's analyzer sends that measurement, keeps a copy of the standard as
 * the hospital's own, since an empty slot is what the analyzer fills.
 *
 * Written lines (urine colour, pus cells) have a written normal instead of
 * numbers — "Pale yellow", "0–5" — kept on the same rows (normal_text, 0298).
 */

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'

type SimpleResult = { success: true } | { success: false; error: string }

const ADULT_FROM = 6570          // 18 years, as Uyirly's standard ranges (0172)
const LIFETIME_TO = 54750        // ~150 years

export interface RangeRow {
  sex: 'any' | 'male' | 'female'
  age_min_days: number
  age_max_days: number
  ref_low: number | null
  ref_high: number | null
  /** The normal of a written line (0298). */
  normal_text: string | null
  source: 'uyirly_standard' | 'tenant' | 'analyzer'
  source_note: string | null
}

export interface MeasurementRanges {
  analyte_id: string
  code: string
  name: string
  /** What the report prints, e.g. "WBC" for Total Leucocyte Count. */
  short: string | null
  unit: string | null
  /** numeric measurements take a range; ordinal/text ones are judged by their normal words */
  value_type: string
  normal_values: string[] | null
  optional: boolean
  standard: RangeRow[]
  mine: RangeRow[]
}

/** The measurements of one of this hospital's tests, with Uyirly's ranges and the hospital's own. */
export async function getMeasurementRanges(testId: string): Promise<MeasurementRanges[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:read')
  const supabase = await createClient()

  const { data: test } = await supabase.from('lab_tests_catalog')
    .select('id, lab_master_id').eq('id', testId).eq('tenant_id', actor.tenant_id).maybeSingle()
  if (!test?.lab_master_id) return []

  const { data: links } = await supabase.from('lab_test_analytes')
    .select('display_order, analyte:lab_analytes(id, code, name, short_name, unit_ucum, value_type, normal_values, is_active)')
    .eq('lab_master_id', test.lab_master_id).order('display_order').limit(200)
  type A = { id: string; code: string; name: string; short_name: string | null; unit_ucum: string | null; value_type: string; normal_values: string[] | null; is_active: boolean }
  const analytes = ((links ?? []) as unknown as Array<{ analyte: A | null }>)
    .map((l) => l.analyte).filter((a): a is A => !!a && a.is_active)
  if (!analytes.length) return []
  const ids = analytes.map((a) => a.id)

  const [{ data: ranges }, { data: opt }] = await Promise.all([
    supabase.from('lab_reference_ranges')
      .select('analyte_id, tenant_id, sex, age_min_days, age_max_days, ref_low, ref_high, normal_text, source, source_note')
      .in('analyte_id', ids)
      .or(`tenant_id.is.null,tenant_id.eq.${actor.tenant_id}`)
      .order('age_min_days').limit(2000),
    supabase.from('lab_optional_analytes').select('analyte_id').eq('test_id', testId).eq('tenant_id', actor.tenant_id),
  ])
  const optional = new Set((opt ?? []).map((o) => o.analyte_id as string))
  const row = (r: Record<string, unknown>): RangeRow => ({
    sex: r.sex as RangeRow['sex'], age_min_days: r.age_min_days as number, age_max_days: r.age_max_days as number,
    ref_low: r.ref_low as number | null, ref_high: r.ref_high as number | null,
    normal_text: (r.normal_text as string | null) ?? null,
    source: r.source as RangeRow['source'], source_note: (r.source_note as string | null) ?? null,
  })
  // A placeholder row with neither numbers nor words says nothing, so it is not shown.
  const hasNumbers = (r: Record<string, unknown>) => r.ref_low != null || r.ref_high != null || !!r.normal_text

  return analytes.map((a) => ({
    analyte_id: a.id, code: a.code, name: a.name, short: a.short_name, unit: a.unit_ucum,
    value_type: a.value_type, normal_values: a.normal_values, optional: optional.has(a.id),
    standard: (ranges ?? []).filter((r) => r.analyte_id === a.id && r.tenant_id === null && hasNumbers(r)).map(row),
    mine: (ranges ?? []).filter((r) => r.analyte_id === a.id && r.tenant_id === actor.tenant_id && hasNumbers(r)).map(row),
  }))
}

export interface RangeInput {
  /** One range for everyone, or separate ranges for men and women. */
  bySex: boolean
  everyone?: { low: number | null; high: number | null }
  men?: { low: number | null; high: number | null }
  women?: { low: number | null; high: number | null }
  /** Off (default): adults, 18 and over, like Uyirly's own. On: every age. */
  allAges: boolean
}

function checkPair(label: string, p?: { low: number | null; high: number | null }): string | null {
  if (!p) return `Enter the ${label} range`
  const lo = p.low, hi = p.high
  if (lo == null && hi == null) return `Enter at least a lower or an upper limit for ${label}`
  if ((lo != null && !Number.isFinite(lo)) || (hi != null && !Number.isFinite(hi))) return `The ${label} range has a number that is not a number`
  if (lo != null && hi != null && lo >= hi) return `For ${label}, the lower limit must be below the upper limit`
  if ((lo != null && lo < 0) || (hi != null && hi < 0)) return `A normal range cannot be below zero (${label})`
  return null
}

/** Set this hospital's own range for one measurement — wherever it appears. */
export async function saveMeasurementRange(analyteId: string, input: RangeInput): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const pairs: Array<{ sex: RangeRow['sex']; p?: { low: number | null; high: number | null }; label: string }> = input.bySex
    ? [{ sex: 'male', p: input.men, label: 'men' }, { sex: 'female', p: input.women, label: 'women' }]
    : [{ sex: 'any', p: input.everyone, label: 'everyone' }]
  for (const x of pairs) { const e = checkPair(x.label, x.p); if (e) return { success: false, error: e } }

  const supabase = await createClient()
  const { data: a } = await supabase.from('lab_analytes').select('id, name, value_type').eq('id', analyteId).maybeSingle()
  if (!a) return { success: false, error: 'That measurement no longer exists' }
  if (a.value_type !== 'numeric') return { success: false, error: `${a.name} is reported in words, so it has no number range` }

  // Replace this hospital's rows for the measurement — typed or analyzer-learned.
  const { error: delErr } = await supabase.from('lab_reference_ranges')
    .delete().eq('analyte_id', analyteId).eq('tenant_id', actor.tenant_id)
  if (delErr) return { success: false, error: delErr.message }

  const note = `Set by this hospital on ${new Date().toISOString().slice(0, 10)}`
  const { error } = await supabase.from('lab_reference_ranges').insert(pairs.map((x) => ({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id, analyte_id: analyteId, sex: x.sex,
    age_min_days: input.allAges ? 0 : ADULT_FROM, age_max_days: LIFETIME_TO,
    ref_low: x.p?.low ?? null, ref_high: x.p?.high ?? null,
    source: 'tenant', source_note: note,
  })))
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'lab_reference_range', analyteId, {
    measurement: a.name, bySex: input.bySex, allAges: input.allAges,
    ranges: pairs.map((x) => ({ sex: x.sex, low: x.p?.low ?? null, high: x.p?.high ?? null })),
  })
  return { success: true }
}

/** The written normal for a written line — "Pale yellow", "0–5", "Nil". */
export async function saveMeasurementNormalText(analyteId: string, text: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const normal = text.trim()
  if (!normal) return { success: false, error: 'Enter the normal, e.g. "Pale yellow" or "0–5"' }
  if (normal.length > 80) return { success: false, error: 'Keep the normal short — it prints in one column of the report' }

  const supabase = await createClient()
  const { data: a } = await supabase.from('lab_analytes').select('id, name, value_type').eq('id', analyteId).maybeSingle()
  if (!a) return { success: false, error: 'That measurement no longer exists' }
  if (a.value_type !== 'text') return { success: false, error: `${a.name} is not a written result` }

  const { error: delErr } = await supabase.from('lab_reference_ranges')
    .delete().eq('analyte_id', analyteId).eq('tenant_id', actor.tenant_id)
  if (delErr) return { success: false, error: delErr.message }

  const { error } = await supabase.from('lab_reference_ranges').insert({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id, analyte_id: analyteId, sex: 'any',
    age_min_days: 0, age_max_days: LIFETIME_TO, ref_low: null, ref_high: null, normal_text: normal,
    source: 'tenant', source_note: `Set by this hospital on ${new Date().toISOString().slice(0, 10)}`,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'lab_reference_range', analyteId, { measurement: a.name, normal_text: normal })
  return { success: true }
}

/** Go back to Uyirly's standard for one measurement. */
export async function resetMeasurementRange(analyteId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  const supabase = await createClient()
  const { data: removed, error } = await supabase.from('lab_reference_ranges')
    .delete().eq('analyte_id', analyteId).eq('tenant_id', actor.tenant_id).select('id')
  if (error) return { success: false, error: error.message }

  // An analyzer that sends this measurement fills an empty slot with its own
  // range on its next result (learnInstrumentRanges), quietly undoing this.
  // So where one does, the standard is kept as the hospital's own copy.
  let kept = 0
  const { count: mapped } = await supabase.from('analyzer_mappings')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', actor.tenant_id).eq('analyte_id', analyteId).eq('enabled', true)
  if (mapped) {
    const { data: standard } = await supabase.from('lab_reference_ranges')
      .select('sex, age_min_days, age_max_days, ref_low, ref_high, crit_low, crit_high, normal_text')
      .eq('analyte_id', analyteId).is('tenant_id', null).limit(50)
    const rows = (standard ?? []).filter((r) => r.ref_low != null || r.ref_high != null || r.normal_text)
    if (rows.length) {
      const note = `Uyirly standard, chosen by this hospital on ${new Date().toISOString().slice(0, 10)}`
      const { error: copyErr } = await supabase.from('lab_reference_ranges').insert(rows.map((r) => ({
        ...r, id: crypto.randomUUID(), tenant_id: actor.tenant_id, analyte_id: analyteId,
        source: 'tenant', source_note: note,
      })))
      if (copyErr) return { success: false, error: copyErr.message }
      kept = rows.length
    }
  }

  await logAudit(actor.id, 'update', 'lab_reference_range', analyteId, {
    reset_to_standard: true, removed: removed?.length ?? 0, kept_as_own_copy: kept,
  })
  return { success: true }
}
