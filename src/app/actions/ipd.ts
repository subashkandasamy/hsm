'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { AdmitPatientSchema, ProgressNoteSchema, DischargeSchema } from '@/lib/schemas'
import type { Admission, IpdProgressNote } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function admitPatient(
  input: Record<string, unknown>
): Promise<{ success: true; admissionId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const parsed = AdmitPatientSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, admitting_doctor_id, bed_id, reason } = parsed.data
  const admissionId = crypto.randomUUID()
  const supabase = await createClient()

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
      ward:wards(id, name),
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
