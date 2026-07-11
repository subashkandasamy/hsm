'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { OtRoomSchema, OtScheduleSchema, OtConsumableSchema } from '@/lib/schemas'
import type { OtRoom, OtSchedule, OtConsumable, OtTeamMember, Profile } from '@/lib/types'
import { autoIpdBill } from '@/lib/ipdBilling'

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
  const { error } = await supabase.from('ot_schedules').insert({
    id, tenant_id: actor.tenant_id, ...parsed.data,
    anaesthetist_id: parsed.data.anaesthetist_id ?? null,
    admission_id: (input.admission_id as string | null) ?? null,
    status: 'scheduled', billing_status: 'unbilled',
  })

  if (error) {
    // Postgres exclusion constraint violation = code 23P01
    if (error.code === '23P01' || error.message.includes('exclusion')) {
      return { success: false, error: 'Room already booked for this time slot. Please choose a different room or time.' }
    }
    return { success: false, error: error.message }
  }

  // Auto-generate an OT bill when surgery is linked to an IPD admission
  const admissionId = (input.admission_id as string | null) ?? null
  if (admissionId && parsed.data.price_snapshot > 0) {
    const billingDate = parsed.data.scheduled_start.split('T')[0]
    await autoIpdBill(supabase, actor.id, {
      tenantId:    actor.tenant_id,
      admissionId,
      patientId:   parsed.data.patient_id,
      billingDate,
      billSource:  'ot',
      lineItems: [{
        source:      'ot',
        ref_id:      id,
        description: parsed.data.procedure_name,
        qty:         1,
        unit_price:  parsed.data.price_snapshot,
      }],
    })
  }

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
  const { error } = await supabase.from('ot_schedules')
    .update({ status: 'cancelled' }).eq('id', id).in('status', ['scheduled'])
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel', 'ot_schedule', id)
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
  const { error } = await supabase.from('ot_schedules').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, `status_${status}`, 'ot_schedule', id)
  return { success: true }
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
    const dayStart = `${filters.date}T00:00:00+00:00`
    const dayEnd   = `${filters.date}T23:59:59+00:00`
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
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('ot_consumables').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
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
    .eq('role', 'doctor')
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
