'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getPatientActiveLocation, patientLocationMessage } from '@/lib/patientLocation'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { PatientCreateSchema, PatientUpdateSchema } from '@/lib/schemas'
import { istToday } from '@/lib/istDate'
import { estimatedDob } from '@/lib/patientAge'
import { pageWindow, searchTerm, isNameSearch, type Paged } from '@/lib/paging'
import type { Patient } from '@/lib/types'

export type CreatePatientResult =
  | { success: true; patient: Patient }
  | { duplicate: true; existing: Pick<Patient, 'id' | 'uhid' | 'full_name' | 'phone'> }
  | { success: false; error: string }

export async function createPatient(
  input: Record<string, unknown>
): Promise<CreatePatientResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:write')

  const parsed = PatientCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const data = parsed.data

  // An age given at the counter becomes an estimated date of birth (today, that
  // many years and months back), flagged so nothing shows it as a real birthday.
  const typedAge = !data.dob && (data.age_years != null || data.age_months != null)
  const dob = typedAge ? estimatedDob(data.age_years ?? 0, data.age_months ?? 0, istToday()) : (data.dob || null)
  const dobEstimated = typedAge

  // Aadhaar is mandatory unless the front desk explicitly registers without it
  // (emergency / patient didn't carry it).
  if (!data.aadhaar_no && !data.no_aadhaar) {
    return { success: false, error: 'Aadhaar is required — or tick "Register without Aadhaar" for emergencies.' }
  }

  const supabase = await createClient()

  // Duplicate phone guard
  const { data: existing } = await supabase
    .from('patients')
    .select('id, uhid, full_name, phone')
    .eq('phone', data.phone)
    .maybeSingle()

  if (existing) return { duplicate: true, existing }

  // Generate UHID (race-safe via Postgres function)
  const { data: uhid, error: uhidErr } = await supabase.rpc('get_next_uhid')
  if (uhidErr || !uhid) return { success: false, error: 'Failed to generate UHID' }

  const id = crypto.randomUUID()
  const { error: insertErr } = await supabase.from('patients').insert({
    id,
    uhid,
    tenant_id: actor.tenant_id,
    full_name: data.full_name,
    dob,
    dob_estimated: dobEstimated,
    gender: data.gender,
    phone: data.phone,
    email: data.email || null,
    address: data.address || null,
    state: data.state || null,
    district: data.district || null,
    pincode: data.pincode || null,
    relation_type: data.relation_type || null,
    relation_name: data.relation_name || null,
    blood_group: data.blood_group ?? null,
    allergies: data.allergies || null,
    emergency_contact_name: data.emergency_contact_name || null,
    emergency_contact_phone: data.emergency_contact_phone || null,
    notify_whatsapp_consent: data.notify_whatsapp_consent ?? false,
    notify_sms_consent: data.notify_sms_consent ?? false,
    aadhaar_no: data.aadhaar_no || null,
    created_by: actor.id,
  })

  if (insertErr) return { success: false, error: insertErr.message }

  // Auto-link to the master patient (family member) if this Aadhaar is known.
  if (data.aadhaar_no) {
    const svc = createServiceClient()
    const { data: member } = await svc
      .from('patient_members').select('id, account_id').eq('aadhaar', data.aadhaar_no).maybeSingle()
    if (member) {
      await svc.from('patients')
        .update({ patient_member_id: member.id as string, patient_account_id: member.account_id as string })
        .eq('id', id)
    }
  }

  await logAudit(actor.id, 'create', 'patient', id, {
    uhid,
    full_name: data.full_name,
    phone: data.phone,
  })

  const { data: patient } = await supabase
    .from('patients').select('*').eq('id', id).single()
  return { success: true, patient: patient as Patient }
}

export async function updatePatient(
  id: string,
  input: Record<string, unknown>
): Promise<{ success: true } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:write')

  const parsed = PatientUpdateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  // Age and months are not columns: they become an estimated date of birth. A
  // date typed in is the real one, so it is no longer an estimate. Neither sent:
  // the date of birth is left as it is.
  const { age_years, age_months, ...fields } = parsed.data
  delete fields.no_aadhaar      // a registration-only switch
  delete fields.dob_estimated   // decided here, not by the form
  const update: Record<string, unknown> = { ...fields }
  if (age_years != null || age_months != null) {
    if ((age_years ?? 0) < 2 && age_months == null) return { success: false, error: 'For a child under 2, enter the months too (or the date of birth)' }
    update.dob = estimatedDob(age_years ?? 0, age_months ?? 0, istToday())
    update.dob_estimated = true
  } else if ('dob' in fields) {
    if (!fields.dob) return { success: false, error: 'Enter the date of birth, or the age in years' }
    update.dob_estimated = false
  }

  const supabase = await createClient()
  const { error } = await supabase.from('patients').update(update).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'patient', id, update)
  return { success: true }
}

export async function getPatient(id: string): Promise<Patient | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('patients').select('*').eq('id', id).single()
  return data as Patient | null
}

export async function searchPatients(query: string): Promise<Patient[]> {
  const supabase = await createClient()
  const q = query.trim()

  if (!q) {
    const { data } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    return (data ?? []) as Patient[]
  }

  const { data } = await supabase
    .from('patients')
    .select('*')
    .or(
      `full_name.ilike.%${q}%,phone.ilike.%${q}%,uhid.ilike.%${q}%,legacy_uhid.ilike.%${q}%`
    )
    .order('full_name')
    .limit(100)

  // A number typed in full goes first. "DRKMCH-1" also contains DRKMCH-10,
  // -100 and -1000, and the one asked for could fall outside the 100 above.
  if (/^[A-Za-z0-9/-]+$/.test(q)) {
    const { data: byNumber } = await supabase
      .from('patients')
      .select('*')
      .or(`uhid.ilike.${q},legacy_uhid.ilike.${q}`)
      .limit(5)
    // The previous software's IP and lab numbers (FAC-18-45) are on the paper
    // files patients bring; both series share one prefix, so both are looked up.
    const [{ data: stays }, { data: labs }] = await Promise.all([
      supabase.from('admissions').select('patient_id').ilike('legacy_ip_no', q).limit(5),
      supabase.from('lab_orders').select('patient_id').ilike('legacy_request_no', q).limit(5),
    ])
    const viaOld = [...new Set([...(stays ?? []), ...(labs ?? [])].map((r) => r.patient_id as string))]
      .filter((id) => !(byNumber ?? []).some((p) => p.id === id))
    const { data: oldOwners } = viaOld.length
      ? await supabase.from('patients').select('*').in('id', viaOld)
      : { data: [] as Patient[] }
    const exact = [...(byNumber ?? []), ...(oldOwners ?? [])]
    if (exact.length) {
      const first = new Set(exact.map((p) => p.id as string))
      return [...exact, ...(data ?? []).filter((p) => !first.has(p.id as string))] as Patient[]
    }
  }
  return (data ?? []) as Patient[]
}

/**
 * The Patients page, one page at a time. No search: newest first. A name:
 * matched anywhere in it. A number or code: UHID, old number or phone that
 * contains it — and a number typed in full (a UHID, DRKMCH-…, an old IP or lab
 * number like FAC-18-45) comes first, ahead of the 10, 100 and 1000 that also
 * contain it.
 */
export async function listPatientsPage(opts: { q?: string; page?: number; size?: number } = {}): Promise<Paged<Patient>> {
  return patientsPage('*', opts)
}

/**
 * The few patients a counter search box offers (pharmacy sale): the same
 * search as the Patients page, over every patient, with only the fields shown.
 */
export async function findPatientsQuick(q: string): Promise<Pick<Patient, 'id' | 'full_name' | 'uhid' | 'phone'>[]> {
  if (!searchTerm(q)) return []
  const { rows } = await patientsPage('id, full_name, uhid, phone', { q, page: 1, size: 25 })
  return rows.slice(0, 8)
}

async function patientsPage(cols: string, opts: { q?: string; page?: number; size?: number }): Promise<Paged<Patient>> {
  const supabase = await createClient()
  const { page, size, from, to } = pageWindow(opts.page, opts.size)
  const s = searchTerm(opts.q)
  if (!s) {
    const { data, count } = await supabase.from('patients').select(cols as '*', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id').range(from, to)
    return { rows: (data ?? []) as Patient[], total: count ?? 0, page, size }
  }
  if (isNameSearch(s)) {
    const { data, count } = await supabase.from('patients').select(cols as '*', { count: 'exact' })
      .ilike('full_name', `%${s}%`).order('full_name').order('id').range(from, to)
    return { rows: (data ?? []) as Patient[], total: count ?? 0, page, size }
  }
  // A number: whole-number matches first (also through an old IP or lab number).
  const token = /^[A-Za-z0-9/-]+$/.test(s) ? s : null
  let exact: Patient[] = []
  if (token) {
    const [{ data: byNo }, { data: stays }, { data: labs }] = await Promise.all([
      supabase.from('patients').select(cols as '*').or(`uhid.ilike.${token},legacy_uhid.ilike.${token}`).limit(5),
      supabase.from('admissions').select('patient_id').ilike('legacy_ip_no', token).limit(5),
      supabase.from('lab_orders').select('patient_id').ilike('legacy_request_no', token).limit(5),
    ])
    exact = (byNo ?? []) as Patient[]
    const more = [...new Set([...(stays ?? []), ...(labs ?? [])].map((r) => r.patient_id as string))].filter((id) => !exact.some((p) => p.id === id))
    if (more.length) exact.push(...((await supabase.from('patients').select(cols as '*').in('id', more)).data ?? []) as Patient[])
  }
  let rest = supabase.from('patients').select(cols as '*', { count: 'exact' })
    .or(`uhid.ilike.%${s}%,legacy_uhid.ilike.%${s}%,phone.ilike.%${s}%`)
  if (exact.length) rest = rest.not('id', 'in', `(${exact.map((p) => p.id).join(',')})`)
  // Page 1 holds the whole-number matches (at most 15, a page is 25+), then the
  // rest; every later page is shifted back by them.
  const lead = page === 1 ? exact : []
  const { data, count } = await rest.order('full_name').order('id').range(Math.max(0, from - exact.length), to - exact.length)
  return { rows: [...lead, ...((data ?? []) as Patient[])], total: exact.length + (count ?? 0), page, size }
}

export async function listPatients(): Promise<Patient[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []) as Patient[]
}

export async function checkPatientLocation(
  patientId: string
): Promise<{ location: 'ipd' | 'emergency' | null; message: string }> {
  const supabase = await createClient()
  const location = await getPatientActiveLocation(patientId, supabase)
  return { location, message: patientLocationMessage(location) }
}
