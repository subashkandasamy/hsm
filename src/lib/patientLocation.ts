import type { SupabaseClient } from '@supabase/supabase-js'

export type PatientLocation = 'ipd' | 'emergency' | null

/**
 * Returns where a patient currently is, or null if they are free.
 * Used to block OPD booking / visit-start when the patient is admitted elsewhere.
 */
export async function getPatientActiveLocation(
  patientId: string,
  supabase: SupabaseClient
): Promise<PatientLocation> {
  const [ipdRes, emRes] = await Promise.all([
    supabase
      .from('admissions')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('status', 'admitted'),
    supabase
      .from('emergency_cases')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .in('status', ['waiting', 'in_treatment']),
  ])

  if ((ipdRes.count ?? 0) > 0) return 'ipd'
  if ((emRes.count ?? 0) > 0) return 'emergency'
  return null
}

export function patientLocationMessage(loc: PatientLocation): string {
  if (loc === 'ipd') return 'This patient is currently admitted to IPD. Discharge them before booking an OPD appointment.'
  if (loc === 'emergency') return 'This patient is currently in Emergency. Resolve the emergency case before booking an OPD appointment.'
  return ''
}
