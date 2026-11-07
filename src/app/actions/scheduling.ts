'use server'

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { requirePermission, hasPermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import {
  ShiftDefinitionSchema, WardCoverageRuleSchema, WardInchargeSchema,
  LeaveRequestSchema, LeaveReviewSchema, RosterPatternSchema,
  GenerateRosterSchema,
} from '@/lib/schemas'
import type {
  ShiftDefinition, WardCoverageRule, WardIncharge, LeaveRequest,
  RosterPattern, DutyRoster, ShiftCoverage, WardRosterData,
} from '@/lib/types'
import { istAddDays } from '@/lib/istDate'
import { pageAll } from '@/lib/supabase/pageAll'

type Result = { success: true } | { success: false; error: string }

const DEFAULT_RATIO = 6      // fallback nurse:patient ratio when no unit rule exists
const DEFAULT_MIN_NURSES = 1

// ── helpers ──────────────────────────────────────────────────────────────────

function eachDate(start: string, end: string): string[] {
  const out: string[] = []
  // Parse as UTC so the result doesn't depend on the server's timezone (on an IST
  // machine a local-midnight parse turned every date into the previous day).
  const d = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}

function shiftDate(date: string, days: number): string {
  return istAddDays(date, days)
}

/** Occupied beds in a nursing unit = admitted patients across ALL rooms in that unit. */
async function unitOccupiedBeds(supabase: SupabaseClient, unitId: string): Promise<number> {
  const { data: rooms } = await supabase.from('wards').select('id').eq('nursing_unit_id', unitId)
  const roomIds = (rooms ?? []).map((r) => r.id as string)
  if (!roomIds.length) return 0
  const { count } = await supabase.from('admissions')
    .select('id', { count: 'exact', head: true })
    .in('ward_id', roomIds).eq('status', 'admitted')
  return count ?? 0
}

/** Admin (scheduling:manage) can manage any unit; a unit in-charge can manage only theirs. */
async function assertCanManageUnit(unitId: string): Promise<{ id: string; tenant_id: string; role: string } | null> {
  const actor = await getActorProfile()
  if (hasPermission(actor.role, 'scheduling:manage')) return actor
  const supabase = await createClient()
  const { data } = await supabase
    .from('ward_incharges').select('id')
    .eq('nursing_unit_id', unitId).eq('profile_id', actor.id).maybeSingle()
  return data ? actor : null   // null = not allowed (caller returns a friendly error)
}

const UNIT_FORBIDDEN = 'You can only manage nursing units you are in charge of'

// ── shift definitions ─────────────────────────────────────────────────────────

export async function listShiftDefinitions(activeOnly = false): Promise<ShiftDefinition[]> {
  const supabase = await createClient()
  let q = supabase.from('shift_definitions').select('*').order('sort_order')
  if (activeOnly) q = q.eq('is_active', true)
  const { data } = await q
  return (data ?? []) as ShiftDefinition[]
}

export async function upsertShiftDefinition(input: Record<string, unknown>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const parsed = ShiftDefinitionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const row = {
    tenant_id: actor.tenant_id,
    code: d.code, label: d.label,
    start_time: d.start_time, end_time: d.end_time,
    crosses_midnight: d.crosses_midnight, sort_order: d.sort_order, is_active: d.is_active,
  }
  const { error } = d.id
    ? await supabase.from('shift_definitions').update(row).eq('id', d.id)
    : await supabase.from('shift_definitions').insert({ id: crypto.randomUUID(), ...row })

  if (error) {
    if (error.code === '23505') return { success: false, error: `A shift with code "${d.code}" already exists` }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, d.id ? 'update' : 'create', 'shift_definition', d.id ?? d.code, { code: d.code })
  return { success: true }
}

export async function deleteShiftDefinition(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('shift_definitions').delete().eq('id', id)
  if (error) {
    if (error.code === '23503')
      return { success: false, error: 'This shift is in use by rosters or assignments — deactivate it instead.' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'delete', 'shift_definition', id, {})
  return { success: true }
}

// ── coverage rules ──────────────────────────────────────────────────────────────

export async function listCoverageRules(): Promise<WardCoverageRule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ward_coverage_rules')
    .select('*, unit:nursing_units(id, block, floor, wing)')
    .order('nursing_unit_id')
  return (data ?? []) as unknown as WardCoverageRule[]
}

export async function upsertCoverageRule(input: Record<string, unknown>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const parsed = WardCoverageRuleSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('ward_coverage_rules').upsert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    nursing_unit_id: d.nursing_unit_id, shift_code: d.shift_code,
    patient_ratio: d.patient_ratio, min_nurses: d.min_nurses,
  }, { onConflict: 'tenant_id,nursing_unit_id,shift_code', ignoreDuplicates: false })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'upsert', 'ward_coverage_rule', `${d.nursing_unit_id}:${d.shift_code}`, d)
  return { success: true }
}

export async function deleteCoverageRule(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('ward_coverage_rules').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'ward_coverage_rule', id, {})
  return { success: true }
}

// ── unit in-charges ──────────────────────────────────────────────────────────────

export async function listWardIncharges(): Promise<WardIncharge[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ward_incharges')
    .select('*, unit:nursing_units(id, block, floor, wing), profile:profiles(id, full_name, role)')
    .order('nursing_unit_id')
  return (data ?? []) as unknown as WardIncharge[]
}

export async function addWardIncharge(input: Record<string, unknown>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const parsed = WardInchargeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('ward_incharges').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    nursing_unit_id: parsed.data.nursing_unit_id,
    profile_id: parsed.data.profile_id,
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Already an in-charge of this unit' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'add', 'ward_incharge', parsed.data.nursing_unit_id, parsed.data)
  return { success: true }
}

export async function removeWardIncharge(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('ward_incharges').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'remove', 'ward_incharge', id, {})
  return { success: true }
}

// ── leave management ────────────────────────────────────────────────────────────

/** Managers (scheduling:manage) see all; everyone else sees their own. */
export async function listLeaveRequests(params?: { status?: string }): Promise<LeaveRequest[]> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  let q = supabase
    .from('leave_requests')
    .select('*, profile:profiles!leave_requests_profile_id_fkey(id, full_name, role), reviewer:profiles!leave_requests_reviewed_by_fkey(id, full_name)')
    .order('created_at', { ascending: false })
  if (!hasPermission(actor.role, 'leave:approve')) q = q.eq('profile_id', actor.id)
  if (params?.status) q = q.eq('status', params.status)
  const { data } = await q.limit(500)
  return (data ?? []) as unknown as LeaveRequest[]
}

export async function requestLeave(input: Record<string, unknown>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'leave:request')
  const parsed = LeaveRequestSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  // Only a manager may file leave on behalf of someone else
  const targetProfile = d.profile_id && d.profile_id !== actor.id
    ? (hasPermission(actor.role, 'leave:approve') ? d.profile_id : actor.id)
    : actor.id
  const supabase = await createClient()
  const { error } = await supabase.from('leave_requests').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    profile_id: targetProfile,
    leave_type: d.leave_type,
    start_date: d.start_date, end_date: d.end_date,
    reason: d.reason ?? null,
    status: 'pending',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'request', 'leave', targetProfile, { start: d.start_date, end: d.end_date })
  return { success: true }
}

export async function reviewLeave(input: Record<string, unknown>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'leave:approve')
  const parsed = LeaveReviewSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()

  // Who the request belongs to, read before the update so self-approval can be
  // judged and so a missing request is distinguishable from a decided one.
  const { data: req } = await supabase
    .from('leave_requests')
    .select('profile_id, status')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (!req) return { success: false, error: 'That leave request no longer exists' }

  // F-64 — a manager approving their own leave.
  //
  // Blocking it outright would deadlock a hospital with one approver, so the
  // line is drawn where there is somebody above: an HR manager cannot decide
  // their own request, an admin can, because there may be nobody else who
  // could. Either way the audit entry records that it was self-reviewed, so the
  // decision is visible afterwards rather than indistinguishable from any other.
  //
  // This is a deliberate choice rather than a found rule — the hospital may
  // want admins blocked too, which is a one-line change here.
  const selfReview = req.profile_id === actor.id
  if (selfReview && actor.role !== 'admin') {
    return { success: false, error: 'You cannot decide your own leave request — ask an administrator.' }
  }

  // F-63 — a zero-row update sets no error, so a request decided a moment
  // earlier would have reported success to the second manager. `verifyOrder`
  // already guards exactly this and says why: reporting success for an
  // authorisation that never happened is the worst lie to tell on this screen.
  const { data: updated, error } = await supabase
    .from('leave_requests')
    .update({ status: parsed.data.decision, reviewed_by: actor.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!updated?.length) {
    return {
      success: false,
      error: `This request is already ${req.status === 'pending' ? 'decided' : req.status} — nothing was changed.`,
    }
  }

  await logAudit(actor.id, parsed.data.decision, 'leave', parsed.data.id, {
    for_profile: req.profile_id, self_review: selfReview,
  })
  return { success: true }
}

export async function cancelLeave(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  const supabase = await createClient()
  // A user may cancel their own pending request; managers may cancel any pending one.
  let q = supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending')
  if (!hasPermission(actor.role, 'leave:approve')) q = q.eq('profile_id', actor.id)
  // Same zero-row trap as reviewLeave (F-63): without the select, cancelling an
  // already-decided request — or somebody else's, for a user without
  // leave:approve — reported success and changed nothing.
  const { data: cancelled, error } = await q.select('id')
  if (error) return { success: false, error: error.message }
  if (!cancelled?.length) {
    return { success: false, error: 'That request is no longer pending, or is not yours to cancel.' }
  }
  await logAudit(actor.id, 'cancel', 'leave', id, {})
  return { success: true }
}

/** Set of "profileId|date" a nurse is unavailable on due to approved leave. */
async function leaveBlockedSlots(start: string, end: string): Promise<Set<string>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leave_requests')
    .select('profile_id, start_date, end_date')
    .eq('status', 'approved')
    .lte('start_date', end)
    .gte('end_date', start)
  const blocked = new Set<string>()
  for (const lr of data ?? []) {
    for (const day of eachDate(
      (lr.start_date as string) > start ? (lr.start_date as string) : start,
      (lr.end_date as string) < end ? (lr.end_date as string) : end,
    )) blocked.add(`${lr.profile_id}|${day}`)
  }
  return blocked
}

// ── coverage computation ──────────────────────────────────────────────────────

/**
 * Required vs assigned nurses per active shift for a nursing unit on a date.
 * required = max(min_nurses, ceil(occupied_beds / ratio)); occupied beds are the
 * current admitted census across all rooms in the unit.
 */
export async function computeUnitCoverage(unitId: string, date: string): Promise<ShiftCoverage[]> {
  const supabase = await createClient()
  const [beds, shifts, rulesRes, rosterRes] = await Promise.all([
    unitOccupiedBeds(supabase, unitId),
    listShiftDefinitions(true),
    supabase.from('ward_coverage_rules').select('shift_code, patient_ratio, min_nurses').eq('nursing_unit_id', unitId),
    supabase.from('duty_roster').select('shift').eq('nursing_unit_id', unitId).eq('date', date),
  ])
  const ruleMap = new Map((rulesRes.data ?? []).map(r => [r.shift_code as string, r]))
  const assignedByShift = new Map<string, number>()
  for (const r of rosterRes.data ?? []) {
    const s = r.shift as string | null
    if (s) assignedByShift.set(s, (assignedByShift.get(s) ?? 0) + 1)
  }
  return shifts.map(s => {
    const rule = ruleMap.get(s.code)
    const ratio = (rule?.patient_ratio as number) ?? DEFAULT_RATIO
    const minN = (rule?.min_nurses as number) ?? DEFAULT_MIN_NURSES
    const required = Math.max(minN, Math.ceil(beds / ratio))
    return {
      nursing_unit_id: unitId, date, shift_code: s.code,
      required, assigned: assignedByShift.get(s.code) ?? 0, occupied_beds: beds,
    }
  })
}

// ── roster grid ───────────────────────────────────────────────────────────────

export async function getUnitRoster(params: { unitId: string; weekStart: string }): Promise<WardRosterData> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const { unitId, weekStart } = params
  const weekEnd = shiftDate(weekStart, 6)
  const dates = eachDate(weekStart, weekEnd)

  const [rosterRes, nursesRes, shifts, beds, rulesRes, inchargeRes] = await Promise.all([
    supabase.from('duty_roster')
      // duty_roster points at profiles twice (profile_id and created_by), so the
      // embed has to name the key — an unqualified one is rejected outright
      // (PGRST201) and the whole week comes back empty.
      .select('*, profile:profiles!duty_roster_profile_id_fkey(id, full_name, role)')
      .eq('nursing_unit_id', unitId).gte('date', weekStart).lte('date', weekEnd).order('date'),
    supabase.from('profiles').select('id, full_name').eq('role', 'nurse').eq('is_active', true).order('full_name'),
    listShiftDefinitions(true),
    unitOccupiedBeds(supabase, unitId),
    supabase.from('ward_coverage_rules').select('shift_code, patient_ratio, min_nurses').eq('nursing_unit_id', unitId),
    supabase.from('ward_incharges').select('id').eq('nursing_unit_id', unitId).eq('profile_id', actor.id).maybeSingle(),
  ])

  const rosterRows = (rosterRes.data ?? []) as unknown as DutyRoster[]
  const ruleMap = new Map((rulesRes.data ?? []).map((r) => [r.shift_code as string, r]))

  // Assigned nurses per date+shift, from the week roster already fetched above.
  const assignedByKey = new Map<string, number>()
  for (const r of rosterRows) {
    const rr = r as unknown as { shift: string | null; date: string }
    if (rr.shift) assignedByKey.set(`${rr.date}|${rr.shift}`, (assignedByKey.get(`${rr.date}|${rr.shift}`) ?? 0) + 1)
  }

  // Coverage for EVERY day of the week.
  const coverage: ShiftCoverage[] = []
  for (const date of dates) {
    for (const sh of shifts) {
      const rule = ruleMap.get(sh.code)
      const ratio = (rule?.patient_ratio as number) ?? DEFAULT_RATIO
      const minN = (rule?.min_nurses as number) ?? DEFAULT_MIN_NURSES
      coverage.push({
        nursing_unit_id: unitId, date, shift_code: sh.code,
        required: Math.max(minN, Math.ceil(beds / ratio)),
        assigned: assignedByKey.get(`${date}|${sh.code}`) ?? 0,
        occupied_beds: beds,
      })
    }
  }

  const canManage = hasPermission(actor.role, 'scheduling:manage') || !!inchargeRes.data
  return {
    roster: rosterRows,
    nurses: (nursesRes.data ?? []) as { id: string; full_name: string }[],
    shifts, coverage, canManage, weekStart,
  }
}

/** Assign (or move) a nurse to a unit+shift on a date. One shift per nurse per day. */
export async function setRosterCell(params: {
  unitId: string; profileId: string; date: string; shift: string
}): Promise<Result> {
  await requireWriteAccess()
  const actor = await assertCanManageUnit(params.unitId)
  if (!actor) return { success: false, error: UNIT_FORBIDDEN }
  const supabase = await createClient()

  // Block if the nurse is on approved leave that day
  const blocked = await leaveBlockedSlots(params.date, params.date)
  if (blocked.has(`${params.profileId}|${params.date}`))
    return { success: false, error: 'This nurse is on approved leave that day' }

  const { error } = await supabase.from('duty_roster').upsert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    profile_id: params.profileId,
    date: params.date,
    shift: params.shift,
    nursing_unit_id: params.unitId,
    status: 'published',
    source: 'manual',
    created_by: actor.id,
  }, { onConflict: 'profile_id,date', ignoreDuplicates: false })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_set', 'duty_roster', params.profileId, { date: params.date, shift: params.shift, unit: params.unitId })
  return { success: true }
}

export async function clearRosterCell(params: { unitId: string; profileId: string; date: string }): Promise<Result> {
  await requireWriteAccess()
  const actor = await assertCanManageUnit(params.unitId)
  if (!actor) return { success: false, error: UNIT_FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('duty_roster').delete()
    .eq('profile_id', params.profileId).eq('date', params.date).eq('nursing_unit_id', params.unitId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_clear', 'duty_roster', params.profileId, { date: params.date })
  return { success: true }
}

export async function publishRoster(params: { unitId: string; start: string; end: string }): Promise<Result> {
  await requireWriteAccess()
  const actor = await assertCanManageUnit(params.unitId)
  if (!actor) return { success: false, error: UNIT_FORBIDDEN }
  const supabase = await createClient()
  const { error } = await supabase.from('duty_roster')
    .update({ status: 'published' })
    .eq('nursing_unit_id', params.unitId).gte('date', params.start).lte('date', params.end).eq('status', 'draft')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_publish', 'duty_roster', params.unitId, params)
  return { success: true }
}

/**
 * Fill EMPTY nurse/day slots for a nursing unit across a range using:
 *  - a cyclic pattern (pattern_id), and/or
 *  - copy-forward from the previous week, and/or
 *  - coverage auto-fill (ratio-driven) from the available nurse pool.
 * Existing roster rows are preserved; only gaps are filled, as drafts.
 */
export async function generateRoster(input: Record<string, unknown>): Promise<{ success: true; created: number } | { success: false; error: string }> {
  await requireWriteAccess()
  const parsed = GenerateRosterSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const actor = await assertCanManageUnit(d.nursing_unit_id)
  if (!actor) return { success: false, error: UNIT_FORBIDDEN }
  const supabase = await createClient()

  const dates = eachDate(d.start_date, d.end_date)
  if (dates.length === 0) return { success: false, error: 'Empty date range' }
  if (dates.length > 62) return { success: false, error: 'Range too large (max ~2 months)' }

  const activeShifts = await listShiftDefinitions(true)
  const activeCodes = new Set(activeShifts.map(s => s.code))
  if (activeCodes.size === 0) return { success: false, error: 'No active shifts configured' }

  // occupied slots = existing roster rows for these nurses in the range (any unit — one shift/day)
  // Paged: nurses x days passes a thousand inside a single month for a ward of
  // any size, and a slot missing from `occupied` is a nurse rostered twice.
  const existingRows = await pageAll<{ profile_id: string; date: string }>((f, t) => supabase
    .from('duty_roster').select('profile_id, date')
    .gte('date', d.start_date).lte('date', d.end_date).order('id').range(f, t))
  const occupied = new Set(existingRows.map(r => `${r.profile_id}|${r.date}`))
  const blocked = await leaveBlockedSlots(d.start_date, d.end_date)

  // staged[profileId|date] = { shift, source } — new rows to insert
  const staged = new Map<string, { profileId: string; date: string; shift: string; source: string }>()
  const stage = (profileId: string, date: string, shift: string, source: string) => {
    const key = `${profileId}|${date}`
    if (occupied.has(key) || blocked.has(key) || staged.has(key)) return
    if (!activeCodes.has(shift)) return
    staged.set(key, { profileId, date, shift, source })
  }

  // 1. pattern stamp
  if (d.pattern_id) {
    const { data: pat } = await supabase.from('roster_patterns').select('*').eq('id', d.pattern_id).maybeSingle()
    const { data: members } = await supabase.from('roster_pattern_members').select('*').eq('pattern_id', d.pattern_id)
    if (pat && members) {
      const dayPlan = pat.day_plan as string[]
      const cycle = pat.cycle_days as number
      for (const m of members) {
        if (m.nursing_unit_id && m.nursing_unit_id !== d.nursing_unit_id) continue
        const anchor = new Date((m.anchor_date as string) + 'T00:00:00Z').getTime()
        const offset = (m.offset_days as number) ?? 0
        for (const date of dates) {
          const dayDiff = Math.round((new Date(date + 'T00:00:00Z').getTime() - anchor) / 86400000)
          const idx = (((dayDiff + offset) % cycle) + cycle) % cycle
          const shift = dayPlan[idx]
          if (shift && shift !== 'off') stage(m.profile_id as string, date, shift, 'pattern')
        }
      }
    }
  }

  // 2. copy-forward from the previous week (date - 7)
  if (d.copy_forward) {
    const priorStart = shiftDate(d.start_date, -7)
    const priorEnd = shiftDate(d.end_date, -7)
    const { data: prior } = await supabase.from('duty_roster')
      .select('profile_id, date, shift').eq('nursing_unit_id', d.nursing_unit_id)
      .gte('date', priorStart).lte('date', priorEnd)
    for (const r of prior ?? []) {
      const target = shiftDate(r.date as string, 7)
      if (target < d.start_date || target > d.end_date) continue
      if (r.shift) stage(r.profile_id as string, target, r.shift as string, 'copy_forward')
    }
  }

  // 3. coverage auto-fill (ratio-driven) from available nurses, fairness by load
  if (d.auto_fill) {
    const [beds, rulesRes, nursesRes] = await Promise.all([
      unitOccupiedBeds(supabase, d.nursing_unit_id),
      supabase.from('ward_coverage_rules').select('shift_code, patient_ratio, min_nurses').eq('nursing_unit_id', d.nursing_unit_id),
      supabase.from('profiles').select('id').eq('role', 'nurse').eq('is_active', true),
    ])
    const ruleMap = new Map((rulesRes.data ?? []).map(r => [r.shift_code as string, r]))
    const nurseIds = (nursesRes.data ?? []).map(n => n.id as string)
    const load = new Map<string, number>()   // fairness: shifts assigned so far in this run
    for (const s of staged.values()) load.set(s.profileId, (load.get(s.profileId) ?? 0) + 1)

    for (const date of dates) {
      for (const sh of activeShifts) {
        const rule = ruleMap.get(sh.code)
        const ratio = (rule?.patient_ratio as number) ?? DEFAULT_RATIO
        const minN = (rule?.min_nurses as number) ?? DEFAULT_MIN_NURSES
        const required = Math.max(minN, Math.ceil(beds / ratio))
        // count already-covering nurses (existing rows + staged) for this unit/date/shift
        let have = 0
        for (const s of staged.values()) if (s.date === date && s.shift === sh.code) have++
        if (have < required) {
          const { count: existingCover } = await supabase.from('duty_roster')
            .select('id', { count: 'exact', head: true })
            .eq('nursing_unit_id', d.nursing_unit_id).eq('date', date).eq('shift', sh.code)
          have += existingCover ?? 0
        }
        if (have >= required) continue
        // candidates: not occupied/blocked that day, ranked by lowest load
        const candidates = nurseIds
          .filter(id => !occupied.has(`${id}|${date}`) && !blocked.has(`${id}|${date}`) && !staged.has(`${id}|${date}`))
          .sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))
        for (const id of candidates) {
          if (have >= required) break
          stage(id, date, sh.code, 'auto_fill')
          load.set(id, (load.get(id) ?? 0) + 1)
          have++
        }
      }
    }
  }

  const rows = [...staged.values()].map(s => ({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    profile_id: s.profileId,
    date: s.date,
    shift: s.shift,
    nursing_unit_id: d.nursing_unit_id,
    status: 'draft',
    source: s.source,
    created_by: actor.id,
  }))
  if (rows.length === 0) return { success: true, created: 0 }

  const { error } = await supabase.from('duty_roster').upsert(rows, { onConflict: 'profile_id,date', ignoreDuplicates: true })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_generate', 'duty_roster', d.nursing_unit_id, { created: rows.length, from: d.start_date, to: d.end_date })
  return { success: true, created: rows.length }
}

// ── roster patterns ────────────────────────────────────────────────────────────

export async function listPatterns(): Promise<RosterPattern[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('roster_patterns')
    .select('*, members:roster_pattern_members(*, profile:profiles(id, full_name, role))')
    .order('name')
  return (data ?? []) as unknown as RosterPattern[]
}

export async function upsertPattern(input: Record<string, unknown>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const parsed = RosterPatternSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const row = { tenant_id: actor.tenant_id, name: d.name, cycle_days: d.day_plan.length, day_plan: d.day_plan }
  const { error } = d.id
    ? await supabase.from('roster_patterns').update(row).eq('id', d.id)
    : await supabase.from('roster_patterns').insert({ id: crypto.randomUUID(), ...row })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, d.id ? 'update' : 'create', 'roster_pattern', d.id ?? d.name, { name: d.name })
  return { success: true }
}

export async function deletePattern(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('roster_patterns').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'roster_pattern', id, {})
  return { success: true }
}

export async function setPatternMembers(patternId: string, members: Array<{
  profile_id: string; nursing_unit_id?: string | null; anchor_date: string; offset_days?: number
}>): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'scheduling:manage')
  const supabase = await createClient()
  // replace-all semantics
  await supabase.from('roster_pattern_members').delete().eq('pattern_id', patternId)
  if (members.length) {
    const { error } = await supabase.from('roster_pattern_members').insert(members.map(m => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      pattern_id: patternId,
      profile_id: m.profile_id,
      nursing_unit_id: m.nursing_unit_id ?? null,
      anchor_date: m.anchor_date,
      offset_days: m.offset_days ?? 0,
    })))
    if (error) return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'set_members', 'roster_pattern', patternId, { count: members.length })
  return { success: true }
}
