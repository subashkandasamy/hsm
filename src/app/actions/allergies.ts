'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { PatientAllergy, AllergySeverity } from '@/lib/types'
import { registrationOnly, REGISTRATION_ALLERGY } from '@/lib/allergyText'

/**
 * Every allergy known for the patient: the structured entries, then anything
 * typed at registration that has not been entered as a structured allergy
 * (BUG-008 — those were invisible to the doctor and to the prescription check).
 */
export async function listAllergies(patientId: string): Promise<PatientAllergy[]> {
  const supabase = await createClient()
  const [{ data }, { data: patient }] = await Promise.all([
    supabase.from('patient_allergies').select('*, recorder:profiles(id, full_name)')
      .eq('patient_id', patientId).order('created_at', { ascending: false }),
    supabase.from('patients').select('allergies, created_at').eq('id', patientId).maybeSingle(),
  ])
  const rows = (data ?? []) as unknown as PatientAllergy[]
  const extra: PatientAllergy[] = registrationOnly(patient?.allergies as string | null, rows.map((r) => r.allergen))
    .map((allergen, i) => ({
      id: `${REGISTRATION_ALLERGY}${i}`, patient_id: patientId, allergen, reaction: null,
      severity: 'moderate', recorded_by: null, created_at: (patient?.created_at as string) ?? new Date().toISOString(),
      recorder: null, source: 'registration',
    }))
  return [...rows, ...extra]
}

export async function addAllergy(input: {
  patientId: string
  allergen: string
  reaction?: string | null
  severity: AllergySeverity
}): Promise<{ success: true; allergy: PatientAllergy } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:allergy:write')

  if (!input.allergen.trim()) return { success: false, error: 'Allergen name is required' }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('patient_allergies').insert({
    id,
    tenant_id: actor.tenant_id,
    patient_id: input.patientId,
    allergen: input.allergen.trim(),
    reaction: input.reaction ?? null,
    severity: input.severity,
    recorded_by: actor.id,
  })

  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'patient_allergy', id, {
    patient_id: input.patientId, allergen: input.allergen, severity: input.severity,
  })

  const { data } = await supabase
    .from('patient_allergies')
    .select('*, recorder:profiles(id, full_name)')
    .eq('id', id)
    .single()
  return { success: true, allergy: data as unknown as PatientAllergy }
}

export async function removeAllergy(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emr:allergy:write')
  if (id.startsWith(REGISTRATION_ALLERGY)) {
    return { success: false, error: 'This allergy was typed at registration — change it in the patient\'s details (Edit).' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('patient_allergies').select('patient_id, allergen').eq('id', id).single()

  const { error } = await supabase.from('patient_allergies').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'patient_allergy', id, {
    patient_id: existing?.patient_id, allergen: existing?.allergen,
  })
  return { success: true }
}
