'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { WardCreateSchema } from '@/lib/schemas'
import type { Ward, Bed, BedStatus, WardWithBeds } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function createWard(
  input: Record<string, unknown>
): Promise<{ success: true; ward: Ward } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'wards:manage')

  const parsed = WardCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('wards').insert({
    id,
    tenant_id: actor.tenant_id,
    name: parsed.data.name,
    ward_type: parsed.data.ward_type ?? null,
    department_id: parsed.data.department_id ?? null,
  })
  if (error) return { success: false, error: error.message }

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
    .neq('status', 'occupied')   // cannot manually override an occupied bed
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

  // Fetch wards
  const { data: wards } = await supabase.from('wards').select('*').order('name')
  if (!wards?.length) return []

  // Fetch beds with current admission info via a join
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

  // Group beds by ward, flatten admission info
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

  return wards.map((w) => ({
    ...(w as Ward),
    beds: bedsByWard.get(w.id) ?? [],
  }))
}
