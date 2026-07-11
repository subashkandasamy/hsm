'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { LabOrderSchema, LabTestCatalogSchema, LabResultItemSchema } from '@/lib/schemas'
import type { LabOrder, LabTestCatalog, LabTestMaster, LabOrderItem, LabFlag } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Master catalog (global, platform-managed) ----

export async function listLabMaster(): Promise<LabTestMaster[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_tests_master').select('*').eq('is_active', true).order('name')
  return (data ?? []) as LabTestMaster[]
}

export async function activateFromMaster(
  masterTestId: string,
  price: number
): Promise<{ success: true; test: LabTestCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  const supabase = await createClient()

  // Guard: don't duplicate if already activated by this tenant
  const { data: existing } = await supabase
    .from('lab_tests_catalog')
    .select('id')
    .eq('lab_master_id', masterTestId)
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()
  if (existing?.id) return { success: false, error: 'This test is already in your catalog' }

  const { data: master } = await supabase
    .from('lab_tests_master').select('*').eq('id', masterTestId).single()
  if (!master) return { success: false, error: 'Master test not found' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('lab_tests_catalog').insert({
    id,
    tenant_id:       actor.tenant_id,
    lab_master_id:   masterTestId,
    name:            master.name,
    code:            master.code ?? null,
    category:        (master as Record<string, unknown>).category as string ?? 'General',
    sample_type:     master.sample_type ?? null,
    unit:            master.unit ?? null,
    ref_low:         master.ref_low ?? null,
    ref_high:        master.ref_high ?? null,
    reference_range: master.reference_range ?? null,
    price,
    is_active:       true,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'activate', 'lab_test', id, { master_id: masterTestId, price })
  const { data: test } = await supabase.from('lab_tests_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as LabTestCatalog }
}

// ---- Catalog ----

export async function listLabCatalog(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_tests_catalog').select('*').eq('is_active', true).order('name')
  return (data ?? []) as LabTestCatalog[]
}

export async function listAllLabCatalog(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_tests_catalog').select('*').order('name')
  return (data ?? []) as LabTestCatalog[]
}

export async function updateLabTest(
  id: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('lab_tests_catalog').update(input).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'lab_test', id, input)
  return { success: true }
}

export async function createLabTest(
  input: Record<string, unknown>
): Promise<{ success: true; test: LabTestCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const parsed = LabOrderSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { patient_id, visit_id, test_ids } = parsed.data

  // Snapshot prices from catalog
  const { data: tests } = await supabase
    .from('lab_tests_catalog').select('id, price, name').in('id', test_ids)
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

  // Phase 15: auto-generate bill for this order immediately
  const totalAmount = items.reduce((s, i) => s + i.price_snapshot, 0)
  if (totalAmount > 0) {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    if (billNoData) {
      const billId = crypto.randomUUID()
      const { error: billErr } = await supabase.from('bills').insert({
        id: billId,
        tenant_id: actor.tenant_id,
        patient_id,
        visit_id: visit_id ?? null,
        bill_no: billNoData as string,
        subtotal: totalAmount,
        discount: 0, tax: 0, total: totalAmount, paid: 0,
        status: 'unpaid',
        created_by: actor.id,
      })
      if (!billErr) {
        await supabase.from('bill_items').insert(
          items.map((item) => ({
            id: crypto.randomUUID(),
            tenant_id: actor.tenant_id,
            bill_id: billId,
            source: 'lab',
            ref_id: orderId,
            description: tests?.find((t) => t.id === item.test_id)?.name ?? 'Lab test',
            qty: 1,
            unit_price: item.price_snapshot,
            amount: item.price_snapshot,
          }))
        )
        // Mark order as billed
        await supabase
          .from('lab_orders')
          .update({ billing_status: 'billed' })
          .eq('id', orderId)
      }
    }
  }

  await logAudit(actor.id, 'create', 'lab_order', orderId, { patient_id, test_count: test_ids.length })
  return { success: true, orderId }
}

export async function collectSample(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  const supabase = await createClient()

  // Fetch order to distinguish IPD (has admission_id) from OPD
  const { data: order } = await supabase
    .from('lab_orders')
    .select('id, admission_id, patient_id, tenant_id, items:lab_order_items(id, price_snapshot, test:lab_tests_catalog(name))')
    .eq('id', orderId)
    .single()

  if (order?.admission_id) {
    // IPD path: bill was created at order time — gate on payment before collection
    const { data: billItem } = await supabase
      .from('bill_items')
      .select('bill_id, bill:bills(id, status)')
      .eq('ref_id', orderId)
      .eq('source', 'lab')
      .maybeSingle()
    const linkedBill = (billItem?.bill as unknown as { id: string; status: string } | null)
    if (linkedBill && linkedBill.status !== 'paid') {
      return { success: false, error: 'Awaiting payment — please collect payment before collecting the sample' }
    }

    const { error } = await supabase
      .from('lab_orders').update({ status: 'collected' }).eq('id', orderId).eq('status', 'ordered')
    if (error) return { success: false, error: error.message }

    await logAudit(actor.id, 'collect', 'lab_order', orderId)
    return { success: true }
  }

  // OPD path: gate on payment before sample collection
  const { data: billItem } = await supabase
    .from('bill_items')
    .select('bill_id, bill:bills(id, status)')
    .eq('ref_id', orderId)
    .eq('source', 'lab')
    .maybeSingle()

  const linkedBill = (billItem?.bill as unknown as { id: string; status: string } | null)
  if (linkedBill && linkedBill.status !== 'paid') {
    return { success: false, error: 'Awaiting payment — please collect payment before collecting the sample' }
  }

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
  await requireWriteAccess()
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
  await requireWriteAccess()
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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const supabase = await createClient()
  const { error } = await supabase
    .from('lab_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }

  // Phase 15: cancel linked bill if it has no payments yet
  const { data: billItem } = await supabase
    .from('bill_items')
    .select('bill_id')
    .eq('ref_id', orderId)
    .eq('source', 'lab')
    .maybeSingle()

  if (billItem?.bill_id) {
    const { count } = await supabase
      .from('payments').select('id', { count: 'exact', head: true }).eq('bill_id', billItem.bill_id)
    if ((count ?? 0) === 0) {
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billItem.bill_id)
    }
  }

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
