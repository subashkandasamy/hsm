'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { removeOrderFromBills } from '@/lib/billing/orderBilling'
import { createServiceBill } from '@/lib/billing/serviceBill'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { isBillCashlessCovered, resolveServiceBill, billsCashlessCovered } from '@/lib/cashlessCover'
import { LabOrderSchema, LabTestCatalogSchema, LabResultItemSchema } from '@/lib/schemas'
import type { LabOrder, LabTestCatalog, LabTestMaster, LabOrderItem, LabFlag, AnalyteFormRow } from '@/lib/types'
import type { ReportAnalyte } from '@/lib/pdf/LabReportPdf'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Master catalog (global, platform-managed) ----

export async function listLabMaster(): Promise<LabTestMaster[]> {
  const supabase = await createClient()
  const { data } = await supabase
    // panel_only measurements — MCV, the differential, globulin, the ratios —
    // are real analytes but cannot be performed on their own, so they never
    // appear as something a hospital can activate and price.
    .from('lab_tests_master').select('*').eq('is_active', true).eq('panel_only', false).order('name')
  return (data ?? []) as LabTestMaster[]
}

export async function activateFromMaster(
  masterTestId: string,
  price: number
): Promise<{ success: true; test: LabTestCatalog } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')
  if (!(price > 0)) return { success: false, error: 'Enter a price greater than 0' }
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


/**
 * How many measurements each catalogue test yields, so the ordering screen can
 * say that a "Complete Blood Count" is twenty and a "Haemoglobin" is one. A
 * doctor picking from a list of identical-looking rows otherwise has no way to
 * tell a panel from a single test.
 *
 * One extra query for the whole list, not one per row.
 */
async function withAnalyteCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tests: LabTestCatalog[],
): Promise<LabTestCatalog[]> {
  const masterIds = [...new Set(tests.map((t) => t.lab_master_id).filter(Boolean))] as string[]
  if (!masterIds.length) return tests
  const { data } = await supabase
    .from('lab_test_analytes').select('lab_master_id, analyte_id').in('lab_master_id', masterIds)
  const byMaster = new Map<string, string[]>()
  for (const r of data ?? []) {
    const k = r.lab_master_id as string
    byMaster.set(k, [...(byMaster.get(k) ?? []), r.analyte_id as string])
  }
  return tests.map((t) => {
    const ids = t.lab_master_id ? byMaster.get(t.lab_master_id) ?? [] : []
    return { ...t, analyte_count: ids.length, analyte_ids: ids }
  })
}

export async function listLabCatalog(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_tests_catalog').select('*').eq('is_active', true).order('name')
  return withAnalyteCounts(supabase, (data ?? []) as LabTestCatalog[])
}

export async function listAllLabCatalog(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_tests_catalog').select('*').order('name')
  return withAnalyteCounts(supabase, (data ?? []) as LabTestCatalog[])
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
  // Re-check is_active here, not only in the picker: a stale tab could
  // otherwise order a test the hospital has switched off.
  const { data: tests } = await supabase
    .from('lab_tests_catalog').select('id, price, name').in('id', test_ids).eq('is_active', true)
  if (!tests?.length) return { success: false, error: 'No valid tests selected' }
  if (tests.length !== test_ids.length) {
    return { success: false, error: 'One of those tests is no longer offered — refresh and try again' }
  }

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

  // Bill the order immediately (OPD lab is paid before sample processing).
  const totalAmount = items.reduce((s, i) => s + i.price_snapshot, 0)
  if (totalAmount > 0) {
    const bill = await createServiceBill(supabase, {
      tenantId: actor.tenant_id, patientId: patient_id, actorId: actor.id, visitId: visit_id ?? null,
      billSource: 'lab',
      lines: items.map((item) => ({
        source: 'lab' as const, ref_id: orderId,
        description: tests?.find((t) => t.id === item.test_id)?.name ?? 'Lab test',
        qty: 1, unit_price: item.price_snapshot,
      })),
    })
    if ('error' in bill) console.error('[createLabOrder] bill failed:', bill.error)
    else await supabase.from('lab_orders').update({ billing_status: 'billed' }).eq('id', orderId)
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
    // IPD path: NOT gated on payment. The charge was captured as a bill at order
    // time and settles into the combined bill at discharge, so an admitted patient
    // never waits on a cash payment to have their sample collected. (Only OPD cash
    // is gated below; cashless is exempt in both paths.)
    const { error } = await supabase
      .from('lab_orders').update({ status: 'collected' }).eq('id', orderId).eq('status', 'ordered')
    if (error) return { success: false, error: error.message }

    await logAudit(actor.id, 'collect', 'lab_order', orderId)
    return { success: true }
  }

  // OPD path: gate on payment before sample collection
  const linkedBill = await resolveServiceBill(supabase, 'lab', orderId)
  // Cashless-approved patients don't pay cash up front — the insurer settles
  // later — so an eligibility-approved claim on this encounter lifts the gate.
  if (linkedBill && linkedBill.status !== 'paid' && !(await isBillCashlessCovered(supabase, linkedBill))) {
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

  // Changing a value withdraws any authorisation it had. A corrected result is
  // a different result, and it has to be looked at again before it goes back
  // out — including when the order had already been released, which is exactly
  // the case where a silent edit would be worst.
  //
  // (Full amendment history — keeping the superseded value and marking the
  // report amended — is the next piece of work. This is the gate, not the trail.)
  await supabase.from('lab_orders').update({
    status: 'processing', verified_by: null, verified_at: null,
  }).eq('id', orderId).in('status', ['collected', 'processing', 'verified', 'reported'])
  await logAudit(actor.id, 'results', 'lab_order', orderId)
  return { success: true }
}

/**
 * Authorise results for release. Nothing outside the laboratory — the patient
 * portal, the printed report — shows an order until this has happened, which is
 * what stops a half-typed panel, or an analyzer's unreviewed output, reaching a
 * patient.
 *
 * Not a four-eyes rule: a small hospital's lab is often one technician, so
 * lab:verify is granted to that role by default. The point is that releasing is
 * a deliberate act by a person, not that it is a different person.
 */
export async function verifyOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:verify')
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('lab_order_items')
    .select('id, result_value, result_text')
    .eq('lab_order_id', orderId)
  if (!items?.length) return { success: false, error: 'This order has no tests' }

  const pending = items.filter((i) => i.result_value == null && !i.result_text)
  if (pending.length === items.length) {
    return { success: false, error: 'No results have been entered yet' }
  }
  if (pending.length) {
    return {
      success: false,
      error: `${pending.length} of ${items.length} tests have no result yet — enter or cancel them first`,
    }
  }

  const { error } = await supabase.from('lab_orders').update({
    status: 'verified', verified_by: actor.id, verified_at: new Date().toISOString(),
  }).eq('id', orderId).in('status', ['collected', 'processing'])
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'verify', 'lab_order', orderId)
  return { success: true }
}

/** Release a verified order. This is the point it becomes visible to the patient. */
export async function reportOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:verify')
  const supabase = await createClient()

  const { data: cur } = await supabase
    .from('lab_orders').select('status').eq('id', orderId).single()
  if (cur?.status !== 'verified') {
    return { success: false, error: 'Results must be verified before the report is released' }
  }

  const { error } = await supabase.from('lab_orders').update({
    status: 'reported', reported_at: new Date().toISOString(),
  }).eq('id', orderId).eq('status', 'verified')
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

  // Take the order off its bill(s) — only its own lines, never other charges.
  const billing = await removeOrderFromBills(supabase, 'lab', orderId)

  await logAudit(actor.id, 'cancel', 'lab_order', orderId, { billing })
  return { success: true }
}

export async function getLabOrder(id: string): Promise<LabOrder | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_orders')
    .select(`*, patient:patients(id,full_name,uhid), orderer:profiles!ordered_by(id,full_name),
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
    .select(`*, patient:patients(id,full_name,uhid), orderer:profiles!ordered_by(id,full_name),
             items:lab_order_items(*, test:lab_tests_catalog(*))`)
    .order('ordered_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.visitId) q = q.eq('visit_id', filters.visitId)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as LabOrder[]
}

/**
 * Which of these orders cannot be collected yet because the money has not
 * arrived. Lets the worklist say so on the row instead of letting somebody
 * press Collect and read an error.
 *
 * Mirrors collectSample exactly, so the screen and the action never disagree:
 * an inpatient is never blocked — their charge settles into the combined bill
 * at discharge — and neither is a patient with an eligibility-approved cashless
 * claim on the encounter. Only an unpaid outpatient bill holds a sample up.
 *
 * Three queries regardless of how many orders are on screen.
 */
export async function labOrdersAwaitingPayment(orderIds: string[]): Promise<string[]> {
  if (!orderIds.length) return []
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('lab_orders').select('id, admission_id').in('id', orderIds)
  // Inpatients are exempt by design — nobody waits on cash in a ward.
  const opd = (orders ?? []).filter((o) => !o.admission_id).map((o) => o.id as string)
  if (!opd.length) return []

  const { data: items } = await supabase
    .from('bill_items')
    .select('ref_id, bill:bills(id, status, visit_id, admission_id)')
    .eq('source', 'lab').in('ref_id', opd)

  type B = { id: string; status: string; visit_id: string | null; admission_id: string | null }
  const billOf = new Map<string, B>()
  for (const it of items ?? []) {
    const b = (it as unknown as { ref_id: string; bill: B | null }).bill
    if (b && b.status !== 'cancelled') billOf.set((it as unknown as { ref_id: string }).ref_id, b)
  }

  const unpaid = [...billOf.entries()].filter(([, b]) => b.status !== 'paid')
  if (!unpaid.length) return []

  const covered = await billsCashlessCovered(supabase, unpaid.map(([, b]) => b))
  return unpaid.filter(([, b]) => !covered.has(b.id)).map(([orderId]) => orderId)
}

// ── Analyte-level results ────────────────────────────────────────────────────

/**
 * The result-entry form for an order: every analyte of every panel on it, with
 * the reference range already resolved for this patient's sex and age, and
 * anything previously entered.
 *
 * Tests with no analytes behind them return no rows and keep the single-value
 * field they have always had, so a hospital's own local panel goes on working.
 */
export async function getOrderAnalyteForm(orderId: string): Promise<AnalyteFormRow[]> {
  await requirePermission((await getActorProfile()).role, 'lab:read')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_order_analyte_form', { p_order_id: orderId })
  if (error) { console.error('[getOrderAnalyteForm]', error.message); return [] }
  return (data ?? []) as AnalyteFormRow[]
}

/**
 * Write a whole panel in one transaction. The database resolves each analyte's
 * range for the patient and decides the flag, so the value the technician sees
 * previewed and the value stored can never diverge.
 */
export async function saveAnalyteResults(
  orderId: string,
  items: Array<{ test_id: string; analyte_id: string; value_num?: number | null; value_text?: string | null }>,
): Promise<{ success: true; written: number; critical: number } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('save_lab_analyte_results', {
    p_order_id: orderId,
    p_items: items,
    p_source: 'manual',
  })
  if (error) return { success: false, error: error.message }

  const row = (Array.isArray(data) ? data[0] : data) as { written: number; critical: number } | null
  await logAudit(actor.id, 'results', 'lab_order', orderId, {
    analytes: row?.written ?? 0, critical: row?.critical ?? 0,
  })
  return { success: true, written: row?.written ?? 0, critical: row?.critical ?? 0 }
}

/** The analyte results a printed report shows, with the range that was applied. */
export async function getLabReportAnalytes(orderId: string): Promise<ReportAnalyte[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_lab_report_analytes', { p_order_id: orderId })
  if (error) { console.error('[getLabReportAnalytes]', error.message); return [] }
  return (data ?? []) as ReportAnalyte[]
}

/** Who authorised the release, for the signature block ISO 15189 Cl. 5.8.3 asks for. */
export async function getLabVerifier(orderId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_orders')
    .select('verifier:profiles!lab_orders_verified_by_fkey(full_name)')
    .eq('id', orderId).maybeSingle()
  return ((data as unknown as { verifier: { full_name: string } | null } | null)?.verifier?.full_name) ?? null
}
