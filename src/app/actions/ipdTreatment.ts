'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type {
  IpdMedicationOrder, IpdAdminSchedule, FrequencyType, IpdPharmacyRequest,
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
  days = 3
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
    .select('*, doctor:profiles!ordered_by(full_name)')
    .eq('admission_id', admissionId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as IpdMedicationOrder[]
}

export async function createOrder(
  admissionId: string,
  input: {
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
    start_at:        startAt.toISOString(),
    notes:           input.notes ?? null,
  })
  if (error) return { success: false, error: error.message }

  // Auto-generate administration schedule slots
  const slots = makeSlots(
    actor.tenant_id, orderId, admissionId,
    input.frequency_type, input.frequency_hours ?? null, startAt
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
    .order('due_at', { ascending: false })
  return (data ?? []) as unknown as IpdAdminSchedule[]
}

export async function markGiven(
  scheduleId: string,
  notes?: string
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:nursing')

  const supabase = await createClient()
  const { error } = await supabase
    .from('ipd_admin_schedule')
    .update({
      status:     'given',
      given_at:   new Date().toISOString(),
      given_by:   actor.id,
      given_notes: notes ?? null,
    })
    .eq('id', scheduleId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'mark_given', 'ipd_admin_schedule', scheduleId, { notes })
  return { success: true }
}

// Extend schedule by 3 more days (called when page loads and latest slot < today+1)
export async function extendSchedule(orderId: string): Promise<SimpleResult> {
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
    new Date(lastDue.getTime() + 1), // start from after last slot
  )

  if (slots.length > 0) await supabase.from('ipd_admin_schedule').insert(slots)
  return { success: true }
}

// ── Copy from OPD visit ──────────────────────────────────────────────────────

export async function getVisitPrescriptions(
  patientId: string
): Promise<Array<{ visitId: string; visitDate: string; prescriptions: Array<{ id: string; drug_name: string; dosage: string | null; frequency: string | null; instructions: string | null }> }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('visits')
    .select('id, created_at, prescriptions(id, drug_name, dosage, frequency, instructions)')
    .eq('patient_id', patientId)
    .eq('status', 'closed')
    .not('prescriptions', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5)

  return (data ?? [])
    .filter((v) => (v.prescriptions as unknown[]).length > 0)
    .map((v) => ({
      visitId:   v.id as string,
      visitDate: v.created_at as string,
      prescriptions: v.prescriptions as Array<{ id: string; drug_name: string; dosage: string | null; frequency: string | null; instructions: string | null }>,
    }))
}

export async function copyPrescriptionsToIPD(
  admissionId: string,
  visitId: string,
  prescriptionIds: string[]
): Promise<{ success: true; count: number } | { success: false; error: string }> {
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
      start_at:      startAt.toISOString(),
      notes:         p.instructions as string | null,
      copied_from_visit_id: visitId,
    })

    const slots = makeSlots(actor.tenant_id, orderId, admissionId, 'daily', null, startAt)
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
  notes?: string
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const supabase = await createClient()
  const { error } = await supabase
    .from('ipd_pharmacy_requests')
    .update({
      status:        'dispensed',
      dispensed_by:  actor.id,
      dispensed_at:  new Date().toISOString(),
      notes:         notes ?? null,
    })
    .eq('id', requestId)

  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'dispense', 'ipd_pharmacy_request', requestId, {})
  return { success: true }
}
