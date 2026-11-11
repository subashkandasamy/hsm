import type { SupabaseClient } from '@supabase/supabase-js'
import { arrivalObservation, type AssessmentData } from '@/lib/initialAssessment'

export interface AssessmentRow {
  id: string
  tenant_id: string
  patient_id: string
  emergency_case_id: string | null
  admission_id: string | null
  setting: 'er' | 'ipd'
  data: AssessmentData
  observation_id: string | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export const ASSESSMENT_COLUMNS =
  'id, tenant_id, patient_id, emergency_case_id, admission_id, setting, data, observation_id, created_at, updated_at, updated_by'

/**
 * Arrival vitals as the stay's first vitals-chart row — once the assessment
 * belongs to an admission. Kept in step: re-saving the vitals updates that one
 * row rather than adding another; clearing them all removes it.
 */
export async function syncArrivalObservation(
  supabase: SupabaseClient,
  a: AssessmentRow,
  actorId: string,
): Promise<void> {
  if (!a.admission_id) return
  const obs = arrivalObservation(a.data.on_arrival)
  const recordedAt = a.data.on_arrival?.at || a.created_at
  if (!obs) {
    if (a.observation_id) {
      await supabase.from('icu_observations').delete().eq('id', a.observation_id)
      await supabase.from('initial_assessments').update({ observation_id: null }).eq('id', a.id)
    }
    return
  }
  const row = { ...obs, recorded_at: recordedAt, notes: 'On arrival — from the Initial Evaluation' }
  if (a.observation_id) {
    const { data } = await supabase.from('icu_observations').update(row).eq('id', a.observation_id).select('id')
    if (data?.length) return
  }
  const id = crypto.randomUUID()
  const { error } = await supabase.from('icu_observations').insert({
    id, tenant_id: a.tenant_id, admission_id: a.admission_id, recorded_by: actorId, ...row,
  })
  if (error) { console.error('[syncArrivalObservation]', error.message); return }
  await supabase.from('initial_assessments').update({ observation_id: id }).eq('id', a.id)
}

/**
 * The ER case's evaluation becomes the admission's — called when an ER patient
 * is admitted (carryIntoAdmission). Its arrival vitals start the vitals chart.
 */
export async function linkAssessmentToAdmission(
  supabase: SupabaseClient,
  p: { emergencyCaseId: string; admissionId: string; actorId: string },
): Promise<boolean> {
  const { data } = await supabase.from('initial_assessments')
    .update({ admission_id: p.admissionId })
    .eq('emergency_case_id', p.emergencyCaseId).is('admission_id', null)
    .select(ASSESSMENT_COLUMNS)
  const row = (data?.[0] as AssessmentRow | undefined) ?? null
  if (!row) return false
  await syncArrivalObservation(supabase, row, p.actorId)
  return true
}
