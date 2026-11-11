import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Moving a patient into IPD — what comes with them.
 *
 * A patient reaches a bed from the ER or from an OPD consultation, with things
 * already started there: an ER case on the board, a consultation visit, tests
 * and scans ordered, blood requested, bills raised. Admission used to carry
 * only the ER bills across, and only when it was started from the ER board's
 * own Admit button. Started anywhere else — the ER doctor's consultation
 * screen, the IPD list, an OPD visit — the ER case stayed on the board, the
 * orders stayed "outpatient" (so the lab asked an inpatient to pay before the
 * sample), and the visit's bills stayed off the IP bill and its discharge
 * check.
 *
 * One rule now, whichever button was pressed.
 */

/** The patient's ER case that is still on the board, if any. One per patient (0258). */
export async function activeErCaseFor(
  supabase: SupabaseClient,
  patientId: string,
): Promise<{ id: string; arrived_at: string } | null> {
  const { data } = await supabase
    .from('emergency_cases').select('id, arrived_at')
    .eq('patient_id', patientId).in('status', ['waiting', 'in_treatment'])
    .order('arrived_at', { ascending: false }).limit(1).maybeSingle()
  return (data as { id: string; arrived_at: string } | null) ?? null
}

/**
 * The ER visits that belong to one case: this patient's emergency visits
 * opened since the case arrived (five minutes' margin for clock skew). Never an
 * earlier ER visit of the same patient.
 */
export async function erVisitIdsForCase(
  supabase: SupabaseClient,
  patientId: string,
  arrivedAt: string,
  opts: { openOnly?: boolean } = {},
): Promise<string[]> {
  let q = supabase
    .from('visits').select('id')
    .eq('patient_id', patientId).eq('type', 'emergency')
    .gte('created_at', new Date(new Date(arrivedAt).getTime() - 5 * 60_000).toISOString())
  if (opts.openOnly) q = q.eq('status', 'open')
  const { data } = await q
  return (data ?? []).map((v) => v.id as string)
}

export interface CarriedIntoAdmission {
  bills: number
  labOrders: number
  radiologyOrders: number
  bloodRequests: number
  visitsClosed: number
  erCaseAdmitted: boolean
}

/**
 * Brings the source encounter into a new admission:
 *  - bills raised on the source visits (and on the ER case) join the IP bill,
 *    so they count in the discharge balance and can take the advance;
 *  - tests, scans and blood requests ordered there become inpatient orders —
 *    the lab no longer asks an admitted patient to pay first, and the results
 *    show on the IP page;
 *  - the source visits are closed, whatever day they were opened;
 *  - the ER case leaves the board as "admitted".
 * Only rows not already on an admission are touched; cancelled ones are left.
 */
export async function carryIntoAdmission(
  supabase: SupabaseClient,
  p: { admissionId: string; visitIds: string[]; emergencyCaseId: string | null },
): Promise<CarriedIntoAdmission> {
  const out: CarriedIntoAdmission = { bills: 0, labOrders: 0, radiologyOrders: 0, bloodRequests: 0, visitsClosed: 0, erCaseAdmitted: false }
  const { admissionId, visitIds, emergencyCaseId } = p

  if (visitIds.length) {
    const [bills, labs, scans, blood, visits] = await Promise.all([
      supabase.from('bills').update({ admission_id: admissionId })
        .in('visit_id', visitIds).is('admission_id', null).neq('status', 'cancelled').select('id'),
      supabase.from('lab_orders').update({ admission_id: admissionId })
        .in('visit_id', visitIds).is('admission_id', null).neq('status', 'cancelled').select('id'),
      supabase.from('radiology_orders').update({ admission_id: admissionId })
        .in('visit_id', visitIds).is('admission_id', null).neq('status', 'cancelled').select('id'),
      supabase.from('blood_requests').update({ admission_id: admissionId })
        .in('visit_id', visitIds).is('admission_id', null).neq('status', 'cancelled').select('id'),
      supabase.from('visits').update({ status: 'closed' })
        .in('id', visitIds).eq('status', 'open').select('id'),
    ])
    for (const r of [bills, labs, scans, blood, visits]) {
      if (r.error) console.error('[carryIntoAdmission]', r.error.message)
    }
    out.bills += bills.data?.length ?? 0
    out.labOrders = labs.data?.length ?? 0
    out.radiologyOrders = scans.data?.length ?? 0
    out.bloodRequests = blood.data?.length ?? 0
    out.visitsClosed = visits.data?.length ?? 0
  }

  if (emergencyCaseId) {
    // The registration fee and ER procedure charges are billed against the case.
    const { data: caseBills, error } = await supabase.from('bills').update({ admission_id: admissionId })
      .eq('emergency_case_id', emergencyCaseId).is('admission_id', null).neq('status', 'cancelled').select('id')
    if (error) console.error('[carryIntoAdmission] ER case bills:', error.message)
    out.bills += caseBills?.length ?? 0

    const { data: adm } = await supabase.from('emergency_cases').update({ status: 'admitted' })
      .eq('id', emergencyCaseId).in('status', ['waiting', 'in_treatment']).select('id')
    out.erCaseAdmitted = !!adm?.length
  }
  return out
}
