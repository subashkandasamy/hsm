'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  GenerateBillSchema, ApplyDiscountSchema, SetTaxSchema, RecordPaymentSchema,
} from '@/lib/schemas'
import type { Bill, ChargePreviewLine, BillItemSource, Tariff, CombinedBillData } from '@/lib/types'
import { autoIpdBill } from '@/lib/ipdBilling'

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
  {
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
      .select('id, qty, price_snapshot, drug:drugs(name)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
    if (admissionId) q = q.eq('admission_id', admissionId)
    else if (visitId) q = q.eq('visit_id', visitId)
    const { data } = await q
    for (const d of data ?? []) {
      const qty = d.qty as number
      const price = d.price_snapshot as number
      lines.push({
        source: 'pharmacy',
        ref_id: d.id,
        description: (d.drug as unknown as { name: string } | null)?.name ?? 'Medication',
        qty,
        unit_price: price,
        amount: qty * price,
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
      .select('id, procedure_name, price_snapshot, consumables:ot_consumables(id, description, qty, unit_price)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
      .eq('status', 'completed')
    if (admissionId) {
      // no direct link — just take all patient OT charges
    }
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
      for (const c of (s.consumables ?? []) as Array<{ id: string; description: string; qty: number; unit_price: number }>) {
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

export async function generateBill(
  input: Record<string, unknown>
): Promise<{ success: true; billId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const parsed = GenerateBillSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, visit_id, admission_id, selected_refs, manual_items } = parsed.data
  const supabase = await createClient()

  // Get all unbilled charge data for the selected refs
  const allCharges = await getUnbilledCharges({
    patientId: patient_id,
    visitId: visit_id ?? null,
    admissionId: admission_id ?? null,
  })

  const selectedCharges = allCharges.filter((c) => selected_refs.includes(c.ref_id))

  // Generate race-safe bill number
  const { data: billNoData, error: billNoErr } = await supabase.rpc('get_next_bill_no')
  if (billNoErr || !billNoData) return { success: false, error: 'Failed to generate bill number' }
  const bill_no = billNoData as string

  const billId = crypto.randomUUID()

  // Build bill_items list
  type BillItemInsert = {
    id: string; tenant_id: string; bill_id: string; source: BillItemSource; ref_id: string | null
    description: string; qty: number; unit_price: number; amount: number
  }

  const itemsToInsert: BillItemInsert[] = [
    ...selectedCharges.map((c) => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      bill_id: billId,
      source: c.source,
      ref_id: c.ref_id,
      description: c.description,
      qty: c.qty,
      unit_price: c.unit_price,
      amount: c.amount,
    })),
    ...(manual_items ?? []).map((m) => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      bill_id: billId,
      source: 'manual' as BillItemSource,
      ref_id: null,
      description: m.description,
      qty: m.qty,
      unit_price: m.unit_price,
      amount: m.qty * m.unit_price,
    })),
  ]

  const subtotal = itemsToInsert.reduce((s, i) => s + i.amount, 0)

  // Insert the bill first
  const { error: billErr } = await supabase.from('bills').insert({
    id: billId,
    tenant_id: actor.tenant_id,
    patient_id,
    visit_id: visit_id ?? null,
    admission_id: admission_id ?? null,
    bill_no,
    subtotal,
    discount: 0,
    tax: 0,
    total: subtotal,
    paid: 0,
    status: 'draft',
    created_by: actor.id,
  })
  if (billErr) return { success: false, error: billErr.message }

  // Insert bill items
  if (itemsToInsert.length > 0) {
    const { error: itemErr } = await supabase.from('bill_items').insert(itemsToInsert)
    if (itemErr) {
      await supabase.from('bills').delete().eq('id', billId)
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

  // Helper: update billing_status with double-bill guard — returns error string or null
  async function flipToBilled(table: string, refs: string[]): Promise<string | null> {
    const { data, error } = await supabase
      .from(table as 'visits')
      .update({ billing_status: 'billed' })
      .in('id', refs)
      .eq('billing_status', 'unbilled')
      .select('id')
    if (error) return error.message
    if ((data?.length ?? 0) < refs.length) return `Some ${table} charges were already billed`
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
      await supabase.from('bills').delete().eq('id', billId)
      return { success: false, error: flipErr }
    }
  }

  // Auto-apply any available advance credit for IPD admission bills.
  // Done inline (not via applyAdvanceToBill) to reuse the existing actor + supabase
  // client and avoid a silent permission failure in the nested server action call.
  if (admission_id) {
    const { data: advRows } = await supabase
      .from('admission_advances').select('amount').eq('admission_id', admission_id)
    const totalAdvance = (advRows ?? []).reduce((s, a) => s + (a.amount as number), 0)

    const { data: refRows } = await supabase
      .from('admission_advance_refunds').select('amount').eq('admission_id', admission_id)
    const totalRefunded = (refRows ?? []).reduce((s, r) => s + (r.amount as number), 0)

    // Advance already applied to OTHER bills for this admission (exclude the new bill)
    const { data: priorBills } = await supabase
      .from('bills').select('id')
      .eq('admission_id', admission_id)
      .neq('id', billId)
      .not('status', 'eq', 'cancelled')
    const priorBillIds = (priorBills ?? []).map((b) => b.id as string)
    let advanceApplied = 0
    if (priorBillIds.length > 0) {
      const { data: advPmts } = await supabase
        .from('payments').select('amount')
        .in('bill_id', priorBillIds).eq('method', 'advance')
      advanceApplied = (advPmts ?? []).reduce((s, p) => s + (p.amount as number), 0)
    }

    const unusedAdvance = Math.max(0, totalAdvance - totalRefunded - advanceApplied)
    const applyAmount   = Math.min(unusedAdvance, subtotal)
    if (applyAmount > 0) {
      await supabase.from('payments').insert({
        id: crypto.randomUUID(),
        tenant_id: actor.tenant_id,
        bill_id: billId,
        amount: applyAmount,
        method: 'advance',
        received_by: actor.id,
      })
      const newStatus = applyAmount >= subtotal ? 'paid' : 'partial'
      await supabase.from('bills').update({ paid: applyAmount, status: newStatus }).eq('id', billId)
    }
  }

  await logAudit(actor.id, 'generate', 'bill', billId, {
    bill_no, patient_id, items: itemsToInsert.length, subtotal,
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
    .from('bills').select('subtotal, tax, status').eq('id', parsed.data.bill_id).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'paid' || (bill.status as string) === 'cancelled')
    return { success: false, error: 'Cannot modify a paid or cancelled bill' }

  const total = Math.max(0, (bill.subtotal as number) - parsed.data.discount + (bill.tax as number))
  const { error } = await supabase.from('bills').update({
    discount: parsed.data.discount, total,
  }).eq('id', parsed.data.bill_id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'discount', 'bill', parsed.data.bill_id, { discount: parsed.data.discount })
  return { success: true }
}

export async function setTax(
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const parsed = SetTaxSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from('bills').select('subtotal, discount, status').eq('id', parsed.data.bill_id).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'paid' || (bill.status as string) === 'cancelled')
    return { success: false, error: 'Cannot modify a paid or cancelled bill' }

  const total = Math.max(0, (bill.subtotal as number) - (bill.discount as number) + parsed.data.tax)
  const { error } = await supabase.from('bills').update({
    tax: parsed.data.tax, total,
  }).eq('id', parsed.data.bill_id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'tax', 'bill', parsed.data.bill_id, { tax: parsed.data.tax })
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

  // Block if non-advance payments exist (cash/card/UPI etc.)
  const { count: cashCount } = await supabase
    .from('payments').select('id', { count: 'exact', head: true })
    .eq('bill_id', billId).neq('method', 'advance')
  if ((cashCount ?? 0) > 0) return { success: false, error: 'Cannot cancel a bill that has payments' }

  // Delete any advance auto-payments — advance returns to pool via exclusion logic
  await supabase.from('payments').delete().eq('bill_id', billId).eq('method', 'advance')

  // Get all bill items with source and ref_id to revert
  const { data: items } = await supabase
    .from('bill_items').select('source, ref_id').eq('bill_id', billId)

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

  const { error } = await supabase
    .from('bills').update({ status: 'cancelled' }).eq('id', billId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'cancel', 'bill', billId)
  return { success: true }
}

// ---- IPD daily charge generation (called from IPD ward board RSC) ----

export async function generateMissingDailyCharges(
  admissions: Array<{ id: string; patient_id: string; ward: { name: string; daily_rate: number } }>
): Promise<void> {
  await requireWriteAccess()
  if (!admissions.length) return
  const actor = await getActorProfile()
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const admissionIds = admissions.map((a) => a.id)

  // ── 1. Fetch all today's non-cancelled bills for these admissions (one query) ──
  const { data: todayBills } = await supabase
    .from('bills')
    .select('id, admission_id, bill_source')
    .in('admission_id', admissionIds)
    .eq('billing_date', today)
    .neq('status', 'cancelled')

  // Map: admissionId → Set<bill_source already created today>
  const billedToday = new Map<string, Set<string>>()
  for (const b of todayBills ?? []) {
    const aid = b.admission_id as string
    if (!billedToday.has(aid)) billedToday.set(aid, new Set())
    billedToday.get(aid)!.add(b.bill_source as string)
  }

  // ── 2. Bed bills: one per admission per day ──────────────────────────────────
  for (const adm of admissions) {
    if (billedToday.get(adm.id)?.has('bed')) continue
    const rate = adm.ward?.daily_rate ?? 0
    if (rate <= 0) continue
    const wardLabel = adm.ward?.name ? `${adm.ward.name} — Room Rent` : 'Room Rent'
    await autoIpdBill(supabase, actor.id, {
      tenantId: actor.tenant_id,
      admissionId: adm.id,
      patientId: adm.patient_id,
      billingDate: today,
      billSource: 'bed',
      lineItems: [{
        source: 'bed',
        ref_id: null,
        description: wardLabel,
        qty: 1,
        unit_price: rate,
      }],
    })
  }

  // ── 3. Nursing bills: carry-forward most recent assignment per shift ──────────
  // Query ALL assignments for these admissions up to and including today,
  // sorted newest-first so we can take the first match per (admission, shift).
  const { data: allAssignments } = await supabase
    .from('admission_nurse_assignments')
    .select('admission_id, shift, charge_snapshot')
    .in('admission_id', admissionIds)
    .lte('assigned_date', today)
    .order('assigned_date', { ascending: false })

  if (!allAssignments?.length) return

  // Deduplicate to the most recent assignment per (admission_id, shift)
  const latestPerShift = new Map<string, { admissionId: string; shift: string; chargeSnapshot: number }>()
  for (const a of allAssignments) {
    const key = `${a.admission_id}:${a.shift}`
    if (!latestPerShift.has(key)) {
      latestPerShift.set(key, {
        admissionId: a.admission_id as string,
        shift: a.shift as string,
        chargeSnapshot: a.charge_snapshot as number,
      })
    }
  }

  // Build admission map for quick lookup
  const admissionMap = new Map(admissions.map((a) => [a.id, a]))

  // Create per-shift nursing bills that haven't been created today yet
  for (const [, entry] of latestPerShift) {
    const billSource = entry.shift === 'morning' ? 'nursing_morning' : 'nursing_night'
    if (billedToday.get(entry.admissionId)?.has(billSource)) continue

    const adm = admissionMap.get(entry.admissionId)
    if (!adm) continue

    const shiftLabel = entry.shift === 'morning' ? 'Morning' : 'Night'
    await autoIpdBill(supabase, actor.id, {
      tenantId: actor.tenant_id,
      admissionId: entry.admissionId,
      patientId: adm.patient_id,
      billingDate: today,
      billSource,
      lineItems: [{
        source: billSource as 'nursing_morning' | 'nursing_night',
        description: `Nursing — ${shiftLabel} Shift`,
        qty: 1,
        unit_price: entry.chargeSnapshot,
      }],
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
  const { data: bill } = await supabase
    .from('bills').select('total, paid, status').eq('id', parsed.data.bill_id).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'cancelled') return { success: false, error: 'Bill is cancelled' }
  if ((bill.status as string) === 'paid') return { success: false, error: 'Bill is already fully paid' }

  const balanceDue = (bill.total as number) - (bill.paid as number)
  if (parsed.data.amount > balanceDue + 0.001) {
    return { success: false, error: `Payment of ₹${parsed.data.amount.toFixed(2)} exceeds balance due of ₹${balanceDue.toFixed(2)}` }
  }

  const { error: payErr } = await supabase.from('payments').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    bill_id: parsed.data.bill_id,
    amount: parsed.data.amount,
    method: parsed.data.method,
    reference: parsed.data.reference ?? null,
    received_by: actor.id,
  })
  if (payErr) return { success: false, error: payErr.message }

  const newPaid = (bill.paid as number) + parsed.data.amount
  const newStatus = newPaid >= (bill.total as number) ? 'paid' : 'partial'

  const { error: billErr } = await supabase.from('bills').update({
    paid: newPaid, status: newStatus,
  }).eq('id', parsed.data.bill_id)
  if (billErr) return { success: false, error: billErr.message }

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
    .select(`*, patient:patients(id,full_name,uhid,phone),
             items:bill_items(*),
             payments(*, receiver:profiles(id,full_name))`)
    .eq('id', id)
    .single()
  return data as unknown as Bill | null
}

export async function getBillingStats(): Promise<{
  todayBilled: number
  todayCollected: number
  todayOutstanding: number
  pastOutstanding: number
}> {
  const supabase = await createClient()
  // IST-aware local date
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const [{ data: todayBills }, { data: todayUnpaid }, { data: pastUnpaid }] = await Promise.all([
    // Today's non-cancelled service bills — use OR to correctly include NULL bill_source rows
    supabase.from('bills').select('total, paid')
      .gte('created_at', `${today}T00:00:00`)
      .not('status', 'eq', 'cancelled')
      .or('bill_source.is.null,bill_source.not.in.(appointment_refund,advance_refund)'),
    // Today's unpaid/partial bills
    supabase.from('bills').select('total, paid')
      .in('status', ['unpaid', 'partial'])
      .gte('created_at', `${today}T00:00:00`),
    // Past unpaid/partial bills
    supabase.from('bills').select('total, paid')
      .in('status', ['unpaid', 'partial'])
      .lt('created_at', `${today}T00:00:00`),
  ])

  return {
    todayBilled:      (todayBills  ?? []).reduce((s, b) => s + (b.total as number), 0),
    todayCollected:   (todayBills  ?? []).reduce((s, b) => s + (b.paid  as number), 0),
    todayOutstanding: (todayUnpaid ?? []).reduce((s, b) => s + Math.max(0, (b.total as number) - (b.paid as number)), 0),
    pastOutstanding:  (pastUnpaid  ?? []).reduce((s, b) => s + Math.max(0, (b.total as number) - (b.paid as number)), 0),
  }
}

export async function listBills(filters?: {
  status?: string
  patientId?: string
}): Promise<Bill[]> {
  const supabase = await createClient()
  let q = supabase
    .from('bills')
    .select('*, patient:patients(id,full_name,uhid,phone), items:bill_items(source), visit:visits(id,type)')
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(300)
  return (data ?? []) as unknown as Bill[]
}


// ---- Combined Bill View ----

const COMBINED_BILL_SECTIONS: Array<{ label: string; sources: string[] }> = [
  { label: 'Room Charges',      sources: ['bed'] },
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

export async function getCombinedBillData(admissionId: string): Promise<CombinedBillData | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()

  // 0. Fetch tenant name
  const { data: tenantRow } = await supabase
    .from('tenants').select('name').eq('id', actor.tenant_id).single()
  const tenantName = (tenantRow?.name as string | null) ?? 'Hospital'

  // 1. Fetch admission
  const { data: admission } = await supabase
    .from('admissions')
    .select('id, patient_id, combined_bill_no')
    .eq('id', admissionId)
    .single()
  if (!admission) return null

  const patientId = admission.patient_id as string

  // 2. Get-or-create combined bill number (lazy generation for old admissions)
  let combinedBillNo = 'COMBINED'
  const existingNo = (admission as Record<string, unknown>).combined_bill_no as string | null | undefined
  if (existingNo) {
    combinedBillNo = existingNo
  } else {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    if (billNoData) {
      combinedBillNo = billNoData as string
      await supabase.from('admissions').update({ combined_bill_no: combinedBillNo }).eq('id', admissionId)
    }
  }

  // 3. Fetch patient info
  const { data: patient } = await supabase
    .from('patients').select('full_name, uhid, phone').eq('id', patientId).single()
  if (!patient) return null

  type RawBill = {
    id: string; bill_no: string; billing_date: string | null; created_at: string
    total: number; paid: number; bill_source: string | null
    items: Array<{ source: string; description: string; qty: number; unit_price: number; amount: number }>
  }

  const BILL_SELECT = 'id, bill_no, billing_date, created_at, total, paid, bill_source, items:bill_items(source, description, qty, unit_price, amount)'

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
  const sections: import('@/lib/types').CombinedBillSection[] = []
  for (const sectionDef of COMBINED_BILL_SECTIONS) {
    const rows: import('@/lib/types').CombinedBillSection['rows'] = []
    for (const bill of allBills) {
      const date = (bill.billing_date ?? bill.created_at).slice(0, 10)
      for (const item of bill.items) {
        if (sectionDef.sources.includes(item.source)) {
          rows.push({
            date,
            billNo: bill.bill_no,
            description: item.description,
            qty: item.qty,
            unitPrice: item.unit_price,
            amount: item.amount,
          })
        }
      }
    }
    if (rows.length > 0) {
      sections.push({ label: sectionDef.label, rows, subtotal: rows.reduce((s, r) => s + r.amount, 0) })
    }
  }

  const regularBills = allBills.filter(b => b.bill_source !== 'advance_refund')
  const refundBills  = allBills.filter(b => b.bill_source === 'advance_refund')
  const grandTotal      = regularBills.reduce((s, b) => s + b.total, 0)
  const totalPaid       = regularBills.reduce((s, b) => s + b.paid, 0)
  const advanceRefunded = refundBills.reduce((s, b) => s + Math.abs(b.total), 0)

  return {
    combinedBillNo,
    tenantName,
    patient: {
      full_name: patient.full_name as string,
      uhid: patient.uhid as string,
      phone: patient.phone as string | null,
    },
    generatedAt: new Date().toISOString(),
    sections,
    grandTotal,
    totalPaid,
    advanceCollected,
    advanceRefunded,
    balanceDue: Math.max(0, grandTotal - totalPaid),
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
  type VisitRow = { id: string; patient_id: string; combined_bill_no: string | null; appointment_id: string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let visitRow: VisitRow | null = null
  {
    const { data, error } = await supabase
      .from('visits')
      .select('id, patient_id, combined_bill_no, appointment_id')
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
      .select('id, patient_id, combined_bill_no, appointment_id')
      .eq('appointment_id', visitId)
      .maybeSingle()
    if (error) console.error('[getOpdCombinedBillData] appt fallback error:', error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (data) visitRow = data as any as VisitRow
  }
  if (!visitRow) return null

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
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
    if (billNoData) {
      combinedBillNo = billNoData as string
      await supabase.from('visits').update({ combined_bill_no: combinedBillNo }).eq('id', resolvedVisitId)
    }
  }

  // 3. Fetch patient info
  const { data: patient } = await supabase
    .from('patients').select('full_name, uhid, phone').eq('id', patientId).single()
  if (!patient) return null

  type RawBill = {
    id: string; bill_no: string; billing_date: string | null; created_at: string
    total: number; paid: number; bill_source: string | null
    items: Array<{ source: string; description: string; qty: number; unit_price: number; amount: number }>
  }

  // 4. Fetch all non-cancelled bills for this visit (filter consolidated in JS — PG neq drops NULLs)
  const BILL_SELECT = 'id, bill_no, billing_date, created_at, total, paid, bill_source, items:bill_items(source, description, qty, unit_price, amount)'
  const { data: visitBills } = await supabase
    .from('bills')
    .select(BILL_SELECT)
    .eq('visit_id', resolvedVisitId)
    .neq('status', 'cancelled')
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
      .neq('status', 'cancelled')
      .order('billing_date', { ascending: true })
      .order('created_at', { ascending: true })
    preVisitBills = ((pb ?? []) as unknown as RawBill[]).filter((b) => b.bill_source !== 'consolidated')
  }

  const allBills = [
    ...preVisitBills,
    ...((visitBills ?? []) as unknown as RawBill[]).filter((b) => b.bill_source !== 'consolidated'),
  ]

  // 5. Group items into sections
  const sections: import('@/lib/types').CombinedBillSection[] = []
  for (const sectionDef of COMBINED_BILL_SECTIONS) {
    const rows: import('@/lib/types').CombinedBillSection['rows'] = []
    for (const bill of allBills) {
      const date = (bill.billing_date ?? bill.created_at).slice(0, 10)
      for (const item of bill.items) {
        if (sectionDef.sources.includes(item.source)) {
          rows.push({
            date,
            billNo: bill.bill_no,
            description: item.description,
            qty: item.qty,
            unitPrice: item.unit_price,
            amount: item.amount,
          })
        }
      }
    }
    if (rows.length > 0) {
      sections.push({ label: sectionDef.label, rows, subtotal: rows.reduce((s, r) => s + r.amount, 0) })
    }
  }

  const regularBills2 = allBills.filter(b => b.bill_source !== 'advance_refund')
  const grandTotal = regularBills2.reduce((s, b) => s + b.total, 0)
  const totalPaid  = regularBills2.reduce((s, b) => s + b.paid, 0)

  return {
    combinedBillNo,
    tenantName,
    patient: {
      full_name: patient.full_name as string,
      uhid: patient.uhid as string,
      phone: patient.phone as string | null,
    },
    generatedAt: new Date().toISOString(),
    sections,
    grandTotal,
    totalPaid,
    advanceCollected: 0,
    advanceRefunded: 0,
    balanceDue: Math.max(0, grandTotal - totalPaid),
  }
}

export async function getPatientCombinedBillData(patientId: string): Promise<CombinedBillData | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()

  const { data: tenantRow } = await supabase
    .from('tenants').select('name').eq('id', actor.tenant_id).single()
  const tenantName = (tenantRow?.name as string | null) ?? 'Hospital'

  const { data: patient } = await supabase
    .from('patients').select('full_name, uhid, phone').eq('id', patientId).single()
  if (!patient) return null

  // Use combined_bill_no on the patient row, or generate one
  let combinedBillNo = 'COMBINED'
  const { data: billNoRow } = await supabase
    .from('patients').select('combined_bill_no').eq('id', patientId).maybeSingle()
  const existingNo = (billNoRow as Record<string, unknown> | null)?.combined_bill_no as string | null | undefined
  if (existingNo) {
    combinedBillNo = existingNo
  } else {
    const { data: billNoData } = await supabase.rpc('get_next_bill_no')
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
    .select('id, bill_no, billing_date, created_at, total, paid, bill_source, items:bill_items(source, description, qty, unit_price, amount)')
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

  const sections: import('@/lib/types').CombinedBillSection[] = []
  for (const sectionDef of COMBINED_BILL_SECTIONS) {
    const rows: import('@/lib/types').CombinedBillSection['rows'] = []
    for (const bill of allBills) {
      const date = (bill.billing_date ?? bill.created_at).slice(0, 10)
      for (const item of bill.items) {
        if (sectionDef.sources.includes(item.source)) {
          rows.push({ date, billNo: bill.bill_no, description: item.description, qty: item.qty, unitPrice: item.unit_price, amount: item.amount })
        }
      }
    }
    if (rows.length > 0) {
      sections.push({ label: sectionDef.label, rows, subtotal: rows.reduce((s, r) => s + r.amount, 0) })
    }
  }

  const regularBills3 = allBills.filter(b => b.bill_source !== 'advance_refund')
  const refundBills3  = allBills.filter(b => b.bill_source === 'advance_refund')
  const grandTotal      = regularBills3.reduce((s, b) => s + b.total, 0)
  const totalPaid       = regularBills3.reduce((s, b) => s + b.paid, 0)
  const advanceRefunded = refundBills3.reduce((s, b) => s + Math.abs(b.total), 0)

  return {
    combinedBillNo,
    tenantName,
    patient: { full_name: patient.full_name as string, uhid: patient.uhid as string, phone: patient.phone as string | null },
    generatedAt: new Date().toISOString(),
    sections,
    grandTotal,
    totalPaid,
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
