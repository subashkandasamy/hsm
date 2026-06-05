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
  const { error } = await supabase.from('drugs').insert({ id, ...parsed.data })
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
  const { error } = await supabase.from('drug_batches').insert({ id, ...parsed.data })
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
  const { data } = await supabase
    .from('prescriptions')
    .select(`
      *,
      visits!prescriptions_visit_id_fkey(visit_date, patient_id,
        patients(full_name, uhid))
    `)
    .is('id', null)  // placeholder — replaced below
    .limit(0)

  // Proper query: prescriptions with no dispense row
  const { data: rows } = await supabase.rpc('list_pending_prescriptions' as string).limit(200)
  // Fallback: direct query with not exists (Supabase JS doesn't natively support NOT EXISTS,
  // so we do a left join and filter null)
  const { data: pending } = await supabase
    .from('prescriptions')
    .select(`
      id, visit_id, drug_name, dosage, frequency, duration, instructions,
      visits!prescriptions_visit_id_fkey(visit_date, patient_id,
        patients(full_name, uhid))
    `)
    .order('id')
    .limit(200)

  if (!pending) return []

  // Filter out already dispensed (have a dispense row with this prescription_id)
  const { data: dispensed } = await supabase
    .from('dispenses').select('prescription_id').not('prescription_id', 'is', null)

  const dispensedSet = new Set((dispensed ?? []).map((d) => d.prescription_id))

  return (pending as Record<string, unknown>[])
    .filter((p) => !dispensedSet.has(p.id as string))
    .map((p) => {
      const visit = p.visits as Record<string, unknown> | null
      const patient = visit?.patients as Record<string, unknown> | null
      return {
        id: p.id as string,
        visit_id: p.visit_id as string,
        drug_name: p.drug_name as string,
        dosage: p.dosage as string | null,
        frequency: p.frequency as string | null,
        duration: p.duration as string | null,
        instructions: p.instructions as string | null,
        visit_date: visit?.visit_date as string ?? '',
        patient_id: visit?.patient_id as string ?? '',
        patient_name: patient?.full_name as string ?? '—',
        patient_uhid: patient?.uhid as string ?? '—',
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

  const { patient_id, prescription_id, drug_id, qty } = parsed.data
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

  await logAudit(actor.id, 'dispense', 'drug', drug_id, {
    patient_id, qty, batch_id: batch.id, price: batch.mrp,
  })
  return { success: true, dispenseId }
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
