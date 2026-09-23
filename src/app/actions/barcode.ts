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
// What each printed code carries:
//   ID card / wristband QR   → patient UHID (admitted patients open their admission)
//   tube label Code 128      → lab accession no + 2-digit tube no (e.g. 260917001201)
//   older labels             → lab order UUID
// Lookups run under RLS, so a code only resolves inside the scanning user's hospital.

export async function resolveBarcodeScan(
  value: string
): Promise<
  | { type: 'patient'; id: string; name: string; uhid: string; admissionId: string | null }
  | { type: 'lab_order'; id: string; patientName: string }
  | { type: 'not_found' }
> {
  const supabase = await createClient()
  const trimmed = value.trim()

  // 1. UHID (case-insensitive: some keyboard-wedge scanners send lower case)
  const { data: patient } = await supabase
    .from('patients')
    .select('id, uhid, full_name')
    .ilike('uhid', trimmed.replace(/[%_\\]/g, '\\$&'))
    .maybeSingle()

  if (patient) {
    const { data: adm } = await supabase
      .from('admissions')
      .select('id')
      .eq('patient_id', patient.id)
      .eq('status', 'admitted')
      .order('admitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { type: 'patient', id: patient.id as string, name: patient.full_name as string, uhid: patient.uhid as string, admissionId: (adm?.id as string | undefined) ?? null }
  }

  const labOrder = async (column: 'id' | 'accession_no', v: string) => {
    const { data: order } = await supabase
      .from('lab_orders')
      .select('id, patient:patients(id, full_name)')
      .eq(column, v)
      .maybeSingle()
    if (!order) return null
    const p = order.patient as unknown as { id: string; full_name: string } | null
    return { type: 'lab_order' as const, id: order.id as string, patientName: p?.full_name ?? 'Unknown' }
  }

  // 2. Tube label: accession no + 2-digit tube no; also accept the accession no typed on its own.
  if (/^\d{10,}$/.test(trimmed)) {
    const found = (await labOrder('accession_no', trimmed.slice(0, -2))) ?? (await labOrder('accession_no', trimmed))
    if (found) return found
  }

  // 3. Older labels encoded the lab order UUID
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (UUID_RE.test(trimmed)) {
    const found = await labOrder('id', trimmed)
    if (found) return found
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
    .select(`*, patient:patients(id, full_name, uhid), orderer:profiles!ordered_by(id, full_name), items:lab_order_items(*, test:lab_tests_catalog(*))`)
    .eq('id', labOrderId)
    .single()
  return data as LabOrder | null
}
