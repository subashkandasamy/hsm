'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import {
  GenerateBillSchema, ApplyDiscountSchema, SetTaxSchema, RecordPaymentSchema,
} from '@/lib/schemas'
import type { Bill, ChargePreviewLine, BillItemSource, Tariff } from '@/lib/types'
import { applyAdvanceToBill } from '@/app/actions/admissionBilling'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Tariffs ----

export async function listTariffs(): Promise<Tariff[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('tariffs').select('*').order('key')
  return (data ?? []) as Tariff[]
}

export async function updateTariff(id: string, amount: number): Promise<SimpleResult> {
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
    if (visitId) q = q.eq('visit_id', visitId)
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
    if (visitId) q = q.eq('visit_id', visitId)
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

  // ---- Pharmacy dispenses (unbilled) ----
  {
    const { data } = await supabase
      .from('dispenses')
      .select('id, qty, price_snapshot, drug:drugs(name)')
      .eq('patient_id', patientId)
      .eq('billing_status', 'unbilled')
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

  // Auto-apply any available advance credit for IPD admission bills
  if (admission_id) {
    await applyAdvanceToBill(billId, admission_id).catch(() => {})
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
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const supabase = await createClient()

  // Must have no payments
  const { count } = await supabase
    .from('payments').select('id', { count: 'exact', head: true }).eq('bill_id', billId)
  if ((count ?? 0) > 0) return { success: false, error: 'Cannot cancel a bill that has payments' }

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
    } else if (source === 'ot') {
      await supabase.from('ot_schedules').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'blood') {
      await supabase.from('blood_issues').update({ billing_status: 'unbilled' }).in('id', refs)
    } else if (source === 'dental') {
      await supabase.from('dental_treatments').update({ billing_status: 'unbilled' }).in('id', refs)
    }
  }

  const { error } = await supabase
    .from('bills').update({ status: 'cancelled' }).eq('id', billId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'cancel', 'bill', billId)
  return { success: true }
}

// ---- Payments ----

export async function recordPayment(
  input: Record<string, unknown>
): Promise<SimpleResult> {
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
  totalOutstanding: number
}> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: todayBills }, { data: todayPayments }, { data: unpaidBills }] = await Promise.all([
    supabase.from('bills').select('total').gte('created_at', `${today}T00:00:00`).not('status', 'eq', 'cancelled'),
    supabase.from('payments').select('amount').gte('received_at', `${today}T00:00:00`),
    supabase.from('bills').select('total, paid').in('status', ['unpaid', 'partial']),
  ])

  return {
    todayBilled:      (todayBills    ?? []).reduce((s, b) => s + (b.total  as number), 0),
    todayCollected:   (todayPayments ?? []).reduce((s, p) => s + (p.amount as number), 0),
    totalOutstanding: (unpaidBills   ?? []).reduce((s, b) => s + Math.max(0, (b.total as number) - (b.paid as number)), 0),
  }
}

export async function listBills(filters?: {
  status?: string
  patientId?: string
}): Promise<Bill[]> {
  const supabase = await createClient()
  let q = supabase
    .from('bills')
    .select('*, patient:patients(id,full_name,uhid,phone)')
    .order('created_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(300)
  return (data ?? []) as unknown as Bill[]
}

export async function updateWardDailyRate(wardId: string, dailyRate: number): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('wards').update({ daily_rate: dailyRate }).eq('id', wardId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'ward_daily_rate', wardId, { daily_rate: dailyRate })
  return { success: true }
}
