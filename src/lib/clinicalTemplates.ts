'use server'

import { createClient } from '@/lib/supabase/server'
import type { ClinicalTemplate } from '@/lib/types'

/**
 * Resolve which clinical template to render for a given visit.
 * Priority:
 *  1. appointment_id → appointment.department_id → department.clinical_template
 *  2. doctor_id      → profiles.department_id   → department.clinical_template
 *  3. Fallback: 'general'
 */
export async function resolveVisitTemplate(visit: {
  id: string
  appointment_id: string | null
  doctor_id: string
}): Promise<ClinicalTemplate> {
  const supabase = await createClient()

  // Path 1: via appointment's department
  if (visit.appointment_id) {
    const { data: appt } = await supabase
      .from('appointments')
      .select('department_id')
      .eq('id', visit.appointment_id)
      .single()

    if (appt?.department_id) {
      const template = await fetchDeptTemplate(supabase, appt.department_id)
      if (template) return template
    }
  }

  // Path 2: via doctor's department
  const { data: profile } = await supabase
    .from('profiles')
    .select('department_id')
    .eq('id', visit.doctor_id)
    .single()

  if (profile?.department_id) {
    const template = await fetchDeptTemplate(supabase, profile.department_id)
    if (template) return template
  }

  return 'general'
}

async function fetchDeptTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  departmentId: string
): Promise<ClinicalTemplate | null> {
  const { data } = await supabase
    .from('departments')
    .select('clinical_template')
    .eq('id', departmentId)
    .single()
  return (data?.clinical_template as ClinicalTemplate | null) ?? null
}
