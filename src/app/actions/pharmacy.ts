'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { DrugSchema, DrugBatchSchema, DispenseSchema } from '@/lib/schemas'
import type { Drug, DrugBatch, DrugWithStock, Dispense, PrescriptionWithVisit } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Drug catalog ----

export async function createDrug(
  input: Record<string, unknown>
): Promise<{ success: true; drug: Drug } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const parsed = DrugSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('drugs').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'drug', id, { name: parsed.data.name })
  const { data: drug } = await supabase.from('drugs').select('*').eq('id', id).single()
  return { success: true, drug: drug as Drug }
}

export async function updateDrug(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const parsed = DrugSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('drugs').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'drug', id)
  return { success: true }
}

export async function addBatch(
  input: Record<string, unknown>
): Promise<{ success: true; batch: DrugBatch } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const parsed = DrugBatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('drug_batches').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add_batch', 'drug', parsed.data.drug_id, {
    batch_no: parsed.data.batch_no, qty: parsed.data.qty_available,
  })
  const { data: batch } = await supabase.from('drug_batches').select('*').eq('id', id).single()
  return { success: true, batch: batch as DrugBatch }
}

export async function listDrugs(): Promise<Drug[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('drugs').select('*').eq('is_active', true).order('name')
  return (data ?? []) as Drug[]
}

// ---- Stock ----

export async function getStock(): Promise<DrugWithStock[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: drugs } = await supabase
    .from('drugs').select('*').eq('is_active', true).order('name')
  if (!drugs?.length) return []

  const { data: batches } = await supabase
    .from('drug_batches')
    .select('*')
    .in('drug_id', drugs.map((d) => d.id))
    .gt('expiry', today)
    .gt('qty_available', 0)
    .order('expiry', { ascending: true })

  const batchesByDrug = new Map<string, DrugBatch[]>()
  for (const b of (batches ?? [])) {
    const list = batchesByDrug.get(b.drug_id) ?? []
    list.push(b as DrugBatch)
    batchesByDrug.set(b.drug_id, list)
  }

  return drugs.map((d) => {
    const dBatches = batchesByDrug.get(d.id) ?? []
    const total_qty = dBatches.reduce((s, b) => s + b.qty_available, 0)
    return { ...(d as Drug), total_qty, batches: dBatches }
  })
}

export interface PharmacyAlerts {
  lowStock: DrugWithStock[]
  nearExpiry: (DrugBatch & { drug_name: string })[]
  expired: (DrugBatch & { drug_name: string })[]
}

export async function getAlerts(): Promise<PharmacyAlerts> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const stock = await getStock()
  const lowStock = stock.filter((d) => d.total_qty <= d.reorder_level)

  const { data: nearRaw } = await supabase
    .from('drug_batches')
    .select('*, drug:drugs(name)')
    .gt('expiry', today).lte('expiry', in30).gt('qty_available', 0)
    .order('expiry')

  const { data: expiredRaw } = await supabase
    .from('drug_batches')
    .select('*, drug:drugs(name)')
    .lte('expiry', today).gt('qty_available', 0)
    .order('expiry')

  const mapBatch = (b: Record<string, unknown>) => ({
    ...(b as unknown as DrugBatch),
    drug_name: (b.drug as { name: string } | null)?.name ?? '—',
  })

  return {
    lowStock,
    nearExpiry: (nearRaw ?? []).map(mapBatch),
    expired: (expiredRaw ?? []).map(mapBatch),
  }
}

// ---- Pending prescriptions ----

export async function listPendingPrescriptions(): Promise<PrescriptionWithVisit[]> {
  const supabase = await createClient()

  // Phase 10 dropped the prescriptions→visits FK (visits became partitioned; CASCADE removed the
  // constraint). We query the two tables separately and merge in code.
  const [{ data: prescriptions }, { data: dispensed }] = await Promise.all([
    supabase
      .from('prescriptions')
      .select('id, visit_id, drug_name, dosage, frequency, duration, instructions')
      .order('id')
      .limit(200),
    supabase
      .from('dispenses')
      .select('prescription_id')
      .not('prescription_id', 'is', null),
  ])

  if (!prescriptions?.length) return []

  // Filter out already-dispensed prescriptions
  const dispensedSet = new Set((dispensed ?? []).map((d) => d.prescription_id as string))
  const undispensed = prescriptions.filter((p) => !dispensedSet.has(p.id))
  if (!undispensed.length) return []

  // Fetch visit info (patient + date) using the unique visit IDs
  const visitIds = [...new Set(undispensed.map((p) => p.visit_id).filter(Boolean))]
  const { data: visits } = await supabase
    .from('visits')
    .select('id, visit_date, patient_id, patient:patients(full_name, uhid)')
    .in('id', visitIds)

  type VisitRow = { id: string; visit_date: string; patient_id: string; patient: { full_name: string; uhid: string } | null }
  const visitMap = new Map<string, VisitRow>((visits ?? []).map((v) => [v.id, v as unknown as VisitRow]))

  return undispensed.map((p) => {
    const v = visitMap.get(p.visit_id)
    return {
      id: p.id,
      visit_id: p.visit_id,
      drug_name: p.drug_name,
      dosage: p.dosage ?? null,
      frequency: p.frequency ?? null,
      duration: p.duration ?? null,
      instructions: p.instructions ?? null,
      visit_date: v?.visit_date ?? '',
      patient_id: v?.patient_id ?? '',
      patient_name: v?.patient?.full_name ?? '—',
      patient_uhid: v?.patient?.uhid ?? '—',
    }
  })
}

// ---- Dispense ----

export async function dispense(
  input: Record<string, unknown>
): Promise<{ success: true; dispenseId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const parsed = DispenseSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, prescription_id, admission_id, drug_id, qty } = parsed.data
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // FEFO: pick earliest non-expired batch with enough stock
  const { data: batches } = await supabase
    .from('drug_batches')
    .select('id, mrp, expiry, qty_available')
    .eq('drug_id', drug_id)
    .gt('expiry', today)
    .gte('qty_available', qty)
    .order('expiry', { ascending: true })
    .limit(1)

  if (!batches?.length) {
    return { success: false, error: 'Insufficient stock or no valid batch available' }
  }

  const batch = batches[0]
  const dispenseId = crypto.randomUUID()

  const { data: result, error: rpcErr } = await supabase.rpc('dispense_drug', {
    p_dispense_id:     dispenseId,
    p_patient_id:      patient_id,
    p_prescription_id: prescription_id ?? null,
    p_drug_id:         drug_id,
    p_batch_id:        batch.id,
    p_qty:             qty,
    p_price_snapshot:  batch.mrp,
    p_dispensed_by:    actor.id,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Dispense failed' }

  // Link dispense to IPD admission if provided
  if (admission_id) {
    await supabase.from('dispenses').update({ admission_id }).eq('id', dispenseId)
  }

  await logAudit(actor.id, 'dispense', 'drug', drug_id, {
    patient_id, qty, batch_id: batch.id, price: batch.mrp, admission_id: admission_id ?? null,
  })
  return { success: true, dispenseId }
}

// Auto-generate one combined bill for all dispenses of a patient (called after "All Packed").
// Requires pharmacy:dispense (not billing:write) — pharmacist can trigger this.
export async function generatePharmacyBill(params: {
  patientId: string
  dispenseIds: string[]
}): Promise<{ success: true; billId: string; billNo: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const { patientId, dispenseIds } = params
  if (!dispenseIds.length) return { success: false, error: 'No dispenses provided' }

  const supabase = await createClient()

  // Load each dispense row (still unbilled) + drug name
  const { data: rows, error: rowErr } = await supabase
    .from('dispenses')
    .select('id, qty, price_snapshot, drug:drugs(name)')
    .in('id', dispenseIds)
    .eq('billing_status', 'unbilled')

  if (rowErr) return { success: false, error: rowErr.message }
  if (!rows?.length) return { success: false, error: 'No unbilled dispenses found — they may already be billed' }

  const subtotal = rows.reduce((s, r) => s + (r.qty as number) * (r.price_snapshot as number), 0)

  const { data: billNoData, error: billNoErr } = await supabase.rpc('get_next_bill_no')
  if (billNoErr || !billNoData) return { success: false, error: 'Failed to generate bill number' }

  const billId = crypto.randomUUID()
  const billNo = billNoData as string

  const { error: billErr } = await supabase.from('bills').insert({
    id: billId,
    tenant_id: actor.tenant_id,
    patient_id: patientId,
    bill_no: billNo,
    subtotal,
    discount: 0,
    tax: 0,
    total: subtotal,
    paid: 0,
    status: 'unpaid',
    created_by: actor.id,
  })
  if (billErr) return { success: false, error: billErr.message }

  const { error: itemErr } = await supabase.from('bill_items').insert(
    rows.map((r) => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      bill_id: billId,
      source: 'pharmacy',
      ref_id: r.id,
      description: (r.drug as unknown as { name: string } | null)?.name ?? 'Medication',
      qty: r.qty as number,
      unit_price: r.price_snapshot as number,
      amount: (r.qty as number) * (r.price_snapshot as number),
    }))
  )
  if (itemErr) {
    await supabase.from('bills').delete().eq('id', billId)
    return { success: false, error: itemErr.message }
  }

  // Mark all dispenses as billed (double-bill guard)
  await supabase
    .from('dispenses')
    .update({ billing_status: 'billed' })
    .in('id', dispenseIds)
    .eq('billing_status', 'unbilled')

  await logAudit(actor.id, 'generate', 'pharmacy_bill', billId, {
    patient_id: patientId, dispense_count: rows.length, subtotal,
  })
  return { success: true, billId, billNo }
}

// ---- Dispatch (post-payment handover) ----

export type AwaitingDispatchPatient = {
  patient_id: string
  patient_name: string
  patient_uhid: string
  dispense_ids: string[]
  drug_names: string[]
  bill: { id: string; bill_no: string; status: string; total: number; paid: number } | null
}

export async function checkBillStatus(
  billId: string
): Promise<{ id: string; status: string; total: number; paid: number } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bills').select('id, status, total, paid').eq('id', billId).single()
  if (!data) return null
  return { id: data.id as string, status: data.status as string, total: data.total as number, paid: data.paid as number }
}

export async function dispatchMedicines(params: {
  patientId: string
  dispenseIds: string[]
  billId: string
}): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')
  const { patientId, dispenseIds, billId } = params

  const supabase = await createClient()

  // Guard: bill must be paid (or partial) before dispatch
  const { data: bill } = await supabase.from('bills').select('status').eq('id', billId).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if (bill.status !== 'paid') {
    return { success: false, error: `Cannot dispatch — bill is "${bill.status}". Full payment must be received before dispatch.` }
  }

  const { error } = await supabase
    .from('dispenses')
    .update({ dispatched_at: new Date().toISOString() })
    .in('id', dispenseIds)
    .is('dispatched_at', null)

  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'dispatch', 'medicines', patientId, {
    dispense_count: dispenseIds.length, bill_id: billId,
  })
  return { success: true }
}

// Returns patients who have packed (dispensed) but not dispatched medicines — persists across page refresh.
// Excludes patients still in packing phase (those appear in listPendingPrescriptions).
export async function listPackedAwaitingDispatch(): Promise<AwaitingDispatchPatient[]> {
  const supabase = await createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data: dispenses } = await supabase
    .from('dispenses')
    .select('id, patient_id, drug_id')
    .is('dispatched_at', null)
    .gte('dispensed_at', sevenDaysAgo)
    .order('dispensed_at', { ascending: false })

  if (!dispenses?.length) return []

  // Group by patient
  const dispenseIdsByPatient = new Map<string, string[]>()
  const drugIdsByPatient = new Map<string, string[]>()
  for (const d of dispenses) {
    const pid = d.patient_id as string
    dispenseIdsByPatient.set(pid, [...(dispenseIdsByPatient.get(pid) ?? []), d.id as string])
    drugIdsByPatient.set(pid, [...(drugIdsByPatient.get(pid) ?? []), d.drug_id as string])
  }

  const patientIds = [...dispenseIdsByPatient.keys()]

  // Filter: only include patients with NO undispensed prescriptions (fully packed)
  const { data: undispensedRxs } = await supabase
    .from('prescriptions')
    .select('patient_id, id')
    .in('patient_id', patientIds)

  if (undispensedRxs?.length) {
    const dispensedRxIds = new Set(
      (await supabase.from('dispenses').select('prescription_id').not('prescription_id', 'is', null))
        .data?.map((d) => d.prescription_id as string) ?? []
    )
    // Patients with at least one undispensed prescription → still packing, exclude from this list
    const stillPackingPatients = new Set(
      undispensedRxs.filter((rx) => !dispensedRxIds.has(rx.id as string)).map((rx) => rx.patient_id as string)
    )
    for (const pid of stillPackingPatients) patientIds.splice(patientIds.indexOf(pid), 1)
  }

  if (!patientIds.length) return []

  const allDrugIds = [...new Set(dispenses.filter(d => patientIds.includes(d.patient_id as string)).map(d => d.drug_id as string))]

  const [{ data: patients }, { data: drugs }, { data: bills }] = await Promise.all([
    supabase.from('patients').select('id, full_name, uhid').in('id', patientIds),
    supabase.from('drugs').select('id, name').in('id', allDrugIds),
    supabase.from('bills').select('id, patient_id, bill_no, status, total, paid')
      .in('patient_id', patientIds)
      .in('status', ['unpaid', 'partial', 'paid'])
      .order('created_at', { ascending: false }),
  ])

  const patientMap = new Map((patients ?? []).map((p) => [p.id as string, p]))
  const drugNameMap = new Map((drugs ?? []).map((d) => [d.id as string, d.name as string]))

  // First bill per patient (most recent unpaid/partial/paid)
  const billByPatient = new Map<string, { id: string; bill_no: string; status: string; total: number; paid: number }>()
  for (const b of (bills ?? [])) {
    if (!billByPatient.has(b.patient_id as string)) {
      billByPatient.set(b.patient_id as string, {
        id: b.id as string, bill_no: b.bill_no as string, status: b.status as string,
        total: b.total as number, paid: b.paid as number,
      })
    }
  }

  return patientIds.map((pid) => {
    const p = patientMap.get(pid)
    const drugIds = [...new Set(drugIdsByPatient.get(pid) ?? [])]
    return {
      patient_id: pid,
      patient_name: (p?.full_name as string) ?? '—',
      patient_uhid: (p?.uhid as string) ?? '—',
      dispense_ids: dispenseIdsByPatient.get(pid) ?? [],
      drug_names: drugIds.map((id) => drugNameMap.get(id) ?? '—'),
      bill: billByPatient.get(pid) ?? null,
    }
  })
}

export async function getFefoPreview(
  drugId: string, qty: number
): Promise<{ batch: DrugBatch; price: number } | null> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data: batches } = await supabase
    .from('drug_batches')
    .select('*')
    .eq('drug_id', drugId)
    .gt('expiry', today)
    .gte('qty_available', qty)
    .order('expiry', { ascending: true })
    .limit(1)
  if (!batches?.length) return null
  const b = batches[0] as DrugBatch
  return { batch: b, price: b.mrp * qty }
}
