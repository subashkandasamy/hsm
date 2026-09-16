import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillItemSource } from '@/lib/types'
import { computeLineGst } from '@/lib/gst'
import { getTenantGstConfig, resolveLineGst, recomputeBillGstTotals, type GstConfig } from '@/lib/billing/gst'
import { tenantHasIpd } from '@/lib/billing/ipdAccess'

export interface IpdBillLineItem {
  source: BillItemSource
  ref_id?: string | null
  description: string
  qty: number
  unit_price: number
  /** Optional per-line GST override (e.g. a pharmacy line inheriting its batch). */
  gst_rate?: number | null
  hsn_sac?: string | null
}

/** Builds a GST-stamped bill_items row from a line item. */
function stampItem(
  i: IpdBillLineItem,
  ctx: { tenantId: string; billId: string; cfg: GstConfig },
) {
  const amount = i.qty * i.unit_price
  const { rate, inclusive, hsn } = resolveLineGst(i.source, ctx.cfg, { gst_rate: i.gst_rate, hsn_sac: i.hsn_sac })
  const { taxableValue, taxAmount } = computeLineGst(amount, rate, inclusive)
  return {
    id: crypto.randomUUID(),
    tenant_id: ctx.tenantId,
    bill_id: ctx.billId,
    source: i.source,
    ref_id: i.ref_id ?? null,
    description: i.description,
    qty: i.qty,
    unit_price: i.unit_price,
    amount,
    gst_rate: rate,
    tax_inclusive: inclusive,
    hsn_sac: hsn,
    taxable_value: taxableValue,
    tax_amount: taxAmount,
  }
}

export type IpdBillSource = 'bed' | 'lab' | 'radiology' | 'ipd_pharmacy' | 'nursing' | 'nursing_morning' | 'nursing_night' | 'consolidated' | 'ot' | 'consultation' | 'manual' | 'blood' | 'icu'

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
  // No IPD charges at all for a plan without IPD (e.g. Starter after the trial).
  if (!(await tenantHasIpd(tenantId))) return null

  const cfg = await getTenantGstConfig(supabase, tenantId)

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

    const itemsToInsert = newItems.map((i) => stampItem(i, { tenantId, billId, cfg }))
    const { error: insertErr } = await supabase.from('bill_items').insert(itemsToInsert)
    if (insertErr) return null

    // Re-derive GST aggregates + total from ALL items on the bill.
    currentSubtotal = await recomputeBillGstTotals(supabase, billId)

  } else {
    // ── 2. Create new bill ───────────────────────────────────────────────────
    // Pass tenant explicitly so this works headless (cron / service role), where
    // current_tenant_id() is NULL — see migration 0099.
    const { data: billNoData } = await supabase.rpc('get_next_bill_no', { p_tenant_id: tenantId })
    if (!billNoData) return null

    billId = crypto.randomUUID()

    const { error: billErr } = await supabase.from('bills').insert({
      id: billId,
      tenant_id: tenantId,
      patient_id: patientId,
      admission_id: admissionId,
      bill_no: billNoData as string,
      billing_date: billingDate,
      bill_source: billSource,
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      paid: 0,
      status: 'unpaid',
      created_by: actorId,
    })
    if (billErr) return null

    const { error: itemErr } = await supabase.from('bill_items').insert(
      lineItems.map((i) => stampItem(i, { tenantId, billId, cfg }))
    )
    if (itemErr) {
      await supabase.from('bills').delete().eq('id', billId)
      return null
    }

    // Set GST aggregates + total now that items exist.
    currentSubtotal = await recomputeBillGstTotals(supabase, billId)
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

/**
 * Sync one shift's nursing charge onto the day's nursing bill.
 *
 * With configurable shifts, every shift's nursing charge lives on a single
 * `nursing` bill per (admission, date), one line item per shift, deduped and
 * identified by ref_id = the shift_definition's id. This keeps auto-billing
 * correct for any number of shifts (morning/evening/night/custom) without
 * needing a distinct bill_source per shift.
 *
 * - creates the line (and the bill) if absent, applying advance credit
 * - updates the line's rate in place if the assigned nurse's charge changed
 * - no-ops when the charge is 0 or the line already matches
 */
export async function syncNursingBillLine(
  supabase: SupabaseClient,
  actorId: string,
  p: {
    tenantId: string
    admissionId: string
    patientId: string
    date: string            // 'YYYY-MM-DD'
    shiftDefId: string      // shift_definitions.id — stable per-shift dedup key
    description: string
    charge: number
  }
): Promise<void> {
  if (p.charge <= 0) return
  if (!(await tenantHasIpd(p.tenantId))) return

  const { data: bill } = await supabase
    .from('bills')
    .select('id')
    .eq('tenant_id', p.tenantId)
    .eq('admission_id', p.admissionId)
    .eq('billing_date', p.date)
    .eq('bill_source', 'nursing')
    .neq('status', 'cancelled')
    .maybeSingle()

  if (bill) {
    const { data: item } = await supabase
      .from('bill_items')
      .select('id, unit_price')
      .eq('bill_id', bill.id)
      .eq('ref_id', p.shiftDefId)
      .maybeSingle()

    if (item) {
      // Rate change (e.g. a different nurse took over the shift) — update in place.
      if (Number(item.unit_price) !== p.charge) {
        await supabase.from('bill_items').update({ unit_price: p.charge, amount: p.charge }).eq('id', item.id)
        const { data: items } = await supabase.from('bill_items').select('amount').eq('bill_id', bill.id)
        const sum = (items ?? []).reduce((s, i) => s + Number(i.amount), 0)
        await supabase.from('bills').update({ subtotal: sum, total: sum }).eq('id', bill.id)
      }
      return
    }
  }

  // No bill yet, or this shift's line is missing — create/append (also applies advance).
  await autoIpdBill(supabase, actorId, {
    tenantId: p.tenantId,
    admissionId: p.admissionId,
    patientId: p.patientId,
    billingDate: p.date,
    billSource: 'nursing',
    lineItems: [{ source: 'nursing', ref_id: p.shiftDefId, description: p.description, qty: 1, unit_price: p.charge }],
  })
}
