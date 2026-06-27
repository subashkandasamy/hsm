'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { VitalsSchema, ConsultationSchema, PrescriptionSchema } from '@/lib/schemas'
import type { Visit, Prescription } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function startVisit(
  appointmentId: string
): Promise<{ success: true; visitId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:read')

  const supabase = await createClient()

  // Idempotent: return existing open visit if one exists for this appointment
  const { data: existing } = await supabase
    .from('visits')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (existing) return { success: true, visitId: existing.id }

  // Fetch appointment to get patient_id + doctor_id
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, status')
    .eq('id', appointmentId)
    .single()

  if (apptErr || !appt) return { success: false, error: 'Appointment not found' }
  if (appt.status === 'done') return { success: false, error: 'Appointment already closed' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('visits').insert({
    id,
    tenant_id: actor.tenant_id,
    patient_id: appt.patient_id,
    doctor_id: appt.doctor_id,
    appointment_id: appointmentId,
    type: 'opd',
    status: 'open',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'start', 'visit', id, { appointment_id: appointmentId })
  return { success: true, visitId: id }
}

export async function saveVitals(
  visitId: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:vitals')

  const parsed = VitalsSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('visits').update({ vitals: parsed.data }).eq('id', visitId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'visit_vitals', visitId)
  return { success: true }
}

export async function saveConsultation(
  visitId: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const parsed = ConsultationSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('visits')
    .update({
      complaint: parsed.data.complaint ?? null,
      diagnosis: parsed.data.diagnosis ?? null,
      icd_code:  parsed.data.icd_code  ?? null,
      notes:     parsed.data.notes     ?? null,
    })
    .eq('id', visitId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'visit_consultation', visitId, parsed.data as Record<string, unknown>)
  return { success: true }
}

export async function addPrescription(
  visitId: string,
  input: Record<string, unknown>
): Promise<{ success: true; prescription: Prescription } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const parsed = PrescriptionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('prescriptions').insert({
    id,
    tenant_id:    actor.tenant_id,
    visit_id:     visitId,
    drug_name:    parsed.data.drug_name,
    dosage:       parsed.data.dosage       ?? null,
    frequency:    parsed.data.frequency    ?? null,
    duration:     parsed.data.duration     ?? null,
    instructions: parsed.data.instructions ?? null,
  })
  if (error) return { success: false, error: error.message }

  return {
    success: true,
    prescription: {
      id,
      visit_id: visitId,
      drug_name:    parsed.data.drug_name,
      dosage:       parsed.data.dosage       ?? null,
      frequency:    parsed.data.frequency    ?? null,
      duration:     parsed.data.duration     ?? null,
      instructions: parsed.data.instructions ?? null,
    },
  }
}

export async function removePrescription(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()
  const { error } = await supabase.from('prescriptions').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'prescription', id)
  return { success: true }
}

export async function closeVisit(visitId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()

  // Get appointment_id first so we can mark it done
  const { data: visit } = await supabase
    .from('visits').select('appointment_id').eq('id', visitId).single()

  // Fetch default consultation fee tariff
  const { data: tariff } = await supabase
    .from('tariffs').select('amount').eq('key', 'default_consultation_fee').maybeSingle()
  const consultationFee = (tariff?.amount as number | undefined) ?? 0

  const { error } = await supabase
    .from('visits').update({
      status: 'closed',
      consultation_fee: consultationFee,
      billing_status: 'unbilled',
    }).eq('id', visitId)
  if (error) return { success: false, error: error.message }

  if (visit?.appointment_id) {
    await supabase
      .from('appointments').update({ status: 'done' })
      .eq('id', visit.appointment_id)
  }

  await logAudit(actor.id, 'close', 'visit', visitId)
  return { success: true }
}

export async function getVisit(visitId: string): Promise<Visit | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visits')
    .select('*, doctor:profiles(id,full_name)')
    .eq('id', visitId)
    .single()
  if (error) {
    console.error('[getVisit] supabase error:', error.code, error.message, { visitId })
    return null
  }
  if (!data) return null

  // Fetch prescriptions separately — FK to partitioned visits was dropped in Phase 10
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*')
    .eq('visit_id', visitId)

  return { ...data, prescriptions: prescriptions ?? [] } as unknown as Visit
}

export async function getPatientVisits(patientId: string): Promise<Visit[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('visits')
    .select('*, doctor:profiles(id,full_name)')
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false })
  if (!data?.length) return []

  // Fetch all prescriptions for these visits in one query
  const visitIds = data.map((v) => v.id as string)
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select('*')
    .in('visit_id', visitIds)

  const rxByVisit = new Map<string, unknown[]>()
  for (const rx of prescriptions ?? []) {
    const vid = (rx as Record<string, unknown>).visit_id as string
    if (!rxByVisit.has(vid)) rxByVisit.set(vid, [])
    rxByVisit.get(vid)!.push(rx)
  }

  return data.map((v) => ({ ...v, prescriptions: rxByVisit.get(v.id as string) ?? [] })) as unknown as Visit[]
}

export async function saveClinicalData(
  visitId: string,
  clinicalData: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('visits')
    .update({ clinical_data: clinicalData })
    .eq('id', visitId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'visit_clinical_data', visitId)
  return { success: true }
}
