'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { computeLineGst } from '@/lib/gst'
import { getTenantGstConfig, resolveLineGst, recomputeBillGstTotals } from '@/lib/billing/gst'
import type { PharmacySale } from '@/lib/types'
import { istToday } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Cart lifecycle ----

export async function startPharmacySale(params: {
  patientId: string
  visitId?: string | null
}): Promise<{ success: true; saleId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('pharmacy_sales').insert({
    id,
    tenant_id: actor.tenant_id,
    patient_id: params.patientId,
    visit_id: params.visitId ?? null,
    status: 'draft',
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'pharmacy_sale', id, { patient_id: params.patientId })
  return { success: true, saleId: id }
}

export async function addSaleItem(params: {
  saleId: string
  prescriptionId?: string | null
  drugId: string
  qty: number
  /** The exact box, when a label of ours was scanned. */
  batchId?: string | null
}): Promise<{ success: true; itemId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const { saleId, prescriptionId, drugId, qty, batchId } = params
  if (qty <= 0) return { success: false, error: 'Quantity must be at least 1' }

  const supabase = await createClient()

  // Verify sale is still draft
  const { data: sale } = await supabase
    .from('pharmacy_sales').select('status').eq('id', saleId).single()
  if (!sale) return { success: false, error: 'Sale not found' }
  if (sale.status !== 'draft') return { success: false, error: 'Sale is already locked' }

  // Determine whether drugId is a tenant drug or a global drug_master entry
  const { data: tenantDrug } = await supabase
    .from('drugs').select('id').eq('id', drugId).maybeSingle()
  const isMasterDrug = !tenantDrug

  // The price comes from the box being sold: the scanned one, else the earliest
  // to expire.
  const today = istToday()
  const { data: batches } = batchId
    ? await supabase.from('drug_batches').select('mrp').eq('id', batchId).gt('expiry', today).gt('qty_available', 0).limit(1)
    : await supabase
        .from('drug_batches')
        .select('mrp')
        .or(`drug_id.eq.${drugId},drug_master_id.eq.${drugId}`)
        .gt('expiry', today)
        .gt('qty_available', 0)
        .order('expiry', { ascending: true })
        .limit(1)

  // No batch in date means there is nothing to sell. Without this the line was
  // added at ₹0 and the patient was billed nothing for it.
  if (!batches?.length) {
    return { success: false, error: batchId ? 'That box is empty or out of date' : 'That medicine has no stock in date — nothing to sell' }
  }
  const unitPrice = (batches[0].mrp as number) ?? 0
  if (unitPrice <= 0) return { success: false, error: 'That batch has no MRP set — fix it in Stock before selling' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('pharmacy_sale_items').insert({
    id,
    tenant_id: actor.tenant_id,
    pharmacy_sale_id: saleId,
    prescription_id: prescriptionId ?? null,
    drug_id:        isMasterDrug ? null : drugId,
    drug_master_id: isMasterDrug ? drugId : null,
    drug_batch_id:  batchId ?? null,
    qty,
    unit_price: unitPrice,
    amount: qty * unitPrice,
  })
  if (error) return { success: false, error: error.message }

  return { success: true, itemId: id }
}

export async function updateSaleItemQty(
  itemId: string,
  qty: number
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')
  if (qty <= 0) return { success: false, error: 'Quantity must be at least 1' }

  const supabase = await createClient()

  // Verify the parent sale is still draft
  const { data: item } = await supabase
    .from('pharmacy_sale_items')
    .select('unit_price, pharmacy_sale:pharmacy_sales(status)')
    .eq('id', itemId)
    .single()

  if (!item) return { success: false, error: 'Item not found' }
  const saleStatus = (item.pharmacy_sale as unknown as { status: string } | null)?.status
  if (saleStatus !== 'draft') return { success: false, error: 'Sale is already locked' }

  const unitPrice = item.unit_price as number
  const { error } = await supabase
    .from('pharmacy_sale_items')
    .update({ qty, amount: qty * unitPrice })
    .eq('id', itemId)
  if (error) return { success: false, error: error.message }

  return { success: true }
}

export async function removeSaleItem(itemId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const supabase = await createClient()

  // Verify the parent sale is still draft
  const { data: item } = await supabase
    .from('pharmacy_sale_items')
    .select('pharmacy_sale:pharmacy_sales(status)')
    .eq('id', itemId)
    .single()

  const saleStatus = (item?.pharmacy_sale as unknown as { status: string } | null)?.status
  if (saleStatus !== 'draft') return { success: false, error: 'Sale is already locked' }

  const { error } = await supabase.from('pharmacy_sale_items').delete().eq('id', itemId)
  if (error) return { success: false, error: error.message }

  return { success: true }
}

export async function finalizeSale(
  saleId: string
): Promise<{ success: true; billId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const supabase = await createClient()

  // Load sale + items
  const { data: sale } = await supabase
    .from('pharmacy_sales')
    .select('*, items:pharmacy_sale_items(*, drug:drugs(name), master:drug_master(name))')
    .eq('id', saleId)
    .single()

  if (!sale) return { success: false, error: 'Sale not found' }
  if (sale.status !== 'draft') return { success: false, error: 'Sale is already finalized' }

  const items = (sale.items ?? []) as Array<{
    id: string; drug_id: string | null; drug_master_id: string | null; qty: number; unit_price: number; amount: number
    drug: { name: string } | null; master: { name: string } | null
  }>
  if (!items.length) return { success: false, error: 'Add at least one item before finalizing' }

  const subtotal = items.reduce((s, i) => s + i.amount, 0)

  // Generate bill number
  const { data: billNoData, error: billNoErr } = await supabase.rpc('get_next_bill_no')
  if (billNoErr || !billNoData) return { success: false, error: 'Failed to generate bill number' }

  const billId = crypto.randomUUID()

  const { error: billErr } = await supabase.from('bills').insert({
    id: billId,
    tenant_id: actor.tenant_id,
    patient_id: sale.patient_id,
    visit_id: sale.visit_id ?? null,
    bill_no: billNoData as string,
    subtotal,
    discount: 0, tax: 0, total: subtotal, paid: 0,
    status: 'unpaid',
    created_by: actor.id,
  })
  if (billErr) return { success: false, error: billErr.message }

  // Resolve HSN + GST per drug from batches (drug-level attributes captured at
  // goods-receipt), so walk-in pharmacy sales bill GST correctly.
  const gstCfg = await getTenantGstConfig(supabase, actor.tenant_id)
  const gstByDrug = new Map<string, { hsn: string | null; gst: number | null }>()
  if (gstCfg.enabled) {
    const masterIds = [...new Set(items.map((i) => i.drug_master_id).filter(Boolean))] as string[]
    const drugIds = [...new Set(items.map((i) => i.drug_id).filter(Boolean))] as string[]
    if (masterIds.length) {
      const { data } = await supabase.from('drug_batches').select('drug_master_id, hsn_code, gst_rate').in('drug_master_id', masterIds)
      for (const b of data ?? []) {
        const k = b.drug_master_id as string
        if (k && !gstByDrug.has(k)) gstByDrug.set(k, { hsn: b.hsn_code as string | null, gst: b.gst_rate as number | null })
      }
    }
    if (drugIds.length) {
      const { data } = await supabase.from('drug_batches').select('drug_id, hsn_code, gst_rate').in('drug_id', drugIds)
      for (const b of data ?? []) {
        const k = b.drug_id as string
        if (k && !gstByDrug.has(k)) gstByDrug.set(k, { hsn: b.hsn_code as string | null, gst: b.gst_rate as number | null })
      }
    }
  }

  // Create one bill_item per pharmacy_sale_item
  const { error: itemErr } = await supabase.from('bill_items').insert(
    items.map((item) => {
      const key = (item.drug_master_id ?? item.drug_id) as string | null
      const drugGst = key ? gstByDrug.get(key) : undefined
      const { rate, inclusive, hsn } = resolveLineGst('pharmacy_sale_item', gstCfg, { gst_rate: drugGst?.gst ?? null, hsn_sac: drugGst?.hsn ?? null })
      const { taxableValue, taxAmount } = computeLineGst(item.amount, rate, inclusive)
      return {
        id: crypto.randomUUID(),
        tenant_id: actor.tenant_id,
        bill_id: billId,
        source: 'pharmacy_sale_item',
        ref_id: item.id,
        description: item.drug?.name ?? 'Medication',
        qty: item.qty,
        unit_price: item.unit_price,
        amount: item.amount,
        gst_rate: rate,
        tax_inclusive: inclusive,
        hsn_sac: hsn,
        taxable_value: taxableValue,
        tax_amount: taxAmount,
      }
    })
  )
  if (itemErr) {
    // Void, don't delete: the invoice number is already issued and must stay in sequence.
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
    return { success: false, error: itemErr.message }
  }

  // Set GST aggregates + total from the stamped items.
  await recomputeBillGstTotals(supabase, billId)

  // Lock the sale
  const { error: saleErr } = await supabase
    .from('pharmacy_sales')
    .update({ status: 'billed', bill_id: billId })
    .eq('id', saleId)
  if (saleErr) return { success: false, error: saleErr.message }

  await logAudit(actor.id, 'finalize', 'pharmacy_sale', saleId, { bill_id: billId, subtotal })
  return { success: true, billId }
}

export async function cancelSale(saleId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const supabase = await createClient()

  const { data: sale } = await supabase
    .from('pharmacy_sales').select('status, bill_id').eq('id', saleId).single()

  if (!sale) return { success: false, error: 'Sale not found' }
  if (sale.status === 'fulfilled') return { success: false, error: 'Fulfilled sales cannot be cancelled' }
  if (sale.status === 'cancelled') return { success: false, error: 'Sale is already cancelled' }

  // Cancel linked bill if unpaid
  if (sale.bill_id) {
    const { count } = await supabase
      .from('payments').select('id', { count: 'exact', head: true }).eq('bill_id', sale.bill_id)
    if ((count ?? 0) > 0) return { success: false, error: 'Cannot cancel — bill already has payments' }
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', sale.bill_id)
  }

  const { error } = await supabase
    .from('pharmacy_sales').update({ status: 'cancelled' }).eq('id', saleId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'cancel', 'pharmacy_sale', saleId)
  return { success: true }
}

export async function fulfillSale(saleId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const supabase = await createClient()

  const { data: sale } = await supabase
    .from('pharmacy_sales')
    .select('*, bill:bills(id, status), items:pharmacy_sale_items(*)')
    .eq('id', saleId)
    .single()

  if (!sale) return { success: false, error: 'Sale not found' }
  if (sale.status !== 'billed' && sale.status !== 'paid') {
    return { success: false, error: 'Sale must be finalized (billed) before fulfillment' }
  }

  // Gate: bill must be paid
  const bill = sale.bill as unknown as { id: string; status: string } | null
  if (!bill || bill.status !== 'paid') {
    return { success: false, error: 'Awaiting payment — hand over medicines only after payment is confirmed' }
  }

  const items = (sale.items ?? []) as Array<{
    drug_id: string | null; drug_master_id: string | null; prescription_id: string | null; qty: number; unit_price: number
    drug_batch_id: string | null
  }>

  const today = istToday()

  // The box that was scanned onto the line leaves the shelf. Where none was
  // scanned — or it has since been emptied — the earliest to expire goes first.
  for (const item of items) {
    const drugRef = item.drug_id ?? item.drug_master_id ?? ''
    const scanned = item.drug_batch_id
      ? await supabase.from('drug_batches').select('id, mrp, expiry, qty_available')
          .eq('id', item.drug_batch_id).gt('expiry', today).gte('qty_available', item.qty).limit(1)
      : null
    const { data: batches } = scanned?.data?.length
      ? scanned
      : await supabase
          .from('drug_batches')
          .select('id, mrp, expiry, qty_available')
          .or(`drug_id.eq.${drugRef},drug_master_id.eq.${drugRef}`)
          .gt('expiry', today)
          .gte('qty_available', item.qty)
          .order('expiry', { ascending: true })
          .limit(1)

    if (!batches?.length) {
      return {
        success: false,
        error: `Insufficient stock for one or more items — restock before fulfilling`,
      }
    }

    const batch = batches[0]
    const dispenseId = crypto.randomUUID()

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('dispense_drug', {
      p_dispense_id:     dispenseId,
      p_patient_id:      sale.patient_id,
      p_prescription_id: item.prescription_id ?? null,
      p_drug_id:         item.drug_id ?? null,
      p_drug_master_id:  item.drug_master_id ?? null,
      p_batch_id:        batch.id,
      p_qty:             item.qty,
      p_price_snapshot:  batch.mrp,
      p_dispensed_by:    actor.id,
    })

    if (rpcErr) return { success: false, error: rpcErr.message }

    const result = rpcResult as { ok: boolean; error?: string }
    if (!result.ok) return { success: false, error: result.error ?? 'Dispense failed' }
  }

  // Mark as fulfilled
  const { error } = await supabase
    .from('pharmacy_sales').update({ status: 'fulfilled' }).eq('id', saleId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'fulfill', 'pharmacy_sale', saleId, {
    patient_id: sale.patient_id, item_count: items.length,
  })
  return { success: true }
}

// ---- Reads ----

export async function getPharmacySale(saleId: string): Promise<PharmacySale | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pharmacy_sales')
    .select(`*, patient:patients(id,full_name,uhid),
             items:pharmacy_sale_items(*, drug:drugs(id,name,form,strength,unit), master:drug_master(id,name,form,strength,unit))`)
    .eq('id', saleId)
    .single()
  return data as unknown as PharmacySale | null
}

export async function listPharmacySales(filters?: {
  status?: string
  patientId?: string
}): Promise<PharmacySale[]> {
  const supabase = await createClient()
  let q = supabase
    .from('pharmacy_sales')
    .select(`*, patient:patients(id,full_name,uhid),
             items:pharmacy_sale_items(*, drug:drugs(id,name,form,strength,unit), master:drug_master(id,name,form,strength,unit)),
             bill:bills(id,bill_no,status,total,paid)`)
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as PharmacySale[]
}
