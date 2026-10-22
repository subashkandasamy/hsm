'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getPatientActiveLocation, patientLocationMessage } from '@/lib/patientLocation'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { PatientCreateSchema, PatientUpdateSchema } from '@/lib/schemas'
import { istToday } from '@/lib/istDate'
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

  // An age given at the counter becomes a date of birth a year wide, flagged so
  // nothing later reads it as an exact birthday.
  let dob = data.dob || null
  let dobEstimated = data.dob_estimated ?? false
  if (!dob && data.age_years != null) {
    const [y, m, d] = istToday().split('-').map(Number)
    dob = `${y - data.age_years}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    dobEstimated = true
  }

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

  const supabase = await createClient()
  const { error } = await supabase.from('patients').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'patient', id, parsed.data as Record<string, unknown>)
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
      `full_name.ilike.%${q}%,phone.ilike.%${q}%,uhid.ilike.%${q}%`
    )
    .order('full_name')
    .limit(100)
  return (data ?? []) as Patient[]
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
