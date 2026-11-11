'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { admissionClosedError } from '@/lib/admissionOpen'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { autoIpdBill } from '@/lib/ipdBilling'
import { AddCareTeamSchema, RequestConsultSchema, LogVisitSchema, CompleteVisitSchema } from '@/lib/schemas'
import type { CareTeamMember, DoctorVisit } from '@/lib/types'
import { istToday } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }
type Supa = Awaited<ReturnType<typeof createClient>>

// ---- Care team ----

export async function listCareTeam(admissionId: string): Promise<CareTeamMember[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admission_care_team')
    .select('*, doctor:profiles!doctor_id(id, full_name)')
    .eq('admission_id', admissionId)
    .is('removed_at', null)
    .order('added_at')
  return (data ?? []) as unknown as CareTeamMember[]
}

// Ensure a doctor is on the care team (idempotent on the active-membership index).
async function ensureOnTeam(supabase: Supa, tenantId: string, admissionId: string, doctorId: string, role: string, addedBy: string) {
  const { data: existing } = await supabase
    .from('admission_care_team')
    .select('id').eq('admission_id', admissionId).eq('doctor_id', doctorId).is('removed_at', null).maybeSingle()
  if (existing) return
  await supabase.from('admission_care_team').insert({
    tenant_id: tenantId, admission_id: admissionId, doctor_id: doctorId, role, added_by: addedBy,
  })
}

export async function addCareTeamDoctor(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = AddCareTeamSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const closed = await admissionClosedError(supabase, admissionId)
  if (closed) return { success: false, error: closed }
  await ensureOnTeam(supabase, actor.tenant_id, admissionId, parsed.data.doctor_id, parsed.data.role, actor.id)
  await logAudit(actor.id, 'add', 'care_team', admissionId, { doctor_id: parsed.data.doctor_id, role: parsed.data.role })
  return { success: true }
}

export async function removeCareTeamDoctor(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('admission_care_team').update({ removed_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'remove', 'care_team', id)
  return { success: true }
}

// ---- Doctor visits / consults ----

export async function listDoctorVisits(admissionId: string): Promise<DoctorVisit[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctor_visits')
    .select('*, doctor:profiles!doctor_id(id, full_name)')
    .eq('admission_id', admissionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as DoctorVisit[]
}

// The current doctor's pending consult worklist (across all admissions).
export async function listMyConsults(): Promise<(DoctorVisit & { patient_name?: string; uhid?: string })[]> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctor_visits')
    .select('*, doctor:profiles!doctor_id(id, full_name), admission:admissions(patient:patients(full_name, uhid))')
    .eq('doctor_id', actor.id)
    .eq('status', 'requested')
    .order('created_at', { ascending: false })
  return (data ?? []).map((v) => {
    const adm = (v as { admission?: { patient?: { full_name?: string; uhid?: string } | null } }).admission
    return { ...(v as unknown as DoctorVisit), patient_name: adm?.patient?.full_name, uhid: adm?.patient?.uhid }
  })
}

// Request a specialist consult — adds them to the team and creates a pending
// visit that appears in their worklist.
export async function requestConsult(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = RequestConsultSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const closed = await admissionClosedError(supabase, admissionId)
  if (closed) return { success: false, error: closed }
  await ensureOnTeam(supabase, actor.tenant_id, admissionId, parsed.data.doctor_id, parsed.data.role, actor.id)
  const { error } = await supabase.from('doctor_visits').insert({
    tenant_id: actor.tenant_id, admission_id: admissionId, doctor_id: parsed.data.doctor_id,
    visit_type: 'consult', status: 'requested', reason: parsed.data.reason ?? null, requested_by: actor.id,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'request_consult', 'doctor_visit', admissionId, { doctor_id: parsed.data.doctor_id })
  return { success: true }
}

// Bill a completed visit — but never double-charge the attending, who is already
// billed by the daily rounding fee (unless that flat fee is switched off).
async function billVisit(supabase: Supa, actorId: string, tenantId: string, visitId: string, admissionId: string, doctorId: string, visitType: string): Promise<'billed' | 'waived'> {
  const { data: adm } = await supabase
    .from('admissions').select('patient_id, admitting_doctor_id').eq('id', admissionId).single()
  if (!adm) return 'waived'
  const { data: cfg } = await supabase
    .from('ipd_billing_config').select('charge_doctor_fee').eq('tenant_id', tenantId).maybeSingle()
  const flatDoctorFeeOn = cfg?.charge_doctor_fee ?? true
  const isAttending = doctorId === adm.admitting_doctor_id
  if (isAttending && flatDoctorFeeOn) return 'waived' // covered by the daily flat fee

  const { data: sp } = await supabase
    .from('staff_profiles').select('consultation_fee').eq('profile_id', doctorId).maybeSingle()
  const fee = (sp?.consultation_fee as number | undefined) ?? 0
  if (fee <= 0) return 'waived'

  const { data: doc } = await supabase.from('profiles').select('full_name').eq('id', doctorId).single()
  const today = istToday()
  await autoIpdBill(supabase, actorId, {
    tenantId, admissionId, patientId: adm.patient_id as string, billingDate: today, billSource: 'consultation',
    lineItems: [{
      source: 'consultation', ref_id: visitId,
      description: `Dr. ${doc?.full_name ?? 'Consultant'} — ${visitType} (${today})`,
      qty: 1, unit_price: fee,
    }],
  })
  await supabase.from('doctor_visits').update({ fee_snapshot: fee }).eq('id', visitId)
  return 'billed'
}

// Log a completed visit directly (a round/consult/procedure by a care-team doctor).
export async function logVisit(admissionId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = LogVisitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const closed = await admissionClosedError(supabase, admissionId)
  if (closed) return { success: false, error: closed }

  const visitId = crypto.randomUUID()
  const { error } = await supabase.from('doctor_visits').insert({
    id: visitId, tenant_id: actor.tenant_id, admission_id: admissionId, doctor_id: parsed.data.doctor_id,
    visit_type: parsed.data.visit_type, status: 'completed', reason: parsed.data.reason ?? null,
    note: parsed.data.note ?? null, completed_by: actor.id, completed_at: new Date().toISOString(),
  })
  if (error) return { success: false, error: error.message }
  await ensureOnTeam(supabase, actor.tenant_id, admissionId, parsed.data.doctor_id, 'consultant', actor.id)
  const billing = await billVisit(supabase, actor.id, actor.tenant_id, visitId, admissionId, parsed.data.doctor_id, parsed.data.visit_type)
  await supabase.from('doctor_visits').update({ billing_status: billing }).eq('id', visitId)
  await logAudit(actor.id, 'log_visit', 'doctor_visit', visitId, { doctor_id: parsed.data.doctor_id, billing })
  return { success: true }
}

// Complete a requested consult (specialist records the note; it bills).
export async function completeVisit(visitId: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const parsed = CompleteVisitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()

  const { data: visit } = await supabase
    .from('doctor_visits').select('admission_id, doctor_id, visit_type, status').eq('id', visitId).single()
  if (!visit) return { success: false, error: 'Visit not found' }
  if (visit.status !== 'requested') return { success: false, error: 'Visit is not pending' }
  const closed = await admissionClosedError(supabase, visit.admission_id as string)
  if (closed) return { success: false, error: closed }

  await supabase.from('doctor_visits').update({
    status: 'completed', note: parsed.data.note ?? null, completed_by: actor.id, completed_at: new Date().toISOString(),
  }).eq('id', visitId)
  const billing = await billVisit(supabase, actor.id, actor.tenant_id, visitId, visit.admission_id as string, visit.doctor_id as string, visit.visit_type as string)
  await supabase.from('doctor_visits').update({ billing_status: billing }).eq('id', visitId)
  await logAudit(actor.id, 'complete_visit', 'doctor_visit', visitId, { billing })
  return { success: true }
}

export async function cancelVisit(visitId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const supabase = await createClient()
  const { error } = await supabase.from('doctor_visits').update({ status: 'cancelled' }).eq('id', visitId).eq('status', 'requested')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel_visit', 'doctor_visit', visitId)
  return { success: true }
}
