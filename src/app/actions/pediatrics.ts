'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { GrowthSchema } from '@/lib/schemas'
import type { GrowthRecord } from '@/lib/types'
import { getVaccination, type Vaccination } from '@/app/actions/vaccination'
import { istDate, istToday } from '@/lib/istDate'
import { assessGrowth, sdCurves, AGE_MAX_DAYS, type Assessment, type Severity, type Sex } from '@/lib/growth/zscore'
import type { PediatricProfile } from '@/lib/types'
import { firstImplausible, GROWTH_RANGES } from '@/lib/clinical/plausible'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Growth ----

export async function listGrowth(patientId: string): Promise<GrowthRecord[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pediatric_growth').select('*').eq('patient_id', patientId).order('recorded_at')
  return (data ?? []) as unknown as GrowthRecord[]
}

export async function recordGrowth(patientId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')
  const parsed = GrowthSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('pediatric_growth').insert({
    tenant_id: actor.tenant_id, patient_id: patientId, recorded_by: actor.id,
    ...parsed.data, recorded_at: parsed.data.recorded_at || istToday(),
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'growth', 'patient', patientId)
  return { success: true }
}

// ---- Paediatric OPD template ----


export interface GrowthPoint {
  id: string; recorded_at: string; ageDays: number; visit_id: string | null
  weight_kg: number | null; height_cm: number | null; head_circ_cm: number | null; muac_cm: number | null
  assessments: Assessment[]; muac: { status: string; severity: Severity } | null
}

export interface PaediatricAssessment {
  sex: Sex | null
  dob: string | null
  /** Age on the visit date (or today), in days. */
  ageDays: number | null
  /** Within WHO 0–5 year standards. */
  inWhoRange: boolean
  profile: PediatricProfile | null
  history: GrowthPoint[]
  visitMeasurement: GrowthPoint | null
  curves: Record<'wfa' | 'lhfa' | 'hcfa', Array<{ day: number; sd: Record<string, number> }>> | null
  vaccination: Vaccination
}

const dayDiff = (from: string, to: string) =>
  Math.floor((new Date(`${to}T00:00:00+05:30`).getTime() - new Date(`${from.slice(0, 10)}T00:00:00+05:30`).getTime()) / 86400000)

/** Everything the paediatric consultation section needs, computed on the server (WHO tables stay server-side). */
export async function getPaediatricAssessment(patientId: string, visitId?: string | null): Promise<PaediatricAssessment> {
  const supabase = await createClient()
  const [{ data: patient }, { data: profile }, { data: rows }, vaccination, visitRes] = await Promise.all([
    supabase.from('patients').select('dob, gender').eq('id', patientId).single(),
    supabase.from('pediatric_profiles').select('*').eq('patient_id', patientId).maybeSingle(),
    supabase.from('pediatric_growth').select('*').eq('patient_id', patientId).order('recorded_at'),
    getVaccination(patientId),
    visitId ? supabase.from('visits').select('visit_date').eq('id', visitId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const dob = (patient?.dob as string | null) ?? null
  const g = patient?.gender as string | null
  const sex: Sex | null = g === 'male' || g === 'female' ? g : null
  const onDate = visitRes.data?.visit_date ? istDate(visitRes.data.visit_date as string) : istToday()
  const ageDays = dob ? dayDiff(dob, onDate) : null

  const history: GrowthPoint[] = ((rows ?? []) as unknown as GrowthRecord[]).map((r) => {
    const age = dob ? dayDiff(dob, r.recorded_at) : -1
    const m = { weight_kg: r.weight_kg, height_cm: r.height_cm, head_circ_cm: r.head_circ_cm, muac_cm: r.muac_cm }
    const a = sex && dob ? assessGrowth(sex, age, m) : { assessments: [], muac: null }
    return { id: r.id, recorded_at: r.recorded_at, ageDays: age, visit_id: r.visit_id ?? null, ...m, assessments: a.assessments, muac: a.muac }
  })

  return {
    sex, dob, ageDays,
    inWhoRange: ageDays != null && ageDays >= 0 && ageDays <= AGE_MAX_DAYS,
    profile: (profile as PediatricProfile | null) ?? null,
    history,
    visitMeasurement: visitId ? history.find((h) => h.visit_id === visitId) ?? null : null,
    curves: sex ? { wfa: sdCurves('wfa', sex), lhfa: sdCurves('lhfa', sex), hcfa: sdCurves('hcfa', sex) } : null,
    vaccination,
  }
}

/** Saves this visit's measurements (one row per visit — re-saving updates it). */
export async function saveVisitGrowth(visitId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')
  const parsed = GrowthSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (d.weight_kg == null && d.height_cm == null && d.head_circ_cm == null && d.muac_cm == null) {
    return { success: false, error: 'Enter at least one measurement' }
  }
  // Plausibility guard against unit slips (grams for kg, mm for cm), and against
  // a value typed into the wrong box. Names the field so it can be found.
  const slip = firstImplausible(
    { weight_kg: d.weight_kg, height_cm: d.height_cm, head_circ_cm: d.head_circ_cm, muac_cm: d.muac_cm },
    GROWTH_RANGES,
  )
  if (slip) return { success: false, error: slip.message }

  const supabase = await createClient()
  const { data: visit } = await supabase.from('visits').select('patient_id, visit_date').eq('id', visitId).maybeSingle()
  if (!visit) return { success: false, error: 'Visit not found' }
  const row = {
    tenant_id: actor.tenant_id, patient_id: visit.patient_id as string, visit_id: visitId, recorded_by: actor.id,
    recorded_at: istDate(visit.visit_date as string),
    weight_kg: d.weight_kg ?? null, height_cm: d.height_cm ?? null, head_circ_cm: d.head_circ_cm ?? null, muac_cm: d.muac_cm ?? null,
    notes: d.notes ?? null,
  }
  const { data: existing } = await supabase.from('pediatric_growth').select('id').eq('visit_id', visitId).maybeSingle()
  const { error } = existing
    ? await supabase.from('pediatric_growth').update(row).eq('id', existing.id)
    : await supabase.from('pediatric_growth').insert(row)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'growth', 'patient', row.patient_id, { visit_id: visitId })
  return { success: true }
}

const PediatricProfileInput = {
  gestational_age_weeks: (v: unknown) => v == null || v === '' ? null : Number(v),
}

export async function savePediatricProfile(patientId: string, input: Partial<Omit<PediatricProfile, 'patient_id'>>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')
  const ga = PediatricProfileInput.gestational_age_weeks(input.gestational_age_weeks)
  if (ga != null && (!(ga >= 20) || ga > 45)) return { success: false, error: 'Gestational age should be between 20 and 45 weeks' }
  if (input.birth_weight_kg != null && (input.birth_weight_kg <= 0 || input.birth_weight_kg > 7)) {
    return { success: false, error: 'Birth weight should be in kg (e.g. 3.2)' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('pediatric_profiles').upsert({
    patient_id: patientId, tenant_id: actor.tenant_id, updated_by: actor.id, updated_at: new Date().toISOString(),
    gestational_age_weeks: ga,
    birth_weight_kg: input.birth_weight_kg ?? null,
    birth_length_cm: input.birth_length_cm ?? null,
    birth_head_circ_cm: input.birth_head_circ_cm ?? null,
    delivery_mode: input.delivery_mode ?? null,
    nicu_admission: input.nicu_admission ?? null,
    neonatal_notes: input.neonatal_notes?.trim() || null,
    feeding: input.feeding ?? null,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'pediatric_profile', 'patient', patientId)
  return { success: true }
}

/**
 * Records several scheduled doses at once. 'today' = given in this visit;
 * 'earlier' = the child already had them elsewhere and the date isn't known, so
 * the scheduled due date is stored with a note saying so.
 */
