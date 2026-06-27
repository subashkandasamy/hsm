'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { AppointmentCreateSchema } from '@/lib/schemas'
import type { Appointment } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function bookAppointment(
  input: Record<string, unknown>
): Promise<{ success: true; appointment: Appointment } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const parsed = AppointmentCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, doctor_id, department_id, scheduled_at, reason } = parsed.data
  const supabase = await createClient()

  // Race-safe token number
  const scheduledDate = new Date(scheduled_at).toISOString().split('T')[0]
  const { data: tokenData, error: tokenErr } = await supabase.rpc(
    'get_next_appointment_token',
    { p_doctor_id: doctor_id, p_date: scheduledDate }
  )
  if (tokenErr) return { success: false, error: tokenErr.message }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('appointments').insert({
    id,
    tenant_id: actor.tenant_id,
    patient_id,
    doctor_id,
    department_id: department_id ?? null,
    scheduled_at,
    token_no: tokenData as number,
    status: 'booked',
    reason: reason ?? null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'appointment', id, {
    patient_id,
    doctor_id,
    scheduled_at,
    token_no: tokenData,
  })

  const { data: appt } = await supabase
    .from('appointments')
    .select('*, patient:patients(id,full_name,uhid,phone), doctor:profiles(id,full_name), department:departments(id,name)')
    .eq('id', id)
    .single()
  return { success: true, appointment: appt as unknown as Appointment }
}

export async function checkIn(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const supabase = await createClient()

  // Fetch appointment to get doctor + patient name for the push
  const { data: appt } = await supabase
    .from('appointments')
    .select('doctor_id, patient:patients(full_name)')
    .eq('id', id)
    .eq('status', 'booked')
    .single()

  const { error } = await supabase
    .from('appointments').update({ status: 'checked_in' })
    .eq('id', id).eq('status', 'booked')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'check_in', 'appointment', id)

  // Fire push notification to the doctor (best-effort, non-blocking)
  if (appt?.doctor_id) {
    const patientName = (appt.patient as unknown as { full_name: string } | null)?.full_name ?? 'A patient'
    Promise.resolve().then(async () => {
      const { getTokensForProfile } = await import('@/app/actions/pushTokens')
      const { sendPushNotification } = await import('@/lib/pushSend')
      const tokens = await getTokensForProfile(appt.doctor_id)
      await Promise.all(
        tokens.map((t) =>
          sendPushNotification(t.push_token, t.platform, 'Patient checked in', `${patientName} is ready for you.`, { appointment_id: id })
        )
      )
    }).catch(() => {})
  }

  return { success: true }
}

export async function cancelAppointment(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments').update({ status: 'cancelled' })
    .eq('id', id).in('status', ['booked', 'checked_in'])
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'cancel', 'appointment', id)
  return { success: true }
}

export async function markNoShow(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'appointments:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('appointments').update({ status: 'no_show' })
    .eq('id', id).eq('status', 'booked')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'no_show', 'appointment', id)
  return { success: true }
}

export async function listAppointments(filters: {
  date?: string
  doctorId?: string
  patientId?: string
  status?: string
}): Promise<Appointment[]> {
  const supabase = await createClient()
  let q = supabase
    .from('appointments')
    .select('*, patient:patients(id,full_name,uhid,phone), doctor:profiles(id,full_name), department:departments(id,name)')
    .order('token_no', { ascending: true })

  if (filters.date) {
    const start = `${filters.date}T00:00:00`
    const end   = `${filters.date}T23:59:59`
    q = q.gte('scheduled_at', start).lte('scheduled_at', end)
  }
  if (filters.doctorId) q = q.eq('doctor_id', filters.doctorId)
  if (filters.patientId) q = q.eq('patient_id', filters.patientId)
  if (filters.status) q = q.eq('status', filters.status)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as Appointment[]
}

export async function getTodaysQueue(doctorId?: string): Promise<Appointment[]> {
  const today = new Date().toISOString().split('T')[0]
  return listAppointments({
    date: today,
    status: 'checked_in',
    ...(doctorId ? { doctorId } : {}),
  })
}
