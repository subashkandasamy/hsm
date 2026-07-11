import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillItemSource } from '@/lib/types'

export interface IpdBillLineItem {
  source: BillItemSource
  ref_id?: string | null
  description: string
  qty: number
  unit_price: number
}

export type IpdBillSource = 'bed' | 'lab' | 'radiology' | 'ipd_pharmacy' | 'nursing' | 'nursing_morning' | 'nursing_night' | 'consolidated' | 'ot'

/**
 * Find-or-create the daily IPD bill for a given (admission, date, source) and
 * append any line items that don't already exist (idempotent by ref_id).
 * After creating/updating, auto-applies any unused advance credit inline.
 * Returns the bill_id, or null on error.
 */
export async function autoIpdBill(
  supabase: SupabaseClient,
  actorId: string,
  params: {
    tenantId: string
    admissionId: string
    patientId: string
    billingDate: string        // 'YYYY-MM-DD'
    billSource: IpdBillSource
    lineItems: IpdBillLineItem[]
  }
): Promise<string | null> {
  const { tenantId, admissionId, patientId, billingDate, billSource, lineItems } = params
  if (!lineItems.length) return null

  // ── 1. Find existing non-cancelled bill ──────────────────────────────────────
  const { data: existing } = await supabase
    .from('bills')
    .select('id, subtotal, total, paid')
    .eq('tenant_id', tenantId)
    .eq('admission_id', admissionId)
    .eq('billing_date', billingDate)
    .eq('bill_source', billSource)
    .neq('status', 'cancelled')
    .maybeSingle()

  let billId: string
  let currentSubtotal = 0

  if (existing) {
    billId = existing.id as string
    currentSubtotal = existing.subtotal as number

    // Find which ref_ids already have items on this bill (dedup)
    const refIds = lineItems.map((i) => i.ref_id).filter(Boolean) as string[]
    let alreadyBilledRefs = new Set<string>()
    if (refIds.length > 0) {
      const { data: existingItems } = await supabase
        .from('bill_items')
        .select('ref_id')
        .eq('bill_id', billId)
        .in('ref_id', refIds)
      alreadyBilledRefs = new Set((existingItems ?? []).map((i) => i.ref_id as string))
    }

    const newItems = lineItems.filter((i) => !i.ref_id || !alreadyBilledRefs.has(i.ref_id))
    if (!newItems.length) return billId

    const itemsToInsert = newItems.map((i) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      bill_id: billId,
      source: i.source,
      ref_id: i.ref_id ?? null,
      description: i.description,
      qty: i.qty,
      unit_price: i.unit_price,
      amount: i.qty * i.unit_price,
    }))
    const { error: insertErr } = await supabase.from('bill_items').insert(itemsToInsert)
    if (insertErr) return null

    const addedTotal = itemsToInsert.reduce((s, i) => s + i.amount, 0)
    currentSubtotal += addedTotal
    await supabase
      .from('bills')
      .update({ subtotal: currentSubtotal, total: currentSubtotal })
      .eq('id', billId)

  } else {
    // ── 2. Create new bill ───────────────────────────────────────────────────
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    if (!billNoData) return null

    billId = crypto.randomUUID()
    currentSubtotal = lineItems.reduce((s, i) => s + i.qty * i.unit_price, 0)

    const { error: billErr } = await supabase.from('bills').insert({
      id: billId,
      tenant_id: tenantId,
      patient_id: patientId,
      admission_id: admissionId,
      bill_no: billNoData as string,
      billing_date: billingDate,
      bill_source: billSource,
      subtotal: currentSubtotal,
      discount: 0,
      tax: 0,
      total: currentSubtotal,
      paid: 0,
      status: 'unpaid',
      created_by: actorId,
    })
    if (billErr) return null

    const { error: itemErr } = await supabase.from('bill_items').insert(
      lineItems.map((i) => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        bill_id: billId,
        source: i.source,
        ref_id: i.ref_id ?? null,
        description: i.description,
        qty: i.qty,
        unit_price: i.unit_price,
        amount: i.qty * i.unit_price,
      }))
    )
    if (itemErr) {
      await supabase.from('bills').delete().eq('id', billId)
      return null
    }
  }

  // ── 3. Auto-apply available advance credit (inline — same logic as generateBill) ──
  const { data: advRows } = await supabase
    .from('admission_advances')
    .select('amount')
    .eq('admission_id', admissionId)
  const totalAdvance = (advRows ?? []).reduce((s, a) => s + (a.amount as number), 0)

  if (totalAdvance > 0) {
    const { data: refRows } = await supabase
      .from('admission_advance_refunds')
      .select('amount')
      .eq('admission_id', admissionId)
    const totalRefunded = (refRows ?? []).reduce((s, r) => s + (r.amount as number), 0)

    const { data: priorBills } = await supabase
      .from('bills')
      .select('id')
      .eq('admission_id', admissionId)
      .neq('id', billId)
      .not('status', 'eq', 'cancelled')
    const priorIds = (priorBills ?? []).map((b) => b.id as string)

    let advanceApplied = 0
    if (priorIds.length > 0) {
      const { data: advPmts } = await supabase
        .from('payments')
        .select('amount')
        .in('bill_id', priorIds)
        .eq('method', 'advance')
      advanceApplied = (advPmts ?? []).reduce((s, p) => s + (p.amount as number), 0)
    }

    const unusedAdvance = Math.max(0, totalAdvance - totalRefunded - advanceApplied)

    // Fetch current bill paid amount (may have been partially paid already)
    const { data: billNow } = await supabase
      .from('bills')
      .select('paid, total')
      .eq('id', billId)
      .single()
    const alreadyPaid = (billNow?.paid as number) ?? 0
    const billTotal   = (billNow?.total as number) ?? currentSubtotal
    const remaining   = Math.max(0, billTotal - alreadyPaid)

    const applyAmount = Math.min(unusedAdvance, remaining)
    if (applyAmount > 0) {
      await supabase.from('payments').insert({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        bill_id: billId,
        amount: applyAmount,
        method: 'advance',
        received_by: actorId,
      })
      const newPaid   = alreadyPaid + applyAmount
      const newStatus = newPaid >= billTotal ? 'paid' : 'partial'
      await supabase.from('bills').update({ paid: newPaid, status: newStatus }).eq('id', billId)
    }
  }

  return billId
}
