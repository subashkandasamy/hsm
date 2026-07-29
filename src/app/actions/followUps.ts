'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { FollowUpCreateSchema, FollowUpConvertSchema } from '@/lib/schemas'
import { bookAppointment } from './appointments'
import type { Appointment, FollowUp } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const SELECT =
  '*, patient:patients(id,full_name,uhid,phone), recommender:profiles!recommended_by(id,full_name), suggested_doctor:profiles!suggested_doctor_id(id,full_name)'

// ── Create a follow-up request (doctor from OPD/IPD, or staff manual) ──────────
export async function createFollowUp(
  input: Record<string, unknown>
): Promise<{ success: true; followUp: FollowUp } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const parsed = FollowUpCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const d = parsed.data
  const supabase = await createClient()
  const id = crypto.randomUUID()

  const { error } = await supabase.from('follow_ups').insert({
    id,
    tenant_id: actor.tenant_id,
    patient_id: d.patient_id,
    source: d.source,
    source_visit_id: d.source_visit_id ?? null,
    source_admission_id: d.source_admission_id ?? null,
    recommended_by: d.recommended_by ?? null,
    suggested_doctor_id: d.suggested_doctor_id ?? null,
    suggested_date: d.suggested_date || null,
    reason: d.reason ?? null,
    note: d.note ?? null,
    status: 'pending',
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'follow_up', id, { patient_id: d.patient_id, source: d.source })

  const { data } = await supabase.from('follow_ups').select(SELECT).eq('id', id).single()
  return { success: true, followUp: data as unknown as FollowUp }
}

// ── List follow-ups (tab defaults to pending; filterable) ─────────────────────
export async function listFollowUps(filters?: {
  status?: 'pending' | 'converted' | 'cancelled' | 'all'
  doctorId?: string
  overdueOnly?: boolean
}): Promise<FollowUp[]> {
  const supabase = await createClient()
  const status = filters?.status ?? 'pending'
  const today = new Date().toISOString().split('T')[0]

  let q = supabase.from('follow_ups').select(SELECT)
  if (status !== 'all') q = q.eq('status', status)
  if (filters?.doctorId) q = q.eq('suggested_doctor_id', filters.doctorId)
  if (filters?.overdueOnly) q = q.eq('status', 'pending').lt('suggested_date', today)

  // Pending: soonest suggested date first; otherwise newest first.
  q = status === 'pending'
    ? q.order('suggested_date', { ascending: true, nullsFirst: false })
    : q.order('created_at', { ascending: false })

  const { data } = await q
  return (data ?? []) as unknown as FollowUp[]
}

// ── Convert a pending follow-up into a real appointment (books + bills) ───────
export async function convertFollowUp(
  followUpId: string,
  input: Record<string, unknown>
): Promise<{ success: true; appointment: Appointment } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const parsed = FollowUpConvertSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: fu } = await supabase
    .from('follow_ups')
    .select('id, patient_id, status, reason')
    .eq('id', followUpId)
    .single()
  if (!fu) return { success: false, error: 'Follow-up not found' }
  if (fu.status !== 'pending') return { success: false, error: 'This follow-up has already been handled' }

  // Reuse the existing booking flow — this is what allocates the token and
  // raises the consultation bill, exactly as a normal appointment does.
  const booked = await bookAppointment({
    patient_id: fu.patient_id as string,
    doctor_id: parsed.data.doctor_id,
    department_id: parsed.data.department_id ?? null,
    scheduled_at: parsed.data.scheduled_at,
    reason: (fu.reason as string | null) ?? 'Follow-up',
  })
  if (!booked.success) return booked

  const { error: updErr } = await supabase
    .from('follow_ups')
    .update({ status: 'converted', appointment_id: booked.appointment.id, converted_at: new Date().toISOString() })
    .eq('id', followUpId)
    .eq('status', 'pending')
  if (updErr) return { success: false, error: updErr.message }

  await logAudit(actor.id, 'convert', 'follow_up', followUpId, { appointment_id: booked.appointment.id })
  return { success: true, appointment: booked.appointment }
}

// ── Cancel a pending follow-up ────────────────────────────────────────────────
export async function cancelFollowUp(followUpId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('follow_ups')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', followUpId)
    .eq('status', 'pending')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'cancel', 'follow_up', followUpId, {})
  return { success: true }
}
