'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { removeOrderFromBills } from '@/lib/billing/orderBilling'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { assertTreatmentStarted } from '@/app/actions/ipdDeclaration'
import type {
  IpdMedicationOrder, IpdAdminSchedule, FrequencyType, IpdPharmacyRequest,
  LabOrder, LabTestCatalog, RadiologyOrder, RadiologyCatalog, RxWarning,
} from '@/lib/types'
import { istToday } from '@/lib/istDate'
import { doseOverMaxError } from '@/lib/dosing/evaluate'
import { checkIpdOrderSafety } from '@/app/actions/rxSafety'
import { pageAll } from '@/lib/supabase/pageAll'
import { requiresSupplyReason, cleanSupplyReason, NEEDS_REASON_MESSAGE } from '@/lib/pharmacy/schedule'
import { scheduleOfDrug } from '@/lib/pharmacy/scheduleOf'

type SimpleResult = { success: true } | { success: false; error: string }

// ── Schedule slot generator ──────────────────────────────────────────────────

function makeSlots(
  tenantId: string,
  orderId: string,
  admissionId: string,
  frequencyType: FrequencyType,
  frequencyHours: number | null,
  startAt: Date,
  days: number
): Array<{ id: string; tenant_id: string; order_id: string; admission_id: string; due_at: string }> {
  const slot = (due: Date) => ({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    order_id: orderId,
    admission_id: admissionId,
    due_at: due.toISOString(),
  })

  if (frequencyType === 'stat')       return [slot(startAt)]
  if (frequencyType === 'sos')        return []
  if (frequencyType === 'continuous') return [slot(startAt)]

  const slots = []
  const end = new Date(startAt)
  end.setDate(end.getDate() + days)

  if (frequencyType === 'daily') {
    for (let d = 0; d < days; d++) {
      const t = new Date(startAt); t.setDate(t.getDate() + d)
      slots.push(slot(t))
    }
  } else if (frequencyType === 'twice_daily') {
    for (let d = 0; d < days; d++) {
      for (const h of [0, 12]) {
        const t = new Date(startAt); t.setDate(t.getDate() + d); t.setHours(t.getHours() + h)
        slots.push(slot(t))
      }
    }
  } else if (frequencyType === 'thrice_daily') {
    for (let d = 0; d < days; d++) {
      for (const h of [0, 8, 16]) {
        const t = new Date(startAt); t.setDate(t.getDate() + d); t.setHours(t.getHours() + h)
        slots.push(slot(t))
      }
    }
  } else if (frequencyType === 'every_x_hours' && frequencyHours) {
    const t = new Date(startAt)
    while (t <= end) {
      slots.push(slot(new Date(t)))
      t.setHours(t.getHours() + frequencyHours)
    }
  }

  return slots
}

// ── Orders ───────────────────────────────────────────────────────────────────

export async function listOrders(admissionId: string): Promise<IpdMedicationOrder[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_medication_orders')
    .select('*, doctor:profiles!ordered_by(full_name), pharmacy:ipd_pharmacy_requests(status)')
    .eq('admission_id', admissionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as IpdMedicationOrder[]
}

export async function createOrder(
  admissionId: string,
  input: {
    type: IpdMedicationOrder['type']
    drug_name?: string
    drug_ref_id?: string | null      // drug_master.id (is_global) or drugs.id
    drug_is_global?: boolean         // true → drug_master, false → drugs
    dose?: number
    dose_unit?: string
    route?: string
    fluid_name?: string
    volume_ml?: number
    rate_ml_per_hr?: number
    flow_rate_lpm?: number
    delivery_method?: string
    /** What was added to the bag, e.g. "KCl 20 mEq" (KMCH IV chart). */
    additives?: string
    /** How a drug is diluted, e.g. "50 mg in 50 ml NS". */
    dilution?: string
    frequency_type: FrequencyType
    frequency_hours?: number
    duration_days: number
    notes?: string
    dose_override?: boolean
    /** The doctor ticked "reviewed this warning" — the only thing taken from the caller; the warnings are recomputed here. */
    safety_acknowledged?: boolean
  }
): Promise<{ success: true; order: IpdMedicationOrder } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const gate = await assertTreatmentStarted(admissionId)
  if (!gate.success) return gate

  const supabase = await createClient()
  let safetyMajor: RxWarning[] = []
  if (input.type === 'medication' && input.drug_name) {
    // Children: a dose above the maximum for their weight needs an explicit override.
    const { data: adm } = await supabase.from('admissions').select('patient_id').eq('id', admissionId).maybeSingle()
    if (!adm) return { success: false, error: 'Admission not found' }
    const doseError = await doseOverMaxError(supabase, {
      patientId: adm.patient_id as string, drugName: input.drug_name,
      dose: input.dose ?? null, doseUnit: input.dose_unit ?? null, route: input.route ?? null,
      frequencyType: input.frequency_type, frequencyHours: input.frequency_hours ?? null,
      drugRef: input.drug_ref_id ? { id: input.drug_ref_id, isGlobal: !!input.drug_is_global } : null,
    }, input.dose_override === true)
    if (doseError) return { success: false, error: doseError }

    // Allergy / interaction check, recomputed here rather than trusted from the
    // form — the same rule as an OPD prescription (F-59): a major warning needs
    // the doctor's acknowledgement, and an override is recorded with their name.
    const warnings = await checkIpdOrderSafety(admissionId, input.drug_name,
      input.drug_ref_id ? { id: input.drug_ref_id, isGlobal: !!input.drug_is_global } : null)
    safetyMajor = warnings.filter((w) => w.severity === 'major')
    if (safetyMajor.length && input.safety_acknowledged !== true) {
      return {
        success: false,
        error: `${safetyMajor[0].message}. Tick the acknowledgement to order anyway — it will be recorded with your name.`,
      }
    }
  }
  const orderId = crypto.randomUUID()
  const startAt = new Date()

  const drugMasterId = input.drug_is_global ? (input.drug_ref_id ?? null) : null
  const drugId       = input.drug_is_global === false ? (input.drug_ref_id ?? null) : null

  const { error } = await supabase.from('ipd_medication_orders').insert({
    id:              orderId,
    tenant_id:       actor.tenant_id,
    admission_id:    admissionId,
    ordered_by:      actor.id,
    type:            input.type,
    drug_name:       input.drug_name ?? null,
    drug_master_id:  drugMasterId,
    drug_id:         drugId,
    dose:            input.dose ?? null,
    dose_unit:       input.dose_unit ?? null,
    route:           input.route ?? null,
    fluid_name:      input.fluid_name ?? null,
    volume_ml:       input.volume_ml ?? null,
    rate_ml_per_hr:  input.rate_ml_per_hr ?? null,
    flow_rate_lpm:   input.flow_rate_lpm ?? null,
    delivery_method: input.delivery_method ?? null,
    additives:       input.additives?.trim().slice(0, 300) || null,
    dilution:        input.dilution?.trim().slice(0, 200) || null,
    frequency_type:  input.frequency_type,
    frequency_hours: input.frequency_hours ?? null,
    duration_days:   input.duration_days,
    start_at:        startAt.toISOString(),
    notes:           input.notes ?? null,
  })
  if (error) return { success: false, error: error.message }

  // Auto-generate administration schedule slots for the full duration
  const slots = makeSlots(
    actor.tenant_id, orderId, admissionId,
    input.frequency_type, input.frequency_hours ?? null, startAt,
    input.duration_days
  )
  if (slots.length > 0) {
    await supabase.from('ipd_admin_schedule').insert(slots)
  }

  // Create pharmacy request for medication and IV orders
  if (input.type !== 'oxygen') {
    const itemName = input.type === 'medication'
      ? (input.drug_name ?? 'Medication')
      : `${input.fluid_name ?? 'IV Fluid'} ${input.volume_ml ?? ''}ml`.trim()

    // Calculate total dispensing quantity: doses per day × duration
    let totalQty = 1
    if (input.type === 'medication') {
      const days = input.duration_days
      if (input.frequency_type === 'daily')        totalQty = days
      else if (input.frequency_type === 'twice_daily')  totalQty = 2 * days
      else if (input.frequency_type === 'thrice_daily') totalQty = 3 * days
      else if (input.frequency_type === 'every_x_hours' && input.frequency_hours)
        totalQty = Math.ceil((24 / input.frequency_hours) * days)
      // stat / sos / continuous → 1
    }

    await supabase.from('ipd_pharmacy_requests').insert({
      id:             crypto.randomUUID(),
      tenant_id:      actor.tenant_id,
      order_id:       orderId,
      admission_id:   admissionId,
      item_name:      itemName,
      quantity:       totalQty,
      unit:           input.type === 'medication' ? null : 'bottle',
      drug_master_id: input.type === 'medication' ? drugMasterId : null,
      drug_id:        input.type === 'medication' ? drugId : null,
    })
  }

  await logAudit(actor.id, 'create', 'ipd_medication_order', orderId, { admissionId, type: input.type, ...(input.dose_override ? { dose_override: true, drug: input.drug_name, dose: input.dose, dose_unit: input.dose_unit } : {}) })
  if (safetyMajor.length) {
    await logAudit(actor.id, 'safety_override', 'ipd_medication_order', orderId, {
      drug: input.drug_name,
      warnings: safetyMajor.map((w) => w.message),
    })
  }

  const { data: row } = await supabase
    .from('ipd_medication_orders')
    .select('*, doctor:profiles!ordered_by(full_name)')
    .eq('id', orderId)
    .single()

  return { success: true, order: row as unknown as IpdMedicationOrder }
}

export async function stopOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()

  const { data: orderRow } = await supabase
    .from('ipd_medication_orders').select('admission_id').eq('id', orderId).maybeSingle()
  if (orderRow?.admission_id) {
    const gate = await assertTreatmentStarted(orderRow.admission_id as string)
    if (!gate.success) return gate
  }

  const { error } = await supabase
    .from('ipd_medication_orders')
    .update({ status: 'stopped', stop_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) return { success: false, error: error.message }

  // Cancel pending slots
  await supabase
    .from('ipd_admin_schedule')
    .update({ status: 'held' })
    .eq('order_id', orderId)
    .eq('status', 'pending')

  // Cancel pending pharmacy request
  await supabase
    .from('ipd_pharmacy_requests')
    .update({ status: 'cancelled' })
    .eq('order_id', orderId)
    .eq('status', 'pending')

  await logAudit(actor.id, 'stop', 'ipd_medication_order', orderId, {})
  return { success: true }
}

// ── Administration schedule ──────────────────────────────────────────────────

export async function listSchedule(admissionId: string): Promise<IpdAdminSchedule[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_admin_schedule')
    .select(`
      *,
      order:ipd_medication_orders(type,drug_name,fluid_name,dose,dose_unit,route,flow_rate_lpm,delivery_method,volume_ml,additives),
      nurse:profiles!given_by(full_name),
      checker:profiles!checked_by(full_name)
    `)
    .eq('admission_id', admissionId)
    .order('due_at', { ascending: true })
  return (data ?? []) as unknown as IpdAdminSchedule[]
}

export async function updateSlotStatus(
  scheduleId: string,
  status: 'given' | 'missed' | 'held',
  notes?: string,
  /** KMCH drug chart: the second person who checked the dose, and the IV bag number. */
  extra?: { checked_by?: string | null; bag_no?: string | null },
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const supabase = await createClient()

  const { data: scheduleRow } = await supabase
    .from('ipd_admin_schedule').select('admission_id, due_at').eq('id', scheduleId).maybeSingle()
  if (scheduleRow?.admission_id) {
    // A dose given before discharge can still be charted after it — but only
    // one that was due before the patient left.
    const gate = await assertTreatmentStarted(scheduleRow.admission_id as string, { allowDischarged: true })
    if (!gate.success) return gate
    const { data: adm } = await supabase
      .from('admissions').select('status, discharged_at').eq('id', scheduleRow.admission_id).maybeSingle()
    if (adm?.status === 'discharged' && adm.discharged_at
        && new Date(scheduleRow.due_at as string).getTime() > new Date(adm.discharged_at as string).getTime()) {
      return { success: false, error: 'This dose was due after the patient was discharged.' }
    }
  }

  // Block 'given' unless pharmacy has dispensed the medication for this order
  if (status === 'given') {
    const { data: slot } = await supabase
      .from('ipd_admin_schedule')
      .select('order_id, order:ipd_medication_orders!order_id(type)')
      .eq('id', scheduleId)
      .single()

    if (slot) {
      const orderType = (slot.order as unknown as { type: string } | null)?.type
      if (orderType && orderType !== 'oxygen') {
        const { data: pharmReqs } = await supabase
          .from('ipd_pharmacy_requests')
          .select('status')
          .eq('order_id', slot.order_id as string)
          .neq('status', 'cancelled')

        const dispensed = (pharmReqs ?? []).some((r) => (r.status as string) === 'dispensed')
        if (!dispensed) {
          return {
            success: false,
            error: 'Pharmacy has not dispensed this medication yet. The dose cannot be marked as given until the pharmacy prepares and dispatches it.',
          }
        }
      }
    }
  }

  // The checker is a different, active member of this hospital's clinical staff.
  let checkedBy: string | null = null
  if (status === 'given' && extra?.checked_by) {
    if (extra.checked_by === actor.id) return { success: false, error: 'The person who checks the dose cannot be the one giving it.' }
    const { data: checker } = await supabase.from('profiles').select('id, role, is_active')
      .eq('id', extra.checked_by).eq('tenant_id', actor.tenant_id).maybeSingle()
    if (!checker?.is_active || !['nurse', 'doctor', 'admin'].includes(checker.role as string)) {
      return { success: false, error: 'Choose a nurse or doctor of this hospital to check the dose.' }
    }
    checkedBy = checker.id as string
  }
  const bagNo = status === 'given' ? (extra?.bag_no?.trim().slice(0, 20) || null) : null

  const { error } = await supabase
    .from('ipd_admin_schedule')
    .update({
      status,
      given_at:    new Date().toISOString(),
      given_by:    actor.id,
      given_notes: notes ?? null,
      checked_by:  checkedBy,
      bag_no:      bagNo,
    })
    .eq('id', scheduleId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, `slot_${status}`, 'ipd_admin_schedule', scheduleId, { notes, checked_by: checkedBy, bag_no: bagNo })
  return { success: true }
}

/**
 * An IV bag ran out. Records when, and writes the bag's volume to the
 * intake/output sheet once (icu_fluid_balance.source_schedule_id is unique),
 * so the nurse does not add IV intake by hand.
 */
export async function finishInfusionBag(
  scheduleId: string, finishedAt?: string | null,
): Promise<{ success: true; intakeMl: number | null } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')
  const supabase = await createClient()

  const { data: slot } = await supabase.from('ipd_admin_schedule')
    .select('id, admission_id, status, given_at, finished_at, bag_no, order:ipd_medication_orders(type, fluid_name, volume_ml)')
    .eq('id', scheduleId).maybeSingle()
  if (!slot) return { success: false, error: 'Dose not found' }
  const order = slot.order as unknown as { type: string; fluid_name: string | null; volume_ml: number | null } | null
  if (order?.type !== 'iv_infusion') return { success: false, error: 'Only an IV infusion bag can be finished.' }
  if (slot.status !== 'given' || !slot.given_at) return { success: false, error: 'Start the bag (mark it given) first.' }
  if (slot.finished_at) return { success: false, error: 'This bag is already marked finished.' }
  const gate = await assertTreatmentStarted(slot.admission_id as string, { allowDischarged: true })
  if (!gate.success) return gate

  const at = finishedAt ? new Date(finishedAt) : new Date()
  if (Number.isNaN(at.getTime())) return { success: false, error: 'Not a valid time' }
  if (at.getTime() > Date.now() + 2 * 60_000) return { success: false, error: 'The finish time is in the future' }
  if (at.getTime() < new Date(slot.given_at as string).getTime()) return { success: false, error: 'The bag cannot finish before it started' }

  const { data: done, error } = await supabase.from('ipd_admin_schedule')
    .update({ finished_at: at.toISOString() }).eq('id', scheduleId).is('finished_at', null).select('id')
  if (error) return { success: false, error: error.message }
  if (!done?.length) return { success: false, error: 'This bag is already marked finished.' }

  let intakeMl: number | null = null
  if (order.volume_ml && order.volume_ml > 0) {
    const { error: fbErr } = await supabase.from('icu_fluid_balance').insert({
      tenant_id: actor.tenant_id, admission_id: slot.admission_id, recorded_by: actor.id,
      recorded_at: at.toISOString(), direction: 'intake', category: 'iv', volume_ml: Math.round(order.volume_ml),
      notes: [order.fluid_name, slot.bag_no ? `bag ${slot.bag_no}` : null].filter(Boolean).join(' — ') || 'IV bag',
      source_schedule_id: scheduleId,
    })
    if (fbErr && fbErr.code !== '23505') console.error('[finishInfusionBag] intake row:', fbErr.message)
    else intakeMl = Math.round(order.volume_ml)
  }
  await logAudit(actor.id, 'iv_bag_finished', 'ipd_admin_schedule', scheduleId, { finished_at: at.toISOString(), intake_ml: intakeMl })
  return { success: true, intakeMl }
}

export async function restoreSlotToPending(scheduleId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const supabase = await createClient()
  const { error } = await supabase
    .from('ipd_admin_schedule')
    .update({ status: 'pending', given_at: null, given_by: null, given_notes: null })
    .eq('id', scheduleId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'slot_restored', 'ipd_admin_schedule', scheduleId)
  return { success: true }
}

export async function markGiven(scheduleId: string, notes?: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  return updateSlotStatus(scheduleId, 'given', notes)
}

// Extend schedule by 3 more days (called when page loads and latest slot < today+1)
export async function extendSchedule(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('ipd_medication_orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order || (order.status as string) !== 'active') return { success: true }

  const gate = await assertTreatmentStarted(order.admission_id as string)
  if (!gate.success) return gate

  const { data: latest } = await supabase
    .from('ipd_admin_schedule')
    .select('due_at')
    .eq('order_id', orderId)
    .order('due_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastDue = latest?.due_at ? new Date(latest.due_at as string) : new Date(order.start_at as string)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)

  if (lastDue >= tomorrow) return { success: true }

  const slots = makeSlots(
    actor.tenant_id, orderId, order.admission_id as string,
    order.frequency_type as FrequencyType,
    order.frequency_hours as number | null,
    new Date(lastDue.getTime() + 1),
    3,
  )

  if (slots.length > 0) await supabase.from('ipd_admin_schedule').insert(slots)
  return { success: true }
}

// ── Copy from OPD visit ──────────────────────────────────────────────────────

export async function getVisitPrescriptions(
  patientId: string
): Promise<Array<{ visitId: string; visitDate: string; prescriptions: Array<{ id: string; drug_name: string; dosage: string | null; frequency: string | null; instructions: string | null }> }>> {
  const supabase = await createClient()

  // visits is partitioned — FK from prescriptions was dropped, so embedded join
  // via PostgREST doesn't work. Two separate queries instead.
  const { data: visits } = await supabase
    .from('visits')
    .select('id, created_at')
    .eq('patient_id', patientId)
    .in('status', ['closed', 'open'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (!visits?.length) return []

  const visitIds = visits.map((v) => v.id as string)
  const { data: rxRows } = await supabase
    .from('prescriptions')
    .select('id, visit_id, drug_name, dosage, frequency, instructions')
    .in('visit_id', visitIds)

  if (!rxRows?.length) return []

  // Group prescriptions by visit, preserving visit date order
  const rxByVisit = new Map<string, Array<{ id: string; drug_name: string; dosage: string | null; frequency: string | null; instructions: string | null }>>()
  for (const rx of rxRows) {
    const vid = rx.visit_id as string
    if (!rxByVisit.has(vid)) rxByVisit.set(vid, [])
    rxByVisit.get(vid)!.push({
      id: rx.id as string,
      drug_name: rx.drug_name as string,
      dosage: rx.dosage as string | null,
      frequency: rx.frequency as string | null,
      instructions: rx.instructions as string | null,
    })
  }

  return visits
    .filter((v) => rxByVisit.has(v.id as string))
    .map((v) => ({
      visitId:   v.id as string,
      visitDate: v.created_at as string,
      prescriptions: rxByVisit.get(v.id as string)!,
    }))
}

export async function copyPrescriptionsToIPD(
  admissionId: string,
  visitId: string,
  prescriptionIds: string[]
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const gate = await assertTreatmentStarted(admissionId)
  if (!gate.success) return gate

  const supabase = await createClient()

  const { data: prx } = await supabase
    .from('prescriptions')
    .select('*')
    .in('id', prescriptionIds)
    .eq('visit_id', visitId)

  if (!prx?.length) return { success: false, error: 'No prescriptions found' }

  // Each drug was checked when it was prescribed, but not against what is now
  // running on this admission. A copy is a batch with no place to acknowledge a
  // warning drug by drug, so a major warning stops the whole copy and names the
  // drugs; those are then ordered one at a time, where the acknowledgement is.
  const blocked: string[] = []
  for (const p of prx) {
    const warnings = await checkIpdOrderSafety(admissionId, (p.drug_name as string) ?? '')
    const major = warnings.find((w) => w.severity === 'major')
    if (major) blocked.push(`${p.drug_name as string} — ${major.message}`)
  }
  if (blocked.length) {
    return {
      success: false,
      error: `Nothing was copied. ${blocked.slice(0, 3).join('; ')}${blocked.length > 3 ? `; and ${blocked.length - 3} more` : ''}. `
        + 'Order these from New Order, where you can review and acknowledge the warning; copy the rest without them.',
    }
  }

  let count = 0
  for (const p of prx) {
    const orderId = crypto.randomUUID()
    const startAt = new Date()

    const copyDays = 5
    await supabase.from('ipd_medication_orders').insert({
      id:            orderId,
      tenant_id:     actor.tenant_id,
      admission_id:  admissionId,
      ordered_by:    actor.id,
      type:          'medication',
      drug_name:     p.drug_name as string,
      dose:          null,
      dose_unit:     p.dosage as string | null,
      route:         'oral',
      frequency_type: 'daily',
      duration_days: copyDays,
      start_at:      startAt.toISOString(),
      notes:         p.instructions as string | null,
      copied_from_visit_id: visitId,
    })

    const slots = makeSlots(actor.tenant_id, orderId, admissionId, 'daily', null, startAt, copyDays)
    if (slots.length > 0) await supabase.from('ipd_admin_schedule').insert(slots)

    await supabase.from('ipd_pharmacy_requests').insert({
      id:           crypto.randomUUID(),
      tenant_id:    actor.tenant_id,
      order_id:     orderId,
      admission_id: admissionId,
      item_name:    p.drug_name as string,
      quantity:     1,
      unit:         null,
    })

    count++
  }

  await logAudit(actor.id, 'copy_from_opd', 'ipd_medication_order', admissionId, { visitId, count })
  return { success: true, count }
}

// ── Pharmacy IPD queue ───────────────────────────────────────────────────────

export async function listIpdPharmacyRequests(): Promise<IpdPharmacyRequest[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ipd_pharmacy_requests')
    .select(`
      *,
      admission:admissions(
        admitted_at,
        patient:patients(full_name, uhid),
        ward:wards(name),
        bed:beds(bed_no)
      )
    `)
    .order('created_at', { ascending: false })

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const adm = row.admission as Record<string, unknown> | null
    return {
      ...(row as unknown as IpdPharmacyRequest),
      admission: adm ? {
        admitted_at: (adm.admitted_at as string | null) ?? null,
        patient: adm.patient as NonNullable<IpdPharmacyRequest['admission']>['patient'],
        ward:    adm.ward as { name: string } | undefined,
        bed:     adm.bed  as { bed_no: string } | undefined,
      } : undefined,
    }
  })
}

export async function dispenseIpdRequest(
  requestId: string,
  pricePerUnit: number,
  notes?: string,
  /** Why it is supplied — required for Schedule X; written to the register (0269). */
  reason?: string | null,
): Promise<SimpleResult | { success: false; error: string; needsReason: true }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const supabase = await createClient()

  // Fetch request details needed for billing and stock deduction.
  // Use * so the query doesn't error on columns added by later migrations (drug_master_id, drug_id).
  const { data: req } = await supabase
    .from('ipd_pharmacy_requests')
    .select('*, admission:admissions(patient_id)')
    .eq('id', requestId)
    .single()

  if (req?.admission_id) {
    const gate = await assertTreatmentStarted(req.admission_id as string)
    if (!gate.success) return gate
  }

  // A Schedule X supply to the ward goes in the X register with its reason.
  const supplyReason = cleanSupplyReason(reason)
  if (!supplyReason && requiresSupplyReason(await scheduleOfDrug(supabase, {
    drugId: (req?.drug_id as string | null) ?? null, drugMasterId: (req?.drug_master_id as string | null) ?? null,
  }))) {
    return { success: false, error: NEEDS_REASON_MESSAGE, needsReason: true }
  }

  // billing_status stays 'unbilled' until we confirm the bill was created;
  // zero-price items have nothing to bill so they are immediately 'billed'
  const { error } = await supabase
    .from('ipd_pharmacy_requests')
    .update({
      status:         'dispensed',
      dispensed_by:   actor.id,
      dispensed_at:   new Date().toISOString(),
      notes:          notes ?? null,
      price_snapshot: pricePerUnit,
      billing_status: pricePerUnit <= 0 ? 'billed' : 'unbilled',
      supply_reason:  supplyReason,
    })
    .eq('id', requestId)

  if (error) return { success: false, error: error.message }

  // Auto-create the IPD pharmacy bill for today — unless Settings → IPD Billing →
  // Medicine Dispenses is off, in which case the dispensed medicine stays
  // 'unbilled' and is billed from the Bill Builder.
  const { autoIpdBill, ipdChargeEnabled } = await import('@/lib/ipdBilling')
  if (req && pricePerUnit > 0 && await ipdChargeEnabled(supabase, actor.tenant_id, 'charge_medicines')) {
    const patientId = (req.admission as unknown as { patient_id: string } | null)?.patient_id
    if (patientId) {
      const today = istToday()

      // Inherit HSN + GST rate from a batch of this drug (drug-level attributes,
      // captured at goods-receipt) so the pharmacy line bills GST correctly.
      let gstRate: number | null = null
      let hsnSac: string | null = null
      const drugMasterId = (req as Record<string, unknown>).drug_master_id as string | null | undefined
      const drugId = (req as Record<string, unknown>).drug_id as string | null | undefined
      const drugCol = drugMasterId ? 'drug_master_id' : drugId ? 'drug_id' : null
      const drugRef = drugMasterId ?? drugId
      if (drugCol && drugRef) {
        const { data: b } = await supabase
          .from('drug_batches')
          .select('hsn_code, gst_rate')
          .eq(drugCol, drugRef)
          .order('expiry', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (b) { gstRate = b.gst_rate as number; hsnSac = b.hsn_code as string }
      }

      const billId = await autoIpdBill(supabase, actor.id, {
        tenantId: actor.tenant_id,
        admissionId: req.admission_id as string,
        patientId,
        billingDate: today,
        billSource: 'ipd_pharmacy',
        lineItems: [{
          source: 'ipd_pharmacy' as const,
          ref_id: requestId,
          description: req.item_name as string,
          qty: req.quantity as number,
          unit_price: pricePerUnit,
          gst_rate: gstRate,
          hsn_sac: hsnSac,
        }],
      })
      if (billId) {
        await supabase
          .from('ipd_pharmacy_requests')
          .update({ billing_status: 'billed' })
          .eq('id', requestId)
      }
      // If billId is null, billing_status stays 'unbilled' so billing can still pick it up
    }
  }

  // Deduct stock via stored drug FK only — no name matching.
  // Requests without a drug ID (typed custom name or pre-migration rows) skip deduction.
  if (req) {
    const resolvedId = ((req as Record<string, unknown>).drug_master_id ?? (req as Record<string, unknown>).drug_id) as string | null | undefined
    const qty = req.quantity as number
    const today = istToday()

    if (resolvedId && qty > 0) {
      const { data: batches } = await supabase
        .from('drug_batches')
        .select('id, qty_available')
        .or(`drug_master_id.eq.${resolvedId},drug_id.eq.${resolvedId}`)
        .gt('expiry', today)
        .gt('qty_available', 0)
        .order('expiry', { ascending: true })

      let remaining = qty
      for (const batch of batches ?? []) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, batch.qty_available as number)
        await supabase
          .from('drug_batches')
          .update({ qty_available: (batch.qty_available as number) - deduct })
          .eq('id', batch.id)
        remaining -= deduct
      }
    }
  }

  await logAudit(actor.id, 'dispense', 'ipd_pharmacy_request', requestId, { price_per_unit: pricePerUnit })
  return { success: true }
}

// ── IPD Lab orders ────────────────────────────────────────────────────────────

export async function listIpdLabOrders(admissionId: string): Promise<LabOrder[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_orders')
    .select('*, patient:patients(id,full_name,uhid), orderer:profiles!ordered_by(id,full_name), items:lab_order_items(*, test:lab_tests_catalog(*))')
    .eq('admission_id', admissionId)
    .order('ordered_at', { ascending: false })
  return (data ?? []) as unknown as LabOrder[]
}

export async function createIpdLabOrder(
  admissionId: string,
  patientId: string,
  testIds: string[],
  priority: 'stat' | 'routine' = 'routine',
  scheduledFor: string | null = null,
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')

  const gate = await assertTreatmentStarted(admissionId)
  if (!gate.success) return gate

  const supabase = await createClient()
  // Same guard as the OPD path: a switched-off test must not be orderable
  // from a stale ward screen either.
  const { data: tests } = await supabase
    .from('lab_tests_catalog').select('id, price, name').in('id', testIds).eq('is_active', true)
  if (!tests?.length) return { success: false, error: 'No valid tests selected' }
  if (tests.length !== testIds.length) {
    return { success: false, error: 'One of those tests is no longer offered — refresh and try again' }
  }

  const priceMap = new Map(tests.map((t) => [t.id as string, t.price as number]))
  const nameMap  = new Map(tests.map((t) => [t.id as string, t.name as string]))
  const orderId = crypto.randomUUID()

  const { error: orderErr } = await supabase.from('lab_orders').insert({
    id: orderId, tenant_id: actor.tenant_id,
    patient_id: patientId, admission_id: admissionId,
    ordered_by: actor.id, status: 'ordered', billing_status: 'unbilled',
    priority, scheduled_for: scheduledFor ?? istToday(),
  })
  if (orderErr) return { success: false, error: orderErr.message }

  const items = testIds.map((test_id) => ({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id,
    lab_order_id: orderId, test_id,
    price_snapshot: priceMap.get(test_id) ?? 0, flag: 'pending',
  }))
  const { error: itemErr } = await supabase.from('lab_order_items').insert(items)
  if (itemErr) return { success: false, error: itemErr.message }

  // Auto-generate IPD bill immediately on order creation
  const totalAmount = items.reduce((s, i) => s + i.price_snapshot, 0)
  if (totalAmount > 0) {
    const { autoIpdBill } = await import('@/lib/ipdBilling')
    const today = istToday()
    await autoIpdBill(supabase, actor.id, {
      tenantId: actor.tenant_id,
      admissionId,
      patientId,
      billingDate: today,
      billSource: 'lab',
      lineItems: testIds.map((test_id) => ({
        source: 'lab' as const,
        ref_id: orderId,
        description: nameMap.get(test_id) ?? 'Lab test',
        qty: 1,
        unit_price: priceMap.get(test_id) ?? 0,
      })),
    })
    await supabase.from('lab_orders').update({ billing_status: 'billed' }).eq('id', orderId)
  }

    await supabase.rpc('ensure_lab_samples', { p_order_id: orderId })
await logAudit(actor.id, 'create', 'lab_order', orderId, { admissionId, count: testIds.length })
  return { success: true, orderId }
}

export async function cancelIpdLabOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const supabase = await createClient()
  const { error } = await supabase.from('lab_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }

  // Take the order off its bill — IPD orders share a pooled per-day bill, so only
  // this order's lines are removed; the rest of the day's charges stay billed.
  const billing = await removeOrderFromBills(supabase, 'lab', orderId)

  await logAudit(actor.id, 'cancel', 'lab_order', orderId, { billing })
  return { success: true }
}

export async function listLabCatalogForIpd(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  // Same rule as the OPD list: panel components are not ordered on their own.
  const tests = await pageAll<LabTestCatalog>((f, t) => supabase
    .from('lab_tests_catalog').select('*')
    .eq('is_active', true).eq('package_only', false)
    .order('name').order('id').range(f, t))

  // Same panel counts the OPD list shows — a ward doctor ordering a CBC should
  // see it is twenty measurements, not guess from the name.
  const masterIds = [...new Set(tests.map((t) => t.lab_master_id).filter(Boolean))] as string[]
  if (!masterIds.length) return tests
  const { data: links } = await supabase
    .from('lab_test_analytes').select('lab_master_id').in('lab_master_id', masterIds)
  const counts = new Map<string, number>()
  for (const r of links ?? []) {
    const k = r.lab_master_id as string
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return tests.map((t) => ({ ...t, analyte_count: t.lab_master_id ? counts.get(t.lab_master_id) ?? 0 : 0 }))
}

// ── IPD Radiology orders ──────────────────────────────────────────────────────

export async function listIpdRadiologyOrders(admissionId: string): Promise<RadiologyOrder[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_orders')
    .select('*, patient:patients(id,full_name,uhid), orderer:profiles!ordered_by(id,full_name), test:radiology_catalog(*)')
    .eq('admission_id', admissionId)
    .order('ordered_at', { ascending: false })
  return (data ?? []) as unknown as RadiologyOrder[]
}

export async function createIpdRadiologyOrder(
  admissionId: string,
  patientId: string,
  testId: string,
  notes?: string,
  priority: 'stat' | 'routine' = 'routine',
  scheduledFor: string | null = null,
): Promise<{ success: true; orderId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')

  const gate = await assertTreatmentStarted(admissionId)
  if (!gate.success) return gate

  const supabase = await createClient()
  const { data: test } = await supabase
    .from('radiology_catalog').select('price, name').eq('id', testId).single()
  if (!test) return { success: false, error: 'Scan not found in catalog' }

  const id = crypto.randomUUID()
  const priceSnapshot = test.price as number
  const { error } = await supabase.from('radiology_orders').insert({
    id, tenant_id: actor.tenant_id,
    patient_id: patientId, admission_id: admissionId,
    test_id: testId, ordered_by: actor.id,
    price_snapshot: priceSnapshot,
    status: 'ordered', billing_status: 'unbilled',
    report: notes ?? null,
    priority, scheduled_for: scheduledFor ?? istToday(),
  })
  if (error) return { success: false, error: error.message }

  // Auto-generate IPD bill immediately on order creation
  if (priceSnapshot > 0) {
    const { autoIpdBill } = await import('@/lib/ipdBilling')
    const today = istToday()
    await autoIpdBill(supabase, actor.id, {
      tenantId: actor.tenant_id,
      admissionId,
      patientId,
      billingDate: today,
      billSource: 'radiology',
      lineItems: [{
        source: 'radiology' as const,
        ref_id: id,
        description: (test.name as string) ?? 'Radiology scan',
        qty: 1,
        unit_price: priceSnapshot,
      }],
    })
    await supabase.from('radiology_orders').update({ billing_status: 'billed' }).eq('id', id)
  }

  await logAudit(actor.id, 'create', 'radiology_order', id, { admissionId, testId })
  return { success: true, orderId: id }
}

export async function cancelIpdRadiologyOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }

  // Take the order off its bill — IPD orders share a pooled per-day bill, so only
  // this order's lines are removed; the rest of the day's charges stay billed.
  const billing = await removeOrderFromBills(supabase, 'radiology', orderId)

  await logAudit(actor.id, 'cancel', 'radiology_order', orderId, { billing })
  return { success: true }
}

export async function listRadiologyCatalogForIpd(): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('radiology_catalog').select('*').eq('is_active', true).order('name')
  return (data ?? []) as RadiologyCatalog[]
}
