import type { SupabaseClient } from '@supabase/supabase-js'
import { removeOrderFromBills, type OrderBillOutcome } from '@/lib/billing/orderBilling'
import { cancelBloodRequestAndRelease } from '@/lib/bloodRelease'

/**
 * Everything still open on a stay, and closing it at discharge.
 *
 * Discharge used to change the admission row and free the bed — and nothing
 * else. Drug orders stayed active with doses pending, pharmacy and blood
 * requests stayed in their queues, booked surgeries stayed on the OT list, and
 * any of them completed later billed a patient who had already gone home.
 *
 * Each step reuses the rule its own module already uses to cancel one item
 * (stopOrder, cancelSurgery, the blood bank's Cancel, cancelIpdLabOrder), so a
 * discharge closes things exactly the way staff would one at a time.
 */

export interface TestNotDone {
  kind: 'lab' | 'radiology'
  orderId: string
  name: string
  /** What it adds to the bill today; removed if the test is cancelled. */
  amount: number
}

export interface OpenWork {
  /** Ordered, never collected / performed. They carry charges, so they are settled before a normal discharge. */
  testsNotDone: TestNotDone[]
  /** A surgery in theatre right now — discharge waits for it to be marked completed. */
  surgeriesInProgress: number
  // Closed by discharge (none of these carries a charge yet):
  medicines: number
  upcomingDoses: number
  pharmacyRequests: number
  bloodRequests: number
  surgeriesBooked: number
  consultsRequested: number
  advanceRequests: number
  /** Doses due before now and never charted. Left for the nurse — not marked anything. */
  unchartedDoses: number
}

export async function findOpenWork(
  supabase: SupabaseClient,
  admissionId: string,
  now: Date = new Date(),
): Promise<OpenWork> {
  const nowIso = now.toISOString()
  const head = { count: 'exact' as const, head: true }
  const [
    labs, scans, inTheatre, meds, upcoming, uncharted, pharmacy, blood, booked, consults, advances,
  ] = await Promise.all([
    supabase.from('lab_orders').select('id, items:lab_order_items(test:lab_tests_catalog(name))')
      .eq('admission_id', admissionId).eq('status', 'ordered'),
    supabase.from('radiology_orders').select('id, test:radiology_catalog(name)')
      .eq('admission_id', admissionId).eq('status', 'ordered'),
    supabase.from('ot_schedules').select('id', head).eq('admission_id', admissionId).eq('status', 'in_progress'),
    supabase.from('ipd_medication_orders').select('id', head).eq('admission_id', admissionId).eq('status', 'active'),
    supabase.from('ipd_admin_schedule').select('id', head).eq('admission_id', admissionId).eq('status', 'pending').gt('due_at', nowIso),
    supabase.from('ipd_admin_schedule').select('id', head).eq('admission_id', admissionId).eq('status', 'pending').lte('due_at', nowIso),
    supabase.from('ipd_pharmacy_requests').select('id', head).eq('admission_id', admissionId).eq('status', 'pending'),
    supabase.from('blood_requests').select('id', head).eq('admission_id', admissionId).in('status', ['requested', 'cross_matched']),
    supabase.from('ot_schedules').select('id', head).eq('admission_id', admissionId).eq('status', 'scheduled'),
    supabase.from('doctor_visits').select('id', head).eq('admission_id', admissionId).eq('status', 'requested'),
    supabase.from('advance_deposit_requests').select('id', head).eq('admission_id', admissionId).eq('status', 'pending'),
  ])

  type LabRow = { id: string; items: Array<{ test: { name: string } | null }> | null }
  type ScanRow = { id: string; test: { name: string } | null }
  const labRows = (labs.data ?? []) as unknown as LabRow[]
  const scanRows = (scans.data ?? []) as unknown as ScanRow[]

  // What each order adds to the bills — its own lines only.
  const amounts = new Map<string, number>()
  const refIds = [...labRows.map((r) => r.id), ...scanRows.map((r) => r.id)]
  if (refIds.length) {
    const { data: lines } = await supabase
      .from('bill_items').select('ref_id, amount, source, bills!inner(status)')
      .in('ref_id', refIds).in('source', ['lab', 'radiology']).neq('bills.status', 'cancelled')
    for (const l of lines ?? []) {
      const k = l.ref_id as string
      amounts.set(k, (amounts.get(k) ?? 0) + Number(l.amount ?? 0))
    }
  }

  const testsNotDone: TestNotDone[] = [
    ...labRows.map((r) => ({
      kind: 'lab' as const, orderId: r.id,
      name: (r.items ?? []).map((i) => i.test?.name).filter(Boolean).join(', ') || 'Lab test',
      amount: amounts.get(r.id) ?? 0,
    })),
    ...scanRows.map((r) => ({
      kind: 'radiology' as const, orderId: r.id, name: r.test?.name ?? 'Scan', amount: amounts.get(r.id) ?? 0,
    })),
  ]

  return {
    testsNotDone,
    surgeriesInProgress: inTheatre.count ?? 0,
    medicines: meds.count ?? 0,
    upcomingDoses: upcoming.count ?? 0,
    unchartedDoses: uncharted.count ?? 0,
    pharmacyRequests: pharmacy.count ?? 0,
    bloodRequests: blood.count ?? 0,
    surgeriesBooked: booked.count ?? 0,
    consultsRequested: consults.count ?? 0,
    advanceRequests: advances.count ?? 0,
  }
}

/**
 * Cancels tests ordered on this stay that were never collected / performed,
 * and takes each one's lines off its bill (advance goes back to the pool, cash
 * already paid is reported for a credit note — see removeOrderFromBills).
 * Only 'ordered': a collected sample still gets its report.
 */
export async function cancelTestsNotDone(
  supabase: SupabaseClient,
  admissionId: string,
): Promise<{ cancelled: number; billing: OrderBillOutcome[] }> {
  const billing: OrderBillOutcome[] = []
  let cancelled = 0
  for (const kind of ['lab', 'radiology'] as const) {
    const table = kind === 'lab' ? 'lab_orders' : 'radiology_orders'
    const { data: rows, error } = await supabase
      .from(table).update({ status: 'cancelled' })
      .eq('admission_id', admissionId).eq('status', 'ordered')
      .select('id')
    if (error) throw new Error(error.message)
    for (const r of rows ?? []) {
      cancelled++
      billing.push(await removeOrderFromBills(supabase, kind, r.id as string))
    }
  }
  return { cancelled, billing }
}

export interface ClosedWork {
  medicines: number
  dosesHeld: number
  pharmacyRequests: number
  bloodRequests: number
  bloodUnitsReleased: number
  surgeriesCancelled: number
  consultsCancelled: number
  advanceRequestsWaived: number
  followUpsCancelled: number
}

/**
 * Closes what nobody will do now that the patient has left. Runs after the
 * admission is marked discharged. Nothing here carries a charge: medicines,
 * blood (IPD) and surgery are billed when dispensed, issued and completed.
 */
export async function closeOpenWork(
  supabase: SupabaseClient,
  p: { admissionId: string; patientId: string; closedAt: string; died: boolean },
): Promise<ClosedWork> {
  const { admissionId, closedAt } = p

  // Medicines — as stopOrder does for one: stopped, future doses held,
  // pending pharmacy requests cancelled.
  const { data: meds } = await supabase
    .from('ipd_medication_orders').update({ status: 'stopped', stop_at: closedAt })
    .eq('admission_id', admissionId).eq('status', 'active').select('id')
  const { data: held } = await supabase
    .from('ipd_admin_schedule').update({ status: 'held', given_notes: 'Not given — patient discharged' })
    .eq('admission_id', admissionId).eq('status', 'pending').gt('due_at', closedAt).select('id')
  const { data: pharmacy } = await supabase
    .from('ipd_pharmacy_requests').update({ status: 'cancelled' })
    .eq('admission_id', admissionId).eq('status', 'pending').select('id')

  // Blood — cancel and put cross-matched units back on the shelf.
  const { data: bloodReqs } = await supabase
    .from('blood_requests').select('id')
    .eq('admission_id', admissionId).in('status', ['requested', 'cross_matched'])
  let bloodRequests = 0, bloodUnitsReleased = 0
  for (const r of bloodReqs ?? []) {
    const out = await cancelBloodRequestAndRelease(supabase, r.id as string)
    if (out.cancelled) bloodRequests++
    bloodUnitsReleased += out.unitsReleased
  }

  // Booked surgeries — as cancelSurgery does for one.
  const { data: surgeries } = await supabase
    .from('ot_schedules').update({ status: 'cancelled' })
    .eq('admission_id', admissionId).eq('status', 'scheduled').select('id')
  for (const s of surgeries ?? []) {
    await removeOrderFromBills(supabase, 'ot', s.id as string)
    await supabase.from('ot_schedules').update({ billing_status: 'unbilled' }).eq('id', s.id)
  }

  // Consults asked for and never seen leave the consultants' lists.
  const { data: consults } = await supabase
    .from('doctor_visits').update({ status: 'cancelled' })
    .eq('admission_id', admissionId).eq('status', 'requested').select('id')

  // An advance nobody collected is no longer owed — the final bill is the debt.
  const { data: advances } = await supabase
    .from('advance_deposit_requests').update({ status: 'waived' })
    .eq('admission_id', admissionId).eq('status', 'pending').select('id')

  // After a death, nobody should phone the family about a follow-up visit.
  let followUpsCancelled = 0
  if (p.died) {
    const { data: fus } = await supabase
      .from('follow_ups').update({ status: 'cancelled', cancelled_at: closedAt })
      .eq('patient_id', p.patientId).eq('status', 'pending').select('id')
    followUpsCancelled = fus?.length ?? 0
  }

  return {
    medicines: meds?.length ?? 0,
    dosesHeld: held?.length ?? 0,
    pharmacyRequests: pharmacy?.length ?? 0,
    bloodRequests,
    bloodUnitsReleased,
    surgeriesCancelled: surgeries?.length ?? 0,
    consultsCancelled: consults?.length ?? 0,
    advanceRequestsWaived: advances?.length ?? 0,
    followUpsCancelled,
  }
}
