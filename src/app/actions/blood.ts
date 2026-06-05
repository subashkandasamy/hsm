'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { BloodDonorSchema, BloodUnitSchema, BloodRequestSchema } from '@/lib/schemas'
import type { BloodDonor, BloodUnit, BloodRequest, BloodInventoryCell, BloodGroup, BloodComponent } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

const BLOOD_GROUPS: BloodGroup[]     = ['A+','A-','B+','B-','AB+','AB-','O+','O-']
const BLOOD_COMPONENTS: BloodComponent[] = ['whole','prbc','plasma','platelets']

// ---- Donors ----

export async function addDonor(
  input: Record<string, unknown>
): Promise<{ success: true; donor: BloodDonor } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodDonorSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('blood_donors').insert({ id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'blood_donor', id, { name: parsed.data.name })
  const { data: row } = await supabase.from('blood_donors').select('*').eq('id', id).single()
  return { success: true, donor: row as BloodDonor }
}

export async function listDonors(): Promise<BloodDonor[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('blood_donors').select('*').order('name')
  return (data ?? []) as BloodDonor[]
}

// ---- Blood Units ----

export async function addBloodUnit(
  input: Record<string, unknown>
): Promise<{ success: true; unit: BloodUnit } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const parsed = BloodUnitSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('blood_units').insert({
    id, ...parsed.data,
    donor_id:     parsed.data.donor_id ?? null,
    collected_at: parsed.data.collected_at ?? null,
    status: 'available',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add_unit', 'blood_unit', id, {
    blood_group: parsed.data.blood_group, component: parsed.data.component,
  })
  const { data: row } = await supabase.from('blood_units').select('*').eq('id', id).single()
  return { success: true, unit: row as BloodUnit }
}

export async function discardUnit(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('blood_units')
    .update({ status: 'discarded' }).eq('id', id).eq('status', 'available')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'discard', 'blood_unit', id)
  return { success: true }
}

export async function listUnits(filters?: {
  blood_group?: string; component?: string; status?: string
}): Promise<BloodUnit[]> {
  const supabase = await createClient()
  let q = supabase.from('blood_units')
    .select('*, donor:blood_donors(id, name)')
    .order('expiry', { ascending: true })
  if (filters?.blood_group) q = q.eq('blood_group', filters.blood_group)
  if (filters?.component)   q = q.eq('component', filters.component)
  if (filters?.status)      q = q.eq('status', filters.status)
  const { data } = await q.limit(500)
  return (data ?? []) as unknown as BloodUnit[]
}

// ---- Inventory ----

export async function getInventory(): Promise<BloodInventoryCell[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const in7   = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const { data: units } = await supabase
    .from('blood_units')
    .select('blood_group, component, status, expiry')
    .in('status', ['available', 'expired'])

  const cells: BloodInventoryCell[] = []
  for (const bg of BLOOD_GROUPS) {
    for (const comp of BLOOD_COMPONENTS) {
      const matching = (units ?? []).filter(
        (u) => u.blood_group === bg && u.component === comp
      )
      cells.push({
        blood_group: bg,
        component:   comp,
        available:   matching.filter((u) => u.status === 'available' && u.expiry >= today).length,
        near_expiry: matching.filter((u) => u.status === 'available' && u.expiry >= today && u.expiry <= in7).length,
        expired:     matching.filter((u) => u.expiry < today).length,
      })
    }
  }
  return cells
}

export async function expireOldUnits(): Promise<{ expired: number }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:manage')
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase.from('blood_units')
    .update({ status: 'expired' })
    .eq('status', 'available')
    .lt('expiry', today)
    .select('id')
  if (error) return { expired: 0 }
  await logAudit(actor.id, 'expire_units', 'blood_unit', null, { count: data?.length ?? 0 })
  return { expired: data?.length ?? 0 }
}

// ---- Requests ----

export async function raiseRequest(
  input: Record<string, unknown>
): Promise<{ success: true; requestId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:request')
  const parsed = BloodRequestSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('blood_requests').insert({
    id, ...parsed.data,
    notes:        parsed.data.notes ?? null,
    requested_by: actor.id,
    status:       'requested',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'raise_request', 'blood_request', id, {
    patient_id:  parsed.data.patient_id,
    blood_group: parsed.data.blood_group,
    component:   parsed.data.component,
  })
  return { success: true, requestId: id }
}

export async function crossMatch(requestId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:issue')
  const supabase = await createClient()
  const { error } = await supabase.from('blood_requests')
    .update({ status: 'cross_matched' }).eq('id', requestId).eq('status', 'requested')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cross_match', 'blood_request', requestId)
  return { success: true }
}

export async function cancelRequest(id: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:request')
  const supabase = await createClient()
  const { error } = await supabase.from('blood_requests')
    .update({ status: 'cancelled' }).eq('id', id).in('status', ['requested','cross_matched'])
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel_request', 'blood_request', id)
  return { success: true }
}

export async function listRequests(status?: string): Promise<BloodRequest[]> {
  const supabase = await createClient()
  let q = supabase.from('blood_requests').select(`
    *,
    patient:patients(id, full_name, uhid),
    requester:profiles(id, full_name)
  `).order('requested_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data } = await q.limit(200)
  return (data ?? []) as unknown as BloodRequest[]
}

// ---- Issue ----

export async function issueUnit(input: {
  requestId: string; bloodUnitId: string; priceSnapshot: number
}): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'bloodbank:issue')

  const supabase = await createClient()

  // Get patient_id from request
  const { data: req } = await supabase
    .from('blood_requests').select('patient_id').eq('id', input.requestId).single()
  if (!req) return { success: false, error: 'Request not found' }

  const issueId = crypto.randomUUID()
  const { data: result, error: rpcErr } = await supabase.rpc('issue_blood_unit', {
    p_issue_id:       issueId,
    p_request_id:     input.requestId,
    p_blood_unit_id:  input.bloodUnitId,
    p_patient_id:     req.patient_id,
    p_price_snapshot: input.priceSnapshot,
    p_issued_by:      actor.id,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }
  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Issue failed' }

  await logAudit(actor.id, 'issue_unit', 'blood_unit', input.bloodUnitId, {
    request_id: input.requestId, patient_id: req.patient_id,
  })
  return { success: true }
}

// Available units matching a request's blood_group + component for the issue dialog
export async function listAvailableUnitsForRequest(
  requestId: string
): Promise<BloodUnit[]> {
  const supabase = await createClient()
  const { data: req } = await supabase
    .from('blood_requests').select('blood_group, component').eq('id', requestId).single()
  if (!req) return []
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('blood_units')
    .select('*, donor:blood_donors(id, name)')
    .eq('blood_group', req.blood_group)
    .eq('component', req.component)
    .eq('status', 'available')
    .gte('expiry', today)
    .order('expiry', { ascending: true })
  return (data ?? []) as unknown as BloodUnit[]
}
