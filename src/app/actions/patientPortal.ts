'use server'

import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import {
  normalizePhone, setPatientSession, clearPatientSession, getPatientSession,
} from '@/lib/patientAuth'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

// Deliver the OTP over WhatsApp. Until an approved WhatsApp Authentication
// template + live number are wired, this returns false and the caller falls
// back to a dev code so the flow is fully testable now.
async function sendOtpViaWhatsApp(phone: string, code: string): Promise<boolean> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const template = process.env.WHATSAPP_OTP_TEMPLATE // e.g. 'patient_login_otp' (auth category)
  if (!phoneNumberId || !token || !template) return false
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0'
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US'
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: template,
          language: { code: lang },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    })
    return res.ok
  } catch { return false }
}

// ── Step 1: request an OTP for a phone ────────────────────────────────────────
export async function requestPatientOtp(
  phoneRaw: string,
): Promise<{ success: true; devCode?: string } | { success: false; error: string }> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return { success: false, error: 'Enter a valid mobile number' }

  const svc = createServiceClient()
  // Rate limit: max 5 codes per phone per 15 minutes.
  const since = new Date(Date.now() - 15 * 60000).toISOString()
  const { count } = await svc
    .from('patient_otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone).gte('created_at', since)
  if ((count ?? 0) >= 5) return { success: false, error: 'Too many requests. Please try again in a few minutes.' }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 5 * 60000).toISOString()
  const { error } = await svc.from('patient_otp_codes').insert({ phone, code_hash: hashCode(code), expires_at: expiresAt })
  if (error) return { success: false, error: error.message }

  const sent = await sendOtpViaWhatsApp(phone, code)
  if (sent) return { success: true }
  // WhatsApp not live yet → expose the code outside production so we can test.
  if (process.env.NODE_ENV !== 'production') return { success: true, devCode: code }
  return { success: true }
}

// ── Step 2: verify the OTP, create/find the account, start a session ──────────
export async function verifyPatientOtp(
  phoneRaw: string, code: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const phone = normalizePhone(phoneRaw)
  if (!phone) return { success: false, error: 'Invalid mobile number' }

  const svc = createServiceClient()
  const { data: otp } = await svc
    .from('patient_otp_codes')
    .select('id, code_hash, attempts')
    .eq('phone', phone).is('consumed_at', null)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (!otp) return { success: false, error: 'Code expired — please request a new one' }
  if ((otp.attempts as number) >= 5) return { success: false, error: 'Too many attempts — request a new code' }
  if (hashCode(code) !== otp.code_hash) {
    await svc.from('patient_otp_codes').update({ attempts: (otp.attempts as number) + 1 }).eq('id', otp.id as string)
    return { success: false, error: 'Incorrect code' }
  }
  await svc.from('patient_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id as string)

  // Find or create the universal patient account for this phone.
  const { data: existing } = await svc.from('patient_accounts').select('id').eq('phone', phone).maybeSingle()
  let accountId: string
  if (existing) {
    accountId = existing.id as string
    await svc.from('patient_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', accountId)
  } else {
    const last10 = phone.slice(-10)
    const { data: match } = await svc.from('patients').select('full_name').ilike('phone', `%${last10}%`).limit(1).maybeSingle()
    const { data: created, error: cErr } = await svc
      .from('patient_accounts')
      .insert({ phone, full_name: (match?.full_name as string) ?? null })
      .select('id').single()
    if (cErr || !created) return { success: false, error: cErr?.message ?? 'Could not create account' }
    accountId = created.id as string
  }

  await setPatientSession(accountId, phone)
  return { success: true }
}

export async function signOutPatient(): Promise<void> {
  await clearPatientSession()
}

// ── "My hospitals" — every hospital where this phone has a patient record ────
export interface MyHospital {
  tenant_id: string
  hospital: string
  patient_id: string
  patient_name: string
  uhid: string
}

export async function getMyHospitals(): Promise<MyHospital[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const last10 = session.phone.slice(-10)
  const { data } = await svc
    .from('patients')
    .select('id, full_name, uhid, phone, tenant_id, tenant:tenants(name)')
    .ilike('phone', `%${last10}%`)

  return ((data ?? []) as Array<Record<string, unknown>>)
    // Exact normalised match (ilike is a loose prefilter).
    .filter((p) => normalizePhone(p.phone as string) === session.phone)
    .map((p) => ({
      tenant_id: p.tenant_id as string,
      hospital: (p.tenant as { name?: string } | null)?.name ?? 'Hospital',
      patient_id: p.id as string,
      patient_name: p.full_name as string,
      uhid: p.uhid as string,
    }))
}

export async function getPatientMe(): Promise<{ accountId: string; phone: string } | null> {
  return getPatientSession()
}

// ── Records at one hospital (Phase 2) ─────────────────────────────────────────
export interface PatientRecords {
  hospital: string
  patientName: string
  uhid: string
  visits: Array<{
    id: string; date: string; doctor: string; type: string
    complaint: string | null; diagnosis: string | null; notes: string | null
    prescriptions: Array<{ drug: string; dosage: string | null; frequency: string | null; duration: string | null; instructions: string | null }>
  }>
  labs: Array<{ id: string; date: string; status: string; items: Array<{ test: string; result: string | null; unit: string | null; flag: string }> }>
  radiology: Array<{ id: string; date: string; status: string; test: string; report: string | null }>
}

// Confirm this patient_id belongs to the logged-in phone (prevents enumeration).
async function ownsPatient(svc: ReturnType<typeof createServiceClient>, patientId: string, phone: string): Promise<{ name: string; uhid: string; tenant: string; tenantId: string } | null> {
  const { data } = await svc
    .from('patients')
    .select('phone, full_name, uhid, tenant_id, tenant:tenants(name)')
    .eq('id', patientId).maybeSingle()
  if (!data || normalizePhone(data.phone as string) !== phone) return null
  return {
    name: data.full_name as string, uhid: data.uhid as string,
    tenant: (data.tenant as { name?: string } | null)?.name ?? 'Hospital',
    tenantId: data.tenant_id as string,
  }
}

export async function getPatientHospitalRecords(patientId: string): Promise<PatientRecords | null> {
  const session = await getPatientSession()
  if (!session) return null
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session.phone)
  if (!owner) return null

  const [visitsRes, labRes, radRes] = await Promise.all([
    svc.from('visits')
      .select('id, type, visit_date, complaint, diagnosis, notes, doctor:profiles(full_name)')
      .eq('patient_id', patientId).order('visit_date', { ascending: false }),
    svc.from('lab_orders')
      .select('id, status, ordered_at, reported_at, items:lab_order_items(result_value, result_text, unit, flag, test:lab_tests_catalog(name))')
      .eq('patient_id', patientId).order('ordered_at', { ascending: false }),
    svc.from('radiology_orders')
      .select('id, status, ordered_at, reported_at, report, test:radiology_catalog(name)')
      .eq('patient_id', patientId).order('ordered_at', { ascending: false }),
  ])

  const visits = (visitsRes.data ?? []) as Array<Record<string, unknown>>
  const visitIds = visits.map((v) => v.id as string)
  const rxByVisit = new Map<string, PatientRecords['visits'][number]['prescriptions']>()
  if (visitIds.length) {
    const { data: rx } = await svc
      .from('prescriptions')
      .select('visit_id, drug_name, dosage, frequency, duration, instructions')
      .in('visit_id', visitIds)
    for (const r of (rx ?? []) as Array<Record<string, unknown>>) {
      const vid = r.visit_id as string
      if (!rxByVisit.has(vid)) rxByVisit.set(vid, [])
      rxByVisit.get(vid)!.push({
        drug: r.drug_name as string, dosage: r.dosage as string | null,
        frequency: r.frequency as string | null, duration: r.duration as string | null,
        instructions: r.instructions as string | null,
      })
    }
  }

  return {
    hospital: owner.tenant, patientName: owner.name, uhid: owner.uhid,
    visits: visits.map((v) => ({
      id: v.id as string,
      date: v.visit_date as string,
      doctor: (v.doctor as { full_name?: string } | null)?.full_name ?? '—',
      type: v.type as string,
      complaint: v.complaint as string | null,
      diagnosis: v.diagnosis as string | null,
      notes: v.notes as string | null,
      prescriptions: rxByVisit.get(v.id as string) ?? [],
    })),
    labs: ((labRes.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: l.id as string,
      date: (l.reported_at ?? l.ordered_at) as string,
      status: l.status as string,
      items: ((l.items ?? []) as Array<Record<string, unknown>>).map((it) => ({
        test: (it.test as { name?: string } | null)?.name ?? 'Test',
        result: (it.result_text as string | null) ?? (it.result_value != null ? String(it.result_value) : null),
        unit: it.unit as string | null,
        flag: it.flag as string,
      })),
    })),
    radiology: ((radRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      date: (r.reported_at ?? r.ordered_at) as string,
      status: r.status as string,
      test: (r.test as { name?: string } | null)?.name ?? 'Study',
      report: r.report as string | null,
    })),
  }
}

// ── Appointments & requests at one hospital (Phase 4) ─────────────────────────
export interface PatientAppointment { id: string; date: string; status: string; doctor: string; reason: string | null }
export interface PatientRequest { id: string; source: string; suggestedDate: string | null; reason: string | null; status: string; doctor: string | null }
export interface HospitalDoctor { id: string; name: string }

export async function getPatientAppointments(patientId: string): Promise<PatientAppointment[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  if (!(await ownsPatient(svc, patientId, session.phone))) return []
  const { data } = await svc
    .from('appointments')
    .select('id, scheduled_at, status, reason, doctor:profiles(full_name)')
    .eq('patient_id', patientId).order('scheduled_at', { ascending: false }).limit(50)
  return ((data ?? []) as Array<Record<string, unknown>>).map((a) => ({
    id: a.id as string, date: a.scheduled_at as string, status: a.status as string,
    doctor: (a.doctor as { full_name?: string } | null)?.full_name ?? '—',
    reason: a.reason as string | null,
  }))
}

// Pending follow-ups/requests for this patient — both doctor-recommended
// (source opd/ipd) and their own portal requests (source patient).
export async function getPatientRequests(patientId: string): Promise<PatientRequest[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  if (!(await ownsPatient(svc, patientId, session.phone))) return []
  const { data } = await svc
    .from('follow_ups')
    .select('id, source, suggested_date, reason, status, suggested_doctor:profiles!suggested_doctor_id(full_name)')
    .eq('patient_id', patientId).eq('status', 'pending').order('created_at', { ascending: false })
  return ((data ?? []) as Array<Record<string, unknown>>).map((f) => ({
    id: f.id as string, source: f.source as string, suggestedDate: f.suggested_date as string | null,
    reason: f.reason as string | null, status: f.status as string,
    doctor: (f.suggested_doctor as { full_name?: string } | null)?.full_name ?? null,
  }))
}

export async function getHospitalDoctors(patientId: string): Promise<HospitalDoctor[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session.phone)
  if (!owner) return []
  const { data } = await svc
    .from('profiles').select('id, full_name')
    .eq('tenant_id', owner.tenantId).eq('role', 'doctor').eq('is_active', true).order('full_name')
  return ((data ?? []) as Array<Record<string, unknown>>).map((d) => ({ id: d.id as string, name: d.full_name as string }))
}

// Patient requests an appointment → a pending follow_up (source 'patient') that
// the hospital front desk confirms & converts. No auto-booked appointment/bill.
export async function requestPatientAppointment(
  patientId: string, input: { doctorId?: string | null; date: string; reason?: string | null },
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getPatientSession()
  if (!session) return { success: false, error: 'Please log in again' }
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session.phone)
  if (!owner) return { success: false, error: 'Record not found' }
  if (!input.date) return { success: false, error: 'Please pick a preferred date' }

  const { error } = await svc.from('follow_ups').insert({
    tenant_id: owner.tenantId,
    patient_id: patientId,
    source: 'patient',
    suggested_doctor_id: input.doctorId || null,
    suggested_date: input.date,
    reason: input.reason?.trim() || 'Appointment requested via patient portal',
    status: 'pending',
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Doctor availability for booking (Phase #2/#3) ─────────────────────────────
export interface AvailableSession { label: string | null; start: string; end: string; tokenCap: number | null }
export interface AvailableDay { date: string; sessions: AvailableSession[] }

// Next `days` calendar days on which this doctor has an active OPD session.
export async function getDoctorAvailability(patientId: string, doctorId: string, days = 30): Promise<AvailableDay[]> {
  const session = await getPatientSession()
  if (!session) return []
  const svc = createServiceClient()
  const owner = await ownsPatient(svc, patientId, session.phone)
  if (!owner) return []

  const { data } = await svc
    .from('doctor_availability')
    .select('day_of_week, start_time, end_time, label, token_cap')
    .eq('doctor_id', doctorId).eq('tenant_id', owner.tenantId).eq('is_active', true)
    .order('start_time')

  const byDow = new Map<number, AvailableSession[]>()
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const dow = r.day_of_week as number
    if (!byDow.has(dow)) byDow.set(dow, [])
    byDow.get(dow)!.push({
      label: r.label as string | null,
      start: (r.start_time as string).slice(0, 5),
      end: (r.end_time as string).slice(0, 5),
      tokenCap: r.token_cap as number | null,
    })
  }

  const out: AvailableDay[] = []
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i)
    const s = byDow.get(d.getDay())
    if (s && s.length) out.push({ date: d.toISOString().split('T')[0], sessions: s })
  }
  return out
}
