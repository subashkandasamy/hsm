'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { EmergencyRegisterSchema, ConsultationSchema } from '@/lib/schemas'
import { resolveConsultationFee } from '@/app/actions/appointments'
import { createServiceBill } from '@/lib/billing/serviceBill'
import { getTenantGstConfig } from '@/lib/billing/gst'
import { reconcileBill } from '@/lib/billing/reconcile'
import { stampBillItem } from '@/lib/ipdBilling'
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

  // ER registration fee (Settings → Tariffs), billed against the case.
  const regFee = await getErRegistrationFee()
  if (regFee > 0) {
    const bill = await createServiceBill(supabase, {
      tenantId: actor.tenant_id, patientId: patientId as string, actorId: actor.id, emergencyCaseId: caseId,
      billSource: 'manual',
      lines: [{ source: 'manual', ref_id: caseId, description: 'Emergency registration fee', qty: 1, unit_price: regFee }],
    })
    if ('error' in bill) console.error('[registerEmergency] registration fee bill failed:', bill.error)
  }

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

  // Opening an existing visit is a read; creating a visit + bill is a write.
  await requireWriteAccess()

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

  // Consultation bill for the ER visit — standard bill rules (IST date, GST, reconcile).
  const consultFee = await resolveConsultationFee(supabase, doctorId)
  if (consultFee > 0) {
    const bill = await createServiceBill(supabase, {
      tenantId: actor.tenant_id, patientId: ec.patient_id as string, actorId: actor.id, visitId, emergencyCaseId: caseId,
      billSource: 'consultation',
      lines: [{ source: 'consultation', ref_id: visitId, description: 'Emergency consultation fee', qty: 1, unit_price: consultFee }],
    })
    if ('error' in bill) console.error('[getOrCreateEmergencyVisit] consultation bill failed:', bill.error)
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

// ---- Recently closed cases (for reprinting notes) ----

export async function listRecentEmergencyCases(days = 7): Promise<EmergencyCase[]> {
  const supabase = await createClient()
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await supabase
    .from('emergency_cases')
    .select('*, patient:patients(id, full_name, uhid, phone), attendant:profiles(id, full_name)')
    .in('status', ['discharged', 'referred', 'admitted'])
    .gte('arrived_at', since)
    .order('arrived_at', { ascending: false })
    .limit(200)
  return (data ?? []) as unknown as EmergencyCase[]
}

// ---- ER charges (registration fee, ER procedures) ----

const ER_REG_FEE_KEY = 'emergency_registration_fee'

export async function getErRegistrationFee(): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase.from('tariffs').select('amount').eq('key', ER_REG_FEE_KEY).maybeSingle()
  return Number(data?.amount ?? 0)
}

export async function setErRegistrationFee(amount: number): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')
  if (!(amount >= 0) || !Number.isFinite(amount)) return { success: false, error: 'Enter a fee of 0 or more' }
  const supabase = await createClient()
  const { error } = await supabase.from('tariffs').upsert(
    { tenant_id: actor.tenant_id, key: ER_REG_FEE_KEY, label: 'Emergency registration fee', amount },
    { onConflict: 'tenant_id,key' },
  )
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'tariff', ER_REG_FEE_KEY, { amount })
  return { success: true }
}

export interface ErChargeLine {
  id: string; bill_id: string; bill_no: string; bill_status: string
  source: string; description: string; qty: number; unit_price: number; amount: number
  removable: boolean
}

/** All billed ER charges for a case (registration, procedures, consultation). */
export async function listEmergencyCharges(caseId: string): Promise<ErChargeLine[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bills')
    .select('id, bill_no, status, items:bill_items(id, source, description, qty, unit_price, amount)')
    .eq('emergency_case_id', caseId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
  type Row = { id: string; bill_no: string; status: string; items: Array<{ id: string; source: string; description: string; qty: number; unit_price: number; amount: number }> }
  return ((data ?? []) as unknown as Row[]).flatMap((b) => (b.items ?? []).map((i) => ({
    ...i, bill_id: b.id, bill_no: b.bill_no, bill_status: b.status,
    // Consultation lines belong to the visit; paid bills need a refund, not a delete.
    removable: i.source === 'manual' && b.status !== 'paid',
  })))
}

async function activeCase(supabase: Awaited<ReturnType<typeof createClient>>, caseId: string) {
  const { data } = await supabase.from('emergency_cases').select('id, patient_id, status').eq('id', caseId).maybeSingle()
  if (!data) return { error: 'Emergency case not found' } as const
  if (!['waiting', 'in_treatment'].includes(data.status as string)) {
    return { error: 'This case is closed — add further charges on the admission or a new bill.' } as const
  }
  return { patientId: data.patient_id as string } as const
}

/** Adds an ER procedure (from the Emergency tariff list) or a custom charge to the case's ER bill. */
export async function addEmergencyCharge(input: {
  caseId: string
  tariffId?: string | null
  description?: string | null
  unitPrice?: number | null
  qty?: number | null
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')
  const supabase = await createClient()

  const c = await activeCase(supabase, input.caseId)
  if ('error' in c) return { success: false, error: c.error as string }

  const qty = Math.max(1, Math.floor(Number(input.qty ?? 1)))
  let description = input.description?.trim() ?? ''
  let unitPrice = Number(input.unitPrice ?? 0)
  if (input.tariffId) {
    const { data: tariff } = await supabase
      .from('procedure_tariffs').select('name, default_price, is_active, category').eq('id', input.tariffId).maybeSingle()
    if (!tariff || !tariff.is_active) return { success: false, error: 'That charge is not available' }
    description = tariff.name as string
    unitPrice = Number(tariff.default_price)
  }
  if (!description) return { success: false, error: 'Describe the charge' }
  if (!(unitPrice > 0)) return { success: false, error: 'Enter an amount greater than 0' }

  // Append to the case's open ER charges bill; a paid one stays closed and a new bill is raised.
  const { data: open } = await supabase
    .from('bills').select('id')
    .eq('emergency_case_id', input.caseId).eq('bill_source', 'manual')
    .in('status', ['unpaid', 'partial', 'draft'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const line = { source: 'manual' as const, ref_id: input.caseId, description, qty, unit_price: unitPrice }
  if (open) {
    const cfg = await getTenantGstConfig(supabase, actor.tenant_id)
    const { error } = await supabase.from('bill_items').insert(stampBillItem(line, { tenantId: actor.tenant_id, billId: open.id as string, cfg }))
    if (error) return { success: false, error: error.message }
    await reconcileBill(supabase, open.id as string)
  } else {
    const bill = await createServiceBill(supabase, {
      tenantId: actor.tenant_id, patientId: c.patientId, actorId: actor.id, emergencyCaseId: input.caseId,
      billSource: 'manual', lines: [line],
    })
    if ('error' in bill) return { success: false, error: bill.error }
  }

  await logAudit(actor.id, 'add_charge', 'emergency_case', input.caseId, { description, qty, unit_price: unitPrice })
  return { success: true }
}

/** Removes an ER charge line that hasn't been paid for. */
export async function removeEmergencyCharge(caseId: string, itemId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')
  const supabase = await createClient()

  const c = await activeCase(supabase, caseId)
  if ('error' in c) return { success: false, error: c.error as string }

  const { data: item } = await supabase
    .from('bill_items').select('*, bill:bills(id, status, emergency_case_id)').eq('id', itemId).maybeSingle()
  const bill = item?.bill as { id: string; status: string; emergency_case_id: string | null } | undefined
  if (!item || !bill || bill.emergency_case_id !== caseId || item.source !== 'manual') {
    return { success: false, error: 'Charge not found on this case' }
  }
  if (bill.status === 'paid' || bill.status === 'cancelled') {
    return { success: false, error: 'This charge is already paid — issue a refund from Billing instead' }
  }

  const { bill: _omit, ...row } = item as Record<string, unknown>
  void _omit
  await supabase.from('bill_items').delete().eq('id', itemId)
  const { count } = await supabase.from('bill_items').select('id', { count: 'exact', head: true }).eq('bill_id', bill.id)
  const rec = await reconcileBill(supabase, bill.id)
  if (!rec.ok) {
    // Patient already paid more than the reduced bill — put the line back.
    await supabase.from('bill_items').insert(row)
    await reconcileBill(supabase, bill.id)
    return { success: false, error: 'The patient has already paid towards this charge — issue a refund from Billing instead' }
  }
  if ((count ?? 0) === 0 && rec.paid === 0) {
    // Void, don't delete: the invoice number is already issued.
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', bill.id)
  }

  await logAudit(actor.id, 'remove_charge', 'emergency_case', caseId, { item_id: itemId, description: item.description })
  return { success: true }
}
