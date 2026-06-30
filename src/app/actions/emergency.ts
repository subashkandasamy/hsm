'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { EmergencyRegisterSchema, ConsultationSchema } from '@/lib/schemas'
import type { EmergencyCase, TriageLevel } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function registerEmergency(
  input: Record<string, unknown>
): Promise<{ success: true; caseId: string; patientId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  const parsed = EmergencyRegisterSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  let patientId = parsed.data.patient_id ?? null

  // If no patient identified, create a provisional patient
  if (!patientId) {
    const age = parsed.data.prov_age ?? 'Unknown'
    const gender = parsed.data.prov_gender ?? 'unknown'
    const provName = parsed.data.prov_name?.trim()
      || `Unknown ${gender.charAt(0).toUpperCase() + gender.slice(1)} ~${age}y`

    const provPhone = `PROV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

    // Use get_next_uhid for the provisional patient too
    const { data: uhid, error: uhidErr } = await supabase.rpc('get_next_uhid')
    if (uhidErr || !uhid) return { success: false, error: 'Failed to generate UHID' }

    patientId = crypto.randomUUID()
    const { error: patErr } = await supabase.from('patients').insert({
      id:         patientId,
      uhid,
      tenant_id:  actor.tenant_id,
      full_name:  provName,
      gender:     parsed.data.prov_gender ?? null,
      phone:      provPhone,
      created_by: actor.id,
    })
    if (patErr) return { success: false, error: patErr.message }
  }

  const caseId = crypto.randomUUID()
  const { error } = await supabase.from('emergency_cases').insert({
    id:           caseId,
    tenant_id:    actor.tenant_id,
    patient_id:   patientId,
    triage_level: parsed.data.triage_level,
    arrival_mode: parsed.data.arrival_mode ?? null,
    complaint:    parsed.data.complaint ?? null,
    status:       'waiting',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'register', 'emergency_case', caseId, {
    triage_level: parsed.data.triage_level,
    patient_id: patientId,
  })
  return { success: true, caseId, patientId }
}

export async function setTriage(
  caseId: string,
  level: TriageLevel
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const { error } = await supabase
    .from('emergency_cases')
    .update({ triage_level: level })
    .eq('id', caseId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'triage', 'emergency_case', caseId, { level })
  return { success: true }
}

export async function attendCase(caseId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const { error } = await supabase
    .from('emergency_cases')
    .update({ status: 'in_treatment', attended_by: actor.id })
    .eq('id', caseId)
    .eq('status', 'waiting')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'attend', 'emergency_case', caseId)
  return { success: true }
}

export async function recordEmergencyVisit(
  caseId: string,
  input: Record<string, unknown>
): Promise<{ success: true; visitId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const parsed = ConsultationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Get case patient_id
  const { data: ec } = await supabase
    .from('emergency_cases').select('patient_id').eq('id', caseId).single()
  if (!ec) return { success: false, error: 'Emergency case not found' }

  const visitId = crypto.randomUUID()
  const { error } = await supabase.from('visits').insert({
    id:         visitId,
    tenant_id:  actor.tenant_id,
    patient_id: ec.patient_id,
    doctor_id:  actor.id,
    type:       'emergency',
    status:     'open',
    complaint:  parsed.data.complaint ?? null,
    diagnosis:  parsed.data.diagnosis ?? null,
    icd_code:   parsed.data.icd_code  ?? null,
    notes:      parsed.data.notes     ?? null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'visit', 'emergency_case', caseId, { visit_id: visitId })
  return { success: true, visitId }
}

export async function resolveEmergency(
  caseId: string,
  outcome: 'discharge' | 'refer',
  outcomeNote: string
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const status = outcome === 'discharge' ? 'discharged' : 'referred'

  const { error } = await supabase
    .from('emergency_cases')
    .update({ status, outcome: outcomeNote })
    .eq('id', caseId)
  if (error) return { success: false, error: error.message }

  // On discharge: close any open emergency visits
  if (outcome === 'discharge') {
    const { data: ec } = await supabase
      .from('emergency_cases').select('patient_id').eq('id', caseId).single()
    if (ec?.patient_id) {
      await supabase.from('visits')
        .update({ status: 'closed' })
        .eq('patient_id', ec.patient_id)
        .eq('type', 'emergency')
        .eq('status', 'open')
    }
  }

  await logAudit(actor.id, outcome, 'emergency_case', caseId, { outcome: outcomeNote })
  return { success: true }
}

export async function admitFromEmergency(
  caseId: string
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const { error } = await supabase
    .from('emergency_cases')
    .update({ status: 'admitted' })
    .eq('id', caseId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'admit_from_emergency', 'emergency_case', caseId)
  return { success: true }
}

export async function listEmergencyCases(activeOnly = true): Promise<EmergencyCase[]> {
  const supabase = await createClient()
  let q = supabase
    .from('emergency_cases')
    .select('*, patient:patients(id, full_name, uhid, phone), attendant:profiles(id, full_name)')
    .order('triage_level', { ascending: true })
    .order('arrived_at',   { ascending: true })

  if (activeOnly) {
    q = q.in('status', ['waiting', 'in_treatment'])
  }

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as EmergencyCase[]
}
