'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { AdmitPatientSchema, ProgressNoteSchema, DischargeSchema } from '@/lib/schemas'
import { getAdmissionFinancials } from '@/app/actions/admissionBilling'
import type { Admission, IpdProgressNote } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function admitPatient(
  input: Record<string, unknown>
): Promise<{ success: true; admissionId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const parsed = AdmitPatientSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, admitting_doctor_id, bed_id, ward_id, reason, procedure_tariff_id, direct_ot, is_temp_ward, temp_slot } = parsed.data
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

  if (direct_ot) {
    // Direct OT: no bed assigned — insert admission row directly (no concurrency claim needed)
    const { error: insertErr } = await supabase.from('admissions').insert({
      id:                  admissionId,
      tenant_id:           actor.tenant_id,
      patient_id,
      admitting_doctor_id,
      ward_id:             null,
      bed_id:              null,
      direct_ot:           true,
      reason:              reason ?? null,
      status:              'admitted',
      admitted_at:         new Date().toISOString(),
    })
    if (insertErr) return { success: false, error: insertErr.message }
  } else if (is_temp_ward) {
    // Temp/overflow ward: create a slot on-the-fly, no concurrency claim needed
    if (!ward_id) return { success: false, error: 'Please select a ward' }

    // Auto-number the slot if the user left it blank
    let slotLabel = temp_slot?.trim() || null
    if (!slotLabel) {
      const { count } = await supabase
        .from('beds').select('id', { count: 'exact', head: true }).eq('ward_id', ward_id)
      slotLabel = `Slot-${(count ?? 0) + 1}`
    }

    const tempBedId = crypto.randomUUID()
    const { error: bedErr } = await supabase.from('beds').insert({
      id:        tempBedId,
      tenant_id: actor.tenant_id,
      ward_id,
      bed_no:    slotLabel,
      status:    'occupied',
    })
    if (bedErr) return { success: false, error: bedErr.message }

    const { error: insertErr } = await supabase.from('admissions').insert({
      id:                  admissionId,
      tenant_id:           actor.tenant_id,
      patient_id,
      admitting_doctor_id,
      ward_id,
      bed_id:              tempBedId,
      reason:              reason ?? null,
      status:              'admitted',
      admitted_at:         new Date().toISOString(),
    })
    if (insertErr) {
      await supabase.from('beds').delete().eq('id', tempBedId)
      return { success: false, error: insertErr.message }
    }
  } else {
    if (!bed_id) return { success: false, error: 'Please select a bed' }
    // Normal admission: concurrency-safe claim via Postgres function
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
  }

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

  // Auto-close any open OPD visits today — patient is now an IPD inpatient
  await supabase
    .from('visits')
    .update({ status: 'closed' })
    .eq('patient_id', patient_id)
    .eq('status', 'open')
    .gte('visit_date', `${todayStr}T00:00:00`)
    .lte('visit_date', `${todayStr}T23:59:59`)

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
  await requireWriteAccess()
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

// Post-OT ward assignment: handles direct_ot (no old bed) and temp ward (old bed to delete)
export async function postOpTransferToWard(
  admissionId: string,
  input: {
    ward_id: string
    bed_id?: string | null
    is_temp_ward?: boolean
    temp_slot?: string | null
  }
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const { ward_id, bed_id, is_temp_ward, temp_slot } = input
  const supabase = await createClient()

  const { data: admission } = await supabase
    .from('admissions')
    .select('bed_id, ward_id, direct_ot, status')
    .eq('id', admissionId)
    .single()

  if (!admission || admission.status !== 'admitted') {
    return { success: false, error: 'Admission not active' }
  }

  let newBedId: string

  if (is_temp_ward) {
    // Create a slot in the target temp ward
    const { count } = await supabase
      .from('beds').select('id', { count: 'exact', head: true }).eq('ward_id', ward_id)
    const slotLabel = temp_slot?.trim() || `Slot-${(count ?? 0) + 1}`
    const tempBedId = crypto.randomUUID()
    const { error: bedErr } = await supabase.from('beds').insert({
      id: tempBedId, tenant_id: actor.tenant_id, ward_id, bed_no: slotLabel, status: 'occupied',
    })
    if (bedErr) return { success: false, error: bedErr.message }
    newBedId = tempBedId
  } else {
    // Regular bed: claim it optimistically
    if (!bed_id) return { success: false, error: 'Please select a bed' }
    const { data: claimed } = await supabase
      .from('beds')
      .update({ status: 'occupied' })
      .eq('id', bed_id)
      .eq('status', 'available')
      .select('id')
    if (!claimed || claimed.length === 0) {
      return { success: false, error: 'Bed is no longer available — please choose another' }
    }
    newBedId = bed_id
  }

  // Free the old bed (delete if temp, mark available if regular)
  if (admission.bed_id) {
    const { data: oldWard } = await supabase
      .from('wards').select('is_temp').eq('id', admission.ward_id).single()
    if (oldWard?.is_temp) {
      await supabase.from('beds').delete().eq('id', admission.bed_id)
    } else {
      await supabase.from('beds').update({ status: 'available' }).eq('id', admission.bed_id)
    }
  }

  // Update the admission
  const { error: updateErr } = await supabase
    .from('admissions')
    .update({ ward_id, bed_id: newBedId, direct_ot: false })
    .eq('id', admissionId)
  if (updateErr) return { success: false, error: updateErr.message }

  await logAudit(actor.id, 'post_op_transfer', 'admission', admissionId, { ward_id, bed_id: newBedId })
  return { success: true }
}

export async function transferBed(
  admissionId: string,
  newBedId: string
): Promise<SimpleResult> {
  await requireWriteAccess()
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
    .select('bed_id, ward_id, status')
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

  // Free the bed — delete temp slots, mark regular beds available
  if (admission.bed_id) {
    const { data: wardRow } = await supabase
      .from('wards').select('is_temp').eq('id', admission.ward_id).single()
    if (wardRow?.is_temp) {
      await supabase.from('beds').delete().eq('id', admission.bed_id)
    } else {
      await supabase.from('beds').update({ status: 'available' }).eq('id', admission.bed_id)
    }
  }

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

export async function updateDischargeSummary(
  admissionId: string,
  summary: string
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('admissions')
    .update({ discharge_summary: summary })
    .eq('id', admissionId)
    .eq('status', 'discharged')

  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update_discharge_summary', 'admission', admissionId)
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
