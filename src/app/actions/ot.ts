'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  OtRoomSchema, OtScheduleSchema, OtConsumableSchema,
  SurgeryRecordSchema, PreOpChecklistSchema, SafetyStepSchema, SurgeryFeesSchema,
} from '@/lib/schemas'
import {
  SAFETY_STEPS, surgeryChargeLines,
  type PreOpChecklist, type SafetyChecklist, type SafetyStepRecord, type SurgeryChargeSource,
} from '@/lib/surgery'
import type { OtRoom, OtSchedule, OtConsumable, OtTeamMember, Profile } from '@/lib/types'
import { autoIpdBill } from '@/lib/ipdBilling'
import { admissionClosedError, ADMISSION_CLOSED_ERROR } from '@/lib/admissionOpen'
import { removeOrderFromBills } from '@/lib/billing/orderBilling'
import { istDayEndISO, istDayStartISO, istToday } from '@/lib/istDate'
import { revalidatePath } from 'next/cache'
import { DOCTOR_FILTER } from '@/lib/doctors'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Rooms ----

export async function createRoom(
  input: Record<string, unknown>
): Promise<{ success: true; room: OtRoom } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:manage')
  const parsed = OtRoomSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const status = parsed.data.status ?? 'active'
  const { error } = await supabase.from('ot_rooms').insert({
    id, tenant_id: actor.tenant_id, ...parsed.data,
    status, is_active: status === 'active',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'ot_room', id, { name: parsed.data.name })
  const { data } = await supabase.from('ot_rooms').select('*').eq('id', id).single()
  return { success: true, room: data as OtRoom }
}

export async function updateRoom(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:manage')
  const parsed = OtRoomSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const status = parsed.data.status ?? 'active'
  const supabase = await createClient()
  const { error } = await supabase.from('ot_rooms').update({
    ...parsed.data, status, is_active: status === 'active',
  }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'ot_room', id)
  return { success: true }
}

export async function deleteRoom(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:manage')
  const supabase = await createClient()

  // Block if active/in-progress surgeries are scheduled for this room
  const { data: activeSchedules } = await supabase
    .from('ot_schedules')
    .select('id')
    .eq('ot_room_id', id)
    .in('status', ['scheduled', 'in_progress'])
    .limit(1)

  if (activeSchedules && activeSchedules.length > 0) {
    return { success: false, error: 'Cannot delete: this room has upcoming or in-progress surgeries. Cancel them first.' }
  }

  // Historical (completed/cancelled) schedules exist — set ot_room_id to a placeholder or block
  const { data: historicalSchedules } = await supabase
    .from('ot_schedules')
    .select('id')
    .eq('ot_room_id', id)
    .limit(1)

  if (historicalSchedules && historicalSchedules.length > 0) {
    return { success: false, error: 'Cannot delete: this room has surgery records linked to it. Set it to "Inactive" instead to decommission it.' }
  }

  const { error } = await supabase.from('ot_rooms').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'ot_room', id, {})
  return { success: true }
}

export async function listRooms(): Promise<OtRoom[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('ot_rooms').select('*').eq('is_active', true).order('name')
  return (data ?? []) as OtRoom[]
}

export async function listAllOtRooms(): Promise<OtRoom[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('ot_rooms').select('*').order('name')
  return (data ?? []) as OtRoom[]
}

// ---- Schedules ----

export async function scheduleSurgery(
  input: Record<string, unknown>
): Promise<{ success: true; scheduleId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:schedule')
  const parsed = OtScheduleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const id = crypto.randomUUID()
  const supabase = await createClient()

  // The admission arrives from the browser — it must be this patient's, and
  // still open, or the surgery bills onto someone else's (or a closed) stay.
  const admissionId = (input.admission_id as string | null | undefined) ?? null
  if (admissionId) {
    const { data: adm } = await supabase
      .from('admissions').select('patient_id, status').eq('id', admissionId).maybeSingle()
    if (!adm || adm.patient_id !== parsed.data.patient_id) {
      return { success: false, error: 'That admission does not belong to this patient.' }
    }
    if (adm.status !== 'admitted') return { success: false, error: ADMISSION_CLOSED_ERROR }
  }

  const { error } = await supabase.from('ot_schedules').insert({
    id, tenant_id: actor.tenant_id, ...parsed.data,
    anaesthetist_id: parsed.data.anaesthetist_id ?? null,
    admission_id: admissionId,
    status: 'scheduled', billing_status: 'unbilled',
  })

  if (error) {
    // Postgres exclusion constraint violation = code 23P01
    if (error.code === '23P01' || error.message.includes('exclusion')) {
      return { success: false, error: 'Room already booked for this time slot. Please choose a different room or time.' }
    }
    return { success: false, error: error.message }
  }

  // The surgery is billed when it is marked completed (setOtStatus), not when it
  // is scheduled — a scheduled surgery can still be cancelled or moved.

  await logAudit(actor.id, 'create', 'ot_schedule', id, {
    patient_id: parsed.data.patient_id, procedure: parsed.data.procedure_name,
  })
  return { success: true, scheduleId: id }
}

export async function rescheduleSurgery(
  id: string,
  input: { start: string; end: string; otRoomId: string }
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:schedule')
  const supabase = await createClient()
  const { error } = await supabase.from('ot_schedules').update({
    scheduled_start: input.start,
    scheduled_end:   input.end,
    ot_room_id:      input.otRoomId,
  }).eq('id', id).in('status', ['scheduled'])

  if (error) {
    if (error.code === '23P01' || error.message.includes('exclusion')) {
      return { success: false, error: 'Room already booked for this time slot.' }
    }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'reschedule', 'ot_schedule', id)
  return { success: true }
}


export async function cancelSurgery(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:schedule')
  const supabase = await createClient()
  const { data: cancelled, error } = await supabase.from('ot_schedules')
    .update({ status: 'cancelled' }).eq('id', id).in('status', ['scheduled']).select('id')
  if (error) return { success: false, error: error.message }
  if (!cancelled?.length) return { success: false, error: 'Only a scheduled surgery can be cancelled.' }

  // Surgeries scheduled before billing moved to completion may already be on a
  // bill — take just this surgery's line off (other charges on the bill stay).
  const billing = await removeOrderFromBills(supabase, 'ot', id)
  await supabase.from('ot_schedules').update({ billing_status: 'unbilled' }).eq('id', id)

  // Consumables requested from pharmacy for this surgery and not yet dispatched are
  // no longer needed. Dispatched ones were issued and stay billed via pharmacy.
  const { data: consumables } = await supabase
    .from('ot_consumables').select('pharmacy_request_id').eq('ot_schedule_id', id).not('pharmacy_request_id', 'is', null)
  const requestIds = (consumables ?? []).map((c) => c.pharmacy_request_id as string)
  if (requestIds.length) {
    await supabase.from('ipd_pharmacy_requests').update({ status: 'cancelled' }).in('id', requestIds).eq('status', 'pending')
  }

  await logAudit(actor.id, 'cancel', 'ot_schedule', id, { billing })
  revalidatePath('/ot')
  return { success: true }
}

export async function setOtStatus(
  id: string,
  status: 'in_progress' | 'completed'
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const supabase = await createClient()
  // Forward-only: scheduled → in progress → completed. A cancelled or completed
  // surgery can't be moved back (that would allow billing it twice).
  const from = status === 'in_progress' ? ['scheduled'] : ['scheduled', 'in_progress']
  const { data: updated, error } = await supabase.from('ot_schedules')
    .update({ status }).eq('id', id).in('status', from)
    .select(`id, admission_id, patient_id, procedure_name, price_snapshot, surgeon_fee, anaesthetist_fee,
      surgeon:profiles!ot_schedules_surgeon_id_fkey(full_name), anaesthetist:profiles!ot_schedules_anaesthetist_id_fkey(full_name),
      team_members:ot_team_members(role, fee, profile:profiles(full_name))`)
  if (error) return { success: false, error: error.message }
  const row = updated?.[0]
  if (!row) return { success: false, error: 'This surgery is no longer in a state that allows that change.' }

  let billId: string | null = null
  if (status === 'completed') billId = await billCompletedSurgery(supabase, actor, row as unknown as CompletedSurgery)

  await logAudit(actor.id, `status_${status}`, 'ot_schedule', id, billId ? { bill_id: billId } : undefined)
  revalidatePath('/ot')
  return { success: true }
}

/**
 * Bills a completed surgery onto the admission's OT bill for today (IST).
 * The schedule is claimed first (unbilled → billed) so two clicks can't bill it
 * twice; if billing doesn't happen (no IPD in the plan, zero price, error) the
 * claim is released and the charge stays available in the Bill Builder.
 */
type CompletedSurgery = SurgeryChargeSource & { admission_id: string | null; patient_id: string }

async function billCompletedSurgery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actor: { id: string; tenant_id: string },
  row: CompletedSurgery,
): Promise<string | null> {
  // The procedure and each doctor's fee, one line each (insurers ask for the break-up).
  const lineItems = surgeryChargeLines(row)
  if (!row.admission_id || !lineItems.length) return null
  const { data: claimed } = await supabase.from('ot_schedules')
    .update({ billing_status: 'billed' }).eq('id', row.id).eq('billing_status', 'unbilled').select('id')
  if (!claimed?.length) return null

  const billId = await autoIpdBill(supabase, actor.id, {
    tenantId:    actor.tenant_id,
    admissionId: row.admission_id,
    patientId:   row.patient_id,
    billingDate: istToday(),
    billSource:  'ot',
    lineItems,
  })
  if (!billId) await supabase.from('ot_schedules').update({ billing_status: 'unbilled' }).eq('id', row.id)
  return billId
}

export async function saveOtNotes(id: string, notes: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const supabase = await createClient()
  const { error } = await supabase.from('ot_schedules').update({ notes }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'notes', 'ot_schedule', id)
  return { success: true }
}

// ── The surgery record ───────────────────────────────────────────────────────
//
// Editable after completion (the operation note is often written once the
// patient is out of theatre); never on a cancelled surgery. Every save is
// audited with the fields it changed.

async function recordTarget(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from('ot_schedules')
    .select('id, status, billing_status, pre_op_checklist, safety_checklist, anaesthesia_start, anaesthesia_end, incision_at, closure_at')
    .eq('id', id).maybeSingle()
  if (!data) return { error: 'Surgery not found' as const }
  if (data.status === 'cancelled') return { error: 'This surgery was cancelled — its record cannot be changed.' as const }
  return { row: data }
}

export async function saveSurgeryRecord(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const parsed = SurgeryRecordSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  // Only the keys this card sent — the other cards' fields are left alone.
  const sent = Object.keys(input).filter((k) => k in parsed.data) as Array<keyof typeof parsed.data>
  if (!sent.length) return { success: true }
  const patch: Record<string, unknown> = {}
  for (const k of sent) patch[k] = parsed.data[k] ?? null

  const supabase = await createClient()
  const t = await recordTarget(supabase, id)
  if ('error' in t) return { success: false, error: t.error as string }

  // Order against what is already stored, so the reason is in words (the
  // database constraint would only say "check constraint").
  const at = (k: 'anaesthesia_start' | 'anaesthesia_end' | 'incision_at' | 'closure_at') =>
    (k in patch ? patch[k] : t.row[k]) as string | null
  const after = (a: string | null, b: string | null) => !!a && !!b && new Date(b).getTime() < new Date(a).getTime()
  if (after(at('anaesthesia_start'), at('anaesthesia_end'))) return { success: false, error: 'Anaesthesia ends before it starts' }
  if (after(at('incision_at'), at('closure_at'))) return { success: false, error: 'Closure is before the incision' }

  const { error } = await supabase.from('ot_schedules').update({
    ...patch, record_updated_at: new Date().toISOString(), record_updated_by: actor.id,
  }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'record', 'ot_schedule', id, { fields: sent })
  return { success: true }
}

export async function savePreOpChecklist(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const parsed = PreOpChecklistSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const t = await recordTarget(supabase, id)
  if ('error' in t) return { success: false, error: t.error as string }

  const checklist: PreOpChecklist = {
    ...((t.row.pre_op_checklist as PreOpChecklist | null) ?? {}),
    ...parsed.data,
    done_at: new Date().toISOString(),
    done_by: actor.id,
  }
  const { error } = await supabase.from('ot_schedules').update({
    pre_op_checklist: checklist, record_updated_at: checklist.done_at, record_updated_by: actor.id,
  }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'pre_op_checklist', 'ot_schedule', id, parsed.data)
  return { success: true }
}

/** One WHO step. Signing stamps who and when; un-signing clears it. */
export async function saveSafetyStep(
  id: string, input: Record<string, unknown>,
): Promise<{ success: true; record: SafetyStepRecord } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const parsed = SafetyStepSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { step, items, sign } = parsed.data

  const def = SAFETY_STEPS.find((s) => s.step === step)!
  const known = new Set(def.items.map((i) => i.key))
  const clean = Object.fromEntries(Object.entries(items).filter(([k]) => known.has(k)))
  if (sign && !def.items.every((i) => clean[i.key])) {
    return { success: false, error: `Tick every ${def.title.toLowerCase()} item before signing it` }
  }

  const supabase = await createClient()
  const t = await recordTarget(supabase, id)
  if ('error' in t) return { success: false, error: t.error as string }

  const all = ((t.row.safety_checklist as SafetyChecklist | null) ?? {})
  const prev = all[step]
  const record: SafetyStepRecord = {
    items: clean,
    done_at: sign ? (prev?.done_at ?? new Date().toISOString()) : null,
    done_by: sign ? (prev?.done_by ?? actor.id) : null,
  }
  const { error } = await supabase.from('ot_schedules').update({
    safety_checklist: { ...all, [step]: record }, record_updated_at: new Date().toISOString(), record_updated_by: actor.id,
  }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, `who_${step}`, 'ot_schedule', id, { signed: sign })
  return { success: true, record }
}

/**
 * Doctors' fees for this surgery, billed as their own lines at completion.
 * Once the surgery is on a bill, a change here would not reach it — so it is
 * refused and the bill is where it gets corrected.
 */
export async function saveSurgeryFees(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:schedule')
  const parsed = SurgeryFeesSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const t = await recordTarget(supabase, id)
  if ('error' in t) return { success: false, error: t.error as string }
  if (t.row.billing_status === 'billed') {
    return { success: false, error: 'This surgery is already billed — change the fee on the bill instead.' }
  }

  const patch: Record<string, unknown> = {}
  if ('surgeon_fee' in parsed.data) patch.surgeon_fee = parsed.data.surgeon_fee ?? null
  if ('anaesthetist_fee' in parsed.data) patch.anaesthetist_fee = parsed.data.anaesthetist_fee ?? null
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('ot_schedules').update(patch).eq('id', id)
    if (error) return { success: false, error: error.message }
  }
  for (const m of parsed.data.team ?? []) {
    const { data: done, error } = await supabase.from('ot_team_members').update({ fee: m.fee })
      .eq('id', m.id).eq('ot_schedule_id', id).select('id')
    if (error) return { success: false, error: error.message }
    if (!done?.length) return { success: false, error: 'That team member is no longer on this surgery — refresh.' }
  }
  await logAudit(actor.id, 'fees', 'ot_schedule', id, parsed.data)
  return { success: true }
}

export async function getSchedule(id: string): Promise<OtSchedule | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('ot_schedules').select(`
    *,
    patient:patients(id, full_name, uhid),
    surgeon:profiles!ot_schedules_surgeon_id_fkey(id, full_name),
    anaesthetist:profiles!ot_schedules_anaesthetist_id_fkey(id, full_name),
    room:ot_rooms(id, name, is_active),
    admission:admissions!ot_schedules_admission_id_fkey(id, ward_id, bed_id, direct_ot, ward:wards(id, name, is_temp), bed:beds(id, bed_no)),
    consumables:ot_consumables(*),
    team_members:ot_team_members(*, profile:profiles(id, full_name))
  `).eq('id', id).single()
  return data as unknown as OtSchedule | null
}

// List OT schedules for a specific IPD admission
export async function listAdmissionSchedules(admissionId: string): Promise<OtSchedule[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('ot_schedules').select(`
    *,
    surgeon:profiles!ot_schedules_surgeon_id_fkey(id, full_name),
    room:ot_rooms(id, name, is_active)
  `).eq('admission_id', admissionId).order('scheduled_start', { ascending: true })
  return (data ?? []) as unknown as OtSchedule[]
}

// ---- Surgical Team ----

export async function addOtTeamMember(
  scheduleId: string,
  profileId: string,
  role: string,
): Promise<{ success: true; member: OtTeamMember } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('ot_team_members').insert({
    id, ot_schedule_id: scheduleId, profile_id: profileId, role,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'ot_team_member', id, { scheduleId, profileId, role })
  const { data } = await supabase
    .from('ot_team_members')
    .select('*, profile:profiles(id, full_name)')
    .eq('id', id)
    .single()
  return { success: true, member: data as unknown as OtTeamMember }
}

export async function removeOtTeamMember(memberId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const supabase = await createClient()
  const { error } = await supabase.from('ot_team_members').delete().eq('id', memberId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'ot_team_member', memberId)
  return { success: true }
}

export async function listSchedules(filters?: {
  date?: string   // YYYY-MM-DD — overlapping schedules for that day
  tab?: 'active' | 'history'
}): Promise<OtSchedule[]> {
  const supabase = await createClient()
  let q = supabase.from('ot_schedules').select(`
    *,
    patient:patients(id, full_name, uhid),
    surgeon:profiles!ot_schedules_surgeon_id_fkey(id, full_name),
    anaesthetist:profiles!ot_schedules_anaesthetist_id_fkey(id, full_name),
    room:ot_rooms(id, name, is_active)
  `).order('scheduled_start', { ascending: true })

  if (filters?.tab === 'active')  q = q.in('status', ['scheduled', 'in_progress'])
  if (filters?.tab === 'history') q = q.in('status', ['completed', 'cancelled'])

  if (filters?.date) {
    // IST calendar day — UTC bounds put surgeries before 05:30 IST on the previous day's list.
    const dayStart = istDayStartISO(filters.date)
    const dayEnd   = istDayEndISO(filters.date)
    q = q.lte('scheduled_start', dayEnd).gte('scheduled_end', dayStart)
  }

  const { data } = await q.limit(500)
  return (data ?? []) as unknown as OtSchedule[]
}

// ---- Consumables ----

export async function addConsumable(
  input: Record<string, unknown>
): Promise<{ success: true; consumable: OtConsumable } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const parsed = OtConsumableSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Fetch schedule to get admission_id + patient_id for billing
  const { data: schedule } = await supabase
    .from('ot_schedules')
    .select('id, admission_id, patient_id')
    .eq('id', parsed.data.ot_schedule_id)
    .single()

  const admissionId = (schedule?.admission_id as string | null) ?? null
  const patientId   = (schedule?.patient_id  as string | null) ?? null
  if (admissionId) {
    const closed = await admissionClosedError(supabase, admissionId)
    if (closed) return { success: false, error: closed }
  }

  // Resolve drug IDs
  const drugMasterId = (parsed.data.drug_master_id as string | null | undefined) ?? null
  const drugId       = (parsed.data.drug_id       as string | null | undefined) ?? null

  // Create IPD pharmacy request if linked to an admission.
  // Price is left at 0 — the pharmacist's dispatch step fetches MRP from stock and auto-bills.
  let pharmacyRequestId: string | null = null
  if (admissionId && patientId) {
    const reqId = crypto.randomUUID()
    const { error: reqErr } = await supabase.from('ipd_pharmacy_requests').insert({
      id:             reqId,
      tenant_id:      actor.tenant_id,
      admission_id:   admissionId,
      item_name:      parsed.data.description,
      quantity:       parsed.data.qty,
      price_snapshot: 0,
      billing_status: 'pending',
      status:         'pending',
      notes:          'OT consumable',
      drug_master_id: drugMasterId,
      drug_id:        drugId,
    })
    if (reqErr) console.error('[addConsumable] pharmacy request insert failed:', reqErr.message)
    if (!reqErr) pharmacyRequestId = reqId
  }

  // Insert consumable row (unit_price stored as 0; real price set at pharmacy dispatch)
  const id = crypto.randomUUID()
  const { error } = await supabase.from('ot_consumables').insert({
    id, tenant_id: actor.tenant_id,
    ot_schedule_id: parsed.data.ot_schedule_id,
    description:    parsed.data.description,
    qty:            parsed.data.qty,
    unit_price:     0,
    drug_master_id: drugMasterId,
    drug_id:        drugId,
    pharmacy_request_id: pharmacyRequestId,
    is_implant:     parsed.data.is_implant ?? false,
    implant_lot_no: parsed.data.is_implant ? (parsed.data.implant_lot_no?.trim() || null) : null,
    implant_maker:  parsed.data.is_implant ? (parsed.data.implant_maker?.trim() || null) : null,
    implant_size:   parsed.data.is_implant ? (parsed.data.implant_size?.trim() || null) : null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'add_consumable', 'ot_schedule', parsed.data.ot_schedule_id)
  const { data: row } = await supabase.from('ot_consumables').select('*').eq('id', id).single()
  return { success: true, consumable: row as OtConsumable }
}

export async function removeConsumable(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:record')
  const supabase = await createClient()

  // Fetch consumable to clean up linked records
  const { data: consumable } = await supabase
    .from('ot_consumables').select('pharmacy_request_id').eq('id', id).single()

  // Cancel linked pharmacy request if still pending (bill is created at dispatch time, not here)
  if (consumable?.pharmacy_request_id) {
    await supabase.from('ipd_pharmacy_requests')
      .update({ status: 'cancelled' })
      .eq('id', consumable.pharmacy_request_id)
      .eq('status', 'pending')
  }

  const { error } = await supabase.from('ot_consumables').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'remove_consumable', 'ot_consumable', id)
  return { success: true }
}

// ---- Staff lookup (for surgeon/anaesthetist selectors) ----

export async function listDoctors(): Promise<Pick<Profile, 'id' | 'full_name' | 'role'>[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles')
    .select('id, full_name, role')
    .or(DOCTOR_FILTER)
    .eq('is_active', true)
    .order('full_name')
  return (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'role'>[]
}

// Search clinical staff by name (doctors + nurses + technicians) — used in OT team picker
export async function searchOtStaff(query: string): Promise<Pick<Profile, 'id' | 'full_name' | 'role'>[]> {
  if (!query.trim()) return []
  const supabase = await createClient()
  const { data } = await supabase.from('profiles')
    .select('id, full_name, role')
    .in('role', ['doctor', 'nurse', 'technician'])
    .eq('is_active', true)
    .ilike('full_name', `%${query.trim()}%`)
    .order('full_name')
    .limit(10)
  return (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'role'>[]
}
