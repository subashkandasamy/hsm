'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { z } from 'zod'
import type { DentalTooth, DentalTreatment, DentalRecall, ToothStatus } from '@/lib/types'
import { istToday, istAddDays } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }

const ALL_TEETH = Array.from({ length: 32 }, (_, i) => i + 1)

// Map procedures to resulting tooth status
const PROCEDURE_STATUS_MAP: Record<string, ToothStatus> = {
  filling:    'filled',
  extraction: 'extracted',
  root_canal: 'root_canal',
  crown:      'crowned',
  implant:    'implant',
}

export async function getDentalChart(patientId: string): Promise<DentalTooth[]> {
  await requirePermission((await getActorProfile()).role, 'dental:read')
  const supabase = await createClient()

  const { data } = await supabase
    .from('patient_dental_chart')
    .select('tooth_number, current_status')
    .eq('patient_id', patientId)

  const existing = new Map((data ?? []).map((r) => [r.tooth_number as number, r.current_status as ToothStatus]))

  return ALL_TEETH.map((n) => ({
    tooth_number:   n,
    current_status: existing.get(n) ?? 'healthy',
  }))
}

export async function setToothStatus(
  patientId: string,
  toothNumber: number,
  status: ToothStatus
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dental:write')

  const supabase = await createClient()
  const { error } = await supabase.from('patient_dental_chart').upsert({
    id:             crypto.randomUUID(),
    tenant_id:      actor.tenant_id,
    patient_id:     patientId,
    tooth_number:   toothNumber,
    current_status: status,
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'patient_id,tooth_number' })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'dental_chart', patientId, { tooth_number: toothNumber, status })
  return { success: true }
}

const AddTreatmentSchema = z.object({
  visitId:       z.string().uuid(),
  patientId:     z.string().uuid(),
  toothNumber:   z.number().int().min(1).max(32).nullable().optional(),
  procedure:     z.string().min(1),
  notes:         z.string().optional(),
  priceSnapshot: z.number().min(0),
})

export async function addTreatment(
  input: Record<string, unknown>
): Promise<{ success: true; treatment: DentalTreatment } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dental:write')

  const parsed = AddTreatmentSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { visitId, patientId, toothNumber, procedure, notes, priceSnapshot } = parsed.data
  const supabase = await createClient()
  const id = crypto.randomUUID()

  const { error } = await supabase.from('dental_treatments').insert({
    id,
    tenant_id:      actor.tenant_id,
    visit_id:       visitId,
    patient_id:     patientId,
    tooth_number:   toothNumber ?? null,
    procedure,
    notes:          notes ?? null,
    price_snapshot: priceSnapshot,
    billing_status: 'unbilled',
  })
  if (error) return { success: false, error: error.message }

  // If procedure implies a status change, update the chart
  const impliedStatus = PROCEDURE_STATUS_MAP[procedure]
  if (impliedStatus && toothNumber) {
    await setToothStatus(patientId, toothNumber, impliedStatus)
  }

  await logAudit(actor.id, 'create', 'dental_treatment', id, { visitId, patientId, procedure, toothNumber })

  return {
    success: true,
    treatment: {
      id, visit_id: visitId, patient_id: patientId,
      tooth_number: toothNumber ?? null, procedure,
      notes: notes ?? null, price_snapshot: priceSnapshot,
      billing_status: 'unbilled',
      created_at: new Date().toISOString(),
    },
  }
}

export async function listTreatmentHistory(patientId: string): Promise<DentalTreatment[]> {
  await requirePermission((await getActorProfile()).role, 'dental:read')
  const supabase = await createClient()
  const { data } = await supabase
    .from('dental_treatments')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
  return (data ?? []) as DentalTreatment[]
}

const RecallSchema = z.object({
  patientId:  z.string().uuid(),
  recallDate: z.string(),
  reason:     z.string().optional(),
})

export async function scheduleRecall(
  input: Record<string, unknown>
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dental:write')

  const parsed = RecallSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('dental_recalls').insert({
    id,
    tenant_id:   actor.tenant_id,
    patient_id:  parsed.data.patientId,
    recall_date: parsed.data.recallDate,
    reason:      parsed.data.reason ?? null,
    status:      'pending',
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'dental_recall', id, { patientId: parsed.data.patientId, date: parsed.data.recallDate })
  return { success: true }
}

export async function listDueRecalls(): Promise<DentalRecall[]> {
  await requirePermission((await getActorProfile()).role, 'dental:read')
  const supabase = await createClient()

  const today = istToday()
  const nextWeek = istAddDays(istToday(), 7)

  const { data } = await supabase
    .from('dental_recalls')
    .select('*, patient:patients(id,full_name,uhid,phone)')
    .eq('status', 'pending')
    .gte('recall_date', today)
    .lte('recall_date', nextWeek)
    .order('recall_date')

  return (data ?? []) as unknown as DentalRecall[]
}

export async function markRecallNotified(recallId: string): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dental:write')

  const supabase = await createClient()
  const { error } = await supabase
    .from('dental_recalls')
    .update({ status: 'notified' })
    .eq('id', recallId)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'dental_recall', recallId, { status: 'notified' })
  return { success: true }
}
