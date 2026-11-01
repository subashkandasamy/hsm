'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { revalidatePath } from 'next/cache'

/**
 * The accident register — the hospital's medico-legal case record.
 *
 * Three things shape this file.
 *
 * It is evidence. Everything describing the patient is COPIED onto the record
 * when it is started, never joined live, because the entry may be produced in
 * court years later and must say what was true on the night they were brought
 * in. Once signed it is locked, and a correction is an amendment that keeps
 * both versions.
 *
 * Informing the police is an event, not a flag. Each intimation is its own row
 * with its own timestamp, because it genuinely happens more than once — on
 * arrival, again if the patient dies, again when jurisdiction moves — and each
 * is a separate discharge of a statutory duty under BNSS 2023 section 397.
 *
 * Nothing is transmitted anywhere. Tamil Nadu's digital route (MedLEaPR via
 * CCTNS 2.0) covers government hospitals only; a private hospital still hands
 * over paper. So a row here means a printed copy was given to a named officer
 * at a recorded time, which is what the hospital has to be able to prove.
 *
 * Reads are audited as well as writes, as they are for Form F. An accident
 * register holds the names of assault and sexual-assault victims; if it ever
 * leaks, the first question is who opened it, and only a read log answers.
 */

type SimpleResult = { success: true } | { success: false; error: string }

export interface MlcOption {
  kind: string
  code: string
  ordinal: number
  label: string
  group_label: string | null
}

export interface MlcListRow {
  id: string
  ar_no: string
  status: string
  patient_name: string | null
  patient_id: string | null
  arrived_at: string | null
  mlc_types: string[] | null
  injury_grade: string | null
  examined_by_name: string | null
  amends_id: string | null
  intimation_count: number
}

export interface PoliceIntimation {
  id: string
  station_name: string
  officer_name: string | null
  officer_rank: string | null
  officer_phone: string | null
  method: string
  intimated_at: string
  intimated_by_name: string | null
  acknowledgement_ref: string | null
  notes: string | null
}

export interface MlcPendingRow {
  emergency_case_id: string
  mlc_id: string | null
  ar_no: string | null
  patient_name: string | null
  arrived_at: string
  mlc_status: 'none' | 'draft' | 'complete'
  intimation_count: number
  first_intimated_at: string | null
  hours_since_arrival: number
}

// ── The categories ──────────────────────────────────────────────────────────

/**
 * The list of what makes a case medico-legal, and the vocabulary for an injury.
 *
 * Shared by every tenant and never edited by a hospital. The commonest failure
 * in a casualty is not a badly filled form — it is nobody realising the case
 * was medico-legal at all, so the list is the prompt.
 */
export async function listMlcOptions(): Promise<MlcOption[]> {
  // Gated even though it is only the dropdown vocabulary: it is read beside
  // the register itself, and leaving one door open in a module is how the
  // next reader concludes the module is open (F-65).
  await requirePermission((await getActorProfile()).role, 'emergency:read')

  const supabase = await createClient()
  const { data } = await supabase
    .from('mlc_options')
    .select('kind, code, ordinal, label, group_label')
    .order('kind').order('ordinal')
  return (data ?? []) as MlcOption[]
}

// ── Flagging a case ─────────────────────────────────────────────────────────

/**
 * Mark a casualty case medico-legal, or unmark it.
 *
 * Deliberately separate from filling the register. The decision is made in the
 * first thirty seconds by whoever is at the desk; the paperwork is done later
 * by the doctor who examined the patient. Forcing them to happen together
 * would mean one of them does not happen at all.
 *
 * Unmarking is allowed only while nothing has been recorded. Once there is an
 * entry the flag is no longer an opinion about the case — it is the reason a
 * register entry exists.
 */
export async function setCaseMlc(caseId: string, isMlc: boolean): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  const supabase = await createClient()

  if (!isMlc) {
    const { count } = await supabase
      .from('mlc_records')
      .select('id', { count: 'exact', head: true })
      .eq('emergency_case_id', caseId)
      .neq('status', 'amended')
    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: 'This case already has a register entry. It cannot be un-marked — delete the draft entry first, or amend it if it is signed.',
      }
    }
  }

  const { error } = await supabase
    .from('emergency_cases').update({ is_mlc: isMlc }).eq('id', caseId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, isMlc ? 'flag_mlc' : 'unflag_mlc', 'emergency_case', caseId, {})
  revalidatePath('/emergency')
  return { success: true }
}

/**
 * Open medico-legal cases with no completed entry, and how long the police
 * have been uninformed.
 *
 * The board reads this. It is the difference between a duty the hospital knows
 * it owes and one it discovers at a hearing.
 */
export async function listMlcPending(): Promise<MlcPendingRow[]> {
  // The accident register's pending queue — patient names and the reason they
  // are medico-legal. Every caller (the ER board and the MLC register) now
  // requires this permission at the page too, so throwing here is safe (F-65).
  await requirePermission((await getActorProfile()).role, 'emergency:read')

  const supabase = await createClient()
  const { data } = await supabase.rpc('get_mlc_pending')
  return (data ?? []) as MlcPendingRow[]
}

// ── Starting an entry ───────────────────────────────────────────────────────

/**
 * Start the register entry, snapshotting the patient.
 *
 * Works from a casualty case or from a patient alone, because a medico-legal
 * case does not only arrive through the emergency door: an assault discovered
 * during an admission, or a poisoning that walked into OPD, is still an
 * accident register entry.
 */
export async function startMlc(input: {
  patient_id: string
  emergency_case_id?: string | null
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  const supabase = await createClient()

  // One entry per casualty case. The database enforces this too, but a clear
  // message beats a unique-violation, and returning the existing id means a
  // second click opens the entry rather than failing.
  if (input.emergency_case_id) {
    const { data: existing } = await supabase
      .from('mlc_records').select('id')
      .eq('emergency_case_id', input.emergency_case_id)
      .neq('status', 'amended')
      .maybeSingle()
    if (existing?.id) return { success: true, id: existing.id as string }
  }

  const [{ data: patient }, { data: ec }] = await Promise.all([
    supabase.from('patients')
      .select('id, full_name, uhid, dob, gender, phone, address, district, state, pincode')
      .eq('id', input.patient_id).maybeSingle(),
    input.emergency_case_id
      ? supabase.from('emergency_cases')
          .select('arrival_mode, complaint, arrived_at').eq('id', input.emergency_case_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!patient) return { success: false, error: 'That patient no longer exists' }

  const { data: arNo, error: serialErr } = await supabase.rpc('get_next_mlc_no')
  if (serialErr || !arNo) return { success: false, error: 'Could not allocate an accident register number' }

  const age = patient.dob
    ? Math.floor((Date.now() - new Date(patient.dob as string).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null

  const address = [patient.address, patient.district, patient.state, patient.pincode]
    .filter(Boolean).join(', ') || null

  // An ambulance arrival is a hint about who brought them, never an answer —
  // the gate rejects "108" on its own, so this is left for a person to fill.
  const id = crypto.randomUUID()
  const { error } = await supabase.from('mlc_records').insert({
    id,
    tenant_id: actor.tenant_id,
    ar_no: arNo as string,
    status: 'draft',
    emergency_case_id: input.emergency_case_id ?? null,
    patient_id: patient.id,
    patient_name: patient.full_name,
    patient_age: age,
    patient_sex: patient.gender ?? null,
    patient_address: address,
    mr_no: patient.uhid ?? null,
    // The complaint is the nearest thing to an alleged cause already recorded,
    // and a casualty nurse should not retype it. It stays editable — "RTA" in
    // triage is not the same document as the informant's own words.
    alleged_cause: (ec as { complaint?: string | null } | null)?.complaint ?? null,
    arrived_at: (ec as { arrived_at?: string | null } | null)?.arrived_at ?? new Date().toISOString(),
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  // Starting an entry means the case is medico-legal, whatever the desk ticked.
  if (input.emergency_case_id) {
    await supabase.from('emergency_cases').update({ is_mlc: true }).eq('id', input.emergency_case_id)
  }

  await logAudit(actor.id, 'create', 'mlc_record', id, {
    ar_no: arNo, emergency_case_id: input.emergency_case_id ?? null,
  })
  revalidatePath('/emergency')
  return { success: true, id }
}

export async function saveMlcDraft(id: string, patch: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  const supabase = await createClient()
  // The database refuses to edit a completed record. Checking here lets the
  // message be about the register rather than about a trigger.
  const { data: cur } = await supabase
    .from('mlc_records').select('status, ar_no').eq('id', id).maybeSingle()
  if (!cur) return { success: false, error: 'That register entry no longer exists' }
  if (cur.status !== 'draft') {
    return { success: false, error: `${cur.ar_no} is already signed — raise an amendment instead` }
  }

  const { error } = await supabase.from('mlc_records').update(patch).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/emergency/mlc')
  return { success: true }
}

/**
 * Sign it off.
 *
 * Needs emergency:triage rather than emergency:register — a receptionist can
 * open the entry and fill in who brought the patient, but the opinion on
 * whether an injury is grievous is a doctor's, and so is the signature.
 *
 * The database decides whether it may be completed and says what is missing.
 * This does not second-guess it; duplicating the rule in two places is how the
 * two drift apart.
 */
export async function completeMlc(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const { error } = await supabase
    .from('mlc_records')
    .update({ status: 'complete', completed_by: actor.id })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'complete', 'mlc_record', id, {})
  revalidatePath('/emergency/mlc')
  revalidatePath('/emergency')
  return { success: true }
}

/**
 * Correct a signed entry.
 *
 * Never an edit. A new entry is created carrying everything the original said,
 * pointing back at it and stating why, and the original is marked superseded
 * rather than changed.
 *
 * This matters more here than anywhere else in the product, because a copy of
 * the original is already sitting in a police station. A register that can be
 * quietly brought into line with a later opinion is worthless as evidence —
 * and a doctor revising "simple" to "grievous" after an X-ray is doing
 * something entirely proper, which the record should show rather than hide.
 */
export async function amendMlc(
  id: string, reason: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  if (!reason.trim()) {
    return { success: false, error: 'Say why this is being amended — a correction without a reason looks like tampering' }
  }

  const supabase = await createClient()
  const { data: original } = await supabase
    .from('mlc_records').select('*').eq('id', id).maybeSingle()
  if (!original) return { success: false, error: 'That register entry no longer exists' }
  if (original.status !== 'complete') {
    return { success: false, error: 'Only a signed entry is amended. This one is still a draft — edit it.' }
  }

  const { data: arNo, error: serialErr } = await supabase.rpc('get_next_mlc_no')
  if (serialErr || !arNo) return { success: false, error: 'Could not allocate an accident register number' }

  const copy = { ...(original as Record<string, unknown>) }
  for (const k of ['id', 'ar_no', 'status', 'amends_id', 'amend_reason',
                   'created_at', 'created_by', 'completed_at', 'completed_by']) {
    delete copy[k]
  }

  const newId = crypto.randomUUID()
  const { error: insErr } = await supabase.from('mlc_records').insert({
    ...copy,
    id: newId,
    ar_no: arNo as string,
    status: 'draft',
    amends_id: id,
    amend_reason: reason.trim(),
    created_by: actor.id,
  })
  if (insErr) return { success: false, error: insErr.message }

  // Only now is the original superseded — if the copy failed, nothing moved.
  const { error: supErr } = await supabase
    .from('mlc_records').update({ status: 'amended' }).eq('id', id)
  if (supErr) {
    await supabase.from('mlc_records').delete().eq('id', newId)
    return { success: false, error: supErr.message }
  }

  // The intimations belong to the case, not to the sheet, so the amendment
  // inherits them: the police were informed, and that does not un-happen
  // because the injury was regraded.
  const { data: priors } = await supabase
    .from('mlc_police_intimations').select('*').eq('mlc_id', id)
  if (priors?.length) {
    await supabase.from('mlc_police_intimations').insert(
      priors.map((p) => {
        const row = { ...(p as Record<string, unknown>) }
        delete row.id
        delete row.created_at
        return { ...row, mlc_id: newId }
      }),
    )
  }

  await logAudit(actor.id, 'amend', 'mlc_record', newId, { amends: id, reason: reason.trim() })
  revalidatePath('/emergency/mlc')
  return { success: true, id: newId }
}

/**
 * Discard a draft entry.
 *
 * Only a draft, and the database enforces that too. A signed entry is part of
 * the register and a gap in the serials is a question nobody wants put to them
 * on a witness stand.
 */
export async function deleteMlcDraft(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:triage')

  const supabase = await createClient()
  const { error } = await supabase.from('mlc_records').delete().eq('id', id).eq('status', 'draft')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete_draft', 'mlc_record', id, {})
  revalidatePath('/emergency/mlc')
  revalidatePath('/emergency')
  return { success: true }
}

// ── Informing the police ────────────────────────────────────────────────────

/**
 * Record that the police were informed.
 *
 * Nothing is sent. This says a printed intimation was handed over, or a call
 * was made, naming the station and the officer and the time — and it cannot be
 * rewritten afterwards, because it is the hospital's own proof that it
 * discharged the duty.
 */
export async function addPoliceIntimation(input: {
  mlc_id: string
  station_name: string
  officer_name?: string | null
  officer_rank?: string | null
  officer_phone?: string | null
  method: 'in_person' | 'telephone' | 'written' | 'other'
  intimated_at?: string | null
  notes?: string | null
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  if (!input.station_name?.trim()) {
    return { success: false, error: 'Name the police station that was informed' }
  }

  const supabase = await createClient()
  const { data: who } = await supabase
    .from('profiles').select('full_name').eq('id', actor.id).maybeSingle()

  const { error } = await supabase.from('mlc_police_intimations').insert({
    tenant_id: actor.tenant_id,
    mlc_id: input.mlc_id,
    station_name: input.station_name.trim(),
    officer_name: input.officer_name?.trim() || null,
    officer_rank: input.officer_rank?.trim() || null,
    officer_phone: input.officer_phone?.trim() || null,
    method: input.method,
    // Backdating is allowed, because a 2am telephone call gets written up at
    // 9am and the record should say 2am. It is audited either way.
    intimated_at: input.intimated_at || new Date().toISOString(),
    intimated_by: actor.id,
    intimated_by_name: (who?.full_name as string | undefined) ?? null,
    notes: input.notes?.trim() || null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'police_intimation', 'mlc_record', input.mlc_id, {
    station: input.station_name.trim(), method: input.method,
    intimated_at: input.intimated_at ?? null,
  })
  revalidatePath('/emergency/mlc')
  revalidatePath('/emergency')
  return { success: true }
}

/**
 * Add the police acknowledgement that arrived later — a GD entry or an FIR
 * number, typically the next morning. The only part of an intimation that can
 * be written after the fact.
 */
export async function setIntimationAcknowledgement(
  intimationId: string, ref: string,
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:register')

  const supabase = await createClient()
  const { error } = await supabase
    .from('mlc_police_intimations')
    .update({ acknowledgement_ref: ref.trim() || null })
    .eq('id', intimationId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'police_acknowledgement', 'mlc_intimation', intimationId, { ref: ref.trim() })
  revalidatePath('/emergency/mlc')
  return { success: true }
}

export async function listPoliceIntimations(mlcId: string): Promise<PoliceIntimation[]> {
  // Police intimations: station, officer name and rank against a patient. The
  // audit's concrete example of a role-blind read, and the one that most
  // obviously should not be readable by pharmacy, lab, HR or accounts (F-65).
  await requirePermission((await getActorProfile()).role, 'emergency:read')

  const supabase = await createClient()
  const { data } = await supabase
    .from('mlc_police_intimations')
    .select('id, station_name, officer_name, officer_rank, officer_phone, method, intimated_at, intimated_by_name, acknowledgement_ref, notes')
    .eq('mlc_id', mlcId)
    .order('intimated_at')
  return (data ?? []) as PoliceIntimation[]
}

// ── Reading the register ────────────────────────────────────────────────────

export async function listMlc(limit = 200): Promise<MlcListRow[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:read')

  const supabase = await createClient()
  const { data } = await supabase
    .from('mlc_records')
    .select('id, ar_no, status, patient_name, patient_id, arrived_at, mlc_types, injury_grade, examined_by_name, amends_id, intimations:mlc_police_intimations(id)')
    .order('arrived_at', { ascending: false })
    .limit(limit)

  await logAudit(actor.id, 'read', 'mlc_register', null, { rows: data?.length ?? 0 })

  type Row = Omit<MlcListRow, 'intimation_count'> & { intimations: { id: string }[] | null }
  return ((data ?? []) as unknown as Row[]).map(({ intimations, ...r }) => ({
    ...r, intimation_count: intimations?.length ?? 0,
  }))
}

export async function getMlc(id: string): Promise<Record<string, unknown> | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'emergency:read')

  const supabase = await createClient()
  const { data } = await supabase.from('mlc_records').select('*').eq('id', id).maybeSingle()
  if (!data) return null

  // An accident register holds the names of assault and sexual-assault
  // victims. Every read is logged, so that a leak has an answer to "who
  // opened it".
  await logAudit(actor.id, 'read', 'mlc_record', id, { ar_no: data.ar_no })
  return data as Record<string, unknown>
}
