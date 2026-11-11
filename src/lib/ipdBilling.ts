import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillItemSource } from '@/lib/types'
import { computeLineGst } from '@/lib/gst'
import { getTenantGstConfig, resolveLineGst, recomputeBillGstTotals, type GstConfig } from '@/lib/billing/gst'
import { tenantHasIpd } from '@/lib/billing/ipdAccess'
import { reconcileBill } from '@/lib/billing/reconcile'

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
export function stampBillItem(
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
 * After creating/updating, auto-applies any unused advance credit through the
 * locking apply_advance_to_bill function.
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

  // Nothing is charged to a stay after it has closed. Discharge runs the
  // day catch-up BEFORE it marks the admission discharged, and closes every
  // open order after; a charge arriving later (a request dispatched, a surgery
  // completed, a visit logged on a stale screen) would land after the balance
  // check and turn up as a bill the patient never saw.
  const { data: admRow } = await supabase
    .from('admissions').select('status').eq('id', admissionId).maybeSingle()
  if (admRow?.status === 'discharged') {
    console.warn('[autoIpdBill] refused — admission is discharged', { admissionId, billSource, billingDate })
    return null
  }

  const cfg = await getTenantGstConfig(supabase, tenantId)

  // ── 1. Find existing non-cancelled bill ──────────────────────────────────────
  const { data: existing } = await supabase
    .from('bills')
    .select('id, subtotal, total, paid')
    .eq('tenant_id', tenantId)
    .eq('admission_id', admissionId)
    .eq('billing_date', billingDate)
    .eq('bill_source', billSource)
    // Only its own daily bills: an ER or OPD visit bill later linked to the
    // admission can share the date and source but must not collect IPD charges.
    .is('visit_id', null)
    .is('emergency_case_id', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  let billId: string

  if (existing) {
    billId = existing.id as string

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

    // A null ref is treated as always-new, which is the only way to append an
    // unidentified line to an existing bill — and it is also the one case this
    // function cannot make idempotent (F-36). Appending to a bill that already
    // exists is precisely when a repeat run would double-charge, so say so
    // rather than leaving the next caller to discover it from the bill.
    const nullRefLines = lineItems.filter((i) => !i.ref_id)
    if (nullRefLines.length) {
      console.warn('[autoIpdBill] appending line(s) with no ref_id to an existing bill — these cannot be deduped on a re-run', {
        billSource, billingDate, admissionId,
        descriptions: nullRefLines.map((i) => i.description),
      })
    }

    const newItems = lineItems.filter((i) => !i.ref_id || !alreadyBilledRefs.has(i.ref_id))
    if (!newItems.length) return billId

    const itemsToInsert = newItems.map((i) => stampBillItem(i, { tenantId, billId, cfg }))
    const { error: insertErr } = await supabase.from('bill_items').insert(itemsToInsert)
    if (insertErr) {
      console.error('[autoIpdBill] appending lines failed', { billSource, billingDate, admissionId, error: insertErr.message })
      return null
    }

    // Re-derive GST aggregates + total from ALL items on the bill.
    await recomputeBillGstTotals(supabase, billId)

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
    if (billErr) {
      // Never swallow silently — a rejected insert hid never-billed charges before.
      console.error('[autoIpdBill] bill insert failed', { billSource, billingDate, admissionId, error: billErr.message })
      return null
    }

    const { error: itemErr } = await supabase.from('bill_items').insert(
      lineItems.map((i) => stampBillItem(i, { tenantId, billId, cfg }))
    )
    if (itemErr) {
      console.error('[autoIpdBill] bill line insert failed', { billSource, billingDate, admissionId, error: itemErr.message })
      // Void, don't delete: the invoice number is already issued and must stay in sequence.
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
      return null
    }

    // Set GST aggregates + total now that items exist.
    await recomputeBillGstTotals(supabase, billId)
  }

  // ── 3. Auto-apply available advance credit ────────────────────────────────
  // Settle paid/status from the payments first — a new line on an already-paid
  // day bill must show as due again (the advance step refuses a bill whose
  // status still says paid), and any advance applied beyond a lowered total
  // is released back to the pool.
  await reconcileBill(supabase, billId, { allowOverpaid: true })

  // Then the same locking function the billing counter and generateBill use
  // (0241). It locks the admission — the advance balance is derived from its
  // rows — so two bills raised at the same moment cannot both draw the same
  // unused advance. This used to be a third, hand-written copy of the
  // arithmetic with no lock, which could apply more than was deposited.
  // A not-ok result is normal: usually there is simply no unused advance.
  const { error: advErr } = await supabase.rpc('apply_advance_to_bill', {
    p_bill_id: billId,
    p_admission_id: admissionId,
  })
  if (advErr) console.error('[autoIpdBill] applying the advance failed', { billId, admissionId, error: advErr.message })

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
/**
 * Whether the tenant's IPD Billing settings allow a charge type to auto-bill.
 * Missing config = the defaults (everything on except the admission fee).
 */
export async function ipdChargeEnabled(
  supabase: SupabaseClient,
  tenantId: string,
  key: 'charge_nursing' | 'charge_medicines',
): Promise<boolean> {
  const { data } = await supabase.from('ipd_billing_config').select(key).eq('tenant_id', tenantId).maybeSingle()
  return ((data as Record<string, unknown> | null)?.[key] ?? true) !== false
}

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
  // Settings → IPD Billing → Nursing Charges off: nurse shifts are not billed.
  if (!(await ipdChargeEnabled(supabase, p.tenantId, 'charge_nursing'))) return

  const { data: bill } = await supabase
    .from('bills')
    .select('id')
    .eq('tenant_id', p.tenantId)
    .eq('admission_id', p.admissionId)
    .eq('billing_date', p.date)
    .eq('bill_source', 'nursing')
    .is('visit_id', null)
    .is('emergency_case_id', null)
    .neq('status', 'cancelled')
    .maybeSingle()

  if (bill) {
    const { data: item } = await supabase
      .from('bill_items')
      .select('id, unit_price, gst_rate, tax_inclusive')
      .eq('bill_id', bill.id)
      .eq('ref_id', p.shiftDefId)
      .maybeSingle()

    if (item) {
      // Rate change (e.g. a different nurse took over the shift) — update in place.
      if (Number(item.unit_price) !== p.charge) {
        const { taxableValue, taxAmount } = computeLineGst(p.charge, Number(item.gst_rate) || 0, !!item.tax_inclusive)
        await supabase.from('bill_items').update({
          unit_price: p.charge, amount: p.charge, taxable_value: taxableValue, tax_amount: taxAmount,
        }).eq('id', item.id)
        // Recompute totals (GST, discount, round-off) and paid/status — the raw sum
        // ignored all of those and never touched paid/status. A rate drop below what
        // was paid releases advance; cash overpayment is left for a refund.
        await reconcileBill(supabase, bill.id as string, { allowOverpaid: true })
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
