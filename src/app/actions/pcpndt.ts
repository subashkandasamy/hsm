'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { revalidatePath } from 'next/cache'

/**
 * Form F — the record the PC&PNDT Act is enforced through.
 *
 * Two things shape everything in this file.
 *
 * It is a legal document, not a screen. Every field that describes the patient
 * or the clinic is COPIED onto the record when it is created, never joined
 * live, because a form printed for an inspection two years from now has to say
 * what was true on the day of the scan.
 *
 * And it is read by people looking for wrongdoing. So reads are audited as
 * well as writes — if this register ever leaks, the first question is who
 * opened it, and only a read log answers that.
 */

type SimpleResult = { success: true } | { success: false; error: string }

export interface FormFListRow {
  id: string
  serial_no: string
  status: string
  form_date: string
  patient_name: string | null
  patient_id: string | null
  procedure_date: string | null
  performed_by_name: string | null
  mtp_indication: string | null
  amends_id: string | null
}

export interface PcpndtOption {
  kind: string
  code: string
  ordinal: number
  label: string
  group_label: string | null
}

export interface PatientChild {
  id: string
  sex: 'male' | 'female'
  dob: string | null
  age_years: number | null
  age_months: number | null
  is_living: boolean
}

// ── The Act's own lists ─────────────────────────────────────────────────────

/**
 * The prescribed options, with the Act's wording.
 *
 * Not tenant data and not editable — the printed form has to reproduce these
 * exactly, so they are seeded in the migration and only read here.
 */
export async function listPcpndtOptions(kind?: string): Promise<PcpndtOption[]> {
  const supabase = await createClient()
  let q = supabase.from('pcpndt_options').select('*').order('kind').order('ordinal')
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) { console.error('[listPcpndtOptions]', error.message); return [] }
  return (data ?? []) as PcpndtOption[]
}

// ── Living children ─────────────────────────────────────────────────────────

export async function listPatientChildren(patientId: string): Promise<PatientChild[]> {
  await requirePermission((await getActorProfile()).role, 'patients:read')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('patient_children')
    .select('id, sex, dob, age_years, age_months, is_living')
    .eq('patient_id', patientId)
    .order('created_at')
  if (error) { console.error('[listPatientChildren]', error.message); return [] }
  return (data ?? []) as PatientChild[]
}

export async function addPatientChild(input: {
  patient_id: string
  sex: 'male' | 'female'
  dob?: string | null
  age_years?: number | null
  age_months?: number | null
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:write')

  if (input.sex !== 'male' && input.sex !== 'female') {
    return { success: false, error: 'Select whether the child is a son or a daughter' }
  }
  // Form F accepts an age in years or months, so a mother who knows her child
  // is nine months old is not made to invent a birthday — but one of the three
  // has to be there or the column is blank, which is the offence.
  if (!input.dob && input.age_years == null && input.age_months == null) {
    return { success: false, error: 'Give a date of birth, or an age in years or months' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('patient_children').insert({
    tenant_id: actor.tenant_id,
    patient_id: input.patient_id,
    sex: input.sex,
    dob: input.dob || null,
    age_years: input.age_years ?? null,
    age_months: input.age_months ?? null,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'patient_child', input.patient_id, { sex: input.sex })
  revalidatePath(`/patients/${input.patient_id}`)
  return { success: true }
}

export async function removePatientChild(id: string, patientId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:write')
  const supabase = await createClient()
  const { error } = await supabase.from('patient_children').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'patient_child', id, { patient_id: patientId })
  revalidatePath(`/patients/${patientId}`)
  return { success: true }
}

// ── Form F ──────────────────────────────────────────────────────────────────

/**
 * Open a new Form F, pre-filled from what the hospital already knows.
 *
 * The pre-fill is a convenience and a safety net both: a sonologist copying a
 * woman's address off a referral slip at eleven at night is how a column ends
 * up wrong, and a wrong column is the same offence as a blank one.
 *
 * Everything copied here is frozen. Later edits to the patient do not reach a
 * Form F already created, by design.
 */
export async function startFormF(input: {
  patient_id: string
  radiology_order_id?: string | null
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()

  const [{ data: patient }, { data: profile }, { data: children }, { data: anc }] = await Promise.all([
    supabase.from('patients')
      .select('id, full_name, dob, gender, phone, address, district, state, pincode, relation_type, relation_name')
      .eq('id', input.patient_id).maybeSingle(),
    supabase.from('tenant_profiles')
      .select('name, pcpndt_reg_no, pcpndt_registered_name, pcpndt_registered_address, address_line1, address_line2, city, state, pincode')
      .maybeSingle(),
    supabase.from('patient_children')
      .select('sex, dob, age_years, age_months').eq('patient_id', input.patient_id).eq('is_living', true),
    supabase.from('anc_records')
      .select('lmp, gravida, para, living, abortions')
      .eq('patient_id', input.patient_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!patient) return { success: false, error: 'That patient no longer exists' }

  // The Act is about pregnant women. A Form F for anyone else is a mistake
  // worth catching at the start rather than at the signature.
  if (patient.gender !== 'female') {
    return { success: false, error: 'Form F is only for a pregnant woman — check the patient is correct' }
  }

  const { data: serial, error: serialErr } = await supabase.rpc('get_next_form_f_no')
  if (serialErr || !serial) return { success: false, error: 'Could not allocate a Form F number' }

  // The certificate's name, not the trading name — Form F must carry the
  // registered one, and they are routinely different.
  const clinicName = profile?.pcpndt_registered_name || profile?.name || null
  const clinicAddress = profile?.pcpndt_registered_address
    || [profile?.address_line1, profile?.address_line2, profile?.city, profile?.state, profile?.pincode]
        .filter(Boolean).join(', ') || null

  const age = patient.dob
    ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null

  const id = crypto.randomUUID()
  const { error } = await supabase.from('form_f_records').insert({
    id,
    tenant_id: actor.tenant_id,
    serial_no: serial as string,
    status: 'draft',
    clinic_name: clinicName,
    clinic_address: clinicAddress,
    clinic_reg_no: profile?.pcpndt_reg_no ?? null,
    patient_id: patient.id,
    patient_name: patient.full_name,
    patient_age_years: age,
    living_children_total: (children ?? []).length,
    children_snapshot: children ?? [],
    relation_type: patient.relation_type ?? null,
    relation_name: patient.relation_name ?? null,
    address_text: patient.address ?? null,
    district: patient.district ?? null,
    state: patient.state ?? null,
    pincode: patient.pincode ?? null,
    contact_no: patient.phone ?? null,
    lmp: anc?.lmp ?? null,
    // Report II quotes the full obstetric history per scan, not just the
    // living children Form F field 4 asks for. Frozen here with everything
    // else, so a reprint years later still says what was true on the day.
    gravida: anc?.gravida ?? null,
    para: anc?.para ?? null,
    abortions: anc?.abortions ?? null,
    radiology_order_id: input.radiology_order_id ?? null,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'form_f', id, { serial_no: serial, patient_id: patient.id })
  revalidatePath('/pcpndt')
  return { success: true, id }
}

/** Save a draft. Deliberately unvalidated — a half-filled draft is legitimate. */
export async function saveFormFDraft(
  id: string, patch: Record<string, unknown>,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  // The database refuses to edit a completed record, but checking here lets
  // the message be about the form rather than about a trigger.
  const { data: cur } = await supabase
    .from('form_f_records').select('status, serial_no').eq('id', id).maybeSingle()
  if (!cur) return { success: false, error: 'That Form F no longer exists' }
  if (cur.status !== 'draft') {
    return { success: false, error: `Form F ${cur.serial_no} is already complete — raise an amendment instead` }
  }

  const { error } = await supabase.from('form_f_records').update(patch).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/pcpndt')
  return { success: true }
}

/**
 * Sign it off.
 *
 * The database decides whether it may be completed, and says what is missing.
 * This does not second-guess it — duplicating the rule in two places is how
 * the two drift apart.
 */
export async function completeFormF(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  const { error } = await supabase
    .from('form_f_records')
    .update({ status: 'complete', completed_by: actor.id })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'complete', 'form_f', id, {})
  revalidatePath('/pcpndt')
  return { success: true }
}

/**
 * Correct a completed Form F.
 *
 * Never an edit. A new record is created carrying everything the original
 * said, pointing back at it and stating why, and the original is marked
 * superseded rather than changed. Both are kept.
 *
 * This will irritate somebody who has just spotted a typo. The alternative is
 * a register whose contents can quietly differ from the paper already filed
 * with the Appropriate Authority, which is not a register at all — and a
 * discrepancy found at an inspection reads as concealment, not as a typo.
 */
export async function amendFormF(
  id: string, reason: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  if (!reason.trim()) {
    return { success: false, error: 'Say why this is being amended — a correction without a reason looks like tampering' }
  }

  const supabase = await createClient()
  const { data: original } = await supabase
    .from('form_f_records').select('*').eq('id', id).maybeSingle()
  if (!original) return { success: false, error: 'That Form F no longer exists' }
  if (original.status !== 'complete') {
    return { success: false, error: 'Only a completed Form F is amended. This one is still a draft — just edit it.' }
  }

  const { data: serial, error: serialErr } = await supabase.rpc('get_next_form_f_no')
  if (serialErr || !serial) return { success: false, error: 'Could not allocate a Form F number' }

  const copy = { ...(original as Record<string, unknown>) }
  delete copy.id
  delete copy.created_at
  delete copy.completed_at
  delete copy.completed_by

  const newId = crypto.randomUUID()
  const { error: insErr } = await supabase.from('form_f_records').insert({
    ...copy,
    id: newId,
    serial_no: serial as string,
    status: 'draft',
    amends_id: id,
    amend_reason: reason.trim(),
    created_by: actor.id,
  })
  if (insErr) return { success: false, error: insErr.message }

  // Mark the original superseded. The lock trigger permits exactly this one
  // transition out of 'complete' and nothing else.
  const { error: markErr } = await supabase
    .from('form_f_records').update({ status: 'amended' }).eq('id', id)
  if (markErr) return { success: false, error: markErr.message }

  await logAudit(actor.id, 'amend', 'form_f', id, { reason: reason.trim(), replacement: newId })
  revalidatePath('/pcpndt')
  return { success: true, id: newId }
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * The register.
 *
 * Reads are audited here and nowhere else in the product. This table holds a
 * woman's name, address, reproductive history and the sex of each of her
 * living children — the exact dataset a sex-determination racket wants. If it
 * ever leaks, the first question asked will be who opened it, and a write-only
 * audit log cannot answer that.
 */
export async function listFormF(filters?: {
  month?: string          // 'YYYY-MM'
  status?: string
  patientId?: string
}): Promise<FormFListRow[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  let q = supabase
    .from('form_f_records')
    .select('id, serial_no, status, form_date, patient_name, patient_id, procedure_date, performed_by_name, mtp_indication, amends_id')
    .order('form_date', { ascending: false })
    .limit(500)

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)
  if (filters?.month) {
    // The register is read a month at a time, because that is how it is filed.
    const start = `${filters.month}-01`
    const [y, m] = filters.month.split('-').map(Number)
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    // A draft has no procedure date yet, so filtering on that alone hides the
    // very forms the "not finished" warning is about — the hospital would be
    // told something needs fixing and given no way to reach it. Unfinished
    // forms fall back to the date they were opened.
    q = q.or(
      `and(procedure_date.gte.${start},procedure_date.lt.${end}),`
      + `and(procedure_date.is.null,form_date.gte.${start},form_date.lt.${end})`,
    )
  }

  const { data, error } = await q
  if (error) { console.error('[listFormF]', error.message); return [] }

  await logAudit(actor.id, 'read', 'form_f_register', filters?.month ?? 'all', {
    rows: (data ?? []).length, ...filters,
  })
  return (data ?? []) as FormFListRow[]
}

export async function getFormF(id: string): Promise<Record<string, unknown> | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  const { data } = await supabase.from('form_f_records').select('*').eq('id', id).maybeSingle()
  if (!data) return null

  await logAudit(actor.id, 'read', 'form_f', id, { serial_no: data.serial_no })
  return data as Record<string, unknown>
}

/**
 * What is not yet fit to file.
 *
 * The number a hospital needs before the 5th, not after. A draft sitting in
 * the register on the 6th is a column the Appropriate Authority never
 * received.
 */
export async function countIncompleteForMonth(month: string): Promise<number> {
  await requirePermission((await getActorProfile()).role, 'pcpndt:record')
  const supabase = await createClient()
  const start = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { count } = await supabase
    .from('form_f_records')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft')
    .gte('form_date', start).lt('form_date', end)
  return count ?? 0
}

// ── Monthly-return setup ────────────────────────────────────────────────────

export interface ScanBucketRow {
  id: string
  name: string
  modality: string | null
  body_part: string | null
  pcpndt_bucket: string | null
}

/**
 * Every ultrasound study the hospital offers, with the column of the monthly
 * scan count it lands in.
 *
 * Report I counts all ultrasound, not only the scans that generated a Form F —
 * it has columns for male abdomen and cardiac work, which no pregnant woman
 * produces. So the mapping cannot be inferred from the register and has to be
 * stated once per study.
 */
export async function listScanBuckets(): Promise<ScanBucketRow[]> {
  await requirePermission((await getActorProfile()).role, 'pcpndt:record')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('radiology_catalog')
    .select('id, name, modality, body_part, pcpndt_bucket')
    .order('modality').order('name')
  if (error) { console.error('[listScanBuckets]', error.message); return [] }
  return (data ?? []) as ScanBucketRow[]
}

export async function setScanBucket(id: string, bucket: string | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:report')

  const supabase = await createClient()
  const { error } = await supabase
    .from('radiology_catalog').update({ pcpndt_bucket: bucket || null }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'radiology_catalog', id, { pcpndt_bucket: bucket })
  revalidatePath('/pcpndt/setup')
  return { success: true }
}

export interface TrackedDrugRow {
  id: string
  drug_master_id: string | null
  report_label: string
  opening_qty: number
  opening_as_of: string
  is_active: boolean
}

export async function listTrackedDrugs(): Promise<TrackedDrugRow[]> {
  await requirePermission((await getActorProfile()).role, 'pcpndt:record')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mtp_tracked_drugs')
    .select('id, drug_master_id, report_label, opening_qty, opening_as_of, is_active')
    .order('report_label')
  if (error) { console.error('[listTrackedDrugs]', error.message); return [] }
  return (data ?? []) as TrackedDrugRow[]
}

/**
 * Put a drug on the monthly stock return.
 *
 * The opening quantity is the stock the hospital held on the day it starts
 * counting. It matters more than it looks: every month afterwards walks
 * forward from it, so a wrong opening is a wrong closing for ever, and the
 * closing balance is what an inspector compares against the shelf.
 */
export async function addTrackedDrug(input: {
  drug_master_id: string
  report_label: string
  opening_qty: number
  opening_as_of: string
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:report')

  if (!input.report_label.trim()) {
    return { success: false, error: 'What should the report call this drug?' }
  }
  if (!Number.isFinite(input.opening_qty) || input.opening_qty < 0) {
    return { success: false, error: 'Opening stock cannot be negative' }
  }
  if (!input.opening_as_of) {
    return { success: false, error: 'From which date is that opening stock correct?' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('mtp_tracked_drugs').insert({
    tenant_id: actor.tenant_id,
    drug_master_id: input.drug_master_id,
    report_label: input.report_label.trim(),
    opening_qty: Math.round(input.opening_qty),
    opening_as_of: input.opening_as_of,
  })
  if (error) {
    // The unique index is per tenant per drug, and "duplicate key" is not a
    // sentence anybody at a hospital should have to interpret.
    if (error.code === '23505') return { success: false, error: 'That drug is already on the return' }
    return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'create', 'mtp_tracked_drug', input.drug_master_id, {
    label: input.report_label, opening: input.opening_qty,
  })
  revalidatePath('/pcpndt/setup')
  return { success: true }
}

export async function removeTrackedDrug(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:report')
  const supabase = await createClient()
  const { error } = await supabase.from('mtp_tracked_drugs').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'mtp_tracked_drug', id, {})
  revalidatePath('/pcpndt/setup')
  return { success: true }
}

/** Drugs a hospital might put on the return — searched against the shared catalogue. */
export async function searchDrugsForReturn(q: string): Promise<Array<{ id: string; name: string }>> {
  await requirePermission((await getActorProfile()).role, 'pcpndt:record')
  if (q.trim().length < 2) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('drug_master').select('id, name').ilike('name', `%${q.trim()}%`).limit(20)
  return (data ?? []) as Array<{ id: string; name: string }>
}

export interface MtpDrugStatusRow {
  tracked_id: string
  report_label: string
  opening_qty: number
  purchased_qty: number
  invoice_refs: string
  suppliers: string
  total_qty: number
  used_qty: number
  closing_qty: number
}

/** Report V for one month, computed from what the pharmacy actually did. */
export async function getMtpDrugStatus(month: string): Promise<MtpDrugStatusRow[]> {
  await requirePermission((await getActorProfile()).role, 'pcpndt:record')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_mtp_drug_status', { p_month: month })
  if (error) { console.error('[getMtpDrugStatus]', error.message); return [] }
  return (data ?? []) as MtpDrugStatusRow[]
}

// ── MTP register ────────────────────────────────────────────────────────────

export interface MtpListRow {
  id: string
  serial_no: string
  status: string
  patient_name: string | null
  procedure_date: string | null
  gestation_weeks: number | null
  performed_by_name: string | null
  method: string | null
}

/**
 * Open an MTP record, pre-filled from the pregnancy that is being terminated.
 *
 * The obstetric history matters more here than anywhere else in the product.
 * Report IV asks for G, P, L, A and for the living children split by sex,
 * because the question the Act is really asking is whether terminations
 * cluster among women who already have daughters. Copying those numbers off
 * the record rather than retyping them is both quicker and harder to fudge.
 */
export async function startMtp(input: {
  patient_id: string
  admission_id?: string | null
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  const [{ data: patient }, { data: anc }, { data: children }] = await Promise.all([
    supabase.from('patients')
      .select('id, full_name, dob, gender, phone, address, district, state, pincode, relation_type, relation_name')
      .eq('id', input.patient_id).maybeSingle(),
    supabase.from('anc_records')
      .select('lmp, gravida, para, living, abortions')
      .eq('patient_id', input.patient_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('patient_children')
      .select('sex').eq('patient_id', input.patient_id).eq('is_living', true),
  ])

  if (!patient) return { success: false, error: 'That patient no longer exists' }
  if (patient.gender !== 'female') {
    return { success: false, error: 'Check the patient — an MTP record belongs to a pregnant woman' }
  }

  const { data: serial, error: serialErr } = await supabase.rpc('get_next_mtp_no')
  if (serialErr || !serial) return { success: false, error: 'Could not allocate an MTP number' }

  const kids = children ?? []
  const age = patient.dob
    ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null

  const id = crypto.randomUUID()
  const { error } = await supabase.from('mtp_records').insert({
    id,
    tenant_id: actor.tenant_id,
    serial_no: serial as string,
    status: 'draft',
    patient_id: patient.id,
    patient_name: patient.full_name,
    patient_age_years: age,
    relation_type: patient.relation_type ?? null,
    relation_name: patient.relation_name ?? null,
    address_text: patient.address ?? null,
    district: patient.district ?? null,
    state: patient.state ?? null,
    pincode: patient.pincode ?? null,
    contact_no: patient.phone ?? null,
    lmp: anc?.lmp ?? null,
    gravida: anc?.gravida ?? null,
    para: anc?.para ?? null,
    living: anc?.living ?? kids.length,
    abortions: anc?.abortions ?? null,
    living_male: kids.filter((c) => c.sex === 'male').length,
    living_female: kids.filter((c) => c.sex === 'female').length,
    admission_id: input.admission_id ?? null,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'mtp_record', id, { serial_no: serial, patient_id: patient.id })
  revalidatePath('/pcpndt/mtp')
  return { success: true, id }
}

export async function saveMtpDraft(id: string, patch: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  const { data: cur } = await supabase
    .from('mtp_records').select('status, serial_no').eq('id', id).maybeSingle()
  if (!cur) return { success: false, error: 'That record no longer exists' }
  if (cur.status !== 'draft') {
    return { success: false, error: `${cur.serial_no} is already complete` }
  }

  const { error } = await supabase.from('mtp_records').update(patch).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/pcpndt/mtp')
  return { success: true }
}

/** The database decides whether it may be completed, and says what is missing. */
export async function completeMtp(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  const { error } = await supabase
    .from('mtp_records').update({ status: 'complete', completed_by: actor.id }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'complete', 'mtp_record', id, {})
  revalidatePath('/pcpndt/mtp')
  return { success: true }
}

/** Reads are audited, for the same reason Form F reads are. */
export async function listMtp(month?: string): Promise<MtpListRow[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  const supabase = await createClient()
  let q = supabase
    .from('mtp_records')
    .select('id, serial_no, status, patient_name, procedure_date, gestation_weeks, performed_by_name, method')
    .order('created_at', { ascending: false })
    .limit(500)

  if (month) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    // Same reasoning as Form F: a draft has no procedure date yet, and hiding
    // it would hide exactly the record that still needs finishing.
    q = q.or(
      `and(procedure_date.gte.${start},procedure_date.lt.${end}),`
      + `and(procedure_date.is.null,created_at.gte.${start},created_at.lt.${end})`,
    )
  }

  const { data, error } = await q
  if (error) { console.error('[listMtp]', error.message); return [] }
  await logAudit(actor.id, 'read', 'mtp_register', month ?? 'all', { rows: (data ?? []).length })
  return (data ?? []) as MtpListRow[]
}

export async function getMtp(id: string): Promise<Record<string, unknown> | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')
  const supabase = await createClient()
  const { data } = await supabase.from('mtp_records').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  await logAudit(actor.id, 'read', 'mtp_record', id, { serial_no: data.serial_no })
  return data as Record<string, unknown>
}

// ── The monthly pack ────────────────────────────────────────────────────────

export interface MonthlyReturn {
  month: string
  report_i: {
    forms_f_obtained: number
    scans: Record<string, number>
    scans_unmapped: number
    invasive_procedures: Record<string, number>
    additional_tests: Record<string, number>
    mtp_advised: number
  }
  report_iii: {
    live_male: number; live_female: number; live_total: number
    intra_uterine_deaths: number
    mothers_primi: number; mothers_one_daughter: number
    mothers_two_plus_daughters: number; mothers_other: number; mothers_total: number
    abortions_mtp: number
  }
  readiness: {
    form_f_drafts: number
    mtp_drafts: number
    scans_unmapped_studies: number
    tracked_drugs: number
    referrals: number
  }
}

/**
 * Everything the monthly pack is counted from, for one month.
 *
 * Reports I and III are the two an Appropriate Authority actually analyses —
 * the others are registers it audits against. Report I shows whether the
 * antenatal scan count is out of line; Report III shows whether women who
 * already have daughters are disproportionately not delivering girls. Both are
 * computed from the registers and neither is typed anywhere, which is the only
 * way the numbers mean anything.
 */
export async function getMonthlyReturn(month: string): Promise<MonthlyReturn | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:report')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_monthly_return_summary', { p_month: month })
  if (error) { console.error('[getMonthlyReturn]', error.message); return null }

  await logAudit(actor.id, 'read', 'pcpndt_monthly_return', month, {})
  return data as unknown as MonthlyReturn
}

export interface AncReferralRow {
  id: string
  patient_name: string | null
  referred_on: string
  referred_to_doctor: string | null
  referred_to_institution: string | null
  reason: string | null
}

export async function listAncReferrals(month?: string): Promise<AncReferralRow[]> {
  await requirePermission((await getActorProfile()).role, 'pcpndt:record')
  const supabase = await createClient()
  let q = supabase
    .from('anc_referrals_out')
    .select('id, patient_name, referred_on, referred_to_doctor, referred_to_institution, reason')
    .order('referred_on', { ascending: false }).limit(300)
  if (month) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    q = q.gte('referred_on', start).lt('referred_on', end)
  }
  const { data, error } = await q
  if (error) { console.error('[listAncReferrals]', error.message); return [] }
  return (data ?? []) as AncReferralRow[]
}

/**
 * Record that an antenatal patient was sent elsewhere.
 *
 * The form asks for the doctor AND the institution, and for the qualification
 * of whoever referred her — "sent to a bigger hospital" is not a record of
 * anything, and a referral that cannot be traced is the gap the register
 * exists to close.
 */
export async function addAncReferral(input: {
  patient_id: string
  referred_on: string
  referred_to_doctor: string
  referred_to_institution: string
  referred_to_address?: string | null
  reason: string
  referred_by_name?: string | null
  referred_by_qualification?: string | null
  op_no?: string | null
  ip_no?: string | null
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:record')

  if (!input.referred_to_institution.trim()) {
    return { success: false, error: 'Which hospital or centre was she referred to?' }
  }
  if (!input.reason.trim()) return { success: false, error: 'Why was she referred?' }

  const supabase = await createClient()
  const [{ data: patient }, { data: anc }] = await Promise.all([
    supabase.from('patients')
      .select('full_name, relation_name, address, phone').eq('id', input.patient_id).maybeSingle(),
    supabase.from('anc_records')
      .select('id, gravida, para, living, abortions')
      .eq('patient_id', input.patient_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const { error } = await supabase.from('anc_referrals_out').insert({
    tenant_id: actor.tenant_id,
    patient_id: input.patient_id,
    anc_id: anc?.id ?? null,
    patient_name: patient?.full_name ?? null,
    relation_name: patient?.relation_name ?? null,
    address_text: patient?.address ?? null,
    contact_no: patient?.phone ?? null,
    gravida: anc?.gravida ?? null,
    para: anc?.para ?? null,
    living: anc?.living ?? null,
    abortions: anc?.abortions ?? null,
    op_no: input.op_no ?? null,
    ip_no: input.ip_no ?? null,
    referred_on: input.referred_on,
    referred_to_doctor: input.referred_to_doctor.trim() || null,
    referred_to_institution: input.referred_to_institution.trim(),
    referred_to_address: input.referred_to_address ?? null,
    reason: input.reason.trim(),
    // getActorProfile carries id, role and tenant only — the referring
    // doctor's name is asked for on the form rather than guessed from the
    // session, since the person typing is often not the person referring.
    referred_by_name: input.referred_by_name ?? null,
    referred_by_qualification: input.referred_by_qualification ?? null,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'anc_referral', input.patient_id, {
    to: input.referred_to_institution,
  })
  revalidatePath('/pcpndt/returns')
  return { success: true }
}

/**
 * Full Form F rows for Report II, which is a register rather than a summary —
 * one line per scan, so it runs to several pages in a busy month.
 *
 * Completed forms only. A draft is not something to put in front of an
 * Appropriate Authority.
 */
export async function listFormFForReturn(month: string): Promise<Record<string, unknown>[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:report')
  const supabase = await createClient()
  const start = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('form_f_records').select('*')
    .eq('status', 'complete')
    .gte('procedure_date', start).lt('procedure_date', end)
    .order('procedure_date').order('serial_no')
  if (error) { console.error('[listFormFForReturn]', error.message); return [] }
  await logAudit(actor.id, 'read', 'form_f_return', month, { rows: (data ?? []).length })
  return (data ?? []) as Record<string, unknown>[]
}

/** Full MTP rows for Report IV, same shape of thing. */
export async function listMtpForReturn(month: string): Promise<Record<string, unknown>[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pcpndt:report')
  const supabase = await createClient()
  const start = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('mtp_records').select('*')
    .eq('status', 'complete')
    .gte('procedure_date', start).lt('procedure_date', end)
    .order('procedure_date').order('serial_no')
  if (error) { console.error('[listMtpForReturn]', error.message); return [] }
  await logAudit(actor.id, 'read', 'mtp_return', month, { rows: (data ?? []).length })
  return (data ?? []) as Record<string, unknown>[]
}
