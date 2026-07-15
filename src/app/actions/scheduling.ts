'use server'

import { createClient } from '@/lib/supabase/server'
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

type Result = { success: true } | { success: false; error: string }

const DEFAULT_RATIO = 6      // fallback nurse:patient ratio when no ward rule exists
const DEFAULT_MIN_NURSES = 1

// ── helpers ──────────────────────────────────────────────────────────────────

function eachDate(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
  return out
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Admin (scheduling:manage) can manage any ward; a ward in-charge can manage only theirs. */
async function assertCanManageWard(wardId: string): Promise<{ id: string; tenant_id: string; role: string }> {
  const actor = await getActorProfile()
  if (hasPermission(actor.role, 'scheduling:manage')) return actor
  const supabase = await createClient()
  const { data } = await supabase
    .from('ward_incharges').select('id')
    .eq('ward_id', wardId).eq('profile_id', actor.id).maybeSingle()
  if (!data) throw new Error('FORBIDDEN')
  return actor
}

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
    .select('*, ward:wards(id, name)')
    .order('ward_id')
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
    ward_id: d.ward_id, shift_code: d.shift_code,
    patient_ratio: d.patient_ratio, min_nurses: d.min_nurses,
  }, { onConflict: 'tenant_id,ward_id,shift_code', ignoreDuplicates: false })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'upsert', 'ward_coverage_rule', `${d.ward_id}:${d.shift_code}`, d)
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

// ── ward in-charges ──────────────────────────────────────────────────────────────

export async function listWardIncharges(): Promise<WardIncharge[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ward_incharges')
    .select('*, ward:wards(id, name), profile:profiles(id, full_name, role)')
    .order('ward_id')
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
    ward_id: parsed.data.ward_id,
    profile_id: parsed.data.profile_id,
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Already an in-charge of this ward' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'add', 'ward_incharge', parsed.data.ward_id, parsed.data)
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
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: parsed.data.decision, reviewed_by: actor.id, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, parsed.data.decision, 'leave', parsed.data.id, {})
  return { success: true }
}

export async function cancelLeave(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  const supabase = await createClient()
  // A user may cancel their own pending request; managers may cancel any pending one.
  let q = supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending')
  if (!hasPermission(actor.role, 'leave:approve')) q = q.eq('profile_id', actor.id)
  const { error } = await q
  if (error) return { success: false, error: error.message }
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
 * Required vs assigned nurses per active shift for a ward on a date.
 * required = max(min_nurses, ceil(occupied_beds / ratio)); occupied beds use
 * the current admitted census as the planning estimate.
 */
export async function computeWardCoverage(wardId: string, date: string): Promise<ShiftCoverage[]> {
  const supabase = await createClient()
  const [{ count: occupied }, shifts, rulesRes, rosterRes] = await Promise.all([
    supabase.from('admissions').select('id', { count: 'exact', head: true })
      .eq('ward_id', wardId).eq('status', 'admitted'),
    listShiftDefinitions(true),
    supabase.from('ward_coverage_rules').select('shift_code, patient_ratio, min_nurses').eq('ward_id', wardId),
    supabase.from('duty_roster').select('shift').eq('ward_id', wardId).eq('date', date),
  ])
  const beds = occupied ?? 0
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
      ward_id: wardId, shift_code: s.code,
      required, assigned: assignedByShift.get(s.code) ?? 0, occupied_beds: beds,
    }
  })
}

// ── roster grid ───────────────────────────────────────────────────────────────

export async function getWardRoster(params: { wardId: string; weekStart: string }): Promise<WardRosterData> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  const { wardId, weekStart } = params
  const weekEnd = shiftDate(weekStart, 6)

  const [rosterRes, nursesRes, shifts, coverage, inchargeRes] = await Promise.all([
    supabase.from('duty_roster')
      .select('*, profile:profiles(id, full_name, role)')
      .eq('ward_id', wardId).gte('date', weekStart).lte('date', weekEnd).order('date'),
    supabase.from('profiles').select('id, full_name').eq('role', 'nurse').eq('is_active', true).order('full_name'),
    listShiftDefinitions(true),
    computeWardCoverage(wardId, weekStart),
    supabase.from('ward_incharges').select('id').eq('ward_id', wardId).eq('profile_id', actor.id).maybeSingle(),
  ])

  const canManage = hasPermission(actor.role, 'scheduling:manage') || !!inchargeRes.data
  return {
    roster: (rosterRes.data ?? []) as unknown as DutyRoster[],
    nurses: (nursesRes.data ?? []) as { id: string; full_name: string }[],
    shifts, coverage, canManage, weekStart,
  }
}

/** Assign (or move) a nurse to a ward+shift on a date. One shift per nurse per day. */
export async function setRosterCell(params: {
  wardId: string; profileId: string; date: string; shift: string
}): Promise<Result> {
  await requireWriteAccess()
  const actor = await assertCanManageWard(params.wardId)
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
    ward_id: params.wardId,
    status: 'published',
    source: 'manual',
    created_by: actor.id,
  }, { onConflict: 'profile_id,date', ignoreDuplicates: false })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_set', 'duty_roster', params.profileId, { date: params.date, shift: params.shift, ward: params.wardId })
  return { success: true }
}

export async function clearRosterCell(params: { wardId: string; profileId: string; date: string }): Promise<Result> {
  await requireWriteAccess()
  const actor = await assertCanManageWard(params.wardId)
  const supabase = await createClient()
  const { error } = await supabase.from('duty_roster').delete()
    .eq('profile_id', params.profileId).eq('date', params.date).eq('ward_id', params.wardId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_clear', 'duty_roster', params.profileId, { date: params.date })
  return { success: true }
}

export async function publishRoster(params: { wardId: string; start: string; end: string }): Promise<Result> {
  await requireWriteAccess()
  const actor = await assertCanManageWard(params.wardId)
  const supabase = await createClient()
  const { error } = await supabase.from('duty_roster')
    .update({ status: 'published' })
    .eq('ward_id', params.wardId).gte('date', params.start).lte('date', params.end).eq('status', 'draft')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_publish', 'duty_roster', params.wardId, params)
  return { success: true }
}

/**
 * Fill EMPTY nurse/day slots for a ward across a range using:
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
  const actor = await assertCanManageWard(d.ward_id)
  const supabase = await createClient()

  const dates = eachDate(d.start_date, d.end_date)
  if (dates.length === 0) return { success: false, error: 'Empty date range' }
  if (dates.length > 62) return { success: false, error: 'Range too large (max ~2 months)' }

  const activeShifts = await listShiftDefinitions(true)
  const activeCodes = new Set(activeShifts.map(s => s.code))
  if (activeCodes.size === 0) return { success: false, error: 'No active shifts configured' }

  // occupied slots = existing roster rows for these nurses in the range (any ward — one shift/day)
  const { data: existingRows } = await supabase
    .from('duty_roster').select('profile_id, date')
    .gte('date', d.start_date).lte('date', d.end_date)
  const occupied = new Set((existingRows ?? []).map(r => `${r.profile_id}|${r.date}`))
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
        if (m.ward_id && m.ward_id !== d.ward_id) continue
        const anchor = new Date((m.anchor_date as string) + 'T00:00:00').getTime()
        const offset = (m.offset_days as number) ?? 0
        for (const date of dates) {
          const dayDiff = Math.round((new Date(date + 'T00:00:00').getTime() - anchor) / 86400000)
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
      .select('profile_id, date, shift').eq('ward_id', d.ward_id)
      .gte('date', priorStart).lte('date', priorEnd)
    for (const r of prior ?? []) {
      const target = shiftDate(r.date as string, 7)
      if (target < d.start_date || target > d.end_date) continue
      if (r.shift) stage(r.profile_id as string, target, r.shift as string, 'copy_forward')
    }
  }

  // 3. coverage auto-fill (ratio-driven) from available nurses, fairness by load
  if (d.auto_fill) {
    const [{ count: occBeds }, rulesRes, nursesRes] = await Promise.all([
      supabase.from('admissions').select('id', { count: 'exact', head: true }).eq('ward_id', d.ward_id).eq('status', 'admitted'),
      supabase.from('ward_coverage_rules').select('shift_code, patient_ratio, min_nurses').eq('ward_id', d.ward_id),
      supabase.from('profiles').select('id').eq('role', 'nurse').eq('is_active', true),
    ])
    const beds = occBeds ?? 0
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
        // count already-covering nurses (existing rows + staged) for this ward/date/shift
        let have = 0
        for (const s of staged.values()) if (s.date === date && s.shift === sh.code) have++
        // NOTE: existing rows for this ward/date/shift also count toward coverage
        // (existingRows only carries profile_id/date; refine with a targeted count)
        if (have < required) {
          const { count: existingCover } = await supabase.from('duty_roster')
            .select('id', { count: 'exact', head: true })
            .eq('ward_id', d.ward_id).eq('date', date).eq('shift', sh.code)
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
    ward_id: d.ward_id,
    status: 'draft',
    source: s.source,
    created_by: actor.id,
  }))
  if (rows.length === 0) return { success: true, created: 0 }

  const { error } = await supabase.from('duty_roster').upsert(rows, { onConflict: 'profile_id,date', ignoreDuplicates: true })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'roster_generate', 'duty_roster', d.ward_id, { created: rows.length, from: d.start_date, to: d.end_date })
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
  profile_id: string; ward_id?: string | null; anchor_date: string; offset_days?: number
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
      ward_id: m.ward_id ?? null,
      anchor_date: m.anchor_date,
      offset_days: m.offset_days ?? 0,
    })))
    if (error) return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'set_members', 'roster_pattern', patternId, { count: members.length })
  return { success: true }
}
