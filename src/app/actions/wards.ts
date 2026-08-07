'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { WardCreateSchema, NursingUnitSchema } from '@/lib/schemas'
import type { Ward, Bed, BedStatus, WardWithBeds, WardRoomType, NursingUnit } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Nursing units (wings — the rosterable unit) ----

export async function listNursingUnits(): Promise<NursingUnit[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nursing_units').select('*')
    .order('block').order('floor').order('wing')
  return (data ?? []) as NursingUnit[]
}

export async function createNursingUnit(
  input: Record<string, unknown>
): Promise<{ success: true; unit: NursingUnit } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')
  const parsed = NursingUnitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('nursing_units').insert({
    id, tenant_id: actor.tenant_id,
    block: d.block.trim(), floor: d.floor.trim(), wing: d.wing.trim(),
    station_name: d.station_name?.trim() || null,
    target_ratio: d.target_ratio, is_active: d.is_active,
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'A unit with this Block · Floor · Wing already exists' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'create', 'nursing_unit', id, { block: d.block, floor: d.floor, wing: d.wing })
  const { data } = await supabase.from('nursing_units').select('*').eq('id', id).single()
  return { success: true, unit: data as NursingUnit }
}

export async function updateNursingUnit(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')
  const parsed = NursingUnitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.from('nursing_units').update({
    block: d.block.trim(), floor: d.floor.trim(), wing: d.wing.trim(),
    station_name: d.station_name?.trim() || null,
    target_ratio: d.target_ratio, is_active: d.is_active,
  }).eq('id', id)
  if (error) {
    if (error.code === '23505') return { success: false, error: 'A unit with this Block · Floor · Wing already exists' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'update', 'nursing_unit', id, input as Record<string, unknown>)
  return { success: true }
}

export async function deleteNursingUnit(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')
  const supabase = await createClient()
  // Detach rooms first so the FK (ON DELETE SET NULL) is explicit, then delete.
  await supabase.from('wards').update({ nursing_unit_id: null }).eq('nursing_unit_id', id)
  const { error } = await supabase.from('nursing_units').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') return { success: false, error: 'This unit is still used by rosters — clear its roster first.' }
    return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'delete', 'nursing_unit', id, {})
  return { success: true }
}

// ---- Room type catalog ----

export async function listWardRoomTypes(): Promise<WardRoomType[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ward_room_types')
    .select('*')
    .order('name')
  return (data ?? []) as WardRoomType[]
}

export async function createWardRoomType(input: {
  name: string
  daily_rate: number
  is_multi_bed: boolean
  is_icu?: boolean
}): Promise<{ success: true; roomType: WardRoomType } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const trimmed = input.name.trim()
  if (!trimmed) return { success: false, error: 'Name is required' }
  if (input.daily_rate < 0) return { success: false, error: 'Rate cannot be negative' }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('ward_room_types').insert({
    id,
    tenant_id: actor.tenant_id,
    name: trimmed,
    daily_rate: input.daily_rate,
    is_multi_bed: input.is_multi_bed,
    is_icu: input.is_icu ?? false,
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Room type already exists' }
    return { success: false, error: error.message }
  }

  const { data } = await supabase.from('ward_room_types').select('*').eq('id', id).single()
  return { success: true, roomType: data as WardRoomType }
}

export async function updateWardRoomType(
  id: string,
  input: { name: string; daily_rate: number; is_icu?: boolean }
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const trimmed = input.name.trim()
  if (!trimmed) return { success: false, error: 'Name is required' }
  if (input.daily_rate < 0) return { success: false, error: 'Rate cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ward_room_types')
    .update({ name: trimmed, daily_rate: input.daily_rate, ...(input.is_icu !== undefined ? { is_icu: input.is_icu } : {}) })
    .eq('id', id)
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Room type name already exists' }
    return { success: false, error: error.message }
  }

  // Sync rate to all wards of this type
  await supabase.from('wards').update({ daily_rate: input.daily_rate }).eq('room_type_id', id)

  await logAudit(actor.id, 'update', 'ward_room_type', id, input as Record<string, unknown>)
  return { success: true }
}

export async function updateWardRoomTypeRate(
  id: string,
  dailyRate: number
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')
  if (dailyRate < 0) return { success: false, error: 'Rate cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ward_room_types')
    .update({ daily_rate: dailyRate })
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  // Sync rate to all wards of this type so billing can still read ward.daily_rate
  await supabase
    .from('wards')
    .update({ daily_rate: dailyRate })
    .eq('room_type_id', id)

  await logAudit(actor.id, 'update', 'ward_room_type_rate', id, { daily_rate: dailyRate })
  return { success: true }
}

export async function deleteWard(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const supabase = await createClient()

  const { data: occupied } = await supabase
    .from('beds').select('id').eq('ward_id', id).eq('status', 'occupied').limit(1)
  if (occupied && occupied.length > 0)
    return { success: false, error: 'Cannot delete a ward with occupied beds' }

  const { error } = await supabase.from('wards').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'ward', id, {})
  return { success: true }
}

export async function deleteWardRoomType(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const supabase = await createClient()

  // Block if any bed in any room of this type is occupied
  const { data: occupiedBeds } = await supabase
    .from('beds')
    .select('id, wards!inner(room_type_id)')
    .eq('wards.room_type_id', id)
    .eq('status', 'occupied')
    .limit(1)

  if (occupiedBeds && occupiedBeds.length > 0) {
    return { success: false, error: 'Cannot delete: one or more rooms of this type have admitted patients.' }
  }

  // Delete all wards (rooms) of this type first
  const { error: wardsErr } = await supabase.from('wards').delete().eq('room_type_id', id)
  if (wardsErr) return { success: false, error: wardsErr.message }

  const { error } = await supabase.from('ward_room_types').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'ward_room_type', id, {})
  return { success: true }
}

// ---- Ward / Room CRUD ----

export async function createWard(
  input: Record<string, unknown>
): Promise<{ success: true; ward: Ward } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const parsed = WardCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Look up room type to get rate and is_multi_bed
  let inheritedRate = parsed.data.daily_rate ?? 0
  let isMultiBed = false
  if (parsed.data.room_type_id) {
    const { data: rt } = await supabase
      .from('ward_room_types')
      .select('daily_rate, is_multi_bed')
      .eq('id', parsed.data.room_type_id)
      .single()
    if (rt) {
      inheritedRate = rt.daily_rate as number
      isMultiBed = rt.is_multi_bed as boolean
    }
  }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('wards').insert({
    id,
    tenant_id: actor.tenant_id,
    name: parsed.data.name,
    ward_type: parsed.data.ward_type ?? null,
    room_type_id: parsed.data.room_type_id ?? null,
    nursing_unit_id: parsed.data.nursing_unit_id ?? null,
    floor: parsed.data.floor ?? null,
    block: parsed.data.block ?? null,
    department_id: parsed.data.department_id ?? null,
    is_temp: parsed.data.is_temp ?? false,
    daily_rate: inheritedRate,
  })
  if (error) return { success: false, error: error.message }

  // Private single-room: auto-create 1 bed so the room can be admitted to
  if (!isMultiBed && !parsed.data.is_temp) {
    await supabase.from('beds').insert({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      ward_id: id,
      bed_no: '1',
      status: 'available' as BedStatus,
    })
  }

  await logAudit(actor.id, 'create', 'ward', id, { name: parsed.data.name })

  const { data: ward } = await supabase.from('wards').select('*').eq('id', id).single()
  return { success: true, ward: ward as Ward }
}

export async function updateWard(
  id: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const parsed = WardCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('wards').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'ward', id, parsed.data as Record<string, unknown>)
  return { success: true }
}

export async function updateWardDetails(
  id: string,
  input: { name: string; room_type_id: string | null; nursing_unit_id?: string | null; floor: string | null; block: string | null }
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const supabase = await createClient()

  // If room_type changed, sync daily_rate
  let dailyRateUpdate: number | undefined
  if (input.room_type_id) {
    const { data: rt } = await supabase
      .from('ward_room_types').select('daily_rate').eq('id', input.room_type_id).single()
    if (rt) dailyRateUpdate = rt.daily_rate as number
  }

  const { error } = await supabase.from('wards').update({
    name: input.name,
    room_type_id: input.room_type_id,
    ...(input.nursing_unit_id !== undefined ? { nursing_unit_id: input.nursing_unit_id } : {}),
    floor: input.floor,
    block: input.block,
    ...(dailyRateUpdate !== undefined ? { daily_rate: dailyRateUpdate } : {}),
  }).eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'ward', id, input as Record<string, unknown>)
  return { success: true }
}

// Kept for the inline rate edit on ward cards (per-room override)
export async function updateWardRate(wardId: string, dailyRate: number): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')
  if (dailyRate < 0) return { success: false, error: 'Rate cannot be negative' }
  const supabase = await createClient()
  const { error } = await supabase.from('wards').update({ daily_rate: dailyRate }).eq('id', wardId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'ward_rate', wardId, { daily_rate: dailyRate })
  return { success: true }
}

export async function addBeds(
  wardId: string,
  bedNumbers: string[]
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  if (bedNumbers.length === 0) return { success: false, error: 'No bed numbers provided' }

  const rows = bedNumbers.map((bed_no) => ({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    ward_id: wardId,
    bed_no: bed_no.trim(),
    status: 'available' as BedStatus,
  }))

  const supabase = await createClient()
  const { error } = await supabase.from('beds').insert(rows)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'add_beds', 'ward', wardId, { count: rows.length, beds: bedNumbers })
  return { success: true, count: rows.length }
}

export async function setBedStatus(
  bedId: string,
  status: 'available' | 'maintenance'
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const supabase = await createClient()
  const { error } = await supabase
    .from('beds')
    .update({ status })
    .eq('id', bedId)
    .neq('status', 'occupied')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'set_bed_status', 'bed', bedId, { status })
  return { success: true }
}

export async function listWards(): Promise<Ward[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('wards').select('*').order('name')
  return (data ?? []) as Ward[]
}

export async function listAvailableBeds(wardId?: string): Promise<Bed[]> {
  const supabase = await createClient()
  let q = supabase.from('beds').select('*').eq('status', 'available').order('bed_no')
  if (wardId) q = q.eq('ward_id', wardId)
  const { data } = await q
  return (data ?? []) as Bed[]
}

export async function getWardBoard(): Promise<WardWithBeds[]> {
  const supabase = await createClient()

  const { data: wards } = await supabase
    .from('wards')
    .select('*, room_type_data:ward_room_types(id, name, daily_rate, is_multi_bed, is_icu)')
    .order('name')
  if (!wards?.length) return []

  // Fetch beds with current admission info
  const { data: bedsRaw } = await supabase
    .from('beds')
    .select(`
      id, ward_id, bed_no, status,
      admissions!admissions_bed_id_fkey(
        id,
        patients(id, full_name, uhid)
      )
    `)
    .order('bed_no')

  const bedsByWard = new Map<string, WardWithBeds['beds']>()
  for (const b of (bedsRaw ?? [])) {
    const admissions = (b as Record<string, unknown>).admissions as Array<{
      id: string
      patients: { id: string; full_name: string; uhid: string } | null
    }> | null

    const activeAdmission = admissions?.find(() => true) ?? null

    const bed = {
      id: b.id,
      ward_id: b.ward_id,
      bed_no: b.bed_no,
      status: b.status as BedStatus,
      created_at: '',
      admission_id: activeAdmission?.id ?? null,
      patient_name: activeAdmission?.patients?.full_name ?? null,
      patient_uhid: activeAdmission?.patients?.uhid ?? null,
    }

    const list = bedsByWard.get(b.ward_id) ?? []
    list.push(bed)
    bedsByWard.set(b.ward_id, list)
  }

  return wards.map((w) => {
    const ward = w as Ward & { room_type_data: WardWithBeds['room_type_data'] }
    const allBeds = bedsByWard.get(w.id) ?? []
    const beds = ward.is_temp ? allBeds.filter(b => b.status === 'occupied') : allBeds
    return { ...ward, beds }
  })
}
