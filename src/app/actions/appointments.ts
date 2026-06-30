'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { AppointmentCreateSchema } from '@/lib/schemas'
import type { Appointment } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// Helper: resolve the consultation fee for a given doctor.
// Priority: staff_profiles.consultation_fee → tariffs.default_consultation_fee
async function resolveConsultationFee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  doctorId: string
): Promise<number> {
  const { data: sp } = await supabase
    .from('staff_profiles')
    .select('consultation_fee')
    .eq('profile_id', doctorId)
    .maybeSingle()

  // Treat 0 as "not set" — staff_profiles.consultation_fee defaults to 0 (NOT NULL DEFAULT 0)
  if (sp?.consultation_fee != null && (sp.consultation_fee as number) > 0) return sp.consultation_fee as number

  const { data: tariff } = await supabase
    .from('tariffs')
    .select('amount')
    .eq('key', 'default_consultation_fee')
    .maybeSingle()

  return (tariff?.amount as number) ?? 300
}

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

  // Auto-generate consultation bill at booking time (Phase 15)
  const consultFee = await resolveConsultationFee(supabase, doctor_id)
  if (consultFee > 0) {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    if (billNoData) {
      const billId = crypto.randomUUID()
      const { error: billErr } = await supabase.from('bills').insert({
        id: billId,
        tenant_id: actor.tenant_id,
        patient_id,
        appointment_id: id,
        bill_no: billNoData as string,
        subtotal: consultFee,
        discount: 0,
        tax: 0,
        total: consultFee,
        paid: 0,
        status: 'unpaid',
        created_by: actor.id,
      })
      if (billErr) {
        console.error('[bookAppointment] bill insert failed:', billErr.message)
      } else {
        await supabase.from('bill_items').insert({
          id: crypto.randomUUID(),
          tenant_id: actor.tenant_id,
          bill_id: billId,
          source: 'consultation',
          ref_id: id,
          description: 'Consultation fee',
          qty: 1,
          unit_price: consultFee,
          amount: consultFee,
        })
      }
    }
  }

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

  // Check-in is NEVER gated on payment — the doctor's queue must stay accurate
  const { error } = await supabase
    .from('appointments').update({ status: 'checked_in' })
    .eq('id', id).eq('status', 'booked')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'check_in', 'appointment', id)

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

  // Cancel linked consultation bill if it has no payments yet (Phase 15)
  const { data: bill } = await supabase
    .from('bills')
    .select('id, status')
    .eq('appointment_id', id)
    .in('status', ['unpaid', 'draft'])
    .maybeSingle()

  if (bill) {
    const { count } = await supabase
      .from('payments').select('id', { count: 'exact', head: true }).eq('bill_id', bill.id)
    if ((count ?? 0) === 0) {
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', bill.id)
    }
  }

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

  // Cancel linked consultation bill if it has no payments yet (same as cancelAppointment)
  const { data: bill } = await supabase
    .from('bills')
    .select('id, status')
    .eq('appointment_id', id)
    .in('status', ['unpaid', 'draft'])
    .maybeSingle()

  if (bill) {
    const { count } = await supabase
      .from('payments').select('id', { count: 'exact', head: true }).eq('bill_id', bill.id)
    if ((count ?? 0) === 0) {
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', bill.id)
    }
  }

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

// Returns the consultation bill for an appointment, or null if none
export async function getAppointmentBill(appointmentId: string): Promise<{
  id: string; status: string; total: number; paid: number
} | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bills')
    .select('id, status, total, paid')
    .eq('appointment_id', appointmentId)
    .not('status', 'eq', 'cancelled')
    .maybeSingle()
  return data as { id: string; status: string; total: number; paid: number } | null
}

// Bulk: returns a map of appointmentId → bill status for a list of appointments
export async function getAppointmentsBillStatuses(
  appointmentIds: string[]
): Promise<Record<string, { id: string; status: string; total: number; paid: number }>> {
  if (appointmentIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('bills')
    .select('id, appointment_id, status, total, paid')
    .in('appointment_id', appointmentIds)
    .not('status', 'eq', 'cancelled')
  const map: Record<string, { id: string; status: string; total: number; paid: number }> = {}
  for (const b of data ?? []) {
    if (b.appointment_id) map[b.appointment_id as string] = b as { id: string; status: string; total: number; paid: number }
  }
  return map
}
