'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { RadiologyCatalogSchema, RadiologyOrderSchema } from '@/lib/schemas'
import type { RadiologyOrder, RadiologyCatalog } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Catalog ----

export async function listRadiologyCatalog(modality?: string): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  let q = supabase.from('radiology_catalog').select('*').eq('is_active', true).order('name')
  if (modality) q = q.eq('modality', modality)
  const { data } = await q
  return (data ?? []) as RadiologyCatalog[]
}

export async function createRadiologyTest(
  input: Record<string, unknown>
): Promise<{ success: true; test: RadiologyCatalog } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  const parsed = RadiologyCatalogSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_catalog').insert({ id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'radiology_test', id, { name: parsed.data.name })
  const { data: test } = await supabase.from('radiology_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as RadiologyCatalog }
}

// ---- Orders ----

export async function createRadiologyOrder(
  input: Record<string, unknown>
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const parsed = RadiologyOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, visit_id, test_id } = parsed.data
  const supabase = await createClient()

  const { data: test } = await supabase
    .from('radiology_catalog').select('price').eq('id', test_id).single()
  if (!test) return { success: false, error: 'Test not found' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('radiology_orders').insert({
    id, patient_id, visit_id: visit_id ?? null, test_id,
    ordered_by: actor.id, price_snapshot: test.price,
    status: 'ordered', billing_status: 'unbilled',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'radiology_order', id, { patient_id, test_id })
  return { success: true, orderId: id }
}

export async function markPerformed(orderId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:process')
  const supabase = await createClient()
  const { error } = await supabase
    .from('radiology_orders').update({ status: 'performed' })
    .eq('id', orderId).eq('status', 'ordered')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'perform', 'radiology_order', orderId)
  return { success: true }
}

export async function uploadReport(
  orderId: string,
  report: string,
  imageUrl: string | null
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:process')
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_orders').update({
    report,
    image_url: imageUrl,
    status: 'reported',
    reported_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'report', 'radiology_order', orderId)
  return { success: true }
}

export async function cancelRadiologyOrder(orderId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const supabase = await createClient()
  const { error } = await supabase
    .from('radiology_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel', 'radiology_order', orderId)
  return { success: true }
}

export async function getRadiologyOrder(id: string): Promise<RadiologyOrder | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_orders')
    .select('*, patient:patients(id,full_name,uhid), test:radiology_catalog(*), orderer:profiles(id,full_name)')
    .eq('id', id).single()
  return data as unknown as RadiologyOrder | null
}

export async function listRadiologyOrders(filters?: {
  status?: string; visitId?: string; patientId?: string; modality?: string
}): Promise<RadiologyOrder[]> {
  const supabase = await createClient()
  let q = supabase
    .from('radiology_orders')
    .select('*, patient:patients(id,full_name,uhid), test:radiology_catalog(*), orderer:profiles(id,full_name)')
    .order('ordered_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.visitId) q = q.eq('visit_id', filters.visitId)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as RadiologyOrder[]
}
