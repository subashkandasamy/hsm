'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { revalidatePath } from 'next/cache'
import type { Permission } from '@/lib/types'

/**
 * Referral letters.
 *
 * A patient leaving to be treated somewhere else takes a letter, and the
 * receiving doctor treats them on the strength of it. That is the whole
 * purpose: not a record for us, a handover to a stranger.
 *
 * Which is why the letter is pre-filled from wherever the patient already is.
 * A doctor writing a referral at the end of a long round will type the reason
 * and the destination and nothing else; if the diagnosis and the treatment
 * given are not already on the page, they will not appear on the letter, and
 * the receiving hospital starts from nothing.
 *
 * Not gated or locked, unlike Form F and the accident register. This is a
 * clinical letter, not evidence — nobody files it with an authority and nobody
 * is prosecuted over its contents.
 */

type SimpleResult = { success: true } | { success: false; error: string }

export type ReferralSource = 'opd' | 'ipd' | 'emergency' | 'other'

export interface ReferralDraft {
  patient_id: string
  patient_name: string | null
  patient_age: number | null
  patient_sex: string | null
  address_text: string | null
  contact_no: string | null
  mr_no: string | null
  op_no: string | null
  ip_no: string | null
  doa: string | null
  diagnosis: string | null
  investigations_done: string | null
  treatment_given: string | null
  vitals_text: string | null
  referred_by_name: string | null
  source: ReferralSource
}

export interface ReferralRow {
  id: string
  ref_no: string
  source: string
  patient_name: string | null
  referred_at: string
  to_doctor: string | null
  to_institution: string | null
  reason: string | null
  referred_by_name: string | null
}

/** Which permission may write a referral from each context. */
const WRITE_PERMISSION: Record<ReferralSource, Permission> = {
  opd: 'opd:write',
  ipd: 'ipd:write',
  emergency: 'emergency:triage',
  other: 'patients:write',
}

function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))
}

function vitalsLine(v: Record<string, unknown> | null | undefined): string | null {
  if (!v) return null
  const parts: string[] = []
  const put = (label: string, key: string, unit = '') => {
    const val = v[key]
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      parts.push(`${label} ${String(val)}${unit}`)
    }
  }
  put('BP', 'bp'); put('Pulse', 'pulse'); put('Temp', 'temp')
  put('SpO₂', 'spo2', '%'); put('RR', 'rr'); put('Weight', 'weight', ' kg')
  return parts.length ? parts.join(', ') : null
}

/**
 * Everything the letter can be filled in with before anyone types a word.
 *
 * Read-only, and deliberately so: the modal shows what it found and lets the
 * doctor correct it. Pre-filling a clinical letter silently is how a wrong
 * diagnosis ends up on somebody else's chart.
 */
export async function prepareReferral(input: {
  patient_id: string
  visit_id?: string | null
  admission_id?: string | null
  emergency_case_id?: string | null
}): Promise<ReferralDraft | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:read')

  const supabase = await createClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id, full_name, uhid, dob, gender, phone, address, district, state, pincode')
    .eq('id', input.patient_id).maybeSingle()
  if (!patient) return null

  const { data: me } = await supabase
    .from('profiles').select('full_name').eq('id', actor.id).maybeSingle()

  const source: ReferralSource =
    input.admission_id ? 'ipd'
    : input.emergency_case_id ? 'emergency'
    : input.visit_id ? 'opd'
    : 'other'

  const draft: ReferralDraft = {
    patient_id: patient.id as string,
    patient_name: patient.full_name as string,
    patient_age: ageFrom(patient.dob as string | null),
    patient_sex: (patient.gender as string | null) ?? null,
    address_text: [patient.address, patient.district, patient.state, patient.pincode]
      .filter(Boolean).join(', ') || null,
    // A provisional patient carries a placeholder phone, which is worse than
    // none on a letter somebody may try to ring.
    contact_no: typeof patient.phone === 'string' && !patient.phone.startsWith('PROV-')
      ? patient.phone : null,
    mr_no: (patient.uhid as string | null) ?? null,
    op_no: null, ip_no: null, doa: null,
    diagnosis: null, investigations_done: null, treatment_given: null, vitals_text: null,
    referred_by_name: (me?.full_name as string | undefined) ?? null,
    source,
  }

  // ── From an admission ────────────────────────────────────────────────────
  if (input.admission_id) {
    const { data: adm } = await supabase
      .from('admissions')
      .select('ip_no, admitted_at, reason, discharge_summary, source_visit_id')
      .eq('id', input.admission_id).maybeSingle()
    if (adm) {
      draft.ip_no = (adm.ip_no as string | null) ?? null
      draft.doa = (adm.admitted_at as string | null) ?? null
      // The admission reason is the working diagnosis until a discharge
      // summary exists, and the summary is the better answer once it does.
      draft.diagnosis = (adm.discharge_summary as string | null)?.trim()
        || (adm.reason as string | null) || null
    }

    // What has actually been done to them on the ward. This is the paragraph
    // the receiving doctor reads first, and the one a tired registrar is least
    // likely to type out again.
    const [{ data: meds }, { data: notes }] = await Promise.all([
      // ipd_medication_orders, not "ipd_medications" — and it carries fluids
      // and oxygen as well as drugs, which is why the line is assembled from
      // whichever of the name columns is populated rather than from drug_name
      // alone. A patient referred on a noradrenaline infusion whose letter
      // says nothing about it is the worst version of this feature.
      supabase.from('ipd_medication_orders')
        .select('type, drug_name, dose, dose_unit, route, fluid_name, volume_ml, rate_ml_per_hr, flow_rate_lpm, frequency_type, frequency_hours, status')
        .eq('admission_id', input.admission_id)
        .eq('status', 'active')
        .order('created_at').limit(40),
      supabase.from('ipd_progress_notes')
        .select('note, vitals, created_at')
        .eq('admission_id', input.admission_id)
        .order('created_at', { ascending: false }).limit(1),
    ])
    type Med = {
      type: string | null; drug_name: string | null; dose: number | string | null
      dose_unit: string | null; route: string | null; fluid_name: string | null
      volume_ml: number | null; rate_ml_per_hr: number | null; flow_rate_lpm: number | null
      frequency_type: string | null; frequency_hours: number | null
    }
    const lines = ((meds ?? []) as Med[]).map((m) => {
      const name = m.drug_name || m.fluid_name
        || (m.type === 'oxygen' ? 'Oxygen' : null)
      if (!name) return ''
      const bits: string[] = [name]
      if (m.dose) bits.push(`${m.dose}${m.dose_unit ? ' ' + m.dose_unit : ''}`)
      if (m.volume_ml) bits.push(`${m.volume_ml} ml`)
      if (m.rate_ml_per_hr) bits.push(`@ ${m.rate_ml_per_hr} ml/hr`)
      if (m.flow_rate_lpm) bits.push(`@ ${m.flow_rate_lpm} L/min`)
      if (m.route) bits.push(m.route.toUpperCase())
      // The ward's own vocabulary, written out as a doctor reading the letter
      // would say it. 'every_x_hours' is the only one that needs the number.
      const FREQ: Record<string, string> = {
        stat: 'STAT', daily: 'once daily', twice_daily: 'twice daily',
        thrice_daily: 'three times daily', sos: 'SOS',
        // Oxygen runs continuously but is not an infusion, and a letter that
        // calls it one reads as though nobody checked it.
        continuous: m.type === 'oxygen' ? 'continuous' : 'continuous infusion',
      }
      if (m.frequency_type === 'every_x_hours') {
        bits.push(m.frequency_hours ? `every ${m.frequency_hours} hours` : 'at fixed intervals')
      } else if (m.frequency_type) {
        bits.push(FREQ[m.frequency_type] ?? m.frequency_type.replace(/_/g, ' '))
      }
      return bits.join(' ')
    }).filter(Boolean)
    if (lines.length) draft.treatment_given = lines.join('\n')

    const last = (notes ?? [])[0] as { vitals?: Record<string, unknown> | null } | undefined
    draft.vitals_text = vitalsLine(last?.vitals)
  }

  // ── From a casualty case ─────────────────────────────────────────────────
  let erVisitId: string | null = null
  if (input.emergency_case_id) {
    const { data: ec } = await supabase
      .from('emergency_cases')
      .select('patient_id, complaint, arrived_at').eq('id', input.emergency_case_id).maybeSingle()
    if (ec) {
      draft.doa = (ec.arrived_at as string | null) ?? null
      // The triage complaint, until the consultation says something better.
      draft.diagnosis = (ec.complaint as string | null) ?? null

      // A casualty case that has been consulted has an emergency visit behind
      // it, carrying the diagnosis, the vitals, the prescription and the tests
      // ordered. Without this the letter from casualty said only what the desk
      // typed at triage — which is the one department where the patient is
      // least likely to be able to fill the gaps themselves.
      const since = new Date(new Date(ec.arrived_at as string).getTime() - 5 * 60_000).toISOString()
      const { data: v } = await supabase
        .from('visits').select('id')
        .eq('patient_id', ec.patient_id).eq('type', 'emergency')
        .gte('created_at', since)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      erVisitId = (v?.id as string | undefined) ?? null
    }
  }

  // ── From a consultation ──────────────────────────────────────────────────
  const visitId = input.visit_id ?? erVisitId
  if (visitId) {
    const { data: visit } = await supabase
      .from('visits')
      .select('diagnosis, complaint, notes, vitals, visit_date')
      .eq('id', visitId).maybeSingle()
    if (visit) {
      // The doctor's diagnosis outranks whatever triage typed, which is why
      // this overwrites rather than falls back. An admission reason still
      // wins over both, because by then somebody has reviewed it.
      draft.diagnosis = (visit.diagnosis as string | null)
        || draft.diagnosis || (visit.complaint as string | null) || null
      draft.vitals_text = draft.vitals_text
        || vitalsLine(visit.vitals as Record<string, unknown> | null)
      if (!draft.doa) draft.doa = (visit.visit_date as string | null) ?? null
    }
    const { data: rx } = await supabase
      .from('prescriptions')
      // 'dosage', not 'dose' — the ward table spells it the other way, and
      // asking for the wrong one here returned an error the caller could not
      // see, so the letter simply arrived with no treatment on it.
      .select('drug_name, dosage, frequency, duration').eq('visit_id', visitId).limit(30)
    type Rx = { drug_name: string | null; dosage: string | null; frequency: string | null; duration: string | null }
    const lines = ((rx ?? []) as Rx[])
      .map((r) => [r.drug_name, r.dosage, r.frequency, r.duration].filter(Boolean).join(' '))
      .filter(Boolean)
    if (lines.length && !draft.treatment_given) draft.treatment_given = lines.join('\n')
  }

  // Investigations already done, from whichever context we have. The receiving
  // hospital repeating a CT the patient had two hours ago is both the cost and
  // the radiation dose this one line prevents.
  if (visitId) {
    const [{ data: labs }, { data: rads }] = await Promise.all([
      supabase.from('lab_orders')
        .select('items:lab_order_items(test:lab_tests_catalog(name))')
        .eq('visit_id', visitId).neq('status', 'cancelled'),
      supabase.from('radiology_orders')
        .select('test:radiology_catalog(name)')
        .eq('visit_id', visitId).neq('status', 'cancelled'),
    ])
    const done: string[] = []
    for (const o of (labs ?? []) as unknown as Array<{ items: Array<{ test: { name: string } | null }> }>) {
      for (const it of o.items ?? []) if (it.test?.name) done.push(it.test.name)
    }
    for (const o of (rads ?? []) as unknown as Array<{ test: { name: string } | null }>) {
      if (o.test?.name) done.push(o.test.name)
    }
    if (done.length) draft.investigations_done = [...new Set(done)].join(', ')
  }

  return draft
}

export async function createReferral(input: {
  patient_id: string
  visit_id?: string | null
  admission_id?: string | null
  emergency_case_id?: string | null
  source: ReferralSource

  patient_name?: string | null
  patient_age?: number | null
  patient_sex?: string | null
  address_text?: string | null
  contact_no?: string | null
  mr_no?: string | null
  op_no?: string | null
  ip_no?: string | null
  doa?: string | null

  diagnosis?: string | null
  investigations_done?: string | null
  treatment_given?: string | null
  condition_at_referral?: string | null
  vitals_text?: string | null
  reason: string

  to_doctor?: string | null
  to_institution?: string | null
  to_department?: string | null
  to_address?: string | null

  transport?: string | null
  accompanied_by?: string | null
  transport_note?: string | null

  referred_by_name?: string | null
  referred_by_qualification?: string | null
  referred_by_reg_no?: string | null
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, WRITE_PERMISSION[input.source] ?? 'patients:write')

  if (!input.reason?.trim()) {
    return { success: false, error: 'Say why the patient is being referred — it is the first thing the receiving doctor reads' }
  }
  if (!input.to_institution?.trim() && !input.to_doctor?.trim()) {
    return { success: false, error: 'Name the hospital or the doctor the patient is going to' }
  }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const insertReferral = (refNo: string) => supabase.from('referrals_out').insert({
    id,
    tenant_id: actor.tenant_id,
    ref_no: refNo,
    patient_id: input.patient_id,
    visit_id: input.visit_id ?? null,
    admission_id: input.admission_id ?? null,
    emergency_case_id: input.emergency_case_id ?? null,
    source: input.source,

    patient_name: input.patient_name ?? null,
    patient_age: input.patient_age ?? null,
    patient_sex: input.patient_sex ?? null,
    address_text: input.address_text ?? null,
    contact_no: input.contact_no ?? null,
    mr_no: input.mr_no ?? null,
    op_no: input.op_no ?? null,
    ip_no: input.ip_no ?? null,
    doa: input.doa ?? null,

    diagnosis: input.diagnosis ?? null,
    investigations_done: input.investigations_done ?? null,
    treatment_given: input.treatment_given ?? null,
    condition_at_referral: input.condition_at_referral ?? null,
    vitals_text: input.vitals_text ?? null,
    reason: input.reason.trim(),

    to_doctor: input.to_doctor?.trim() || null,
    to_institution: input.to_institution?.trim() || null,
    to_department: input.to_department?.trim() || null,
    to_address: input.to_address?.trim() || null,

    transport: input.transport || null,
    accompanied_by: input.accompanied_by?.trim() || null,
    transport_note: input.transport_note?.trim() || null,

    referred_by_id: actor.id,
    referred_by_name: input.referred_by_name?.trim() || null,
    referred_by_qualification: input.referred_by_qualification?.trim() || null,
    referred_by_reg_no: input.referred_by_reg_no?.trim() || null,

    created_by: actor.id,
  })

  // The counter can sit behind numbers already used (BUG-058: the letter failed
  // with "duplicate key … referrals_out_ref_no_key"). A taken number is skipped —
  // the next one is drawn — rather than the doctor being told to click again.
  let refNo: string | null = null
  let error: { message: string; code?: string } | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: n, error: serialErr } = await supabase.rpc('get_next_referral_no')
    if (serialErr || !n) return { success: false, error: 'Could not allocate a referral number' }
    refNo = n as string
    ;({ error } = await insertReferral(refNo))
    if (!error || error.code !== '23505' || !/ref_no/.test(error.message)) break
  }
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'refer_out', 'referral', id, {
    ref_no: refNo, to: input.to_institution ?? input.to_doctor, source: input.source,
  })
  revalidatePath('/emergency')
  if (input.admission_id) revalidatePath(`/ipd/${input.admission_id}`)
  return { success: true, id }
}

/**
 * Which casualty cases already have a letter, and which letter.
 *
 * The board needs this to offer a reprint. A referral written in casualty was
 * otherwise printable only in the seconds after it was written — and casualty
 * is where a letter is most likely to leave without the patient, or leave with
 * them and never reach the file.
 */
export async function listCaseReferrals(
  caseIds: string[],
): Promise<Record<string, { id: string; ref_no: string }>> {
  if (caseIds.length === 0) return {}
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:read')

  const supabase = await createClient()
  const { data } = await supabase
    .from('referrals_out')
    .select('id, ref_no, emergency_case_id, referred_at')
    .in('emergency_case_id', caseIds)
    .order('referred_at', { ascending: false })

  const out: Record<string, { id: string; ref_no: string }> = {}
  for (const r of (data ?? []) as Array<{ id: string; ref_no: string; emergency_case_id: string }>) {
    // Newest first, so the first one seen for a case is the one to offer.
    if (!out[r.emergency_case_id]) out[r.emergency_case_id] = { id: r.id, ref_no: r.ref_no }
  }
  return out
}

/**
 * Correct a letter that has already been written.
 *
 * In place, keeping its own reference number. The alternative — a second
 * letter for the same referral — leaves two numbers for one patient going to
 * one hospital and nobody able to say which they are holding.
 *
 * Not restricted once printed. The receiving doctor treats the patient on the
 * sheet in their hand, and a doctor who realises the diagnosis was wrong must
 * be able to correct it. What the reprint then does is say so.
 */
export async function updateReferral(
  id: string,
  patch: {
    diagnosis?: string | null
    investigations_done?: string | null
    treatment_given?: string | null
    condition_at_referral?: string | null
    vitals_text?: string | null
    reason: string
    to_doctor?: string | null
    to_institution?: string | null
    to_department?: string | null
    to_address?: string | null
    transport?: string | null
    accompanied_by?: string | null
    transport_note?: string | null
    referred_by_name?: string | null
    referred_by_qualification?: string | null
    referred_by_reg_no?: string | null
  },
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:write')

  if (!patch.reason?.trim()) {
    return { success: false, error: 'Say why the patient is being referred' }
  }
  if (!patch.to_institution?.trim() && !patch.to_doctor?.trim()) {
    return { success: false, error: 'Name the hospital or the doctor the patient is going to' }
  }

  const supabase = await createClient()
  const { data: before } = await supabase
    .from('referrals_out').select('ref_no, first_printed_at').eq('id', id).maybeSingle()
  if (!before) return { success: false, error: 'That letter no longer exists' }

  const { error } = await supabase.from('referrals_out').update({
    diagnosis: patch.diagnosis || null,
    investigations_done: patch.investigations_done || null,
    treatment_given: patch.treatment_given || null,
    condition_at_referral: patch.condition_at_referral || null,
    vitals_text: patch.vitals_text || null,
    reason: patch.reason.trim(),
    to_doctor: patch.to_doctor?.trim() || null,
    to_institution: patch.to_institution?.trim() || null,
    to_department: patch.to_department?.trim() || null,
    to_address: patch.to_address?.trim() || null,
    transport: patch.transport || null,
    accompanied_by: patch.accompanied_by?.trim() || null,
    transport_note: patch.transport_note?.trim() || null,
    referred_by_name: patch.referred_by_name?.trim() || null,
    referred_by_qualification: patch.referred_by_qualification?.trim() || null,
    referred_by_reg_no: patch.referred_by_reg_no?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { success: false, error: error.message }

  // Worth noting in the audit whether a copy was already out, because that is
  // the edit somebody may later ask about.
  await logAudit(actor.id, 'update', 'referral', id, {
    ref_no: before.ref_no, after_printing: !!before.first_printed_at,
  })
  revalidatePath('/emergency')
  return { success: true }
}

/**
 * Note that a copy has left the building.
 *
 * Stamped by the print route the first time only, so a later edit can say
 * when the copy it supersedes was issued. Reprints do not move it.
 */
export async function markReferralPrinted(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('referrals_out')
    .update({ first_printed_at: new Date().toISOString() })
    .eq('id', id).is('first_printed_at', null)
}

export async function getReferral(id: string): Promise<Record<string, unknown> | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:read')
  const supabase = await createClient()
  const { data } = await supabase.from('referrals_out').select('*').eq('id', id).maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

/**
 * Letters already written for this patient, newest first.
 *
 * Scoped by context where one is given, so an admission's panel shows the
 * letter raised on that admission rather than one from a visit two years ago.
 */
export async function listReferrals(scope: {
  patient_id?: string | null
  admission_id?: string | null
  visit_id?: string | null
  emergency_case_id?: string | null
  limit?: number
} = {}): Promise<ReferralRow[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'patients:read')

  const supabase = await createClient()
  let q = supabase
    .from('referrals_out')
    .select('id, ref_no, source, patient_name, referred_at, to_doctor, to_institution, reason, referred_by_name')
    .order('referred_at', { ascending: false })
    .limit(scope.limit ?? 50)

  if (scope.admission_id) q = q.eq('admission_id', scope.admission_id)
  else if (scope.emergency_case_id) q = q.eq('emergency_case_id', scope.emergency_case_id)
  else if (scope.visit_id) q = q.eq('visit_id', scope.visit_id)
  else if (scope.patient_id) q = q.eq('patient_id', scope.patient_id)

  const { data } = await q
  return (data ?? []) as ReferralRow[]
}
