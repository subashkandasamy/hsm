'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { istToday } from '@/lib/istDate'
import { evaluateChildDose, type DoseCheckInput, type DoseCheckResult } from '@/lib/dosing/evaluate'

/** Live dose check for the prescription forms. */
export async function checkChildDose(input: DoseCheckInput): Promise<DoseCheckResult> {
  const supabase = await createClient()
  return evaluateChildDose(supabase, input)
}

/** Records the child's weight for dosing (today), when none is on file. */
export async function recordDosingWeight(patientId: string, weightKg: number, visitId?: string | null): Promise<{ success: true } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')
  if (!Number.isFinite(weightKg) || weightKg < 0.4 || weightKg > 150) return { success: false, error: 'Enter the weight in kg (0.4–150)' }
  const supabase = await createClient()
  const { data: patient } = await supabase.from('patients').select('id').eq('id', patientId).maybeSingle()
  if (!patient) return { success: false, error: 'Patient not found' }
  if (visitId) {
    // Keep it with the visit's vitals so the consultation shows the same weight.
    const { data: visit } = await supabase.from('visits').select('vitals, patient_id').eq('id', visitId).maybeSingle()
    if (!visit || visit.patient_id !== patientId) return { success: false, error: 'Visit not found' }
    const vitals = { ...((visit.vitals as Record<string, unknown> | null) ?? {}), weight: String(weightKg) }
    const { error } = await supabase.from('visits').update({ vitals }).eq('id', visitId)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase.from('pediatric_growth').insert({
      tenant_id: actor.tenant_id, patient_id: patientId, recorded_by: actor.id, recorded_at: istToday(), weight_kg: weightKg, notes: 'Weight for dosing',
    })
    if (error) return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'dosing_weight', 'patient', patientId, { weight_kg: weightKg, visit_id: visitId ?? null })
  return { success: true }
}
