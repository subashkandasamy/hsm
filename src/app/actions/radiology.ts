'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { RadiologyCatalogSchema, RadiologyOrderSchema } from '@/lib/schemas'
import type { RadiologyOrder, RadiologyCatalog, RadiologyMaster } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Catalog ----

export async function listRadiologyCatalog(modality?: string): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  let q = supabase.from('radiology_catalog').select('*').eq('is_active', true).order('name')
  if (modality) q = q.eq('modality', modality)
  const { data } = await q
  return (data ?? []) as RadiologyCatalog[]
}

export async function listAllRadiologyCatalog(): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_catalog').select('*').order('name')
  return (data ?? []) as RadiologyCatalog[]
}

export async function updateRadiologyTest(
  id: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_catalog').update(input).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'radiology_test', id, input)
  return { success: true }
}

export async function createRadiologyTest(
  input: Record<string, unknown>
): Promise<{ success: true; test: RadiologyCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  const parsed = RadiologyCatalogSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_catalog').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'radiology_test', id, { name: parsed.data.name })
  const { data: test } = await supabase.from('radiology_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as RadiologyCatalog }
}

// ---- Orders ----

export async function createRadiologyOrder(
  input: Record<string, unknown>
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  await requireWriteAccess()
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
  const priceSnapshot = test.price as number

  const { error } = await supabase.from('radiology_orders').insert({
    id, tenant_id: actor.tenant_id, patient_id, visit_id: visit_id ?? null, test_id,
    ordered_by: actor.id, price_snapshot: priceSnapshot,
    status: 'ordered', billing_status: 'unbilled',
  })
  if (error) return { success: false, error: error.message }

  // Phase 15: auto-generate bill immediately on order creation
  if (priceSnapshot > 0) {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    const { data: testDetail } = await supabase
      .from('radiology_catalog').select('name').eq('id', test_id).single()
    if (billNoData) {
      const billId = crypto.randomUUID()
      const { error: billErr } = await supabase.from('bills').insert({
        id: billId,
        tenant_id: actor.tenant_id,
        patient_id,
        visit_id: visit_id ?? null,
        bill_no: billNoData as string,
        subtotal: priceSnapshot,
        discount: 0, tax: 0, total: priceSnapshot, paid: 0,
        status: 'unpaid',
        created_by: actor.id,
      })
      if (!billErr) {
        await supabase.from('bill_items').insert({
          id: crypto.randomUUID(),
          tenant_id: actor.tenant_id,
          bill_id: billId,
          source: 'radiology',
          ref_id: id,
          description: (testDetail?.name as string) ?? 'Radiology scan',
          qty: 1,
          unit_price: priceSnapshot,
          amount: priceSnapshot,
        })
        await supabase
          .from('radiology_orders')
          .update({ billing_status: 'billed' })
          .eq('id', id)
      }
    }
  }

  await logAudit(actor.id, 'create', 'radiology_order', id, { patient_id, test_id })
  return { success: true, orderId: id }
}

export async function markPerformed(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:process')
  const supabase = await createClient()

  // Fetch order to distinguish IPD (has admission_id) from OPD
  const { data: order } = await supabase
    .from('radiology_orders')
    .select('id, admission_id, patient_id, tenant_id, price_snapshot, test:radiology_catalog(name)')
    .eq('id', orderId)
    .single()

  if (order?.admission_id) {
    // IPD path: bill was created at order time — gate on payment before scan
    const { data: billItem } = await supabase
      .from('bill_items')
      .select('bill_id, bill:bills(id, status)')
      .eq('ref_id', orderId)
      .eq('source', 'radiology')
      .maybeSingle()
    const linkedBill = (billItem?.bill as unknown as { id: string; status: string } | null)
    if (linkedBill && linkedBill.status !== 'paid') {
      return { success: false, error: 'Awaiting payment — please collect payment before performing this scan' }
    }

    const { error } = await supabase
      .from('radiology_orders').update({ status: 'performed' })
      .eq('id', orderId).eq('status', 'ordered')
    if (error) return { success: false, error: error.message }

    await logAudit(actor.id, 'perform', 'radiology_order', orderId)
    return { success: true }
  }

  // OPD path: gate on payment before performing the scan
  const { data: billItem } = await supabase
    .from('bill_items')
    .select('bill_id, bill:bills(id, status)')
    .eq('ref_id', orderId)
    .eq('source', 'radiology')
    .maybeSingle()

  const linkedBill = (billItem?.bill as unknown as { id: string; status: string } | null)
  if (linkedBill && linkedBill.status !== 'paid') {
    return { success: false, error: 'Awaiting payment — please collect payment before performing this scan' }
  }

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
  await requireWriteAccess()
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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const supabase = await createClient()
  const { error } = await supabase
    .from('radiology_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }

  // Phase 15: cancel linked bill if it has no payments yet
  const { data: billItem } = await supabase
    .from('bill_items')
    .select('bill_id')
    .eq('ref_id', orderId)
    .eq('source', 'radiology')
    .maybeSingle()

  if (billItem?.bill_id) {
    const { count } = await supabase
      .from('payments').select('id', { count: 'exact', head: true }).eq('bill_id', billItem.bill_id)
    if ((count ?? 0) === 0) {
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billItem.bill_id)
    }
  }

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

// ---- Master Catalog ----

export async function listRadiologyMaster(): Promise<RadiologyMaster[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_master')
    .select('*')
    .eq('is_active', true)
    .order('modality')
    .order('body_part')
    .order('name')
  return (data ?? []) as RadiologyMaster[]
}

export async function activateRadiologyFromMaster(
  masterTestId: string,
  price: number,
): Promise<{ success: true; test: RadiologyCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:manage')
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('radiology_catalog')
    .select('id')
    .eq('radiology_master_id', masterTestId)
    .maybeSingle()
  if (existing) return { success: false, error: 'Already in your catalog' }

  const { data: master } = await supabase
    .from('radiology_master')
    .select('*')
    .eq('id', masterTestId)
    .single()
  if (!master) return { success: false, error: 'Procedure not found in master catalog' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('radiology_catalog').insert({
    id,
    tenant_id: actor.tenant_id,
    name: master.name as string,
    modality: master.modality as string,
    body_part: (master.body_part as string) || 'General',
    price,
    is_active: true,
    radiology_master_id: masterTestId,
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'activate', 'radiology_test', id, { name: master.name })
  const { data: test } = await supabase.from('radiology_catalog').select('*').eq('id', id).single()
  return { success: true, test: test as RadiologyCatalog }
}
