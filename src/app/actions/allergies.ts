'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { PatientAllergy, AllergySeverity } from '@/lib/types'

export async function listAllergies(patientId: string): Promise<PatientAllergy[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patient_allergies')
    .select('*, recorder:profiles(id, full_name)')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as PatientAllergy[]
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
