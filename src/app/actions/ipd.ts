'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { AdmitPatientSchema, ProgressNoteSchema, DischargeSchema } from '@/lib/schemas'
import { getAdmissionFinancials } from '@/app/actions/admissionBilling'
import { bedIsIcu, enterIcu, exitIcu } from '@/lib/icuStay'
import { catchUpDailyCharges } from '@/lib/ipdDailyBilling'
import { assertTreatmentStarted } from '@/app/actions/ipdDeclaration'
import type { Admission, IpdProgressNote } from '@/lib/types'
import { istToday, istDayStartISO, istDayEndISO } from '@/lib/istDate'
import { findOpenWork, cancelTestsNotDone, closeOpenWork, type OpenWork } from '@/lib/closeAdmission'
import { dischargeSkipsBalanceGate } from '@/lib/dischargeType'
import { admissionClosedError } from '@/lib/admissionOpen'

type SimpleResult = { success: true } | { success: false; error: string }

// True if the patient currently has an active (admitted) IPD admission. Lets
// callers block a second admission up-front (e.g. from the ER board) instead of
// only failing inside admitPatient() after the whole flow. admitPatient keeps
// its own guard as the authoritative backstop.
export async function hasActiveAdmission(patientId: string): Promise<boolean> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('admissions')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patientId)
    .eq('status', 'admitted')
  return (count ?? 0) > 0
}

// Postgres 23505 is unique_violation. With idx_admissions_one_active_per_patient
// in place (migration 0245) a concurrent admission of the same patient loses
// here instead of creating a second active admission — the count check inside
// admitPatient is a read-then-write and cannot see an insert that has not
// committed yet. Without that translation the counter staff would be shown a
// raw constraint name.
const ALREADY_ADMITTED =
  'This patient is already admitted. Discharge the existing admission before admitting again.'

function admissionInsertError(err: { code?: string; message: string }): string {
  return err.code === '23505' ? ALREADY_ADMITTED : err.message
}

export async function admitPatient(
  input: Record<string, unknown>
): Promise<{ success: true; admissionId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const parsed = AdmitPatientSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, visit_id, emergency_case_id, admitting_doctor_id, bed_id, ward_id, reason, procedure_tariff_id, direct_ot, is_temp_ward, temp_slot } = parsed.data
  const admissionId = crypto.randomUUID()
  const supabase = await createClient()

  // Block if the patient already has an active admission
  const { count: activeCount } = await supabase
    .from('admissions')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', patient_id)
    .eq('status', 'admitted')
  if ((activeCount ?? 0) > 0) {
    return { success: false, error: ALREADY_ADMITTED }
  }

  if (direct_ot) {
    // Direct OT: no bed assigned — insert admission row directly (no concurrency claim needed)
    const { error: insertErr } = await supabase.from('admissions').insert({
      id:                  admissionId,
      tenant_id:           actor.tenant_id,
      patient_id,
      admitting_doctor_id,
      ward_id:             null,
      bed_id:              null,
      direct_ot:           true,
      reason:              reason ?? null,
      status:              'admitted',
      admitted_at:         new Date().toISOString(),
    })
    if (insertErr) return { success: false, error: admissionInsertError(insertErr) }
  } else if (is_temp_ward) {
    // Temp/overflow ward: create a slot on-the-fly, no concurrency claim needed
    if (!ward_id) return { success: false, error: 'Please select a ward' }

    // Auto-number the slot if the user left it blank
    let slotLabel = temp_slot?.trim() || null
    if (!slotLabel) {
      const { count } = await supabase
        .from('beds').select('id', { count: 'exact', head: true }).eq('ward_id', ward_id)
      slotLabel = `Slot-${(count ?? 0) + 1}`
    }

    const tempBedId = crypto.randomUUID()
    const { error: bedErr } = await supabase.from('beds').insert({
      id:        tempBedId,
      tenant_id: actor.tenant_id,
      ward_id,
      bed_no:    slotLabel,
      status:    'occupied',
    })
    if (bedErr) return { success: false, error: bedErr.message }

    const { error: insertErr } = await supabase.from('admissions').insert({
      id:                  admissionId,
      tenant_id:           actor.tenant_id,
      patient_id,
      admitting_doctor_id,
      ward_id,
      bed_id:              tempBedId,
      reason:              reason ?? null,
      status:              'admitted',
      admitted_at:         new Date().toISOString(),
    })
    if (insertErr) {
      await supabase.from('beds').delete().eq('id', tempBedId)
      return { success: false, error: admissionInsertError(insertErr) }
    }
  } else {
    if (!bed_id) return { success: false, error: 'Please select a bed' }
    // Normal admission: concurrency-safe claim via Postgres function
    const { data: result, error: rpcErr } = await supabase.rpc('claim_bed_and_admit', {
      p_admission_id: admissionId,
      p_patient_id:   patient_id,
      p_doctor_id:    admitting_doctor_id,
      p_bed_id:       bed_id,
      p_reason:       reason ?? null,
    })
    if (rpcErr) return { success: false, error: rpcErr.message }
    const rpcResult = result as { ok: boolean; error?: string }
    if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Bed no longer available' }
  }

  // Fetch tenant advance percentage (default 50 if not set)
  const { data: tenantRow } = await supabase
    .from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single()
  const advancePct = (tenantRow?.advance_percentage as number) ?? 50

  // Auto-record advance based on selected procedure tariff (or general tariff as fallback)
  let tariffPrice: number | null = null
  let resolvedTariffId: string | null = procedure_tariff_id ?? null

  if (procedure_tariff_id) {
    const { data: t } = await supabase
      .from('procedure_tariffs').select('default_price').eq('id', procedure_tariff_id).single()
    tariffPrice = (t?.default_price as number) ?? null
  } else {
    const { data: t } = await supabase
      .from('procedure_tariffs').select('id, default_price')
      .eq('category', 'general').eq('is_active', true).limit(1).maybeSingle()
    tariffPrice = (t?.default_price as number) ?? null
    resolvedTariffId = (t?.id as string) ?? null
  }

  // Snapshot treatment on the admission row
  if (resolvedTariffId || tariffPrice) {
    await supabase.from('admissions').update({
      procedure_tariff_id: resolvedTariffId,
      treatment_value: tariffPrice,
    }).eq('id', admissionId)
  }

  if (tariffPrice && tariffPrice > 0 && advancePct > 0) {
    const advanceAmount = Math.round(tariffPrice * advancePct / 100)
    // Don't collect here — create a pending obligation at the billing counter
    await supabase.from('advance_deposit_requests').insert({
      id:           crypto.randomUUID(),
      tenant_id:    actor.tenant_id,
      admission_id: admissionId,
      amount:       advanceAmount,
      created_by:   actor.id,
    })
    await logAudit(actor.id, 'advance_deposit_created', 'admission', admissionId, {
      amount: advanceAmount, pct: advancePct,
      source: procedure_tariff_id ? 'procedure_tariff' : 'general_tariff',
    })
  }

  // Auto-close today's checked_in/booked appointment — patient moved to IPD
  const todayStr = istToday()
  await supabase
    .from('appointments')
    .update({ status: 'done' })
    .eq('patient_id', patient_id)
    .in('status', ['checked_in', 'booked'])
    .gte('scheduled_at', istDayStartISO(todayStr))
    .lte('scheduled_at', istDayEndISO(todayStr))

  // Auto-close any open OPD visits today — patient is now an IPD inpatient
  await supabase
    .from('visits')
    .update({ status: 'closed' })
    .eq('patient_id', patient_id)
    .eq('status', 'open')
    .gte('visit_date', istDayStartISO(todayStr))
    .lte('visit_date', istDayEndISO(todayStr))

  // Assign a combined bill number to this admission.
  // Carry forward from a same-day OPD visit if one exists; otherwise generate a new one.
  const { data: todayVisit } = await supabase
    .from('visits')
    .select('combined_bill_no')
    .eq('patient_id', patient_id)
    .gte('visit_date', istDayStartISO(todayStr))
    .lt('visit_date', istDayEndISO(todayStr))
    .not('combined_bill_no', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let admissionCombinedNo: string | null = null
  if (todayVisit?.combined_bill_no) {
    admissionCombinedNo = todayVisit.combined_bill_no as string
  } else {
    // Summary numbers have their own series — invoice numbers are only for real bills.
    const { data: billNoData } = await supabase.rpc('get_next_summary_no', { p_tenant_id: actor.tenant_id })
    admissionCombinedNo = billNoData as string | null
  }

  // Record which OPD visit this admission followed on from — so insurance can
  // treat OPD + IPD as one continuous encounter instead of two disconnected
  // claims. Prefer the exact visit the "Admit to IPD" button was launched from
  // (passed explicitly); only when the admit wasn't started from a visit (e.g.
  // ward-list or emergency) fall back to inferring the patient's latest visit
  // today. The explicit link is exact and works across days.
  let sourceVisitId: string | null = visit_id ?? null
  if (!sourceVisitId) {
    const { data: latestTodayVisit } = await supabase
      .from('visits')
      .select('id')
      .eq('patient_id', patient_id)
      .gte('visit_date', istDayStartISO(todayStr))
      .lt('visit_date', istDayEndISO(todayStr))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    sourceVisitId = (latestTodayVisit?.id as string | undefined) ?? null
  }

  const admissionUpdate: Record<string, unknown> = {}
  if (admissionCombinedNo) admissionUpdate.combined_bill_no = admissionCombinedNo
  if (sourceVisitId) admissionUpdate.source_visit_id = sourceVisitId
  if (emergency_case_id) admissionUpdate.source_emergency_case_id = emergency_case_id
  if (Object.keys(admissionUpdate).length > 0) {
    await supabase.from('admissions').update(admissionUpdate).eq('id', admissionId)
  }

  // Admitted from ER: the ER consultation and any ER orders were billed against the
  // ER visit. Link those bills to this admission so they are on the IPD final bill,
  // count in the discharge balance check and can use the admission's advance.
  if (emergency_case_id) {
    const { data: erCase } = await supabase
      .from('emergency_cases').select('patient_id, arrived_at').eq('id', emergency_case_id).maybeSingle()
    if (erCase && erCase.patient_id === patient_id) {
      const { data: erVisits } = await supabase
        .from('visits').select('id')
        .eq('patient_id', patient_id).eq('type', 'emergency')
        // The ER visit is created after arrival; a small margin covers clock skew.
        .gte('created_at', new Date(new Date(erCase.arrived_at as string).getTime() - 5 * 60_000).toISOString())
      const erVisitIds = (erVisits ?? []).map((v) => v.id as string)
      if (erVisitIds.length) {
        const { error: visitLinkErr } = await supabase.from('bills')
          .update({ admission_id: admissionId })
          .in('visit_id', erVisitIds)
          .is('admission_id', null)
          .neq('status', 'cancelled')
        if (visitLinkErr) console.error('[admitPatient] linking ER visit bills failed:', visitLinkErr.message)
      }
      // ER registration fee and ER procedure charges are billed against the case.
      const { error: caseLinkErr } = await supabase.from('bills')
        .update({ admission_id: admissionId })
        .eq('emergency_case_id', emergency_case_id)
        .is('admission_id', null)
        .neq('status', 'cancelled')
      if (caseLinkErr) console.error('[admitPatient] linking ER case bills failed:', caseLinkErr.message)
    }
  }

  // Direct ICU admission: if admitted to an ICU bed, flag critical care + open
  // the ICU episode automatically.
  if (bed_id && await bedIsIcu(supabase, bed_id)) {
    await enterIcu(supabase, actor.tenant_id, admissionId, bed_id, ward_id ?? null, actor.id)
  }

  await logAudit(actor.id, 'admit', 'admission', admissionId, { patient_id, bed_id })
  return { success: true, admissionId }
}

export async function addProgressNote(
  admissionId: string,
  input: Record<string, unknown>
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:notes')

  // A late entry about the stay is still part of the record.
  const gate = await assertTreatmentStarted(admissionId, { allowDischarged: true })
  if (!gate.success) return gate

  const parsed = ProgressNoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('ipd_progress_notes').insert({
    id:           crypto.randomUUID(),
    tenant_id:    actor.tenant_id,
    admission_id: admissionId,
    author_id:    actor.id,
    note:         parsed.data.note,
    vitals:       parsed.data.vitals ?? null,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'note', 'admission', admissionId)
  return { success: true }
}

// Post-OT ward assignment: handles direct_ot (no old bed) and temp ward (old bed to delete)
export async function postOpTransferToWard(
  admissionId: string,
  input: {
    ward_id: string
    bed_id?: string | null
    is_temp_ward?: boolean
    temp_slot?: string | null
  }
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const gate = await assertTreatmentStarted(admissionId)
  if (!gate.success) return gate

  const { ward_id, bed_id, is_temp_ward, temp_slot } = input
  const supabase = await createClient()

  const { data: admission } = await supabase
    .from('admissions')
    .select('bed_id, ward_id, direct_ot, status')
    .eq('id', admissionId)
    .single()

  if (!admission || admission.status !== 'admitted') {
    return { success: false, error: 'Admission not active' }
  }

  let newBedId: string

  if (is_temp_ward) {
    // Create a slot in the target temp ward
    const { count } = await supabase
      .from('beds').select('id', { count: 'exact', head: true }).eq('ward_id', ward_id)
    const slotLabel = temp_slot?.trim() || `Slot-${(count ?? 0) + 1}`
    const tempBedId = crypto.randomUUID()
    const { error: bedErr } = await supabase.from('beds').insert({
      id: tempBedId, tenant_id: actor.tenant_id, ward_id, bed_no: slotLabel, status: 'occupied',
    })
    if (bedErr) return { success: false, error: bedErr.message }
    newBedId = tempBedId
  } else {
    // Regular bed: claim it optimistically
    if (!bed_id) return { success: false, error: 'Please select a bed' }
    const { data: claimed } = await supabase
      .from('beds')
      .update({ status: 'occupied' })
      .eq('id', bed_id)
      .eq('status', 'available')
      .select('id')
    if (!claimed || claimed.length === 0) {
      return { success: false, error: 'Bed is no longer available — please choose another' }
    }
    newBedId = bed_id
  }

  // Free the old bed (delete if temp, mark available if regular)
  if (admission.bed_id) {
    const { data: oldWard } = await supabase
      .from('wards').select('is_temp').eq('id', admission.ward_id).single()
    if (oldWard?.is_temp) {
      await supabase.from('beds').delete().eq('id', admission.bed_id)
    } else {
      await supabase.from('beds').update({ status: 'available' }).eq('id', admission.bed_id)
    }
  }

  // Update the admission
  const { error: updateErr } = await supabase
    .from('admissions')
    .update({ ward_id, bed_id: newBedId, direct_ot: false })
    .eq('id', admissionId)
  if (updateErr) return { success: false, error: updateErr.message }

  await logAudit(actor.id, 'post_op_transfer', 'admission', admissionId, { ward_id, bed_id: newBedId })
  return { success: true }
}

export async function transferBed(
  admissionId: string,
  newBedId: string
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()

  // Get current bed
  const { data: admission } = await supabase
    .from('admissions')
    .select('bed_id, status')
    .eq('id', admissionId)
    .single()

  if (!admission || admission.status !== 'admitted') {
    return { success: false, error: 'Admission not found or already closed' }
  }

  const { data: result, error: rpcErr } = await supabase.rpc('transfer_bed', {
    p_admission_id: admissionId,
    p_old_bed_id:   admission.bed_id,
    p_new_bed_id:   newBedId,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Transfer failed' }

  // Critical-care follows the bed: entering an ICU bed flags critical care +
  // opens an ICU episode; leaving ICU for a normal bed clears it + closes the
  // episode. Room→room and ICU→ICU moves don't touch the manual flag.
  const wasIcu = await bedIsIcu(supabase, admission.bed_id as string | null)
  const nowIcu = await bedIsIcu(supabase, newBedId)
  if (!wasIcu && nowIcu) {
    const { data: nb } = await supabase.from('beds').select('ward_id').eq('id', newBedId).maybeSingle()
    await enterIcu(supabase, actor.tenant_id, admissionId, newBedId, (nb?.ward_id as string | null) ?? null, actor.id)
  } else if (wasIcu && !nowIcu) {
    await exitIcu(supabase, admissionId, actor.id)
  }

  // Record as a progress note
  await supabase.from('ipd_progress_notes').insert({
    id:           crypto.randomUUID(),
    tenant_id:    actor.tenant_id,
    admission_id: admissionId,
    author_id:    actor.id,
    note:         !wasIcu && nowIcu ? 'Transferred into ICU.' : wasIcu && !nowIcu ? 'Transferred out of ICU.' : 'Transferred to new bed.',
  })

  await logAudit(actor.id, 'transfer', 'admission', admissionId, {
    old_bed: admission.bed_id, new_bed: newBedId,
  })
  return { success: true }
}

/**
 * What the discharge window shows before anyone presses Discharge: what is
 * still open on the stay, the patient's balance, and whether it is a
 * medico-legal case.
 */
export interface DischargeReadiness extends OpenWork {
  patientBalanceDue: number
  insuranceApproved: number
  isMlc: boolean
  /** Future appointments — after a death the family should not be called about them. */
  upcomingAppointments: number
}

export async function getDischargeReadiness(admissionId: string): Promise<DischargeReadiness | null> {
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const supabase = await createClient()

  const { data: adm } = await supabase
    .from('admissions').select('id, patient_id, status, source_emergency_case_id').eq('id', admissionId).maybeSingle()
  if (!adm || adm.status !== 'admitted') return null

  const [open, financials, erCase, appts] = await Promise.all([
    findOpenWork(supabase, admissionId),
    getAdmissionFinancials(admissionId),
    adm.source_emergency_case_id
      ? supabase.from('emergency_cases').select('is_mlc').eq('id', adm.source_emergency_case_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('appointments').select('id', { count: 'exact', head: true })
      .eq('patient_id', adm.patient_id).in('status', ['booked', 'checked_in'])
      .gt('scheduled_at', new Date().toISOString()),
  ])

  return {
    ...open,
    patientBalanceDue: financials.patientBalanceDue,
    insuranceApproved: financials.insuranceApproved,
    isMlc: !!(erCase.data as { is_mlc?: boolean } | null)?.is_mlc,
    upcomingAppointments: appts.count ?? 0,
  }
}

/**
 * The discharge window's "Cancel these tests": tests ordered on the stay and
 * never collected or performed come off the bill before the final balance is
 * collected, so the patient never pays for a test that was not done.
 */
export async function cancelTestsBeforeDischarge(
  admissionId: string,
): Promise<{ success: true; cancelled: number; refundNeeded: number } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')
  const supabase = await createClient()

  const closed = await admissionClosedError(supabase, admissionId)
  if (closed) return { success: false, error: closed }

  try {
    const { cancelled, billing } = await cancelTestsNotDone(supabase, admissionId)
    const refundNeeded = billing.reduce((n, b) => n + b.refundNeeded.length, 0)
    await logAudit(actor.id, 'cancel_tests_before_discharge', 'admission', admissionId, { cancelled, billing })
    return { success: true, cancelled, refundNeeded }
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}

export async function dischargePatient(
  admissionId: string,
  input: Record<string, unknown>
): Promise<{ success: true; dueRecorded: number } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const parsed = DischargeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const { discharge_type: type } = parsed.data

  const supabase = await createClient()

  const { data: admission } = await supabase
    .from('admissions')
    .select('bed_id, ward_id, status, patient_id, admitting_doctor_id, admitted_at, ward:wards(name, daily_rate)')
    .eq('id', admissionId)
    .single()

  if (!admission || admission.status !== 'admitted') {
    return { success: false, error: 'Admission not found or already discharged' }
  }

  const now = new Date()
  const nowIso = now.toISOString()

  // Time of death: after admission, and not in the future (two minutes' grace
  // for a clock that runs ahead).
  let deathAt: string | null = null
  if (type === 'death') {
    const d = new Date(parsed.data.death_at as string)
    if (d.getTime() > now.getTime() + 2 * 60_000) return { success: false, error: 'The time of death cannot be in the future' }
    if (admission.admitted_at && d.getTime() < new Date(admission.admitted_at as string).getTime()) {
      return { success: false, error: 'The time of death is before the admission' }
    }
    deathAt = d.toISOString()
  }

  const open = await findOpenWork(supabase, admissionId, now)
  if (open.surgeriesInProgress > 0) {
    return { success: false, error: 'A surgery is still in progress — mark it completed in OT before discharge.' }
  }
  const skipsGate = dischargeSkipsBalanceGate(type)
  if (!skipsGate && open.testsNotDone.length > 0) {
    const names = open.testsNotDone.map((t) => t.name).join('; ')
    return {
      success: false,
      error: `${open.testsNotDone.length} test${open.testsNotDone.length > 1 ? 's were' : ' was'} ordered but not done (${names}). Cancel them in this window first, so they come off the bill.`,
    }
  }

  // Bill every day of the stay before the balance gate — any day the cron / ward
  // board missed, plus the discharge day — so a patient can never be discharged
  // with unbilled days. Idempotent: never double-bills a day already charged.
  const catchUp = await catchUpDailyCharges(supabase, actor.id, actor.tenant_id, [{
    id: admissionId,
    patient_id: admission.patient_id as string,
    admitting_doctor_id: (admission.admitting_doctor_id as string | null) ?? null,
    admitted_at: (admission.admitted_at as string | null) ?? null,
    ward: (admission.ward as unknown as { name: string; daily_rate: number }) ?? { name: '', daily_rate: 0 },
  }])
  if (catchUp.backfilled.length || catchUp.skippedOlder.length) {
    await logAudit(actor.id, 'ipd_daily_catch_up', 'admission', admissionId, {
      backfilled: catchUp.backfilled, skipped_older: catchUp.skippedOlder,
    })
  }

  // Death, against advice, absconded: the patient (or the body) is not held for
  // the bill. Tests that will never be done come off it first, so what stays
  // due is only what was actually provided.
  let testsCancelled = 0
  if (skipsGate && open.testsNotDone.length > 0) {
    try {
      testsCancelled = (await cancelTestsNotDone(supabase, admissionId)).cancelled
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  // Gate on the patient's own outstanding balance before discharge. An
  // approved-but-unsettled insurance claim covers its portion — the TPA settles
  // later — so only the patient's residual share must be collected now.
  const financials = await getAdmissionFinancials(admissionId)
  if (!skipsGate && financials.patientBalanceDue > 0) {
    const insuranceNote = financials.insuranceApproved > 0
      ? ` (₹${financials.insuranceApproved.toFixed(2)} is covered by an approved insurance claim)`
      : ''
    return {
      success: false,
      error: `Cannot discharge — ₹${financials.patientBalanceDue.toFixed(2)} patient balance due${insuranceNote}. Collect the patient's share before discharge.`,
    }
  }
  const dueRecorded = skipsGate ? financials.patientBalanceDue : 0

  // Only one discharge wins: a second click or a second screen finds the stay
  // already closed and changes nothing.
  const { data: updated, error } = await supabase
    .from('admissions')
    .update({
      status:            'discharged',
      discharged_at:     nowIso,
      discharge_summary: parsed.data.discharge_summary,
      discharge_type:    type,
      death_at:          deathAt,
      death_cause:       type === 'death' ? (parsed.data.death_cause?.trim() || null) : null,
      on_ventilator:     false,
    })
    .eq('id', admissionId)
    .eq('status', 'admitted')
    .select('id')
  if (error) return { success: false, error: error.message }
  if (!updated?.length) return { success: false, error: 'This patient has already been discharged.' }

  // Free the bed — delete temp slots, mark regular beds available
  if (admission.bed_id) {
    const { data: wardRow } = await supabase
      .from('wards').select('is_temp').eq('id', admission.ward_id).single()
    if (wardRow?.is_temp) {
      await supabase.from('beds').delete().eq('id', admission.bed_id)
    } else {
      await supabase.from('beds').update({ status: 'available' }).eq('id', admission.bed_id)
    }
  }

  // Close the ICU episode (if any) and everything else still open on the stay.
  await exitIcu(supabase, admissionId, actor.id)
  const closedWork = await closeOpenWork(supabase, {
    admissionId, patientId: admission.patient_id as string, closedAt: nowIso, died: type === 'death',
  })

  await logAudit(actor.id, 'discharge', 'admission', admissionId, {
    discharge_type: type,
    ...(type === 'death' ? { death_at: deathAt } : {}),
    ...(dueRecorded > 0 ? { due_recorded: dueRecorded } : {}),
    tests_cancelled: testsCancelled,
    closed: closedWork,
    uncharted_doses: open.unchartedDoses,
  })
  return { success: true, dueRecorded }
}

export async function updateDischargeSummary(
  admissionId: string,
  summary: string
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('admissions')
    .update({ discharge_summary: summary })
    .eq('id', admissionId)
    .eq('status', 'discharged')

  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update_discharge_summary', 'admission', admissionId)
  return { success: true }
}

export async function listAdmissions(filters?: {
  status?: string
  patientId?: string
}): Promise<Admission[]> {
  const supabase = await createClient()
  let q = supabase
    .from('admissions')
    .select(`
      *,
      patient:patients(id, full_name, uhid, phone, blood_group, allergies),
      doctor:profiles!admissions_admitting_doctor_id_fkey(id, full_name),
      ward:wards(id, name, daily_rate, room_type:ward_room_types(is_icu)),
      bed:beds(id, bed_no)
    `)
    .order('admitted_at', { ascending: false })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.patientId) q = q.eq('patient_id', filters.patientId)

  const { data } = await q.limit(200)
  return (data ?? []) as unknown as Admission[]
}

export async function getAdmission(id: string): Promise<Admission | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admissions')
    .select(`
      *,
      patient:patients(id, full_name, uhid, phone, blood_group, allergies, dob, gender),
      doctor:profiles!admissions_admitting_doctor_id_fkey(id, full_name),
      ward:wards(id, name),
      bed:beds(id, bed_no)
    `)
    .eq('id', id)
    .single()
  return data as unknown as Admission | null
}

export async function getAdmissionNotes(admissionId: string): Promise<IpdProgressNote[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_progress_notes')
    .select('*, author:profiles(id, full_name, role)')
    .eq('admission_id', admissionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as IpdProgressNote[]
}
