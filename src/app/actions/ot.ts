'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { OtRoomSchema, OtScheduleSchema, OtConsumableSchema } from '@/lib/schemas'
import type { OtRoom, OtSchedule, OtConsumable, Profile } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Rooms ----

export async function createRoom(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:manage')
  const parsed = OtRoomSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('ot_rooms').insert({ id, tenant_id: actor.tenant_id, ...parsed.data, is_active: true })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'ot_room', id, { name: parsed.data.name })
  return { success: true }
}

export async function updateRoom(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ot:manage')
  const parsed = OtRoomSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('ot_rooms').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'ot_room', id)
  return { success: true }
}

export async function listRooms(): Promise<OtRoom[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('ot_rooms').select('*').eq('is_active', true).order('name')
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
    status: 'scheduled', billing_status: 'unbilled',
  })

  if (error) {
    // Postgres exclusion constraint violation = code 23P01
    if (error.code === '23P01' || error.message.includes('exclusion')) {
      return { success: false, error: 'Room already booked for this time slot. Please choose a different room or time.' }
    }
    return { success: false, error: error.message }
  }

  await logAudit(actor.id, 'create', 'ot_schedule', id, {
    patient_id: parsed.data.patient_id, procedure: parsed.data.procedure_name,
  })
  return { success: true, scheduleId: id }
}

export async function rescheduleSurgery(
  id: string,
  input: { start: string; end: string; otRoomId: string }
  await requireWriteAccess()
): Promise<SimpleResult> {
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
    consumables:ot_consumables(*)
  `).eq('id', id).single()
  return data as unknown as OtSchedule | null
}

export async function listSchedules(filters?: {
  date?: string   // YYYY-MM-DD — filters to schedules overlapping that day
  roomId?: string
}): Promise<OtSchedule[]> {
  const supabase = await createClient()
  let q = supabase.from('ot_schedules').select(`
    *,
    patient:patients(id, full_name, uhid),
    surgeon:profiles!ot_schedules_surgeon_id_fkey(id, full_name),
    anaesthetist:profiles!ot_schedules_anaesthetist_id_fkey(id, full_name),
    room:ot_rooms(id, name, is_active),
    consumables:ot_consumables(*)
  `).order('scheduled_start', { ascending: true })

  if (filters?.roomId) q = q.eq('ot_room_id', filters.roomId)

  if (filters?.date) {
    // Include schedules where any part of the procedure falls on the given date
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
    .in('role', ['doctor', 'admin'])
    .eq('is_active', true)
    .order('full_name')
  return (data ?? []) as Pick<Profile, 'id' | 'full_name' | 'role'>[]
}
