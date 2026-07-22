'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { EmergencyRegisterSchema, ConsultationSchema } from '@/lib/schemas'
import { resolveConsultationFee } from '@/app/actions/appointments'
import type { EmergencyCase, TriageLevel } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function registerEmergency(
  input: Record<string, unknown>
): Promise<{ success: true; caseId: string; patientId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  const parsed = EmergencyRegisterSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  let patientId = parsed.data.patient_id ?? null

  // For a known (already-registered) patient, block invalid ER registrations.
  // Skipped for provisional/unknown arrivals — they always get a fresh patient
  // id below, so neither duplication is possible.
  if (patientId) {
    // One physical presence in the ER — no duplicate active case per patient.
    const { count: activeEr } = await supabase
      .from('emergency_cases')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .in('status', ['waiting', 'in_treatment'])
    if ((activeEr ?? 0) > 0) {
      return { success: false, error: 'This patient already has an active emergency case. Resolve it before registering a new one.' }
    }

    // An inpatient isn't an ER walk-in — an admitted patient's emergencies are
    // handled within IPD, not by registering a new casualty case.
    const { count: activeAdm } = await supabase
      .from('admissions')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('status', 'admitted')
    if ((activeAdm ?? 0) > 0) {
      return { success: false, error: 'This patient is already admitted in IPD. Discharge the admission before registering an emergency case.' }
    }
  }

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
  await requireWriteAccess()
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

export async function attendCase(caseId: string, doctorId?: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const { error } = await supabase
    .from('emergency_cases')
    .update({ status: 'in_treatment', attended_by: doctorId ?? actor.id })
    .eq('id', caseId)
    .eq('status', 'waiting')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'attend', 'emergency_case', caseId, { doctor_id: doctorId ?? actor.id })
  return { success: true }
}

// Returns existing open emergency visit for this case, or creates a fresh one.
// The doctor fills in all consultation details in the full OPD workspace (/opd/[visitId]).
export async function getOrCreateEmergencyVisit(
  caseId: string
): Promise<{ success: true; visitId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()

  const { data: ec } = await supabase
    .from('emergency_cases')
    .select('patient_id, complaint, attended_by')
    .eq('id', caseId)
    .single()
  if (!ec) return { success: false, error: 'Emergency case not found' }

  // Reuse existing open emergency visit so the doctor resumes where they left off
  const { data: existing } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', ec.patient_id)
    .eq('type', 'emergency')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id) return { success: true, visitId: existing.id }

  // Use the assigned doctor (attended_by) — falls back to whoever clicked Consult
  const doctorId = ec.attended_by ?? actor.id

  const visitId = crypto.randomUUID()
  const { error } = await supabase.from('visits').insert({
    id:         visitId,
    tenant_id:  actor.tenant_id,
    patient_id: ec.patient_id,
    doctor_id:  doctorId,
    type:       'emergency',
    status:     'open',
    complaint:  ec.complaint ?? null,
  })
  if (error) return { success: false, error: error.message }

  // Auto-generate consultation bill — same logic as appointment booking
  const consultFee = await resolveConsultationFee(supabase, doctorId)
  if (consultFee > 0) {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    if (billNoData) {
      const billId = crypto.randomUUID()
      const { error: billErr } = await supabase.from('bills').insert({
        id:         billId,
        tenant_id:  actor.tenant_id,
        patient_id: ec.patient_id,
        visit_id:   visitId,
        bill_no:    billNoData as string,
        subtotal:   consultFee,
        discount:   0,
        tax:        0,
        total:      consultFee,
        paid:       0,
        status:     'unpaid',
        created_by: actor.id,
      })
      if (!billErr) {
        await supabase.from('bill_items').insert({
          id:         crypto.randomUUID(),
          tenant_id:  actor.tenant_id,
          bill_id:    billId,
          source:     'consultation',
          ref_id:     visitId,
          description: 'Emergency consultation fee',
          qty:        1,
          unit_price: consultFee,
          amount:     consultFee,
        })
      }
    }
  }

  await logAudit(actor.id, 'visit', 'emergency_case', caseId, { visit_id: visitId })
  return { success: true, visitId }
}

// Returns this case's existing emergency visit id (most recent, any status), or
// null — WITHOUT creating one. Used when admitting from ER so we only link the
// admission to a visit that actually exists (i.e. the patient was consulted),
// never fabricating an empty visit just to record the link.
export async function getExistingEmergencyVisit(caseId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: ec } = await supabase
    .from('emergency_cases')
    .select('patient_id')
    .eq('id', caseId)
    .single()
  if (!ec) return null

  const { data: visit } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', ec.patient_id)
    .eq('type', 'emergency')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (visit?.id as string | undefined) ?? null
}

export async function resolveEmergency(
  caseId: string,
  outcome: 'discharge' | 'refer',
  outcomeNote: string
): Promise<SimpleResult> {
  await requireWriteAccess()
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
  await requireWriteAccess()
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
