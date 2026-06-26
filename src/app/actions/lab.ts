'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { LabOrderSchema, LabTestCatalogSchema, LabResultItemSchema } from '@/lib/schemas'
import type { LabOrder, LabTestCatalog, LabOrderItem, LabFlag } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Catalog ----

export async function listLabCatalog(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_tests_catalog').select('*').eq('is_active', true).order('name')
  return (data ?? []) as LabTestCatalog[]
}

export async function createLabTest(
  input: Record<string, unknown>
): Promise<{ success: true; test: LabTestCatalog } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  const parsed = LabTestCatalogSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('lab_tests_catalog').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'lab_test', id, { name: parsed.data.name })
  const { data: test } = await supabase.from('lab_tests_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as LabTestCatalog }
}

// ---- Orders ----

export async function createLabOrder(
  input: Record<string, unknown>
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const parsed = LabOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { patient_id, visit_id, test_ids } = parsed.data

  // Snapshot prices from catalog
  const { data: tests } = await supabase
    .from('lab_tests_catalog').select('id, price').in('id', test_ids)
  if (!tests?.length) return { success: false, error: 'No valid tests selected' }

  const priceMap = new Map(tests.map((t) => [t.id, t.price as number]))
  const orderId = crypto.randomUUID()

  const { error: orderErr } = await supabase.from('lab_orders').insert({
    id: orderId, tenant_id: actor.tenant_id, patient_id, visit_id: visit_id ?? null,
    ordered_by: actor.id, status: 'ordered', billing_status: 'unbilled',
  })
  if (orderErr) return { success: false, error: orderErr.message }

  const items = test_ids.map((test_id) => ({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id, lab_order_id: orderId, test_id,
    price_snapshot: priceMap.get(test_id) ?? 0, flag: 'pending',
  }))

  const { error: itemErr } = await supabase.from('lab_order_items').insert(items)
  if (itemErr) return { success: false, error: itemErr.message }

  await logAudit(actor.id, 'create', 'lab_order', orderId, { patient_id, test_count: test_ids.length })
  return { success: true, orderId }
}

export async function collectSample(orderId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_orders').update({ status: 'collected' }).eq('id', orderId).eq('status', 'ordered')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'collect', 'lab_order', orderId)
  return { success: true }
}

export async function enterResults(
  orderId: string,
  items: Record<string, unknown>[]
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  const supabase = await createClient()

  for (const raw of items) {
    const parsed = LabResultItemSchema.safeParse(raw)
    if (!parsed.success) continue
    const { item_id, result_value, result_text, unit } = parsed.data

    // Fetch the catalog item to auto-flag
    const { data: item } = await supabase
      .from('lab_order_items')
      .select('test_id, lab_tests_catalog(ref_low, ref_high)')
      .eq('id', item_id).single()

    let flag: LabFlag = 'normal'
    if (result_value != null) {
      const cat = (item as Record<string, unknown>)?.lab_tests_catalog as
        { ref_low: number | null; ref_high: number | null } | null
      if (cat?.ref_high != null && result_value > cat.ref_high) flag = 'high'
      else if (cat?.ref_low != null && result_value < cat.ref_low) flag = 'low'
      else flag = 'normal'
    } else {
      flag = 'pending'
    }

    await supabase.from('lab_order_items').update({
      result_value: result_value ?? null,
      result_text: result_text ?? null,
      unit: unit ?? null,
      flag,
    }).eq('id', item_id)
  }

  await supabase.from('lab_orders').update({ status: 'processing' }).eq('id', orderId)
  await logAudit(actor.id, 'results', 'lab_order', orderId)
  return { success: true }
}

export async function reportOrder(orderId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  const supabase = await createClient()
  const { error } = await supabase.from('lab_orders').update({
    status: 'reported', reported_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'report', 'lab_order', orderId)
  return { success: true }
}

export async function cancelLabOrder(orderId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel', 'lab_order', orderId)
  return { success: true }
}

export async function getLabOrder(id: string): Promise<LabOrder | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_orders')
    .select(`*, patient:patients(id,full_name,uhid), orderer:profiles(id,full_name),
             items:lab_order_items(*, test:lab_tests_catalog(*))`)
    .eq('id', id).single()
  return data as unknown as LabOrder | null
}

export async function listLabOrders(filters?: {
  status?: string; visitId?: string; patientId?: string
}): Promise<LabOrder[]> {
  const supabase = await createClient()
  let q = supabase
    .from('lab_orders')
    .select(`*, patient:patients(id,full_name,uhid), orderer:profiles(id,full_name),
             items:lab_order_items(*, test:lab_tests_catalog(*))`)
    .order('ordered_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.visitId) q = q.eq('visit_id', filters.visitId)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as LabOrder[]
}
