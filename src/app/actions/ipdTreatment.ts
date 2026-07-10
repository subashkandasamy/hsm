'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import type {
  IpdMedicationOrder, IpdAdminSchedule, FrequencyType, IpdPharmacyRequest,
  LabOrder, LabTestCatalog, RadiologyOrder, RadiologyCatalog,
} from '@/lib/types'

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
  await requireWriteAccess()
    type: IpdMedicationOrder['type']
    drug_name?: string
    dose?: number
    dose_unit?: string
    route?: string
    fluid_name?: string
    volume_ml?: number
    rate_ml_per_hr?: number
    flow_rate_lpm?: number
    delivery_method?: string
    frequency_type: FrequencyType
    frequency_hours?: number
    duration_days: number
    notes?: string
  }
): Promise<{ success: true; order: IpdMedicationOrder } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()
  const orderId = crypto.randomUUID()
  const startAt = new Date()

  const { error } = await supabase.from('ipd_medication_orders').insert({
    id:              orderId,
    tenant_id:       actor.tenant_id,
    admission_id:    admissionId,
    ordered_by:      actor.id,
    type:            input.type,
    drug_name:       input.drug_name ?? null,
    dose:            input.dose ?? null,
    dose_unit:       input.dose_unit ?? null,
    route:           input.route ?? null,
    fluid_name:      input.fluid_name ?? null,
    volume_ml:       input.volume_ml ?? null,
    rate_ml_per_hr:  input.rate_ml_per_hr ?? null,
    flow_rate_lpm:   input.flow_rate_lpm ?? null,
    delivery_method: input.delivery_method ?? null,
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
      ? `${input.drug_name ?? 'Medication'} ${input.dose ?? ''}${input.dose_unit ?? ''}`.trim()
      : `${input.fluid_name ?? 'IV Fluid'} ${input.volume_ml ?? ''}ml`.trim()

    await supabase.from('ipd_pharmacy_requests').insert({
      id:           crypto.randomUUID(),
      tenant_id:    actor.tenant_id,
      order_id:     orderId,
      admission_id: admissionId,
      item_name:    itemName,
      quantity:     1,
      unit:         input.type === 'medication' ? (input.dose_unit ?? null) : 'bottle',
    })
  }

  await logAudit(actor.id, 'create', 'ipd_medication_order', orderId, { admissionId, type: input.type })

  const { data: row } = await supabase
    .from('ipd_medication_orders')
    .select('*, doctor:profiles!ordered_by(full_name)')
    .eq('id', orderId)
    .single()

  return { success: true, order: row as unknown as IpdMedicationOrder }
}

export async function stopOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()
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
      order:ipd_medication_orders(type,drug_name,fluid_name,dose,dose_unit,route,flow_rate_lpm,delivery_method),
      nurse:profiles!given_by(full_name)
    `)
    .eq('admission_id', admissionId)
    .order('due_at', { ascending: true })
  return (data ?? []) as unknown as IpdAdminSchedule[]
}

export async function updateSlotStatus(
  scheduleId: string,
  status: 'given' | 'missed' | 'held',
  notes?: string
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const supabase = await createClient()

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

  const { error } = await supabase
    .from('ipd_admin_schedule')
    .update({
      status,
      given_at:    new Date().toISOString(),
      given_by:    actor.id,
      given_notes: notes ?? null,
    })
    .eq('id', scheduleId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, `slot_${status}`, 'ipd_admin_schedule', scheduleId, { notes })
  return { success: true }
}

export async function restoreSlotToPending(scheduleId: string): Promise<SimpleResult> {
  await requireWriteAccess()
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
  return updateSlotStatus(scheduleId, 'given', notes)
}

// Extend schedule by 3 more days (called when page loads and latest slot < today+1)
export async function extendSchedule(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('ipd_medication_orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order || (order.status as string) !== 'active') return { success: true }

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
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:write')

  const supabase = await createClient()

  const { data: prx } = await supabase
    .from('prescriptions')
    .select('*')
    .in('id', prescriptionIds)
    .eq('visit_id', visitId)

  if (!prx?.length) return { success: false, error: 'No prescriptions found' }

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
        patient: adm.patient as IpdPharmacyRequest['admission'] extends undefined ? never : NonNullable<IpdPharmacyRequest['admission']>['patient'],
        ward:    adm.ward as { name: string } | undefined,
        bed:     adm.bed  as { bed_no: string } | undefined,
      } : undefined,
    }
  })
}

export async function dispenseIpdRequest(
  requestId: string,
  pricePerUnit: number,
  notes?: string
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const supabase = await createClient()

  // Fetch request details needed for auto-billing
  const { data: req } = await supabase
    .from('ipd_pharmacy_requests')
    .select('admission_id, item_name, quantity, admission:admissions(patient_id)')
    .eq('id', requestId)
    .single()

  const { error } = await supabase
    .from('ipd_pharmacy_requests')
    .update({
      status:         'dispensed',
      dispensed_by:   actor.id,
      dispensed_at:   new Date().toISOString(),
      notes:          notes ?? null,
      price_snapshot: pricePerUnit,
      billing_status: 'billed',
    })
    .eq('id', requestId)

  if (error) return { success: false, error: error.message }

  // Auto-create the IPD pharmacy bill for today
  if (req && pricePerUnit > 0) {
    const { autoIpdBill } = await import('@/lib/ipdBilling')
    const patientId = (req.admission as unknown as { patient_id: string } | null)?.patient_id
    if (patientId) {
      const today = new Date().toISOString().split('T')[0]
      await autoIpdBill(supabase, actor.id, {
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
        }],
      })
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
    .select('*, orderer:profiles!ordered_by(id,full_name), items:lab_order_items(*, test:lab_tests_catalog(*))')
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
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')

  const supabase = await createClient()
  const { data: tests } = await supabase
    .from('lab_tests_catalog').select('id, price').in('id', testIds)
  if (!tests?.length) return { success: false, error: 'No valid tests selected' }

  const priceMap = new Map(tests.map((t) => [t.id as string, t.price as number]))
  const orderId = crypto.randomUUID()

  const { error: orderErr } = await supabase.from('lab_orders').insert({
    id: orderId, tenant_id: actor.tenant_id,
    patient_id: patientId, admission_id: admissionId,
    ordered_by: actor.id, status: 'ordered', billing_status: 'unbilled',
    priority, scheduled_for: scheduledFor ?? new Date().toISOString().split('T')[0],
  })
  if (orderErr) return { success: false, error: orderErr.message }

  const items = testIds.map((test_id) => ({
    id: crypto.randomUUID(), tenant_id: actor.tenant_id,
    lab_order_id: orderId, test_id,
    price_snapshot: priceMap.get(test_id) ?? 0, flag: 'pending',
  }))
  const { error: itemErr } = await supabase.from('lab_order_items').insert(items)
  if (itemErr) return { success: false, error: itemErr.message }

  await logAudit(actor.id, 'create', 'lab_order', orderId, { admissionId, count: testIds.length })
  return { success: true, orderId }
}

export async function cancelIpdLabOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'lab:order')
  const supabase = await createClient()
  const { error } = await supabase.from('lab_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel', 'lab_order', orderId, {})
  return { success: true }
}

export async function listLabCatalogForIpd(): Promise<LabTestCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('lab_tests_catalog').select('*').eq('is_active', true).order('name')
  return (data ?? []) as LabTestCatalog[]
}

// ── IPD Radiology orders ──────────────────────────────────────────────────────

export async function listIpdRadiologyOrders(admissionId: string): Promise<RadiologyOrder[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('radiology_orders')
    .select('*, orderer:profiles!ordered_by(id,full_name), test:radiology_catalog(*)')
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
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')

  const supabase = await createClient()
  const { data: test } = await supabase
    .from('radiology_catalog').select('price').eq('id', testId).single()
  if (!test) return { success: false, error: 'Scan not found in catalog' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('radiology_orders').insert({
    id, tenant_id: actor.tenant_id,
    patient_id: patientId, admission_id: admissionId,
    test_id: testId, ordered_by: actor.id,
    price_snapshot: test.price as number,
    status: 'ordered', billing_status: 'unbilled',
    report: notes ?? null,
    priority, scheduled_for: scheduledFor ?? new Date().toISOString().split('T')[0],
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'radiology_order', id, { admissionId, testId })
  return { success: true, orderId: id }
}

export async function cancelIpdRadiologyOrder(orderId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'radiology:order')
  const supabase = await createClient()
  const { error } = await supabase.from('radiology_orders').update({ status: 'cancelled' }).eq('id', orderId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'cancel', 'radiology_order', orderId, {})
  return { success: true }
}

export async function listRadiologyCatalogForIpd(): Promise<RadiologyCatalog[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('radiology_catalog').select('*').eq('is_active', true).order('name')
  return (data ?? []) as RadiologyCatalog[]
}
