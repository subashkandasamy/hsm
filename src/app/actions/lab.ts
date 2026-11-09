'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { removeOrderFromBills } from '@/lib/billing/orderBilling'
import { createServiceBill } from '@/lib/billing/serviceBill'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { resolveServiceBill, billsCashlessCovered } from '@/lib/cashlessCover'
import { requiresPaymentFirst, unpaidAllowed } from '@/lib/payGate'
import { LabOrderSchema, LabTestCatalogSchema, LabResultItemSchema } from '@/lib/schemas'
import type { LabOrder, LabTestCatalog, LabTestMaster, LabOrderItem, LabFlag, AnalyteFormRow } from '@/lib/types'
import type { ReportAnalyte } from '@/lib/pdf/LabReportPdf'
import { pageAll } from '@/lib/supabase/pageAll'

type SimpleResult = { success: true } | { success: false; error: string }

/**
 * Verification can fail in a way the technician is allowed to overrule.
 *
 * `needsConfirmation` marks the one refusal that is a question rather than a
 * verdict: a panel with measurements still missing. Releasing part of a panel
 * is a real decision a laboratory makes; it just must not be made by accident.
 */
type VerifyResult = SimpleResult | { success: false; error: string; needsConfirmation: true }

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

  // A panel component is activated at 0 deliberately — it is not for sale.
  // Everything else must carry a price or it bills as a zero.
  const isComponent = (master as Record<string, unknown>).package_only === true
  if (!isComponent && !(price > 0)) return { success: false, error: 'Enter a price greater than 0' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('lab_tests_catalog').insert({
    id,
    tenant_id:       actor.tenant_id,
    lab_master_id:   masterTestId,
    name:            master.name,
    code:            master.code ?? null,
    category:        (master as Record<string, unknown>).category as string ?? 'General',
    // The clinical grouping a doctor orders by, and the discipline that runs
    // it, are different facts and both have to come across.
    department:      (master as Record<string, unknown>).department as string ?? null,
    // Which container it is drawn into. Added in 0183 and backfilled there,
    // but never copied here — so anything activated since has been arriving
    // with no tube type, which ensure_lab_samples reads as 'other'. That puts
    // a serum test in the wrong tube and out of NABL's draw order.
    tube_type:       (master as Record<string, unknown>).tube_type as string ?? null,
    sample_type:     master.sample_type ?? null,
    unit:            master.unit ?? null,
    ref_low:         master.ref_low ?? null,
    ref_high:        master.ref_high ?? null,
    reference_range: master.reference_range ?? null,
    // Whether a test is a panel component is true of the test, not of one
    // hospital, so it comes down with the clinical detail.
    package_only:    (master as Record<string, unknown>).package_only === true,
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
  // `package_only` rows are the measurements inside a panel. They are real
  // records with real results, but nobody orders A/G Ratio on its own, and a
  // test with no price on an order screen ends up on a bill as a zero.
  const data = await pageAll<LabTestCatalog>((f, t) => supabase
    .from('lab_tests_catalog').select('*')
    .eq('is_active', true).eq('package_only', false)
    .order('name').order('id').range(f, t))
  return withAnalyteCounts(supabase, data)
}

export async function listAllLabCatalog(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const data = await pageAll<LabTestCatalog>((f, t) => supabase
    .from('lab_tests_catalog').select('*').order('name').order('id').range(f, t))
  return withAnalyteCounts(supabase, data)
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
    // A failed bill is only logged — the order stays, so the laboratory is not
    // blocked by an accounting problem. What must not happen is the sample
    // going through as if there were nothing to pay, which is what collectSample
    // now checks for rather than trusting this line to have succeeded.
    if ('error' in bill) console.error('[createLabOrder] bill failed:', bill.error)
    else await supabase.from('lab_orders').update({ billing_status: 'billed' }).eq('id', orderId)
  }

  // Work out the tubes now, so the label and the analyzer agree from the start.
  await supabase.rpc('ensure_lab_samples', { p_order_id: orderId })

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
    return markCollected(supabase, actor.id, orderId)
  }

  // OPD path: gate on payment before sample collection
  const linkedBill = await resolveServiceBill(supabase, 'lab', orderId)
  // Cashless-approved patients don't pay cash up front — the insurer settles
  // later — so an eligibility-approved claim on this encounter lifts the gate.
  if (linkedBill && linkedBill.status !== 'paid' && !(await unpaidAllowed(supabase, actor.tenant_id, 'lab', linkedBill))) {
    return { success: false, error: 'Awaiting payment — please collect payment before collecting the sample' }
  }

  // No bill at all, on an order that costs something, is not the same as
  // nothing to pay. The gate above only fires on a bill it can FIND, so a
  // billing failure at order time used to arrive here as silence and the test
  // was run free. A chargeable order with no bill is held until someone looks.
  if (!linkedBill) {
    const chargeable = ((order?.items ?? []) as Array<{ price_snapshot: number | null }>)
      .reduce((sum, i) => sum + (i.price_snapshot ?? 0), 0)
    if (chargeable > 0) {
      return {
        success: false,
        error: 'This order was never billed — raise the bill from Billing before collecting the sample',
      }
    }
  }

  return markCollected(supabase, actor.id, orderId)
}

/**
 * The one place an order becomes 'collected'.
 *
 * Both paths used to update and return success without looking at whether a
 * row had actually changed, so a second click, or a click on an order someone
 * else had already moved on, reported "collected" having done nothing.
 */
async function markCollected(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  orderId: string,
): Promise<SimpleResult> {
  const { data, error } = await supabase
    .from('lab_orders').update({ status: 'collected' })
    .eq('id', orderId).eq('status', 'ordered')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!data?.length) {
    return { success: false, error: 'This sample is no longer awaiting collection — refresh the page' }
  }
  await logAudit(actorId, 'collect', 'lab_order', orderId)
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

  // The same two gates the database puts on the panel path (0175), which this
  // one went around entirely: results on a tube nobody drew, and results on a
  // cancelled order. An order left at 'ordered' with results on it could also
  // never be verified afterwards, because verifyOrder only moves an order out
  // of 'collected' or 'processing'.
  const { data: order } = await supabase
    .from('lab_orders').select('status').eq('id', orderId).maybeSingle()
  if (!order) return { success: false, error: 'That order no longer exists' }
  if (order.status === 'ordered') {
    return { success: false, error: 'Collect the sample before entering results' }
  }
  if (order.status === 'cancelled') {
    return { success: false, error: 'This order was cancelled' }
  }

  for (const raw of items) {
    const parsed = LabResultItemSchema.safeParse(raw)
    if (!parsed.success) continue
    const { item_id, result_value, result_text, unit } = parsed.data

    // Scoped to this order, not just to the id. item_id arrives from the
    // browser; without the second filter a crafted call could write a result
    // onto another patient's order in the same hospital, and the audit entry
    // would name the order it was not written to.
    const { data: item } = await supabase
      .from('lab_order_items')
      .select('test_id')
      .eq('id', item_id).eq('lab_order_id', orderId).maybeSingle()
    if (!item) continue

    // The range comes from `effective_test_range`, not from the catalogue
    // columns directly (F-44).
    //
    // Reading `lab_tests_catalog.crit_low/crit_high` here looked right and was
    // inert: not one of the 22 catalogue rows has either set, in any tenant, so
    // this path could never produce a critical flag. The same measurement
    // entered through a panel went through `resolve_reference_range` and did —
    // a fasting glucose of 500 was `critical_high` as an analyte and merely
    // `high` as a single test, reaching no queue and telephoning nobody.
    //
    // Where a test maps to exactly one analyte, the resolver hands back that
    // analyte's age- and sex-aware range, so both paths now answer the same
    // clinical question the same way. Otherwise it hands back the catalogue's
    // own figures, so nothing is lost for a test with no analyte definition.
    //
    // One call per item: result entry is a handful of tests, not a hot path.
    const { data: rangeRows } = await supabase.rpc('effective_test_range', {
      p_order_id: orderId,
      p_test_id: item.test_id,
    })
    const range = (Array.isArray(rangeRows) ? rangeRows[0] : rangeRows) as
      { ref_low: number | null; ref_high: number | null
        crit_low: number | null; crit_high: number | null } | null

    // Critical before reference, because a potassium of 7.0 and one of 5.2 are
    // not the same fact. The order of these tests, and the final 'unranged',
    // mirror save_lab_analyte_results exactly — the two paths disagreeing about
    // precedence would be the same class of defect as them disagreeing about
    // bounds.
    let flag: LabFlag
    if (result_value != null) {
      if (range?.crit_high != null && result_value >= range.crit_high) flag = 'critical_high'
      else if (range?.crit_low != null && result_value <= range.crit_low) flag = 'critical_low'
      else if (range?.ref_high != null && result_value > range.ref_high) flag = 'high'
      else if (range?.ref_low != null && result_value < range.ref_low) flag = 'low'
      // 'normal' only when something was actually compared. This used to fall
      // through to 'normal' with no range at all, which reports a number nobody
      // can interpret as a reassurance.
      else if (range?.ref_low != null || range?.ref_high != null) flag = 'normal'
      else flag = 'unranged'
    } else {
      flag = 'pending'
    }

    await supabase.from('lab_order_items').update({
      result_value: result_value ?? null,
      result_text: result_text ?? null,
      unit: unit ?? null,
      flag,
    }).eq('id', item_id).eq('lab_order_id', orderId)

    // A value corrected down out of the critical band has to leave the queue,
    // or it stands as an instruction to telephone a doctor about a number
    // that is no longer anywhere in the record. The panel path already does
    // this; this one did not exist to.
    if (flag !== 'critical_high' && flag !== 'critical_low') {
      await supabase.rpc('withdraw_stale_critical_item', {
        p_order_id: orderId,
        p_test_id: (item as { test_id: string }).test_id,
        p_new_value: result_value ?? null,
      })
    }
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
export async function verifyOrder(
  orderId: string,
  /** Set after the technician has been told how many are missing and said yes. */
  releasePartial = false,
): Promise<VerifyResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:verify')
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('lab_order_items')
    .select('id, test_id, result_value, result_text')
    .eq('lab_order_id', orderId)
  if (!items?.length) return { success: false, error: 'This order has no tests' }

  // A panel's results are NOT on its lab_order_items row — a CBC's twenty
  // numbers live in lab_result_analytes and the item carries nothing. Checking
  // only the item made every analyte test unverifiable: a hospital would enter
  // an HbA1c, be told "no results have been entered yet", and try again.
  const { data: analyteRows } = await supabase
    .from('lab_result_analytes')
    .select('test_id, value_num, value_text')
    .eq('lab_order_id', orderId)

  const testsWithAnalyteValues = new Set(
    (analyteRows ?? [])
      .filter((r) => r.value_num != null || (r.value_text ?? '') !== '')
      .map((r) => r.test_id as string),
  )

  const pending = items.filter((i) =>
    i.result_value == null
    && !i.result_text
    && !testsWithAnalyteValues.has(i.test_id as string))

  if (pending.length === items.length) {
    return { success: false, error: 'No results have been entered yet' }
  }
  if (pending.length) {
    return {
      success: false,
      error: `${pending.length} of ${items.length} tests have no result yet — enter or cancel them first`,
    }
  }

  // ── And a panel that is only partly answered ────────────────────────────
  //
  // The check above asks whether each *test* has been touched, and one analyte
  // with a value marks the whole panel answered. So a Complete Blood Count
  // with one number of twenty-eight passed exactly as a complete one did, and
  // two orders in the demo tenant were released that way.
  //
  // Releasing part of a panel is a legitimate thing to do — a result nobody
  // can produce should not hold up twenty-seven that are ready. What is not
  // legitimate is doing it without knowing, so this says how many are missing
  // and asks again rather than refusing.
  const completeness = await countMissingAnalytes(supabase, orderId)
  // Refuse rather than guess. Verifying is an authorisation, and authorising a
  // report whose completeness we could not read is the one outcome worse than
  // making the technician try again.
  if (!completeness.ok) {
    return {
      success: false,
      error: 'Could not check whether every measurement in this order has a value, '
        + 'so nothing has been verified. Try again in a moment.',
    }
  }
  const incomplete = completeness.missing
  if (incomplete > 0 && !releasePartial) {
    return {
      success: false,
      error: `${incomplete} measurement${incomplete === 1 ? '' : 's'} in this order `
        + 'still have no value. Enter them, or verify again to release an interim '
        + 'report — it will be marked interim and a final report must follow.',
      needsConfirmation: true,
    }
  }

  const { data: updated, error } = await supabase.from('lab_orders').update({
    status: 'verified', verified_by: actor.id, verified_at: new Date().toISOString(),
  }).eq('id', orderId).in('status', ['collected', 'processing']).select('id')
  if (error) return { success: false, error: error.message }
  // The status filter can match nothing — an order already verified, released
  // or cancelled. Reporting success for an authorisation that never happened
  // is the worst possible lie to tell on this particular screen.
  if (!updated?.length) {
    return { success: false, error: 'This order is no longer awaiting verification — refresh the page' }
  }

  await logAudit(actor.id, 'verify', 'lab_order', orderId)
  return { success: true }
}

/**
 * Promised measurements on this order with no value yet.
 *
 * Asks the report's own function, so the number a technician is shown is
 * exactly the number that will be printed as pending — two definitions of
 * "incomplete" would be worse than none.
 */
async function countMissingAnalytes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
): Promise<{ ok: true; missing: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('get_lab_report_analytes', { p_order_id: orderId })
  // This used to return 0 here, which this function's own caller reads as
  // "nothing missing" — so an RPC failure skipped the confirmation and
  // authorised an incomplete panel as though it were complete. A completeness
  // check that cannot establish completeness must say so, not say "fine".
  if (error) {
    console.error('[countMissingAnalytes]', error.message)
    return { ok: false, error: error.message }
  }
  return {
    ok: true,
    missing: ((data ?? []) as Array<{ value_num: number | null; value_text: string | null }>)
      .filter((r) => r.value_num == null && !r.value_text).length,
  }
}

/** Release a verified order. This is the point it becomes visible to the patient. */
export async function reportOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:verify')
  const supabase = await createClient()

  const { data: cur } = await supabase
    .from('lab_orders').select('status, admission_id').eq('id', orderId).single()
  if (cur?.status !== 'verified') {
    return { success: false, error: 'Results must be verified before the report is released' }
  }

  // ── The payment gate, where it actually holds ───────────────────────────
  //
  // collectSample refuses an unpaid OPD order, and that was the only check.
  // It is bypassed in ordinary use: printing tube labels creates the barcodes
  // with no check at all, and an analyzer's result moves an order out of
  // 'ordered' on its own — "a machine only reports on a tube that was drawn
  // and run". So an unpaid test could be labelled, run, resulted, verified
  // and released without anyone being asked for money.
  //
  // Release is the moment the hospital loses its leverage, so the gate belongs
  // here as well. IPD is exempt for the same reason as at collection: the
  // charge settles into the discharge bill, and holding a ward patient's
  // report for a cash payment would be absurd.
  if (!cur.admission_id) {
    const linkedBill = await resolveServiceBill(supabase, 'lab', orderId)
    if (linkedBill && linkedBill.status !== 'paid'
        && !(await unpaidAllowed(supabase, actor.tenant_id, 'lab', linkedBill))) {
      return {
        success: false,
        error: 'This test has not been paid for — take the payment before releasing the report',
      }
    }
  }

  const { data: updated, error } = await supabase.from('lab_orders').update({
    status: 'reported', reported_at: new Date().toISOString(),
  }).eq('id', orderId).eq('status', 'verified').select('id')
  if (error) return { success: false, error: error.message }
  if (!updated?.length) {
    return { success: false, error: 'This order is no longer awaiting release — refresh the page' }
  }
  await logAudit(actor.id, 'report', 'lab_order', orderId)
  return { success: true }
}

export async function cancelLabOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const supabase = await createClient()

  // Only an order that has not been authorised. Without the status filter this
  // would cancel a released report — wiping its charge off the bill and leaving
  // a patient holding a result the hospital now says was never done — and would
  // happily run a second time on an already-cancelled order, stripping bill
  // lines again.
  const { data: updated, error } = await supabase
    .from('lab_orders').update({ status: 'cancelled' })
    .eq('id', orderId).in('status', ['ordered', 'collected', 'processing'])
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!updated?.length) {
    return {
      success: false,
      error: 'Only an order that has not been verified can be cancelled — '
        + 'a released report has to be withdrawn by the laboratory instead',
    }
  }

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
  // A hospital that does not take payment before lab work has nothing waiting
  // on money — the same rule the collection and release gates apply.
  const actor = await getActorProfile()
  if (!(await requiresPaymentFirst(supabase, actor.tenant_id, 'lab'))) return []

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

/**
 * The measurements a panel reports, for the catalogue and ordering screens.
 *
 * Read-only: these are analytes, not tests. You cannot order "haemoglobin out
 * of a CBC" — a standalone Haemoglobin is a different catalogue entry at a
 * different price. This only answers the question a clinician actually asks:
 * what does this panel give me?
 */
export async function getPanelMeasurements(labMasterId: string, testId?: string): Promise<Array<{
  analyte_id: string; code: string; name: string; short_name: string | null; unit_ucum: string | null
  /** This hospital marked it optional for this test (0277). */
  optional: boolean
}>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_test_analytes')
    .select('display_order, analyte:lab_analytes(id, code, name, short_name, unit_ucum)')
    .eq('lab_master_id', labMasterId)
    .order('display_order')
  let optional = new Set<string>()
  if (testId) {
    const { data: opt } = await supabase.from('lab_optional_analytes').select('analyte_id').eq('test_id', testId)
    optional = new Set((opt ?? []).map((o) => o.analyte_id as string))
  }
  return ((data ?? []) as unknown as Array<{ analyte: { id: string; code: string; name: string; short_name: string | null; unit_ucum: string | null } | null }>)
    .map((r) => r.analyte)
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({
      analyte_id: a.id, code: a.code, name: a.name, short_name: a.short_name, unit_ucum: a.unit_ucum,
      optional: optional.has(a.id),
    }))
}

/**
 * Mark a measurement in a panel optional (or required again) for this
 * hospital (0277).
 *
 * Optional means: when it has no value it is left off the report and does not
 * count as missing, so the panel can be verified as complete. Made for 3-part
 * haematology analyzers, which cannot measure eosinophils and basophils — but
 * a value entered for an optional measurement (from a smear, say) still prints.
 */
export async function setMeasurementOptional(
  testId: string, analyteId: string, optional: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:manage')

  const svc = createServiceClient()
  // The test must be this hospital's, and the measurement part of it.
  const { data: test } = await svc.from('lab_tests_catalog')
    .select('id, name, lab_master_id').eq('id', testId).eq('tenant_id', actor.tenant_id).maybeSingle()
  if (!test?.lab_master_id) return { success: false, error: 'That test is not in your catalogue' }
  const { data: part } = await svc.from('lab_test_analytes')
    .select('analyte_id').eq('lab_master_id', test.lab_master_id).eq('analyte_id', analyteId).maybeSingle()
  if (!part) return { success: false, error: 'That measurement is not part of this test' }

  const { error } = optional
    ? await svc.from('lab_optional_analytes').upsert(
        { tenant_id: actor.tenant_id, test_id: testId, analyte_id: analyteId, created_by: actor.id },
        { onConflict: 'tenant_id,test_id,analyte_id', ignoreDuplicates: true })
    : await svc.from('lab_optional_analytes').delete()
        .eq('tenant_id', actor.tenant_id).eq('test_id', testId).eq('analyte_id', analyteId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'lab_test', testId, {
    action: optional ? 'measurement optional' : 'measurement required', analyte_id: analyteId, test: test.name,
  })
  return { success: true }
}

// ── Critical results (NABL 112 §5.8) ─────────────────────────────────────────

export interface OpenCritical {
  id: string
  lab_order_id: string
  accession_no: string | null
  patient_name: string
  patient_uhid: string
  analyte: string
  value_num: number | null
  unit: string | null
  notified_to_name: string | null
  created_at: string
}

/**
 * Critical results nobody has confirmed telling a clinician about.
 *
 * This is the queue NABL §5.8 is really about: a critical value must be
 * "communicated to the concerned clinician after proper documentation", and a
 * red flag on a report is neither the communication nor the documentation.
 */
export async function listOpenCriticalResults(): Promise<OpenCritical[]> {
  await requirePermission((await getActorProfile()).role, 'lab:read')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lab_critical_notifications')
    .select(`id, lab_order_id, value_num, created_at,
             analyte:lab_analytes(name, short_name, unit_ucum),
             test:lab_tests_catalog(name, unit),
             doctor:profiles!lab_critical_notifications_notified_to_fkey(full_name),
             order:lab_orders(accession_no, patient:patients(full_name, uhid))`)
    .eq('acknowledged', false)
    // A result corrected to a non-critical value before anyone was telephoned
    // withdraws its own entry. The row stays for the record; it leaves the
    // queue, because there is no longer a clinician to call.
    .is('withdrawn_at', null)
    .order('created_at', { ascending: true })
  if (error) { console.error('[listOpenCriticalResults]', error.message); return [] }

  type Row = {
    id: string; lab_order_id: string; value_num: number | null; created_at: string
    analyte: { name: string; short_name: string | null; unit_ucum: string | null } | null
    test: { name: string; unit: string | null } | null
    doctor: { full_name: string } | null
    order: { accession_no: string | null; patient: { full_name: string; uhid: string } | null } | null
  }
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    lab_order_id: r.lab_order_id,
    accession_no: r.order?.accession_no ?? null,
    patient_name: r.order?.patient?.full_name ?? '—',
    patient_uhid: r.order?.patient?.uhid ?? '—',
    // One or the other, never both — an entry names the analyte it came from,
    // or the catalogue test where there are no analytes behind it.
    analyte: r.analyte?.short_name ?? r.analyte?.name ?? r.test?.name ?? '—',
    value_num: r.value_num,
    unit: r.analyte?.unit_ucum ?? r.test?.unit ?? null,
    notified_to_name: r.doctor?.full_name ?? null,
    created_at: r.created_at,
  }))
}

/**
 * Record that the clinician was told. Closes the entry.
 *
 * Nothing is sent from here — a critical result is communicated by a person
 * picking up a telephone, and pretending software did it would be the lie an
 * assessor is looking for.
 */
export async function acknowledgeCritical(input: {
  id: string; toName: string; method: string; note?: string
}): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:process')
  if (!input.toName.trim()) return { success: false, error: 'Who did you tell?' }

  const supabase = await createClient()
  const { data: closed, error } = await supabase.from('lab_critical_notifications').update({
    notified_to_name: input.toName.trim(),
    notified_by: actor.id,
    notified_at: new Date().toISOString(),
    method: input.method,
    note: input.note?.trim() || null,
    acknowledged: true,
  }).eq('id', input.id).eq('acknowledged', false).is('withdrawn_at', null).select('id')
  if (error) return { success: false, error: error.message }
  // Recording a call for an alert that was withdrawn, or already closed, would
  // put a communication in the register that did not need to happen.
  if (!closed?.length) {
    return { success: false, error: 'That alert has already been closed or withdrawn' }
  }

  await logAudit(actor.id, 'critical_notified', 'lab_critical_notification', input.id, {
    to: input.toName, method: input.method,
  })
  return { success: true }
}
