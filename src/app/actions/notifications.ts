'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { notify } from '@/lib/notify'
import type { Notification, NotificationChannel } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ── List ──────────────────────────────────────────────────────────────────────

export async function listNotifications(params?: {
  patientId?: string
  status?: string
  limit?: number
}): Promise<Notification[]> {
  const supabase = await createClient()
  let q = supabase
    .from('notifications')
    .select('*, patient:patients(id, full_name, uhid), sender:profiles(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 200)

  if (params?.patientId) q = q.eq('patient_id', params.patientId)
  if (params?.status)    q = q.eq('status', params.status)

  const { data } = await q
  return (data ?? []) as unknown as Notification[]
}

// ── Send bill notification ─────────────────────────────────────────────────────

export async function sendBillNotification(
  billId: string,
  channel: NotificationChannel
): Promise<{ success: boolean; error?: string; fallback?: boolean }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'notifications:send')

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from('bills')
    .select('id, bill_no, total, patient:patients(id, full_name, phone, notify_whatsapp_consent, notify_sms_consent)')
    .eq('id', billId)
    .single()

  if (!bill || !bill.patient) return { success: false, error: 'Bill or patient not found' }
  const patient = bill.patient as unknown as { id: string; full_name: string; phone: string; notify_whatsapp_consent: boolean; notify_sms_consent: boolean }

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const docUrl = `[Bill ${bill.bill_no}]` // In production: generate signed PDF URL

  return notify({
    patientId: patient.id,
    channel,
    templateKey: 'bill_ready',
    params: [patient.full_name, bill.bill_no, String(bill.total), docUrl],
    refType: 'bill',
    refId: billId,
    actorId: actor.id,
  })
}

// ── Send prescription notification ────────────────────────────────────────────

export async function sendPrescriptionNotification(
  visitId: string,
  channel: NotificationChannel
): Promise<{ success: boolean; error?: string; fallback?: boolean }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'notifications:send')

  const supabase = await createClient()
  const { data: visit } = await supabase
    .from('visits')
    .select('id, patient:patients(id, full_name), doctor:profiles(full_name)')
    .eq('id', visitId)
    .single()

  if (!visit || !visit.patient) return { success: false, error: 'Visit or patient not found' }
  const patient = visit.patient as unknown as { id: string; full_name: string }
  const doctorName = (visit.doctor as unknown as { full_name: string } | null)?.full_name ?? 'your doctor'
  const docUrl = `[Prescription]` // In production: generate signed PDF URL

  return notify({
    patientId: patient.id,
    channel,
    templateKey: 'prescription_ready',
    params: [patient.full_name, doctorName, docUrl],
    refType: 'prescription',
    refId: visitId,
    actorId: actor.id,
  })
}

// ── Send appointment reminder ─────────────────────────────────────────────────

export async function sendAppointmentReminder(
  appointmentId: string,
  channel: NotificationChannel = 'whatsapp'
): Promise<{ success: boolean; error?: string; fallback?: boolean }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'notifications:send')

  const supabase = await createClient()
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, scheduled_at, patient:patients(id, full_name), doctor:profiles(full_name)')
    .eq('id', appointmentId)
    .single()

  if (!appt || !appt.patient) return { success: false, error: 'Appointment not found' }
  const patient = appt.patient as unknown as { id: string; full_name: string }
  const doctorName = (appt.doctor as unknown as { full_name: string } | null)?.full_name ?? 'your doctor'
  const apptDate = new Date(appt.scheduled_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const apptTime = new Date(appt.scheduled_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return notify({
    patientId: patient.id,
    channel,
    templateKey: 'appointment_reminder',
    params: [patient.full_name, apptDate, apptTime],
    refType: 'appointment',
    refId: appointmentId,
    actorId: actor.id,
  })
}

// ── Retry failed notification ─────────────────────────────────────────────────

export async function retryNotification(notificationId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'notifications:send')

  const supabase = await createClient()
  const { data: notif } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notificationId)
    .single()

  if (!notif) return { success: false, error: 'Notification not found' }
  if (notif.status === 'sent' || notif.status === 'delivered') {
    return { success: false, error: 'Notification already sent successfully' }
  }

  // Reset to queued and retry
  await supabase.from('notifications').update({ status: 'queued', error: null }).eq('id', notificationId)

  // Re-send: reconstruct params from ref data (simplified — look up bill or visit)
  const refType = notif.ref_type as string
  if (refType === 'bill' && notif.ref_id) {
    const r = await sendBillNotification(notif.ref_id as string, notif.channel as NotificationChannel)
    return r.success ? { success: true } : { success: false, error: r.error ?? 'Send failed' }
  }
  if (refType === 'prescription' && notif.ref_id) {
    const r = await sendPrescriptionNotification(notif.ref_id as string, notif.channel as NotificationChannel)
    return r.success ? { success: true } : { success: false, error: r.error ?? 'Send failed' }
  }
  if (refType === 'appointment' && notif.ref_id) {
    const r = await sendAppointmentReminder(notif.ref_id as string, notif.channel as NotificationChannel)
    return r.success ? { success: true } : { success: false, error: r.error ?? 'Send failed' }
  }

  return { success: false, error: 'Cannot retry this notification type automatically' }
}
