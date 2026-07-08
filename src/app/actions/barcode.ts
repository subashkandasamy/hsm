'use server'

import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import type { Patient, LabOrder } from '@/lib/types'

// ── Stamp wristband printed + audit ─────────────────────────────────────────

export async function stampWristbandPrinted(
  patientId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'barcode:print:patient')
  const supabase = await createClient()

  const { data: patient } = await supabase
    .from('patients')
    .select('uhid, full_name')
    .eq('id', patientId)
    .single()

  if (!patient) return { success: false, error: 'Patient not found' }

  await supabase
    .from('patients')
    .update({ wristband_printed_at: new Date().toISOString() })
    .eq('id', patientId)

  await logAudit(actor.id, 'print', 'barcode_wristband', patientId, {
    uhid: patient.uhid,
    full_name: patient.full_name,
  })

  return { success: true }
}

// ── Stamp sample label printed + audit ──────────────────────────────────────

export async function stampSampleLabelPrinted(
  labOrderId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'barcode:print:sample')
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('lab_orders')
    .select('id, patient:patients(uhid), items:lab_order_items(test:lab_tests_catalog(name))')
    .eq('id', labOrderId)
    .single()

  if (!order) return { success: false, error: 'Lab order not found' }

  await supabase
    .from('lab_orders')
    .update({ sample_label_printed_at: new Date().toISOString() })
    .eq('id', labOrderId)

  const patient = order.patient as unknown as { uhid: string } | null
  const items = order.items as unknown as Array<{ test: { name: string } | null }> | null
  const testNames = (items ?? []).map((i) => i.test?.name).filter(Boolean).join(', ')

  await logAudit(actor.id, 'print', 'barcode_sample', labOrderId, {
    patient_uhid: patient?.uhid,
    tests: testNames,
  })

  return { success: true }
}

// ── Resolve a scanned barcode value ─────────────────────────────────────────
// Returns the route to navigate to, or null if not found.

export async function resolveBarcodeScan(
  value: string
): Promise<
  | { type: 'patient'; id: string; name: string; uhid: string }
  | { type: 'lab_order'; id: string; patientName: string }
  | { type: 'not_found' }
> {
  const supabase = await createClient()
  const trimmed = value.trim()

  // 1. Try UHID match (patients.uhid)
  const { data: patient } = await supabase
    .from('patients')
    .select('id, uhid, full_name')
    .eq('uhid', trimmed)
    .maybeSingle()

  if (patient) {
    return { type: 'patient', id: patient.id as string, name: patient.full_name as string, uhid: patient.uhid as string }
  }

  // 2. Try lab order UUID match
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (UUID_RE.test(trimmed)) {
    const { data: order } = await supabase
      .from('lab_orders')
      .select('id, patient:patients(id, full_name)')
      .eq('id', trimmed)
      .maybeSingle()

    if (order) {
      const p = order.patient as unknown as { id: string; full_name: string } | null
      return { type: 'lab_order', id: order.id as string, patientName: p?.full_name ?? 'Unknown' }
    }
  }

  return { type: 'not_found' }
}

// ── Fetch full patient data for wristband label ───────────────────────────

export async function getPatientForWristband(patientId: string): Promise<Patient | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()
  return data as Patient | null
}

// ── Fetch full lab order data for sample label ───────────────────────────

export async function getLabOrderForLabel(labOrderId: string): Promise<LabOrder | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_orders')
    .select(`*, patient:patients(id, full_name, uhid), orderer:profiles(id, full_name), items:lab_order_items(*, test:lab_tests_catalog(*))`)
    .eq('id', labOrderId)
    .single()
  return data as LabOrder | null
}
