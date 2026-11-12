'use server'

import { z } from 'zod'
import { toCelsius } from '@/lib/round'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { SECTION_KEYS, type AssessmentData, type AssessmentSetting, type SectionKey } from '@/lib/initialAssessment'
import { ASSESSMENT_COLUMNS, syncArrivalObservation, type AssessmentRow } from '@/lib/initialAssessmentDb'

type SimpleResult = { success: true } | { success: false; error: string }

/** Whose evaluation: an ER case, or an admission (which may have come from one). */
export interface AssessmentOwner { emergencyCaseId?: string | null; admissionId?: string | null }

export interface AssessmentContext {
  setting: AssessmentSetting
  patientId: string
  ageYears: number | null
  emergencyCaseId: string | null
  admissionId: string | null
  /** From the ER case, when there is one — shown, not re-entered. */
  er: { triage_level: number; arrival_mode: string | null; arrived_at: string; complaint: string | null; is_mlc: boolean } | null
}

export interface AssessmentView {
  assessment: AssessmentRow | null
  context: AssessmentContext
}

function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let y = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--
  return Math.max(0, y)
}

type Supa = Awaited<ReturnType<typeof createClient>>

/** Resolve the owner to its patient, ER case and admission, and the evaluation row if one exists. */
async function resolve(supabase: Supa, owner: AssessmentOwner): Promise<{ view: AssessmentView } | { error: string }> {
  const admissionId = owner.admissionId ?? null
  let caseId = owner.emergencyCaseId ?? null
  let patientId: string | null = null

  if (admissionId) {
    const { data: adm } = await supabase.from('admissions')
      .select('id, patient_id, source_emergency_case_id').eq('id', admissionId).maybeSingle()
    if (!adm) return { error: 'Admission not found' }
    patientId = adm.patient_id as string
    caseId = caseId ?? (adm.source_emergency_case_id as string | null)
  }
  let er: AssessmentContext['er'] = null
  if (caseId) {
    const { data: ec } = await supabase.from('emergency_cases')
      .select('id, patient_id, triage_level, arrival_mode, arrived_at, complaint, is_mlc').eq('id', caseId).maybeSingle()
    if (!ec) return { error: 'Emergency case not found' }
    if (patientId && ec.patient_id !== patientId) return { error: 'That ER case is another patient’s' }
    patientId = ec.patient_id as string
    er = {
      triage_level: ec.triage_level as number, arrival_mode: (ec.arrival_mode as string | null) ?? null,
      arrived_at: ec.arrived_at as string, complaint: (ec.complaint as string | null) ?? null, is_mlc: !!ec.is_mlc,
    }
  }
  if (!patientId) return { error: 'No patient for this evaluation' }

  // The admission's own evaluation, else the one written in the ER for its case.
  let row: AssessmentRow | null = null
  if (admissionId) {
    const { data } = await supabase.from('initial_assessments').select(ASSESSMENT_COLUMNS).eq('admission_id', admissionId).maybeSingle()
    row = (data as AssessmentRow | null) ?? null
  }
  if (!row && caseId) {
    const { data } = await supabase.from('initial_assessments').select(ASSESSMENT_COLUMNS).eq('emergency_case_id', caseId).maybeSingle()
    row = (data as AssessmentRow | null) ?? null
  }

  const { data: pt } = await supabase.from('patients').select('dob').eq('id', patientId).maybeSingle()
  return {
    view: {
      assessment: row,
      context: {
        setting: row?.setting ?? (caseId ? 'er' : 'ipd'),
        patientId, ageYears: ageFrom(pt?.dob as string | null), emergencyCaseId: caseId, admissionId, er,
      },
    },
  }
}

export async function getInitialAssessment(owner: AssessmentOwner): Promise<AssessmentView | null> {
  const actor = await getActorProfile()
  if (!['admin', 'doctor', 'nurse'].includes(actor.role)) return null
  const supabase = await createClient()
  const r = await resolve(supabase, owner)
  return 'error' in r ? null : r.view
}

// ── Section validation ────────────────────────────────────────────────────────
// Lenient on purpose (a half-filled section saves), strict on type and size so
// nothing odd reaches the JSON.

const txt = (max = 2000) => z.string().max(max).optional()
const num = (min: number, max: number) => z.number().min(min).max(max).nullable().optional()
const when = z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), 'Not a valid time').nullable().optional()

const SECTION_SCHEMAS: Record<SectionKey, z.ZodTypeAny> = {
  arrival: z.object({ pre_hospital: txt(), iv_fluids: z.boolean().optional(), inotropes: z.boolean().optional(), ventilated: z.boolean().optional(), bystander: txt(200),
    iv_fluids_note: txt(200), inotropes_note: txt(200), ventilation_note: txt(200) }),
  on_arrival: z.object({
    at: when, avpu: z.enum(['A', 'V', 'P', 'U', '']).optional(), oriented: z.boolean().nullable().optional(),
    // °C or °F — KMCH writes °F; a reading of 80 or more is converted before it is kept
    hr: num(0, 300), sbp: num(0, 350), dbp: num(0, 250), rr: num(0, 120), spo2: num(0, 100), temp: num(25, 110),
    grbs: num(0, 1500), etco2: num(0, 150), weight: num(0, 400),
    gcs_e: num(1, 4), gcs_v: num(1, 5), gcs_m: num(1, 6),
    level: z.enum(['unresponsive', 'altered', 'drowsy', 'conscious', '']).optional(),
    orientation: z.object({ time: z.boolean().optional(), place: z.boolean().optional(), person: z.boolean().optional() }).optional(),
    pain: num(0, 10), id_marks: txt(300), triage_staff: txt(100),
  }),
  primary_survey: z.object({
    airway: z.object({
      status: z.enum(['patent', 'at_risk', 'obstructed', '']).optional(), intervention: txt(500),
      signs: z.array(z.enum(['patent', 'impending', 'secretions', 'stridor'])).max(4).optional(), oxygen_lpm: num(0, 60),
      c_spine: z.enum(['cleared', 'collar', '']).optional(), triple_immobilised: z.boolean().optional(),
    }).optional(),
    breathing: z.object({
      findings: txt(500), intervention: txt(500),
      trachea: z.enum(['midline', 'shift_right', 'shift_left', '']).optional(), surgical_emphysema: z.enum(['yes', 'no', '']).optional(),
      breath_r: txt(200), breath_l: txt(200), percussion_r: txt(200), percussion_l: txt(200),
    }).optional(),
    circulation: z.object({
      crt: txt(50), bleeding: txt(300), iv_access: txt(200), findings: txt(500),
      central_pulse: z.enum(['present', 'absent', '']).optional(), heart_sound: z.enum(['yes', 'no', 'muffled', '']).optional(),
      peripheral_pulse: z.enum(['present', 'feeble', 'absent', '']).optional(), radio_femoral: z.enum(['present', 'absent', '']).optional(),
      pelvic_compression: z.enum(['positive', 'negative', '']).optional(), actions: txt(500),
    }).optional(),
    disability: z.object({ pupils_left: txt(50), pupils_right: txt(50), findings: txt(500), cbg: num(0, 1500) }).optional(),
    exposure: z.object({ findings: txt(1000) }).optional(),
  }),
  sample: z.object({ complaint: txt(1000), history: txt(4000), medications: txt(1000), last_meal: txt(100), lmp: txt(100), events: txt(2000),
    smoking: z.enum(['yes', 'no', 'ex', '']).optional(), alcohol: z.enum(['yes', 'no', 'ex', '']).optional(), social: txt(300) }),
  efast: z.object({ done: z.enum(['yes', 'no', '']).optional(), results: z.record(z.string().max(30), z.enum(['positive', 'negative', ''])).optional(), notes: txt(1000),
    echo: txt(500), usg_chest: txt(500), usg_abdomen: txt(500) }),
  secondary_survey: z.object({ signs: z.record(z.string().max(30), z.boolean()).optional(), general: txt(1000), systems: z.record(z.string().max(30), z.string().max(1000)).optional() }),
  burns: z.object({ areas: z.record(z.string().max(30), z.number().min(0).max(1)).optional(), depth: txt(200) }),
  plan: z.object({
    provisional_diagnosis: txt(1000), investigations: txt(1000), plan: txt(4000), service_contacted: txt(300),
    disposition: z.enum(['admit_ward', 'admit_icu', 'ot', 'observation', 'discharge', 'refer', '']).optional(),
  }),
  treatment: z.array(z.object({ at: z.string().max(40), item: z.string().min(1, 'Name the treatment').max(300), dose: txt(100), route: txt(50), by: txt(100) })).max(100),
  shifting: z.object({ at: when, to: txt(200), condition: txt(1000), escort: txt(200), handed_over_to: txt(200) }),
}

/**
 * Saves one section of the evaluation, creating the evaluation on first save.
 * In the ER it belongs to the case; on an admission to the admission (an ER
 * case's evaluation found unlinked is linked here too).
 */
export async function saveAssessmentSection(
  owner: AssessmentOwner, section: string, value: unknown,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  if (!SECTION_KEYS.includes(section as SectionKey)) return { success: false, error: 'Unknown section' }
  const key = section as SectionKey
  const parsed = SECTION_SCHEMAS[key].safeParse(value)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  // Temperature on arrival is kept in °C (it becomes the first chart reading); KMCH writes °F.
  if (key === 'on_arrival') {
    const oa = parsed.data as { temp?: number | null }
    if (typeof oa.temp === 'number') oa.temp = toCelsius(oa.temp)
  }

  const supabase = await createClient()
  const r = await resolve(supabase, owner)
  if ('error' in r) return { success: false, error: r.error }
  const { context: c } = r.view
  await requirePermission(actor.role, c.admissionId ? 'ipd:notes' : 'emergency:triage')

  let row = r.view.assessment
  const now = new Date().toISOString()
  if (!row) {
    const { data, error } = await supabase.from('initial_assessments').insert({
      tenant_id: actor.tenant_id, patient_id: c.patientId,
      emergency_case_id: c.emergencyCaseId, admission_id: c.admissionId,
      setting: c.setting, data: { [key]: parsed.data }, created_by: actor.id, updated_by: actor.id,
    }).select(ASSESSMENT_COLUMNS).single()
    if (error) {
      // Two screens saving the first section at once: the unique index wins; save again onto it.
      if (error.code === '23505') return saveAssessmentSection(owner, section, value)
      return { success: false, error: error.message }
    }
    row = data as AssessmentRow
  } else {
    const data: AssessmentData = { ...(row.data ?? {}), [key]: parsed.data }
    const patch: Record<string, unknown> = { data, updated_by: actor.id, updated_at: now }
    if (c.admissionId && !row.admission_id) patch.admission_id = c.admissionId
    const { data: upd, error } = await supabase.from('initial_assessments').update(patch).eq('id', row.id).select(ASSESSMENT_COLUMNS).single()
    if (error) return { success: false, error: error.message }
    row = upd as AssessmentRow
  }

  if (key === 'on_arrival' || (c.admissionId && !r.view.assessment?.admission_id)) {
    await syncArrivalObservation(supabase, row, actor.id)
  }
  await logAudit(actor.id, `assessment_${key}`, 'initial_assessment', row.id, {
    emergency_case_id: c.emergencyCaseId, admission_id: c.admissionId,
  })
  return { success: true }
}
