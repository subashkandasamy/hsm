'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { AdmitPatientSchema, ProgressNoteSchema, DischargeSchema } from '@/lib/schemas'
import { getAdmissionFinancials } from '@/app/actions/admissionBilling'
import type { Admission, IpdProgressNote } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function admitPatient(
  input: Record<string, unknown>
): Promise<{ success: true; admissionId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const parsed = AdmitPatientSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, admitting_doctor_id, bed_id, reason, procedure_tariff_id } = parsed.data
  const admissionId = crypto.randomUUID()
  const supabase = await createClient()

  // Block if the patient already has an active admission
  const { count: activeCount } = await supabase
    .from('admissions')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient_id)
    .eq('status', 'admitted')
  if ((activeCount ?? 0) > 0) {
    return { success: false, error: 'This patient is already admitted. Discharge the existing admission before admitting again.' }
  }

  // Concurrency-safe claim: Postgres function does UPDATE WHERE status='available'
  const { data: result, error: rpcErr } = await supabase.rpc('claim_bed_and_admit', {
    p_admission_id: admissionId,
    p_patient_id:   patient_id,
    p_doctor_id:    admitting_doctor_id,
    p_bed_id:       bed_id,
    p_reason:       reason ?? null,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Bed no longer available' }

  // Fetch tenant advance percentage (default 50 if not set)
  const { data: tenantRow } = await supabase
    .from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single()
  const advancePct = (tenantRow?.advance_percentage as number) ?? 50

  // Auto-record advance based on selected procedure tariff (or general tariff as fallback)
  let tariffPrice: number | null = null
  let resolvedTariffId: string | null = procedure_tariff_id ?? null

  if (procedure_tariff_id) {
    const { data: t } = await supabase
      .from('procedure_tariffs').select('default_price').eq('id', procedure_tariff_id).single()
    tariffPrice = (t?.default_price as number) ?? null
  } else {
    const { data: t } = await supabase
      .from('procedure_tariffs').select('id, default_price')
      .eq('category', 'general').eq('is_active', true).limit(1).maybeSingle()
    tariffPrice = (t?.default_price as number) ?? null
    resolvedTariffId = (t?.id as string) ?? null
  }

  // Snapshot treatment on the admission row
  if (resolvedTariffId || tariffPrice) {
    await supabase.from('admissions').update({
      procedure_tariff_id: resolvedTariffId,
      treatment_value: tariffPrice,
    }).eq('id', admissionId)
  }

  if (tariffPrice && tariffPrice > 0 && advancePct > 0) {
    const advanceAmount = Math.round(tariffPrice * advancePct / 100)
    // Don't collect here — create a pending obligation at the billing counter
    await supabase.from('advance_deposit_requests').insert({
      id:           crypto.randomUUID(),
      tenant_id:    actor.tenant_id,
      admission_id: admissionId,
      amount:       advanceAmount,
      created_by:   actor.id,
    })
    await logAudit(actor.id, 'advance_deposit_created', 'admission', admissionId, {
      amount: advanceAmount, pct: advancePct,
      source: procedure_tariff_id ? 'procedure_tariff' : 'general_tariff',
    })
  }

  // Auto-close today's checked_in/booked appointment — patient moved to IPD
  const todayStr = new Date().toISOString().split('T')[0]
  await supabase
    .from('appointments')
    .update({ status: 'done' })
    .eq('patient_id', patient_id)
    .in('status', ['checked_in', 'booked'])
    .gte('scheduled_at', `${todayStr}T00:00:00`)
    .lte('scheduled_at', `${todayStr}T23:59:59`)

  // Assign a combined bill number to this admission.
  // Carry forward from a same-day OPD visit if one exists; otherwise generate a new one.
  const { data: todayVisit } = await supabase
    .from('visits')
    .select('combined_bill_no')
    .eq('patient_id', patient_id)
    .gte('visit_date', `${todayStr}T00:00:00`)
    .lt('visit_date', `${todayStr}T23:59:59`)
    .not('combined_bill_no', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let admissionCombinedNo: string | null = null
  if (todayVisit?.combined_bill_no) {
    admissionCombinedNo = todayVisit.combined_bill_no as string
  } else {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    admissionCombinedNo = billNoData as string | null
  }
  if (admissionCombinedNo) {
    await supabase
      .from('admissions')
      .update({ combined_bill_no: admissionCombinedNo })
      .eq('id', admissionId)
  }

  await logAudit(actor.id, 'admit', 'admission', admissionId, { patient_id, bed_id })
  return { success: true, admissionId }
}

export async function addProgressNote(
  admissionId: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:notes')

  const parsed = ProgressNoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('ipd_progress_notes').insert({
    id:           crypto.randomUUID(),
    tenant_id:    actor.tenant_id,
    admission_id: admissionId,
    author_id:    actor.id,
    note:         parsed.data.note,
    vitals:       parsed.data.vitals ?? null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'note', 'admission', admissionId)
  return { success: true }
}

export async function transferBed(
  admissionId: string,
  newBedId: string
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()

  // Get current bed
  const { data: admission } = await supabase
    .from('admissions')
    .select('bed_id, status')
    .eq('id', admissionId)
    .single()

  if (!admission || admission.status !== 'admitted') {
    return { success: false, error: 'Admission not found or already closed' }
  }

  const { data: result, error: rpcErr } = await supabase.rpc('transfer_bed', {
    p_admission_id: admissionId,
    p_old_bed_id:   admission.bed_id,
    p_new_bed_id:   newBedId,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Transfer failed' }

  // Record as a progress note
  await supabase.from('ipd_progress_notes').insert({
    id:           crypto.randomUUID(),
    tenant_id:    actor.tenant_id,
    admission_id: admissionId,
    author_id:    actor.id,
    note:         `Transferred to new bed.`,
  })

  await logAudit(actor.id, 'transfer', 'admission', admissionId, {
    old_bed: admission.bed_id, new_bed: newBedId,
  })
  return { success: true }
}

export async function dischargePatient(
  admissionId: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const parsed = DischargeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  const { data: admission } = await supabase
    .from('admissions')
    .select('bed_id, status')
    .eq('id', admissionId)
    .single()

  if (!admission || admission.status !== 'admitted') {
    return { success: false, error: 'Admission not found or already discharged' }
  }

  // Phase 15: gate on full settlement before discharge
  const financials = await getAdmissionFinancials(admissionId)
  if (financials.balanceDue > 0) {
    return {
      success: false,
      error: `Cannot discharge — ₹${financials.balanceDue.toFixed(2)} balance due. Settle the outstanding amount before discharge.`,
    }
  }

  // Free the bed
  await supabase.from('beds').update({ status: 'available' }).eq('id', admission.bed_id)

  const { error } = await supabase
    .from('admissions')
    .update({
      status:            'discharged',
      discharged_at:     new Date().toISOString(),
      discharge_summary: parsed.data.discharge_summary,
    })
    .eq('id', admissionId)

  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'discharge', 'admission', admissionId)
  return { success: true }
}

export async function listAdmissions(filters?: {
  status?: string
  patientId?: string
}): Promise<Admission[]> {
  const supabase = await createClient()
  let q = supabase
    .from('admissions')
    .select(`
      *,
      patient:patients(id, full_name, uhid, phone, blood_group, allergies),
      doctor:profiles!admissions_admitting_doctor_id_fkey(id, full_name),
      ward:wards(id, name, daily_rate),
      bed:beds(id, bed_no)
    `)
    .order('admitted_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as Admission[]
}

export async function getAdmission(id: string): Promise<Admission | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admissions')
    .select(`
      *,
      patient:patients(id, full_name, uhid, phone, blood_group, allergies, dob, gender),
      doctor:profiles!admissions_admitting_doctor_id_fkey(id, full_name),
      ward:wards(id, name),
      bed:beds(id, bed_no)
    `)
    .eq('id', id)
    .single()
  return data as unknown as Admission | null
}

export async function getAdmissionNotes(admissionId: string): Promise<IpdProgressNote[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_progress_notes')
    .select('*, author:profiles(id, full_name, role)')
    .eq('admission_id', admissionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as IpdProgressNote[]
}
