'use server'

import { istDate } from '@/lib/istDate'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, hasModule, isReadOnlyRequest } from '@/lib/server-utils'
import {
  GenerateBillSchema, ApplyDiscountSchema, RecordPaymentSchema,
} from '@/lib/schemas'
import type { Bill, ChargePreviewLine, BillItemSource, Tariff, CombinedBillData } from '@/lib/types'
import { catchUpDailyCharges, type DailyBillAdmission } from '@/lib/ipdDailyBilling'
import { encounterInsurance } from '@/lib/billing/insuranceShare'
import { computeLineGst, summarizeBillGst, computeRoundOff } from '@/lib/gst'
import { gstForSource, getTenantGstConfig } from '@/lib/billing/gst'
import { reconcileBill, overpaidMessage } from '@/lib/billing/reconcile'
import { getCollectionSummary, SERVICE_BILLS_ONLY, istToday, istDayBoundsISO } from '@/lib/billing/collections'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Tariffs ----

export async function listTariffs(): Promise<Tariff[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('tariffs').select('*').order('key')
  return (data ?? []) as Tariff[]
}

export async function updateTariff(id: string, amount: number): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('tariffs').update({ amount }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'tariff', id, { amount })
  return { success: true }
}

// ---- Charge preview ----

export async function getUnbilledCharges(params: {
  patientId: string
  visitId?: string | null
  admissionId?: string | null
}): Promise<ChargePreviewLine[]> {
  const { patientId, visitId, admissionId } = params
  const supabase = await createClient()
  const lines: ChargePreviewLine[] = []

  // ---- Consultation (closed visits, unbilled, fee > 0) ----
  {
    let q = supabase
      .from('visits')
      .select('id, consultation_fee')
      .eq('patient_id', patientId)
      .eq('status', 'closed')
      .eq('billing_status', 'unbilled')
      .gt('consultation_fee', 0)
    if (visitId) q = q.eq('id', visitId)
    const { data } = await q
    for (const v of data ?? []) {
      lines.push({
        source: 'consultation',
        ref_id: v.id,
        description: 'Consultation fee',
        qty: 1,
        unit_price: v.consultation_fee as number,
        amount: v.consultation_fee as number,
      })
    }
  }

  // ---- Bed charges (admissions, unbilled) ----
  // Only when the hospital has switched OFF daily room-rent auto-billing. With it
  // on (the default), room rent is already charged day by day, so offering a
  // whole-stay "Bed charges (N nights)" line here double-bills the same nights.
  const { tenant_id: tenantId } = await getActorProfile()
  const { data: ipdCfg } = await supabase
    .from('ipd_billing_config').select('charge_room_rent').eq('tenant_id', tenantId).maybeSingle()
  const autoRoomRent = (ipdCfg?.charge_room_rent ?? true) !== false
  if (!autoRoomRent) {
    let q = supabase
      .from('admissions')
      .select('id, admitted_at, discharged_at, ward:wards(daily_rate)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
      .in('status', ['admitted', 'discharged'])
    if (admissionId) q = q.eq('id', admissionId)
    const { data } = await q
    for (const a of data ?? []) {
      const ward = (a.ward as unknown as { daily_rate: number } | null)
      const rate = ward?.daily_rate ?? 0
      if (rate === 0) continue
      const from = new Date(a.admitted_at as string)
      const to   = a.discharged_at ? new Date(a.discharged_at as string) : new Date()
      const nights = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000))
      lines.push({
        source: 'bed',
        ref_id: a.id,
        description: `Bed charges (${nights} night${nights !== 1 ? 's' : ''})`,
        qty: nights,
        unit_price: rate,
        amount: nights * rate,
      })
    }
  }

  // ---- Lab orders (unbilled) ----
  {
    let q = supabase
      .from('lab_orders')
      .select('id, items:lab_order_items(price_snapshot, test:lab_tests_catalog(name))')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
      .not('status', 'eq', 'cancelled')
    if (admissionId) q = q.eq('admission_id', admissionId)
    else if (visitId) q = q.eq('visit_id', visitId)
    const { data } = await q
    for (const o of data ?? []) {
      const items = (o.items ?? []) as unknown as Array<{ price_snapshot: number; test: { name: string } | null }>
      for (const item of items) {
        lines.push({
          source: 'lab',
          ref_id: o.id,
          description: item.test?.name ?? 'Lab test',
          qty: 1,
          unit_price: item.price_snapshot,
          amount: item.price_snapshot,
        })
      }
    }
  }

  // ---- Radiology orders (unbilled) ----
  {
    let q = supabase
      .from('radiology_orders')
      .select('id, price_snapshot, test:radiology_catalog(name)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
      .not('status', 'eq', 'cancelled')
    if (admissionId) q = q.eq('admission_id', admissionId)
    else if (visitId) q = q.eq('visit_id', visitId)
    const { data } = await q
    for (const o of data ?? []) {
      lines.push({
        source: 'radiology',
        ref_id: o.id,
        description: (o.test as unknown as { name: string } | null)?.name ?? 'Imaging',
        qty: 1,
        unit_price: o.price_snapshot as number,
        amount: o.price_snapshot as number,
      })
    }
  }

  // ---- Pharmacy dispenses — OPD/direct (unbilled) ----
  {
    let q = supabase
      .from('dispenses')
      .select('id, qty, price_snapshot, drug:drugs(name), batch:drug_batches(hsn_code, gst_rate)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
    if (admissionId) {
      q = q.eq('admission_id', admissionId)
    } else if (visitId) {
      // `dispenses` has no visit_id — the link to a visit runs through the
      // prescription. Filtering on it directly made PostgREST reject the whole
      // query, and because the error was never read the result was simply an
      // empty list: **medicines dispensed to an OPD patient were silently left
      // off their bill**, every time, and the hospital gave them away.
      const { data: rx } = await supabase
        .from('prescriptions').select('id').eq('visit_id', visitId)
      q = q.in('prescription_id', (rx ?? []).map((r) => r.id as string))
    }
    const { data, error } = await q
    if (error) throw new Error(`Could not read pharmacy charges: ${error.message}`)
    for (const d of data ?? []) {
      const qty = d.qty as number
      const price = d.price_snapshot as number
      // HSN + GST come from the batch (captured at goods-receipt).
      const batch = d.batch as unknown as { hsn_code: string | null; gst_rate: number | null } | null
      lines.push({
        source: 'pharmacy',
        ref_id: d.id,
        description: (d.drug as unknown as { name: string } | null)?.name ?? 'Medication',
        qty,
        unit_price: price,
        amount: qty * price,
        gst_rate: batch?.gst_rate ?? null,
        hsn_sac: batch?.hsn_code ?? null,
      })
    }
  }

  // ---- IPD pharmacy requests — dispensed, unbilled (admission-scoped only) ----
  if (admissionId) {
    const { data } = await supabase
      .from('ipd_pharmacy_requests')
      .select('id, item_name, quantity, price_snapshot')
      .eq('admission_id', admissionId)
      .eq('status', 'dispensed')
      .eq('billing_status', 'unbilled')
    for (const r of data ?? []) {
      const qty = r.quantity as number
      const price = r.price_snapshot as number
      lines.push({
        source: 'ipd_pharmacy',
        ref_id: r.id,
        description: r.item_name as string,
        qty,
        unit_price: price,
        amount: qty * price,
      })
    }
  }

  // ---- OT schedules (unbilled, completed) ----
  {
    let q = supabase
      .from('ot_schedules')
      .select('id, procedure_name, price_snapshot, consumables:ot_consumables(id, description, qty, unit_price, pharmacy_request_id)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
      .eq('status', 'completed')
    // `ot_schedules.admission_id` does exist and is populated — this branch
    // used to be an empty block saying there was no link, so every one of a
    // patient's unbilled surgeries was offered on every bill. An OPD bill
    // could pull in, and permanently mark as billed, a surgery belonging to
    // an admission it had nothing to do with.
    if (admissionId) q = q.eq('admission_id', admissionId)
    else q = q.is('admission_id', null)   // day-case surgery only
    const { data } = await q
    for (const s of data ?? []) {
      lines.push({
        source: 'ot',
        ref_id: s.id,
        description: s.procedure_name as string,
        qty: 1,
        unit_price: s.price_snapshot as number,
        amount: s.price_snapshot as number,
      })
      // Consumables requested through pharmacy are priced and billed when pharmacy
      // dispatches them (as IPD pharmacy lines) — listing them here too showed ₹0
      // lines and risked billing them twice.
      for (const c of (s.consumables ?? []) as Array<{ id: string; description: string; qty: number; unit_price: number; pharmacy_request_id: string | null }>) {
        if (c.pharmacy_request_id || !(Number(c.unit_price) > 0)) continue
        lines.push({
          source: 'ot_consumable',
          ref_id: c.id,
          description: c.description,
          qty: c.qty,
          unit_price: c.unit_price,
          amount: c.qty * c.unit_price,
        })
      }
    }
  }

  // ---- Blood issues (unbilled) ----
  {
    const { data } = await supabase
      .from('blood_issues')
      .select('id, price_snapshot, blood_unit:blood_units(blood_group, component)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
    for (const i of data ?? []) {
      const unit = i.blood_unit as unknown as { blood_group: string; component: string } | null
      lines.push({
        source: 'blood',
        ref_id: i.id,
        description: `Blood: ${unit?.blood_group ?? ''} ${unit?.component ?? ''}`.trim(),
        qty: 1,
        unit_price: i.price_snapshot as number,
        amount: i.price_snapshot as number,
      })
    }
  }

  // ---- Dental treatments (unbilled) ----
  {
    let q = supabase
      .from('dental_treatments')
      .select('id, procedure, tooth_number, price_snapshot')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
    if (visitId) q = q.eq('visit_id', visitId)
    const { data } = await q
    for (const t of data ?? []) {
      const proc = (t.procedure as string).replace('_', ' ')
      const toothLabel = t.tooth_number ? ` (Tooth #${t.tooth_number})` : ''
      lines.push({
        source: 'dental',
        ref_id: t.id,
        description: `Dental: ${proc}${toothLabel}`,
        qty: 1,
        unit_price: t.price_snapshot as number,
        amount: t.price_snapshot as number,
      })
    }
  }

  return lines
}

// ---- Generate bill (transactional, double-bill-safe) ----

/**
 * The admission the selected charges belong to, if any. Room-rent charges use the
 * admission id as their ref; lab, radiology, pharmacy, IPD pharmacy and OT rows
 * record their admission_id. Charges from two different admissions are refused.
 */
async function admissionOfCharges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  charges: ChargePreviewLine[],
): Promise<{ admissionId: string | null } | { error: string }> {
  const TABLES: Partial<Record<BillItemSource, string>> = {
    lab: 'lab_orders', radiology: 'radiology_orders', pharmacy: 'dispenses',
    ipd_pharmacy: 'ipd_pharmacy_requests', ot: 'ot_schedules',
  }
  const found = new Set<string>()
  const refsByTable = new Map<string, string[]>()
  for (const c of charges) {
    if (c.source === 'bed') { found.add(c.ref_id); continue }
    const table = TABLES[c.source]
    if (table) refsByTable.set(table, [...(refsByTable.get(table) ?? []), c.ref_id])
  }
  for (const [table, ids] of refsByTable) {
    const { data } = await supabase.from(table as 'lab_orders').select('admission_id').in('id', ids)
    for (const r of data ?? []) if (r.admission_id) found.add(r.admission_id as string)
  }
  if (found.size > 1) return { error: 'The selected charges belong to different admissions — bill each admission separately.' }
  return { admissionId: [...found][0] ?? null }
}

export async function generateBill(
  input: Record<string, unknown>
): Promise<{ success: true; billId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const parsed = GenerateBillSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, visit_id, admission_id: requestedAdmissionId, selected_refs, manual_items } = parsed.data
  const supabase = await createClient()

  // Get all unbilled charge data for the selected refs
  const allCharges = await getUnbilledCharges({
    patientId: patient_id,
    visitId: visit_id ?? null,
    admissionId: requestedAdmissionId ?? null,
  })

  const selectedCharges = allCharges.filter((c) => selected_refs.includes(c.ref_id))

  // Link the bill to its admission even when the builder was opened from the
  // Billing page with just a patient: work it out from the charges. Without the
  // link an IPD bill is missing from the admission's combined bill, its discharge
  // balance check and advance application.
  const inferred = await admissionOfCharges(supabase, selectedCharges)
  if ('error' in inferred) return { success: false, error: inferred.error }
  if (requestedAdmissionId && inferred.admissionId && inferred.admissionId !== requestedAdmissionId) {
    return { success: false, error: 'Some selected charges belong to a different admission — bill them from that admission.' }
  }
  const admission_id = requestedAdmissionId ?? inferred.admissionId

  // IPD bills need a plan with IPD — a hospital that moved to Starter can't bill
  // admissions from its trial until it upgrades.
  if (admission_id && !(await hasModule('ipd'))) {
    return { success: false, error: 'IPD billing is not included in your plan. Upgrade to Growth to bill admissions.' }
  }

  // Generate race-safe bill number
  const { data: billNoData, error: billNoErr } = await supabase.rpc('get_next_bill_no')
  if (billNoErr || !billNoData) return { success: false, error: 'Failed to generate bill number' }
  const bill_no = billNoData as string

  const billId = crypto.randomUUID()

  // Hospital GST config drives per-line tax treatment.
  const gstCfg = await getTenantGstConfig(supabase, actor.tenant_id)

  // Build bill_items list
  type BillItemInsert = {
    id: string; tenant_id: string; bill_id: string; source: BillItemSource; ref_id: string | null
    description: string; qty: number; unit_price: number; amount: number
    gst_rate: number; tax_inclusive: boolean; hsn_sac: string | null
    taxable_value: number; tax_amount: number
  }

  const buildItem = (
    base: { source: BillItemSource; ref_id: string | null; description: string; qty: number; unit_price: number; amount: number; gst_rate?: number | null; hsn_sac?: string | null },
  ): BillItemInsert => {
    const { rate: defRate, inclusive } = gstForSource(base.source, gstCfg)
    // Prefer the charge's own GST/HSN (e.g. a pharmacy line inherits its batch's
    // rate + HSN); fall back to the per-source default.
    const rate = gstCfg.enabled && base.gst_rate != null ? base.gst_rate : defRate
    const { taxableValue, taxAmount } = computeLineGst(base.amount, rate, inclusive)
    return {
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      bill_id: billId,
      source: base.source,
      ref_id: base.ref_id,
      description: base.description,
      qty: base.qty,
      unit_price: base.unit_price,
      amount: base.amount,
      gst_rate: rate,
      tax_inclusive: inclusive,
      hsn_sac: gstCfg.enabled ? (base.hsn_sac ?? null) : null,
      taxable_value: taxableValue,
      tax_amount: taxAmount,
    }
  }

  const itemsToInsert: BillItemInsert[] = [
    ...selectedCharges.map((c) => buildItem({
      source: c.source, ref_id: c.ref_id, description: c.description,
      qty: c.qty, unit_price: c.unit_price, amount: c.amount,
      gst_rate: c.gst_rate, hsn_sac: c.hsn_sac,
    })),
    ...(manual_items ?? []).map((m) => buildItem({
      source: 'manual' as BillItemSource, ref_id: null, description: m.description,
      qty: m.qty, unit_price: m.unit_price, amount: m.qty * m.unit_price,
    })),
  ]

  // Bill-level GST aggregation. `subtotal` is the net (pre-tax) taxable value;
  // grand total = subtotal + GST, rounded to the nearest rupee.
  const gst = summarizeBillGst(itemsToInsert)
  const { roundOff, total } = computeRoundOff(gst.subtotal + gst.taxTotal)

  // Insert the bill first
  const { error: billErr } = await supabase.from('bills').insert({
    id: billId,
    tenant_id: actor.tenant_id,
    patient_id,
    visit_id: visit_id ?? null,
    admission_id: admission_id ?? null,
    bill_no,
    subtotal: gst.subtotal,
    discount: 0,
    tax: gst.taxTotal,
    cgst: gst.cgst,
    sgst: gst.sgst,
    igst: 0,
    round_off: roundOff,
    total,
    paid: 0,
    status: 'draft',
    created_by: actor.id,
  })
  if (billErr) return { success: false, error: billErr.message }

  // Insert bill items
  if (itemsToInsert.length > 0) {
    const { error: itemErr } = await supabase.from('bill_items').insert(itemsToInsert)
    if (itemErr) {
      // Void, don't delete: the invoice number is already issued and must stay in sequence.
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
      return { success: false, error: itemErr.message }
    }
  }

  // Flip source rows to 'billed' with conditional update (double-bill guard)
  // Group by source type so we can batch the updates
  const refsBySource = new Map<BillItemSource, string[]>()
  for (const c of selectedCharges) {
    const existing = refsBySource.get(c.source) ?? []
    existing.push(c.ref_id)
    refsBySource.set(c.source, existing)
  }

  // Rows THIS bill flipped to 'billed' — reverted if the bill fails part-way, so
  // no charge is left marked billed without a live bill (it would vanish from the
  // unbilled list forever). Rows another bill already owned are never touched.
  const flipped: Array<{ table: string; ids: string[] }> = []

  /**
   * Mark the source rows billed, refusing if another bill got there first.
   *
   * The count must be compared against **distinct** ids, not against the
   * number of charge lines. One row can produce several lines — a lab order
   * with three tests is three lines all carrying the same `ref_id` — so a
   * two-test order asked to flip `[X, X]`, matched the one row that exists,
   * and read 1 < 2 as "somebody else billed this".
   *
   * The effect was that **a lab order with more than one test could never be
   * billed at all**, and every attempt burned a GST invoice number from a
   * legally sequential series on the way out. The guard was right; it was
   * being handed a list with duplicates in it.
   */
  async function flipToBilled(table: string, refs: string[]): Promise<string | null> {
    const wanted = [...new Set(refs)]
    const { data, error } = await supabase
      .from(table as 'visits')
      .update({ billing_status: 'billed' })
      .in('id', wanted)
      .eq('billing_status', 'unbilled')
      .select('id')
    if (error) return error.message
    const ids = (data ?? []).map((r) => r.id as string)
    if (ids.length) flipped.push({ table, ids })
    if (ids.length < wanted.length) return `Some ${table} charges were already billed`
    return null
  }

  const TABLE_MAP: Record<string, string> = {
    consultation: 'visits',
    bed:          'admissions',
    lab:          'lab_orders',
    radiology:    'radiology_orders',
    pharmacy:     'dispenses',
    ipd_pharmacy: 'ipd_pharmacy_requests',
    ot:           'ot_schedules',
    blood:        'blood_issues',
    dental:       'dental_treatments',
  }

  for (const [source, refs] of refsBySource) {
    const table = TABLE_MAP[source]
    if (!table) continue

    const flipErr = await flipToBilled(table, refs)
    if (flipErr) {
      for (const f of flipped) {
        await supabase.from(f.table as 'visits').update({ billing_status: 'unbilled' }).in('id', f.ids)
      }
      // Void, don't delete: the invoice number is already issued and must stay in sequence.
      await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
      return { success: false, error: flipErr }
    }
  }

  // Auto-apply any available advance credit for IPD admission bills, through the
  // same locking RPC the billing counter uses. This used to be a second,
  // independent copy of the advance arithmetic, which wrote `paid` by assignment
  // rather than addition — correct only because a new bill has paid = 0. A
  // not-ok result here is not a failure: it usually means there is no unused
  // advance, and the bill itself is already valid.
  if (admission_id) {
    await supabase.rpc('apply_advance_to_bill', {
      p_bill_id: billId,
      p_admission_id: admission_id,
    })
  }

  await logAudit(actor.id, 'generate', 'bill', billId, {
    bill_no, patient_id, items: itemsToInsert.length, total,
  })
  return { success: true, billId }
}

// ---- Discount / tax ----

export async function applyDiscount(
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const parsed = ApplyDiscountSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from('bills').select('subtotal, tax, discount, status').eq('id', parsed.data.bill_id).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'paid' || (bill.status as string) === 'cancelled')
    return { success: false, error: 'Cannot modify a paid or cancelled bill' }

  const { error } = await supabase.from('bills')
    .update({ discount: parsed.data.discount }).eq('id', parsed.data.bill_id)
  if (error) return { success: false, error: error.message }
  const rec = await reconcileBill(supabase, parsed.data.bill_id)
  if (!rec.ok) {
    // Would leave the bill below what was already paid — undo.
    await supabase.from('bills').update({ discount: bill.discount }).eq('id', parsed.data.bill_id)
    await reconcileBill(supabase, parsed.data.bill_id, { allowOverpaid: true })
    return { success: false, error: overpaidMessage(rec) }
  }

  await logAudit(actor.id, 'discount', 'bill', parsed.data.bill_id, { discount: parsed.data.discount })
  return { success: true }
}

/**
 * Overrides the GST rate and/or HSN/SAC code on a single bill line, then
 * recomputes the line's tax and the whole bill's totals. Blocked on
 * paid/cancelled bills.
 */
export async function updateBillItemGst(
  input: { item_id: string; gst_rate: number; hsn_sac?: string | null },
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const rate = Number(input.gst_rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 28) {
    return { success: false, error: 'GST rate must be between 0 and 28%.' }
  }

  const supabase = await createClient()
  const { data: item } = await supabase
    .from('bill_items')
    .select('id, bill_id, amount, tax_inclusive, gst_rate, hsn_sac, taxable_value, tax_amount, bill:bills(status)')
    .eq('id', input.item_id)
    .single()
  if (!item) return { success: false, error: 'Line item not found' }
  const status = (item.bill as unknown as { status: string } | null)?.status
  if (status === 'paid' || status === 'cancelled') {
    return { success: false, error: 'Cannot modify a paid or cancelled bill' }
  }

  const { taxableValue, taxAmount } = computeLineGst(item.amount as number, rate, !!item.tax_inclusive)
  const { error } = await supabase.from('bill_items').update({
    gst_rate: rate,
    hsn_sac: input.hsn_sac?.trim() || null,
    taxable_value: taxableValue,
    tax_amount: taxAmount,
  }).eq('id', input.item_id)
  if (error) return { success: false, error: error.message }

  const rec = await reconcileBill(supabase, item.bill_id as string)
  if (!rec.ok) {
    // Would leave the bill below what was already paid — undo.
    await supabase.from('bill_items').update({
      gst_rate: item.gst_rate, hsn_sac: item.hsn_sac, taxable_value: item.taxable_value, tax_amount: item.tax_amount,
    }).eq('id', input.item_id)
    await reconcileBill(supabase, item.bill_id as string, { allowOverpaid: true })
    return { success: false, error: overpaidMessage(rec) }
  }
  await logAudit(actor.id, 'gst_edit', 'bill', item.bill_id as string, { item_id: input.item_id, gst_rate: rate })
  return { success: true }
}

// ---- Finalize / cancel ----

export async function finalizeBill(billId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from('bills').select('status').eq('id', billId).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) !== 'draft')
    return { success: false, error: 'Only draft bills can be finalized' }

  const { error } = await supabase
    .from('bills').update({ status: 'unpaid' }).eq('id', billId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'finalize', 'bill', billId)
  return { success: true }
}

export async function cancelBill(billId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const supabase = await createClient()

  // Cancelling twice is not a no-op, which is why this guard exists.
  //
  // The second pass reverts the same charges to 'unbilled' again — but by then
  // a replacement bill may legitimately own them, and it has just had them
  // pulled out from under it. A stale tab or a double-click was enough.
  const { data: bill } = await supabase
    .from('bills').select('status').eq('id', billId).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'cancelled')
    return { success: false, error: 'This bill is already cancelled' }

  // Block if non-advance payments exist (cash/card/UPI etc.)
  const { count: cashCount } = await supabase
    .from('payments').select('id', { count: 'exact', head: true })
    .eq('bill_id', billId).neq('method', 'advance')
  if ((cashCount ?? 0) > 0) return { success: false, error: 'Cannot cancel a bill that has payments' }

  // Delete any advance auto-payments — advance returns to pool via exclusion logic
  await supabase.from('payments').delete().eq('bill_id', billId).eq('method', 'advance')

  // Get all bill items with source and ref_id to revert. Read the error: a
  // failure here with the cancel going ahead anyway would strand every charge
  // as 'billed' against a bill that no longer exists, and they would never
  // appear on the unbilled list again.
  const { data: items, error: itemsErr } = await supabase
    .from('bill_items').select('source, ref_id').eq('bill_id', billId)
  if (itemsErr) return { success: false, error: itemsErr.message }

  // Revert each source row back to unbilled
  const refsBySource = new Map<string, string[]>()
  for (const item of items ?? []) {
    if (!item.ref_id) continue
    const existing = refsBySource.get(item.source as string) ?? []
    existing.push(item.ref_id as string)
    refsBySource.set(item.source as string, existing)
  }

  for (const [source, refs] of refsBySource) {
    if (source === 'consultation') {
      await supabase.from('visits').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'bed') {
      await supabase.from('admissions').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'lab') {
      await supabase.from('lab_orders').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'radiology') {
      await supabase.from('radiology_orders').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'pharmacy') {
      await supabase.from('dispenses').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'ipd_pharmacy') {
      await supabase.from('ipd_pharmacy_requests').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'ot') {
      await supabase.from('ot_schedules').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'blood') {
      await supabase.from('blood_issues').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'dental') {
      await supabase.from('dental_treatments').update({ billing_status: 'unbilled' }).in('id', refs)
    }
    // 'nursing' and daily 'bed' auto-bills have no source-table billing_status to revert
  }

  // Conditional on the status we read above, so two cancels racing each other
  // cannot both come through.
  const { error } = await supabase
    .from('bills').update({ status: 'cancelled' })
    .eq('id', billId).neq('status', 'cancelled')
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'cancel', 'bill', billId)
  return { success: true }
}

// ---- IPD daily charge generation (called from IPD ward board RSC) ----

export async function generateMissingDailyCharges(
  admissions: DailyBillAdmission[]
): Promise<void> {
  // Runs on ward-board page load: a read-only hospital must still be able to VIEW
  // its patients (throwing here crashed the page), and a plan without IPD bills nothing.
  if (!admissions.length || (await isReadOnlyRequest()) || !(await hasModule('ipd'))) return
  const actor = await getActorProfile()
  const supabase = await createClient()
  // Core logic lives in a session-free lib so the same generator can run from a
  // headless cron (service-role client, per-tenant actor) — see lib/cron/dailyBilling.
  // Bills any missed past days too (not just today) — see catchUpDailyCharges.
  const catchUp = await catchUpDailyCharges(supabase, actor.id, actor.tenant_id, admissions)
  if (catchUp.backfilled.length || catchUp.skippedOlder.length) {
    await logAudit(actor.id, 'ipd_daily_catch_up', 'admission', null, {
      backfilled: catchUp.backfilled, skipped_older: catchUp.skippedOlder,
    })
  }
}

// ---- Payments ----

export async function recordPayment(
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const parsed = RecordPaymentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  // One locked transaction in the database: two cashiers paying the same bill at
  // once can no longer both pass the balance check or overwrite each other's paid.
  const { data: res, error: rpcErr } = await supabase.rpc('record_bill_payment', {
    p_bill_id: parsed.data.bill_id,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_reference: parsed.data.reference ?? null,
  })
  if (rpcErr) return { success: false, error: rpcErr.message }
  const result = res as { ok: boolean; error?: string }
  if (!result?.ok) return { success: false, error: result?.error ?? 'Payment failed' }

  await logAudit(actor.id, 'payment', 'bill', parsed.data.bill_id, {
    amount: parsed.data.amount, method: parsed.data.method,
  })
  return { success: true }
}

// ---- Read ----

export async function getBill(id: string): Promise<Bill | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bills')
    .select(`*, patient:patients(id,full_name,uhid,phone,dob,gender),
             items:bill_items(*),
             payments(*, receiver:profiles(id,full_name))`)
    .eq('id', id)
    .single()
  return data as unknown as Bill | null
}

export async function getBillingStats(): Promise<{
  todayBilled: number
  todayCollected: number
  collectedPayments: number
  collectedAdvances: number
  collectedRefunds: number
  todayOutstanding: number
  pastOutstanding: number
}> {
  const actor = await getActorProfile()
  const supabase = await createClient()
  // IST-aware local day
  const today = istToday()
  const { from, to } = istDayBoundsISO(today)

  const [{ data: todayBills }, { data: todayUnpaid }, { data: pastUnpaid }, collection] = await Promise.all([
    // Today's non-cancelled service bills — for "Billed Today" (value of new bills raised)
    supabase.from('bills').select('total')
      .gte('created_at', from).lt('created_at', to)
      .not('status', 'eq', 'cancelled')
      .or(SERVICE_BILLS_ONLY),
    supabase.from('bills').select('total, paid')
      .in('status', ['unpaid', 'partial'])
      .gte('created_at', from)
      .or(SERVICE_BILLS_ONLY),
    supabase.from('bills').select('total, paid')
      .in('status', ['unpaid', 'partial'])
      .lt('created_at', from)
      .or(SERVICE_BILLS_ONLY),
    // "Collected Today" = actual money received today (payments + advances − refunds)
    getCollectionSummary(supabase, actor.tenant_id, from, to),
  ])

  return {
    todayBilled:       (todayBills  ?? []).reduce((s, b) => s + (b.total as number), 0),
    todayCollected:    collection.total,
    collectedPayments: collection.billPayments,
    collectedAdvances: collection.advances,
    collectedRefunds:  collection.refunds,
    todayOutstanding:  (todayUnpaid ?? []).reduce((s, b) => s + Math.max(0, (b.total as number) - (b.paid as number)), 0),
    pastOutstanding:   (pastUnpaid  ?? []).reduce((s, b) => s + Math.max(0, (b.total as number) - (b.paid as number)), 0),
  }
}

export async function listBills(filters?: {
  status?: string
  patientId?: string
}): Promise<Bill[]> {
  const supabase = await createClient()
  let q = supabase
    .from('bills')
    .select('*, patient:patients(id,full_name,uhid,phone), items:bill_items(source), credit_notes(amount)')
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data: bills } = await q.limit(300)
  if (!bills) return []

  // Batch-fetch visit types for bills that have a visit_id.
  // (visits is partitioned — no FK exists, so PostgREST cannot join it inline)
  const visitIds = [...new Set(bills.filter((b) => b.visit_id).map((b) => b.visit_id as string))]
  const visitTypeMap: Record<string, string> = {}
  if (visitIds.length > 0) {
    const { data: visitRows } = await supabase
      .from('visits')
      .select('id, type')
      .in('id', visitIds)
    for (const v of visitRows ?? []) {
      visitTypeMap[v.id as string] = v.type as string
    }
  }

  return bills.map((b) => ({
    ...b,
    visit: b.visit_id ? { id: b.visit_id, type: visitTypeMap[b.visit_id as string] ?? 'opd' } : null,
  })) as unknown as Bill[]
}


// ---- Combined Bill View ----

const COMBINED_BILL_SECTIONS: Array<{ label: string; sources: string[] }> = [
  { label: 'Room Charges',      sources: ['bed'] },
  { label: 'Critical Care',     sources: ['icu'] },
  { label: 'Nursing Charges',   sources: ['nursing', 'nursing_morning', 'nursing_night'] },
  { label: 'Laboratory',        sources: ['lab'] },
  { label: 'Radiology',         sources: ['radiology'] },
  { label: 'Pharmacy',          sources: ['pharmacy', 'ipd_pharmacy', 'pharmacy_sale_item'] },
  { label: 'Operation Theatre', sources: ['ot', 'ot_consumable'] },
  { label: 'Blood Bank',        sources: ['blood'] },
  { label: 'Dental',            sources: ['dental'] },
  { label: 'Consultations',     sources: ['consultation'] },
  { label: 'Other Charges',     sources: ['manual'] },
]

type CombinedBillRawItem = { source: string; description: string; qty: number; unit_price: number; amount: number; gst_rate?: number; hsn_sac?: string | null; tax_inclusive?: boolean }
type CombinedBillRaw = { bill_no: string; billing_date: string | null; created_at: string; total: number; paid: number; bill_source?: string | null; status?: string | null; items: CombinedBillRawItem[] }

function buildSections(bills: CombinedBillRaw[]): import('@/lib/types').CombinedBillSection[] {
  const sections: import('@/lib/types').CombinedBillSection[] = []
  for (const sectionDef of COMBINED_BILL_SECTIONS) {
    const rows: import('@/lib/types').CombinedBillSection['rows'] = []
    for (const bill of bills) {
      const date = bill.billing_date ?? istDate(bill.created_at)
      for (const item of bill.items) {
        if (sectionDef.sources.includes(item.source)) {
          rows.push({
            date, billNo: bill.bill_no, description: item.description,
            qty: item.qty, unitPrice: item.unit_price, amount: item.amount,
            hsn_sac: item.hsn_sac ?? null, gstRate: item.gst_rate ?? 0, taxInclusive: !!item.tax_inclusive,
            cancelled: bill.status === 'cancelled',
          })
        }
      }
    }
    if (rows.length > 0) sections.push({ label: sectionDef.label, rows, subtotal: rows.reduce((s, r) => s + (r.cancelled ? 0 : r.amount), 0) })
  }
  return sections
}

/** Total refunded via credit notes on the given bills (summaries must show refunds). */
async function sumCreditNotes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billIds: string[],
): Promise<number> {
  if (!billIds.length) return 0
  const { data } = await supabase.from('credit_notes').select('amount').in('bill_id', billIds)
  return Math.round((data ?? []).reduce((s, c) => s + Number(c.amount), 0) * 100) / 100
}

/** Amount on the given bills that was adjusted from an advance deposit. */
async function sumAdvanceAdjusted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billIds: string[],
): Promise<number> {
  if (!billIds.length) return 0
  const { data } = await supabase.from('payments').select('amount').in('bill_id', billIds).eq('method', 'advance')
  return Math.round((data ?? []).reduce((s, p) => s + Number(p.amount), 0) * 100) / 100
}

export async function getCombinedBillData(admissionId: string): Promise<CombinedBillData | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()

  // 0. Fetch tenant name
  const { data: tenantRow } = await supabase
    .from('tenants').select('name').eq('id', actor.tenant_id).single()
  const tenantName = (tenantRow?.name as string | null) ?? 'Hospital'

  // 1. Fetch admission
  const { data: admission, error: admError } = await supabase
    .from('admissions')
    .select('id, patient_id, combined_bill_no, admitted_at, discharged_at, ward:wards(name), bed:beds(bed_no), doctor:profiles!admissions_admitting_doctor_id_fkey(full_name)')
    .eq('id', admissionId)
    .maybeSingle()
  if (admError) console.error('[getCombinedBillData] admission fetch error:', admError.message)
  if (!admission) {
    // Fallback: try to resolve patient from bills linked to this admissionId
    const { data: firstBill } = await supabase
      .from('bills').select('patient_id').eq('admission_id', admissionId).limit(1).maybeSingle()
    if (!firstBill?.patient_id) { console.error('[getCombinedBillData] no admission or bills found for', admissionId); return null }
    const pid = firstBill.patient_id as string
    const { data: fbPatient } = await supabase.from('patients').select('full_name, uhid, phone, dob, gender, address').eq('id', pid).single()
    if (!fbPatient) return null
    const { data: admBillsFb } = await supabase
      .from('bills')
      .select('id, bill_no, billing_date, created_at, total, paid, bill_source, items:bill_items(source, description, qty, unit_price, amount, gst_rate, hsn_sac, tax_inclusive)')
      .eq('admission_id', admissionId).neq('status', 'cancelled')
      .order('billing_date', { ascending: true }).order('created_at', { ascending: true })
    const allBillsFb = ((admBillsFb ?? []) as unknown as CombinedBillRaw[]).filter((b) => (b as { bill_source?: string | null }).bill_source !== 'consolidated')
    const { data: advRowsFb } = await supabase.from('admission_advances').select('amount').eq('admission_id', admissionId)
    const advFb = (advRowsFb ?? []).reduce((s, a) => s + (a.amount as number), 0)
    const secFb = buildSections(allBillsFb)
    const regFb = allBillsFb.filter((b) => (b as { bill_source?: string | null }).bill_source !== 'advance_refund')
    return {
      kind: 'ipd',
      // A view must never take a number — show the first bill's own number.
      combinedBillNo: ((allBillsFb[0] as { bill_no?: string } | undefined)?.bill_no) ?? 'SUMMARY',
      tenantName,
      patient: { full_name: fbPatient.full_name as string, uhid: fbPatient.uhid as string, phone: fbPatient.phone as string | null, dob: (fbPatient.dob as string | null) ?? null, gender: (fbPatient.gender as string | null) ?? null, address: (fbPatient.address as string | null) ?? null },
      generatedAt: new Date().toISOString(),
      sections: secFb,
      grandTotal: regFb.reduce((s, b) => s + (b as { total: number }).total, 0),
      totalPaid: regFb.reduce((s, b) => s + (b as { paid: number }).paid, 0),
      refunded: await sumCreditNotes(supabase, regFb.map((b) => (b as unknown as { id: string }).id)),
      // Both of these were missing on this path, and the omission showed on a
      // patient's own summary: `advanceAdjusted` undefined made the view
      // compute a full advance still outstanding and print "Advance Not Yet
      // Applied" over a deposit that had in fact been used up.
      advanceAdjusted: await sumAdvanceAdjusted(supabase, regFb.map((b) => (b as unknown as { id: string }).id)),
      advanceCollected: advFb,
      advanceRefunded: allBillsFb
        .filter((b) => (b as { bill_source?: string | null }).bill_source === 'advance_refund')
        .reduce((sum, b) => sum + Math.abs((b as { total: number }).total), 0),
      balanceDue: Math.max(0, regFb.reduce((s, b) => s + (b as { total: number }).total, 0) - regFb.reduce((s, b) => s + (b as { paid: number }).paid, 0)),
    }
  }

  const patientId = admission.patient_id as string

  // 2. Get-or-create combined bill number (lazy generation for old admissions)
  let combinedBillNo = 'COMBINED'
  const existingNo = (admission as Record<string, unknown>).combined_bill_no as string | null | undefined
  if (existingNo) {
    combinedBillNo = existingNo
  } else {
    // Summaries have their own series — invoice numbers are only for real bills.
    const { data: billNoData } = await supabase.rpc('get_next_summary_no', { p_tenant_id: actor.tenant_id })
    if (billNoData) {
      combinedBillNo = billNoData as string
      await supabase.from('admissions').update({ combined_bill_no: combinedBillNo }).eq('id', admissionId)
    }
  }

  // 3. Fetch patient info
  const { data: patient } = await supabase
    .from('patients').select('full_name, uhid, phone, dob, gender, address').eq('id', patientId).single()
  if (!patient) return null

  type RawBill = {
    id: string; bill_no: string; billing_date: string | null; created_at: string
    total: number; paid: number; bill_source: string | null
    items: Array<{ source: string; description: string; qty: number; unit_price: number; amount: number }>
  }

  const BILL_SELECT = 'id, bill_no, billing_date, created_at, total, paid, bill_source, items:bill_items(source, description, qty, unit_price, amount, gst_rate, hsn_sac, tax_inclusive)'

  // 4. Fetch all non-cancelled IPD bills for this admission
  const { data: admBills } = await supabase
    .from('bills')
    .select(BILL_SELECT)
    .eq('admission_id', admissionId)
    .neq('status', 'cancelled')
    .order('billing_date', { ascending: true })
    .order('created_at', { ascending: true })

  const allBills = ((admBills ?? []) as unknown as RawBill[])
    .filter((b) => b.bill_source !== 'consolidated')

  // 6. Advance collected for this admission only
  const { data: advRows } = await supabase
    .from('admission_advances').select('amount').eq('admission_id', admissionId)
  const advanceCollected = (advRows ?? []).reduce((s, a) => s + (a.amount as number), 0)

  // 7. Group items into sections
  const sections = buildSections(allBills)

  const regularBills = allBills.filter(b => b.bill_source !== 'advance_refund')
  const refundBills  = allBills.filter(b => b.bill_source === 'advance_refund')
  const grandTotal      = regularBills.reduce((s, b) => s + b.total, 0)
  const totalPaid       = regularBills.reduce((s, b) => s + b.paid, 0)
  const advanceRefunded = refundBills.reduce((s, b) => s + Math.abs(b.total), 0)

  // Insurance split: what a settled/approved claim covers vs. the patient's own share.
  const billIds = allBills.map(b => b.id)
  let insuranceSettled = 0
  if (billIds.length > 0) {
    const { data: insPays } = await supabase
      .from('payments').select('amount').in('bill_id', billIds).eq('method', 'insurance')
    insuranceSettled = (insPays ?? []).reduce((s, p) => s + (p.amount as number), 0)
  }
  const insuranceApproved = (await encounterInsurance(supabase, { admissionId, billIds: regularBills.map((b) => b.id) })).outstanding

  const adm = admission as unknown as { admitted_at: string | null; discharged_at: string | null; ward: { name: string } | null; bed: { bed_no: string } | null; doctor: { full_name: string } | null }
  return {
    kind: 'ipd',
    encounter: {
      admittedAt: adm.admitted_at, dischargedAt: adm.discharged_at,
      ward: adm.ward?.name ?? null, bed: adm.bed?.bed_no ?? null, doctor: adm.doctor?.full_name ?? null,
    },
    combinedBillNo,
    tenantName,
    patient: {
      full_name: patient.full_name as string,
      uhid: patient.uhid as string,
      phone: patient.phone as string | null,
      dob: (patient.dob as string | null) ?? null,
      gender: (patient.gender as string | null) ?? null,
      address: (patient.address as string | null) ?? null,
    },
    generatedAt: new Date().toISOString(),
    sections,
    grandTotal,
    totalPaid,
    refunded: await sumCreditNotes(supabase, regularBills.map((b) => b.id)),
    advanceAdjusted: await sumAdvanceAdjusted(supabase, regularBills.map((b) => b.id)),
    advanceCollected,
    advanceRefunded,
    balanceDue: Math.max(0, grandTotal - totalPaid),
    insuranceSettled,
    insuranceApproved,
    patientBalance: Math.max(0, grandTotal - totalPaid - insuranceApproved),
  }
}

export async function getOpdCombinedBillData(visitId: string): Promise<CombinedBillData | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()

  // 0. Fetch tenant name
  const { data: tenantRow } = await supabase
    .from('tenants').select('name').eq('id', actor.tenant_id).single()
  const tenantName = (tenantRow?.name as string | null) ?? 'Hospital'

  // 1. Fetch visit — try by visit id, then by appointment_id as fallback
  type VisitRow = { id: string; patient_id: string; combined_bill_no: string | null; appointment_id: string | null; doctor_id: string | null; visit_date: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let visitRow: VisitRow | null = null
  {
    const { data, error } = await supabase
      .from('visits')
      .select('id, patient_id, combined_bill_no, appointment_id, doctor_id, visit_date')
      .eq('id', visitId)
      .maybeSingle()
    if (error) console.error('[getOpdCombinedBillData] visit lookup error:', error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (data) visitRow = data as any as VisitRow
  }
  // Fallback: visitId might actually be an appointment_id
  if (!visitRow) {
    const { data, error } = await supabase
      .from('visits')
      .select('id, patient_id, combined_bill_no, appointment_id, doctor_id, visit_date')
      .eq('appointment_id', visitId)
      .maybeSingle()
    if (error) console.error('[getOpdCombinedBillData] appt fallback error:', error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (data) visitRow = data as any as VisitRow
  }
  type RawBill = {
    id: string; bill_no: string; billing_date: string | null; created_at: string
    total: number; paid: number; bill_source: string | null; status: string | null; patient_id?: string
    items: Array<{ source: string; description: string; qty: number; unit_price: number; amount: number }>
  }
  const BILL_SELECT = 'id, bill_no, billing_date, created_at, total, paid, bill_source, status, patient_id, items:bill_items(source, description, qty, unit_price, amount, gst_rate, hsn_sac, tax_inclusive)'

  // No visit row found — visitId is an appointmentId for a booking where OPD visit hasn't started yet.
  // Fall back to appointment-stage bills directly.
  if (!visitRow) {
    // Cancelled bills are fetched too — a cancelled booking still deserves a
    // summary that says so, rather than a 404. They render struck through and
    // count toward no total. (A `.neq` filter here would also drop NULL statuses.)
    const { data: apptBillRows } = await supabase
      .from('bills')
      .select(BILL_SELECT)
      .eq('appointment_id', visitId)
      .is('visit_id', null)
      .order('created_at', { ascending: true })
    const apptBills = ((apptBillRows ?? []) as unknown as RawBill[]).filter((b) => b.bill_source !== 'consolidated')
    if (apptBills.length === 0) return null
    const apptPatientId = apptBills[0].patient_id
    if (!apptPatientId) return null
    const { data: apptPatient } = await supabase
      .from('patients').select('full_name, uhid, phone, dob, gender, address').eq('id', apptPatientId).single()
    if (!apptPatient) return null
    // A view must never take a number — show the booking bill's own number.
    const combinedBillNoAppt = apptBills[0].bill_no ?? 'SUMMARY'
    const apptSections = buildSections(apptBills)
    const apptRegular = apptBills.filter(b => b.bill_source !== 'advance_refund' && b.status !== 'cancelled')
    return {
      kind: 'opd',
      combinedBillNo: combinedBillNoAppt,
      tenantName,
      patient: {
        full_name: apptPatient.full_name as string,
        uhid: apptPatient.uhid as string,
        phone: apptPatient.phone as string | null,
        dob: (apptPatient.dob as string | null) ?? null,
        gender: (apptPatient.gender as string | null) ?? null,
        address: (apptPatient.address as string | null) ?? null,
      },
      generatedAt: new Date().toISOString(),
      sections: apptSections,
      grandTotal: apptRegular.reduce((s, b) => s + b.total, 0),
      totalPaid: apptRegular.reduce((s, b) => s + b.paid, 0),
      refunded: await sumCreditNotes(supabase, apptRegular.map((b) => b.id)),
      advanceCollected: 0,
      advanceRefunded: 0,
      balanceDue: Math.max(0, apptRegular.reduce((s, b) => s + b.total, 0) - apptRegular.reduce((s, b) => s + b.paid, 0)),
    }
  }

  const resolvedVisitId = visitRow.id
  const patientId = visitRow.patient_id
  // Appointment-stage bills (created before OPD visit start) carry appointment_id but no visit_id
  const visitApptId = visitRow.appointment_id

  // 2. Get-or-create combined bill number
  let combinedBillNo = 'COMBINED'
  const existingNo = visitRow.combined_bill_no
  if (existingNo) {
    combinedBillNo = existingNo
  } else {
    // Summaries have their own series — invoice numbers are only for real bills.
    const { data: billNoData } = await supabase.rpc('get_next_summary_no', { p_tenant_id: actor.tenant_id })
    if (billNoData) {
      combinedBillNo = billNoData as string
      await supabase.from('visits').update({ combined_bill_no: combinedBillNo }).eq('id', resolvedVisitId)
    }
  }

  // 3. Fetch patient info
  const { data: patient } = await supabase
    .from('patients').select('full_name, uhid, phone, dob, gender, address').eq('id', patientId).single()
  if (!patient) return null

  // 4. Fetch every bill for this visit, cancelled ones included (filter consolidated
  //    in JS — PG neq drops NULLs). Cancelled rows are struck through on the view
  //    and excluded from all totals by buildSections.
  const { data: visitBills } = await supabase
    .from('bills')
    .select(BILL_SELECT)
    .eq('visit_id', resolvedVisitId)
    .order('billing_date', { ascending: true })
    .order('created_at', { ascending: true })

  // Also include appointment-stage bills (created at booking time before the visit was started)
  // These carry appointment_id but have visit_id = null, so they're missed by the visit_id query above
  let preVisitBills: RawBill[] = []
  if (visitApptId) {
    const { data: pb } = await supabase
      .from('bills')
      .select(BILL_SELECT)
      .eq('appointment_id', visitApptId)
      .is('visit_id', null)
      .order('billing_date', { ascending: true })
      .order('created_at', { ascending: true })
    preVisitBills = ((pb ?? []) as unknown as RawBill[]).filter((b) => b.bill_source !== 'consolidated')
  }

  const allBills = [
    ...preVisitBills,
    ...((visitBills ?? []) as unknown as RawBill[]).filter((b) => b.bill_source !== 'consolidated'),
  ]

  // 5. Group items into sections
  const sections = buildSections(allBills)

  const regularBills2 = allBills.filter(b => b.bill_source !== 'advance_refund' && b.status !== 'cancelled')
  const grandTotal = regularBills2.reduce((s, b) => s + b.total, 0)
  const totalPaid  = regularBills2.reduce((s, b) => s + b.paid, 0)

  const { data: visitDoctor } = visitRow.doctor_id
    ? await supabase.from('profiles').select('full_name').eq('id', visitRow.doctor_id).maybeSingle()
    : { data: null }

  // Insurance on the OPD / ER visit (claims on the visit or any of its bills).
  const opdBillIds = regularBills2.map((b) => b.id)
  const opdIns = await encounterInsurance(supabase, { visitId: resolvedVisitId, billIds: opdBillIds })
  let opdInsuranceSettled = 0
  if (opdBillIds.length) {
    const { data: insPays } = await supabase.from('payments').select('amount').in('bill_id', opdBillIds).eq('method', 'insurance')
    opdInsuranceSettled = (insPays ?? []).reduce((s, p) => s + Number(p.amount), 0)
  }
  return {
    kind: 'opd',
    encounter: { visitDate: visitRow.visit_date, doctor: (visitDoctor?.full_name as string | undefined) ?? null },
    combinedBillNo,
    tenantName,
    patient: {
      full_name: patient.full_name as string,
      uhid: patient.uhid as string,
      phone: patient.phone as string | null,
      dob: (patient.dob as string | null) ?? null,
      gender: (patient.gender as string | null) ?? null,
      address: (patient.address as string | null) ?? null,
    },
    generatedAt: new Date().toISOString(),
    sections,
    grandTotal,
    totalPaid,
    refunded: await sumCreditNotes(supabase, regularBills2.map((b) => b.id)),
    advanceCollected: 0,
    advanceRefunded: 0,
    balanceDue: Math.max(0, grandTotal - totalPaid),
    ...(opdIns.credit > 0 ? {
      insuranceSettled: opdInsuranceSettled,
      insuranceApproved: opdIns.outstanding,
      patientBalance: Math.max(0, grandTotal - totalPaid - opdIns.outstanding),
    } : {}),
  }
}

export async function getPatientCombinedBillData(patientId: string): Promise<CombinedBillData | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()

  const { data: tenantRow } = await supabase
    .from('tenants').select('name').eq('id', actor.tenant_id).single()
  const tenantName = (tenantRow?.name as string | null) ?? 'Hospital'

  const { data: patient } = await supabase
    .from('patients').select('full_name, uhid, phone, dob, gender, address').eq('id', patientId).single()
  if (!patient) return null

  // Use combined_bill_no on the patient row, or generate one
  let combinedBillNo = 'COMBINED'
  const { data: billNoRow } = await supabase
    .from('patients').select('combined_bill_no').eq('id', patientId).maybeSingle()
  const existingNo = (billNoRow as Record<string, unknown> | null)?.combined_bill_no as string | null | undefined
  if (existingNo) {
    combinedBillNo = existingNo
  } else {
    // Summaries have their own series — invoice numbers are only for real bills.
    const { data: billNoData } = await supabase.rpc('get_next_summary_no', { p_tenant_id: actor.tenant_id })
    if (billNoData) {
      combinedBillNo = billNoData as string
      await supabase.from('patients').update({ combined_bill_no: combinedBillNo }).eq('id', patientId)
    }
  }

  type RawBill = {
    id: string; bill_no: string; billing_date: string | null; created_at: string
    total: number; paid: number; bill_source: string | null
    items: Array<{ source: string; description: string; qty: number; unit_price: number; amount: number }>
  }

  const { data: bills } = await supabase
    .from('bills')
    .select('id, bill_no, billing_date, created_at, total, paid, bill_source, items:bill_items(source, description, qty, unit_price, amount, gst_rate, hsn_sac, tax_inclusive)')
    .eq('patient_id', patientId)
    .neq('status', 'cancelled')
    .order('billing_date', { ascending: true })
    .order('created_at', { ascending: true })

  const allBills = ((bills ?? []) as unknown as RawBill[]).filter((b) => b.bill_source !== 'consolidated')

  // Advance across all admissions
  const { data: admissions } = await supabase.from('admissions').select('id').eq('patient_id', patientId)
  const admissionIds = (admissions ?? []).map((a) => a.id as string)
  let advanceCollected = 0
  if (admissionIds.length > 0) {
    const { data: advRows } = await supabase.from('admission_advances').select('amount').in('admission_id', admissionIds)
    advanceCollected = (advRows ?? []).reduce((s, a) => s + (a.amount as number), 0)
  }

  const sections = buildSections(allBills)

  const regularBills3 = allBills.filter(b => b.bill_source !== 'advance_refund')
  const refundBills3  = allBills.filter(b => b.bill_source === 'advance_refund')
  const grandTotal      = regularBills3.reduce((s, b) => s + b.total, 0)
  const totalPaid       = regularBills3.reduce((s, b) => s + b.paid, 0)
  const advanceRefunded = refundBills3.reduce((s, b) => s + Math.abs(b.total), 0)

  return {
    kind: 'patient',
    combinedBillNo,
    tenantName,
    patient: { full_name: patient.full_name as string, uhid: patient.uhid as string, phone: patient.phone as string | null, dob: (patient.dob as string | null) ?? null, gender: (patient.gender as string | null) ?? null, address: (patient.address as string | null) ?? null },
    generatedAt: new Date().toISOString(),
    sections,
    grandTotal,
    totalPaid,
    refunded: await sumCreditNotes(supabase, regularBills3.map((b) => b.id)),
    advanceAdjusted: await sumAdvanceAdjusted(supabase, regularBills3.map((b) => b.id)),
    advanceCollected,
    advanceRefunded,
    balanceDue: Math.max(0, grandTotal - totalPaid),
  }
}

export async function updateWardDailyRate(wardId: string, dailyRate: number): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('wards').update({ daily_rate: dailyRate }).eq('id', wardId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'ward_daily_rate', wardId, { daily_rate: dailyRate })
  return { success: true }
}
