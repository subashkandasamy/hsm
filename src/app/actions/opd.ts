'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { VitalsSchema, ConsultationSchema, PrescriptionSchema } from '@/lib/schemas'
import { getPatientActiveLocation, patientLocationMessage } from '@/lib/patientLocation'
import { encounterInsurance } from '@/lib/billing/insuranceShare'
import type { Visit, Prescription, VisitFinancials } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

/**
 * OPD equivalent of getAdmissionFinancials (admissionBilling.ts) — no
 * advances (that's IPD-only), just this visit's bills vs. any approved or
 * settled cashless claim scoped to it. An approved claim is a receivable
 * that covers the patient's balance the same way it does at IPD discharge;
 * only the patient's own residual share needs collecting.
 */
export async function getVisitFinancials(visitId: string): Promise<VisitFinancials> {
  const supabase = await createClient()

  const { data: bills } = await supabase
    .from('bills')
    .select('id, total, paid')
    .eq('visit_id', visitId)
    .not('status', 'eq', 'cancelled')
  const totalBilled = (bills ?? []).reduce((s, b) => s + (b.total as number), 0)
  const totalPaid   = (bills ?? []).reduce((s, b) => s + (b.paid as number), 0)

  const billIds = (bills ?? []).map((b) => b.id as string)
  let insuranceSettled = 0
  if (billIds.length > 0) {
    const { data: insPayments } = await supabase
      .from('payments').select('amount').in('bill_id', billIds).eq('method', 'insurance')
    insuranceSettled = (insPayments ?? []).reduce((s, p) => s + (p.amount as number), 0)
  }

  // Claims on the visit or on any of its bills (a cashless claim is often raised on
  // the consultation bill before the visit starts); only unreceived credit counts.
  const ins = await encounterInsurance(supabase, { visitId, billIds })
  const insuranceApproved = ins.outstanding

  const balanceDue = Math.max(0, totalBilled - totalPaid)
  const patientBalanceDue = Math.max(0, balanceDue - insuranceApproved)

  return { totalBilled, totalPaid, balanceDue, insuranceApproved, insuranceSettled, patientBalanceDue }
}

export async function startVisit(
  appointmentId: string
): Promise<{ success: true; visitId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:read')

  const supabase = await createClient()

  // Idempotent: return existing open visit if one exists for this appointment
  const { data: existing } = await supabase
    .from('visits')
    .select('id')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (existing) {
    // Ensure pre-existing appointment bills are linked (fixes visits started before this backfill)
    await supabase.from('bills').update({ visit_id: existing.id }).eq('appointment_id', appointmentId).is('visit_id', null)
    return { success: true, visitId: existing.id }
  }

  // Fetch appointment to get patient_id + doctor_id
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('id, patient_id, doctor_id, status')
    .eq('id', appointmentId)
    .single()

  if (apptErr || !appt) return { success: false, error: 'Appointment not found' }
  if (appt.status === 'done') return { success: false, error: 'Appointment already closed' }

  // Block visit start if patient is admitted to IPD or active in Emergency
  const location = await getPatientActiveLocation(appt.patient_id as string, supabase)
  if (location) return { success: false, error: patientLocationMessage(location) }

  // Phase 15: gate on consultation bill payment before opening the visit.
  // Fetch ALL bills for this appointment (including cancelled ones) so a cancelled
  // bill without payment doesn't silently bypass the gate.
  const { data: allConsultBills } = await supabase
    .from('bills')
    .select('id, status')
    .eq('appointment_id', appointmentId)

  const hasBill      = (allConsultBills?.length ?? 0) > 0
  const hasPaid      = allConsultBills?.some((b) => b.status === 'paid') ?? false
  const hasActiveUnpaid = allConsultBills?.some((b) => b.status !== 'paid' && b.status !== 'cancelled') ?? false

  // A verified cashless claim (front-desk eligibility check, approved before
  // the visit even starts) covers the bill the same way an approved claim
  // covers the balance at IPD discharge — the patient doesn't need to pay
  // what the insurer already owes. Keyed off eligibility_status specifically
  // (the provisional pre-auth decision), not the final claim status — that's
  // what actually unlocks treatment; the final claim only settles the money
  // later, often after the patient has already been seen. No visit exists
  // yet at this point, so this can only be a bill-scoped claim.
  let cashlessCovered = false
  if (hasBill && !hasPaid) {
    const activeBillIds = (allConsultBills ?? []).filter((b) => b.status !== 'cancelled').map((b) => b.id as string)
    if (activeBillIds.length > 0) {
      const { count } = await supabase
        .from('insurance_claims')
        .select('id', { count: 'exact', head: true })
        .in('bill_id', activeBillIds)
        .eq('eligibility_status', 'approved')
      cashlessCovered = (count ?? 0) > 0
    }
  }

  if (hasBill && !hasPaid && !cashlessCovered) {
    return {
      success: false,
      error: hasActiveUnpaid
        ? 'Please collect payment at the counter before starting this consultation'
        : 'Consultation fee was not collected. Please raise a new bill and collect payment before starting.',
    }
  }

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

  // Backfill visit_id onto the consultation bill created at booking time (which only has appointment_id)
  await supabase.from('bills').update({ visit_id: id }).eq('appointment_id', appointmentId).is('visit_id', null)

  await logAudit(actor.id, 'start', 'visit', id, { appointment_id: appointmentId })
  return { success: true, visitId: id }
}

export async function saveVitals(
  visitId: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
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
  await requireWriteAccess()
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
  await requireWriteAccess()
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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()
  const { error } = await supabase.from('prescriptions').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'prescription', id)
  return { success: true }
}

export async function closeVisit(visitId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()

  // Get appointment_id first so we can mark it done
  const { data: visit } = await supabase
    .from('visits').select('appointment_id').eq('id', visitId).single()

  // Phase 15: billing happens at booking time (not at close).
  // Only update status; billing_status stays 'unbilled' by default.
  const { error } = await supabase
    .from('visits').update({ status: 'closed' }).eq('id', visitId)
  if (error) return { success: false, error: error.message }

  if (visit?.appointment_id) {
    await supabase
      .from('appointments').update({ status: 'done' })
      .eq('id', visit.appointment_id)
  }

  await logAudit(actor.id, 'close', 'visit', visitId)
  return { success: true }
}

export async function reopenVisit(visitId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('visits').update({ status: 'open' }).eq('id', visitId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'reopen', 'visit', visitId)
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

// Merge the general examination into clinical_data.general_exam without
// disturbing other template data (dental/eye) held in the same jsonb.
export async function saveExamination(
  visitId: string,
  exam: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')
  const supabase = await createClient()
  const { data: v } = await supabase.from('visits').select('clinical_data').eq('id', visitId).single()
  const merged = { ...((v?.clinical_data as Record<string, unknown> | null) ?? {}), general_exam: exam }
  const { error } = await supabase.from('visits').update({ clinical_data: merged }).eq('id', visitId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'visit_examination', visitId)
  return { success: true }
}

export async function saveClinicalData(
  visitId: string,
  clinicalData: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'opd:write')

  const supabase = await createClient()
  // The general examination lives in the same column (saveExamination) — keep it.
  const { data: v } = await supabase.from('visits').select('clinical_data').eq('id', visitId).single()
  const generalExam = (v?.clinical_data as Record<string, unknown> | null)?.general_exam
  const { error } = await supabase
    .from('visits')
    .update({ clinical_data: generalExam === undefined ? clinicalData : { ...clinicalData, general_exam: generalExam } })
    .eq('id', visitId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'visit_clinical_data', visitId)
  return { success: true }
}
