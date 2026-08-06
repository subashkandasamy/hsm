'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { isBillCashlessCovered } from '@/lib/cashlessCover'
import { DrugSchema, DrugBatchSchema, DispenseSchema } from '@/lib/schemas'
import type { Drug, DrugBatch, DrugWithStock, Dispense, PrescriptionWithVisit } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Drug catalog ----

// Creates a tenant-specific custom drug (Growth plan only — requires pharmacy:manage).
// Starter plan tenants use drug_master global catalog instead.
export async function createDrug(
  input: Record<string, unknown>
): Promise<{ success: true; drug: Drug } | { success: false; error: string }> {
  await requireWriteAccess()
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
  await requireWriteAccess()
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

export async function updateBatch(
  batchId: string,
  input: { batch_no?: string; expiry?: string; qty_available?: number; mrp?: number; purchase_price?: number | null; storage_location?: string | null }
): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const supabase = await createClient()
  const { error } = await supabase.from('drug_batches').update(input).eq('id', batchId)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'drug_batch', batchId, input)
  return { success: true }
}

export async function updateDrugReorderLevel(drugId: string, reorderLevel: number): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const supabase = await createClient()
  // drug_master rows (is_global) have no tenant-scoped reorder_level column on drug_master;
  // they store it on drug_batches. For tenant drugs, update the drugs table directly.
  const { data: drug } = await supabase.from('drugs').select('id').eq('id', drugId).maybeSingle()
  if (drug) {
    const { error } = await supabase.from('drugs').update({ reorder_level: reorderLevel }).eq('id', drugId)
    if (error) return { success: false, error: error.message }
  } else {
    // Global drug — drug_master has no reorder_level column; persist it on the drug's batches
    // (getStock() derives reorder_level for master drugs from drug_batches.reorder_level)
    const { error } = await supabase
      .from('drug_batches')
      .update({ reorder_level: reorderLevel })
      .eq('drug_master_id', drugId)
    if (error) return { success: false, error: error.message }
  }
  await logAudit(actor.id, 'update', 'drug', drugId, { reorder_level: reorderLevel })
  return { success: true }
}

// Adds a stock batch. Accepts drug_master_id (global drug) OR drug_id (tenant custom drug).
export async function addBatch(
  input: Record<string, unknown>
): Promise<{ success: true; batch: DrugBatch } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  const parsed = DrugBatchSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('drug_batches').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'add_batch', 'drug', parsed.data.drug_master_id ?? parsed.data.drug_id ?? id, {
    batch_no: parsed.data.batch_no, qty: parsed.data.qty_available,
  })
  const { data: batch } = await supabase.from('drug_batches').select('*').eq('id', id).single()
  return { success: true, batch: batch as DrugBatch }
}

// Returns unified drug list: global drug_master + this tenant's custom drugs.
// drug_master drugs have is_global=true; tenant drugs have is_global=false.
export async function listDrugs(): Promise<Drug[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()

  type BrandRow = {
    brand_name: string; manufacturer: string | null
    hsn_code: string | null; gst_rate: number | null
    pack_size: number | null; pack_unit: string | null
  }

  const [{ data: masterDrugs }, { data: tenantDrugs }] = await Promise.all([
    supabase.from('drug_master')
      .select('id, name, generic_name, form, strength, unit, is_active, drug_brands(brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit)')
      .eq('is_active', true).order('name'),
    supabase.from('drugs').select('id, name, generic_name, form, strength, unit, reorder_level, is_active').eq('is_active', true).order('name'),
  ])

  const global: Drug[] = (masterDrugs ?? []).map(d => {
    const brands = ((d as Record<string, unknown>).drug_brands as BrandRow[] | null) ?? []
    return {
      id: d.id as string,
      name: d.name as string,
      generic_name: (d.generic_name as string | null) ?? null,
      form: (d.form as string | null) ?? null,
      strength: (d.strength as string | null) ?? null,
      unit: (d.unit as string | null) ?? null,
      is_active: true,
      is_global: true,
      brand_aliases: brands.map(b => b.brand_name),
      brand_data: brands,
    }
  })

  const tenant: Drug[] = (tenantDrugs ?? []).map(d => ({
    id: d.id as string,
    name: d.name as string,
    generic_name: (d.generic_name as string | null) ?? null,
    form: (d.form as string | null) ?? null,
    strength: (d.strength as string | null) ?? null,
    unit: (d.unit as string | null) ?? null,
    reorder_level: (d.reorder_level as number) ?? 0,
    is_active: true,
    is_global: false,
  }))

  // Merge: global drugs first, then tenant-specific (deduplication not needed — different IDs)
  return [...global, ...tenant]
}

// Server-side drug typeahead. The global catalogue holds ~15k molecules and
// ~250k brands, so we never ship the whole list to the client — components call
// this as the user types. Matches molecule name/generic AND brand name (people
// mostly search by brand), returns molecules with a bounded set of brands.
export async function searchDrugs(query: string, limit = 20): Promise<Drug[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()

  const cleaned = query.replace(/[,()*%]/g, ' ').trim()
  if (cleaned.length < 2) return []
  const pat = `*${cleaned}*`

  type BrandDetail = {
    drug_master_id: string; brand_name: string; manufacturer: string | null
    hsn_code: string | null; gst_rate: number | null; pack_size: number | null; pack_unit: string | null
  }
  const brandCols = 'drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit'

  const [{ data: nameHits }, { data: brandHits }] = await Promise.all([
    supabase.from('drug_master').select('id').eq('is_active', true)
      .or(`name.ilike.${pat},generic_name.ilike.${pat}`).order('name').limit(limit),
    supabase.from('drug_brands').select(brandCols).ilike('brand_name', pat).limit(200),
  ])

  // Molecule ids: name/generic matches first, then brand matches — deduped, capped.
  const ordered: string[] = []
  for (const id of [
    ...((nameHits ?? []).map(r => r.id as string)),
    ...((brandHits ?? []).map(r => (r as BrandDetail).drug_master_id).filter(Boolean)),
  ]) if (id && !ordered.includes(id)) ordered.push(id)
  const ids = ordered.slice(0, limit)

  const globals: Drug[] = []
  if (ids.length) {
    const [{ data: mols }, { data: sample }] = await Promise.all([
      supabase.from('drug_master').select('id, name, generic_name, form, strength, unit').in('id', ids),
      supabase.from('drug_brands').select(brandCols).in('drug_master_id', ids).limit(300),
    ])
    const byMol = new Map<string, BrandDetail[]>()
    for (const b of [...((sample ?? []) as BrandDetail[]), ...((brandHits ?? []) as BrandDetail[])]) {
      if (!b.drug_master_id) continue
      const arr = byMol.get(b.drug_master_id) ?? []
      if (!arr.some(x => x.brand_name === b.brand_name)) arr.push(b)
      byMol.set(b.drug_master_id, arr)
    }
    const molMap = new Map((mols ?? []).map(m => [m.id as string, m]))
    for (const id of ids) {
      const m = molMap.get(id); if (!m) continue
      const brands = byMol.get(id) ?? []
      globals.push({
        id, name: m.name as string,
        generic_name: (m.generic_name as string | null) ?? null,
        form: (m.form as string | null) ?? null,
        strength: (m.strength as string | null) ?? null,
        unit: (m.unit as string | null) ?? null,
        is_active: true, is_global: true,
        brand_aliases: brands.map(b => b.brand_name),
        brand_data: brands,
      })
    }
  }

  const { data: tenantDrugs } = await supabase.from('drugs')
    .select('id, name, generic_name, form, strength, unit, reorder_level, is_active')
    .eq('is_active', true).or(`name.ilike.${pat},generic_name.ilike.${pat}`).order('name').limit(limit)
  const tenant: Drug[] = (tenantDrugs ?? []).map(d => ({
    id: d.id as string, name: d.name as string,
    generic_name: (d.generic_name as string | null) ?? null,
    form: (d.form as string | null) ?? null, strength: (d.strength as string | null) ?? null,
    unit: (d.unit as string | null) ?? null, reorder_level: (d.reorder_level as number) ?? 0,
    is_active: true, is_global: false,
  }))

  return [...tenant, ...globals].slice(0, limit)
}

// ---- Stock ----

export async function getStock(): Promise<DrugWithStock[]> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // All batches for this tenant (all expiry/qty states — to show full inventory)
  const { data: allBatches } = await supabase
    .from('drug_batches')
    .select('id, drug_id, drug_master_id, batch_no, expiry, qty_available, purchase_price, mrp, reorder_level, storage_location')
    .order('expiry', { ascending: true })

  if (!allBatches?.length) return []

  // Separate by source
  const masterIds = [...new Set(allBatches.filter(b => b.drug_master_id).map(b => b.drug_master_id as string))]
  const tenantIds  = [...new Set(allBatches.filter(b => b.drug_id).map(b => b.drug_id as string))]

  type MRow = { id: string; name: string; generic_name: string | null; form: string | null; strength: string | null; unit: string | null }
  type TRow = MRow & { reorder_level: number }

  type BrandDetail = { drug_master_id: string; brand_name: string; manufacturer: string | null; hsn_code: string | null; gst_rate: number | null; pack_size: number | null; pack_unit: string | null }

  const masterMap = new Map<string, MRow>()
  const tenantMap = new Map<string, TRow>()
  const masterBrandAliases = new Map<string, string[]>()
  const masterBrandData    = new Map<string, BrandDetail[]>()

  if (masterIds.length) {
    const { data: mDrugs } = await supabase.from('drug_master').select('id, name, generic_name, form, strength, unit').in('id', masterIds)
    for (const d of (mDrugs ?? [])) { const r = d as unknown as MRow; masterMap.set(r.id, r) }

    const { data: brandRows } = await supabase
      .from('drug_brands')
      .select('drug_master_id, brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit')
      .in('drug_master_id', masterIds)
    for (const br of (brandRows ?? []) as BrandDetail[]) {
      const aliases = masterBrandAliases.get(br.drug_master_id) ?? []
      aliases.push(br.brand_name)
      masterBrandAliases.set(br.drug_master_id, aliases)
      const data = masterBrandData.get(br.drug_master_id) ?? []
      data.push(br)
      masterBrandData.set(br.drug_master_id, data)
    }
  }
  if (tenantIds.length) {
    const { data: tDrugs } = await supabase.from('drugs').select('id, name, generic_name, form, strength, unit, reorder_level').in('id', tenantIds).eq('is_active', true)
    for (const d of (tDrugs ?? [])) { const r = d as unknown as TRow; tenantMap.set(r.id, r) }
  }

  // Group active batches by drug reference key
  const activeBatchesByKey = new Map<string, DrugBatch[]>()
  const reorderByKey = new Map<string, number>()

  for (const b of allBatches) {
    const key = (b.drug_master_id ?? b.drug_id) as string
    if (!key) continue

    // Track max reorder_level per drug
    const rl = (b.reorder_level as number) ?? 0
    reorderByKey.set(key, Math.max(reorderByKey.get(key) ?? 0, rl))

    // Only active (unexpired + in-stock) batches for the display list
    if (b.expiry > today && b.qty_available > 0) {
      const list = activeBatchesByKey.get(key) ?? []
      list.push(b as DrugBatch)
      activeBatchesByKey.set(key, list)
    }
  }

  const allKeys = [...new Set(allBatches.map(b => (b.drug_master_id ?? b.drug_id) as string).filter(Boolean))]

  return allKeys
    .map((key): DrugWithStock | null => {
      const isMaster = masterMap.has(key)
      const info = isMaster ? masterMap.get(key)! : tenantMap.get(key)
      if (!info) return null

      const batches = activeBatchesByKey.get(key) ?? []
      const total_qty = batches.reduce((s, b) => s + b.qty_available, 0)
      const reorder_level = isMaster
        ? (reorderByKey.get(key) ?? 0)
        : Math.max(reorderByKey.get(key) ?? 0, (tenantMap.get(key) as TRow | undefined)?.reorder_level ?? 0)

      const brand_aliases = isMaster ? (masterBrandAliases.get(key) ?? []) : []
      const brand_data    = isMaster ? (masterBrandData.get(key) ?? []) : []
      return {
        id: key,
        name: info.name,
        generic_name: info.generic_name,
        form: info.form,
        strength: info.strength,
        unit: info.unit,
        reorder_level,
        is_active: true,
        is_global: isMaster,
        brand_aliases,
        brand_data,
        total_qty,
        batches,
      }
    })
    .filter((d): d is DrugWithStock => d !== null)
}

export type RichBatch = DrugBatch & {
  drug_name: string
  generic_name: string | null
  form: string | null
  strength: string | null
  brand_name: string | null
  manufacturer: string | null
  hsn_code: string | null
  pack_size: number | null
  pack_unit: string | null
  all_brands: Array<{ brand_name: string; manufacturer: string | null; hsn_code: string | null; pack_size: number | null; pack_unit: string | null }>
}

export interface PharmacyAlerts {
  lowStock: DrugWithStock[]
  nearExpiry: RichBatch[]
  expired: RichBatch[]
}

export async function getAlerts(): Promise<PharmacyAlerts> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]

  const stock = await getStock()
  const lowStock = stock.filter((d) => d.total_qty <= (d.reorder_level ?? 0))

  const batchSelect = `
    *,
    master:drug_master(name, generic_name, form, strength, drug_brands(brand_name, manufacturer, hsn_code, pack_size, pack_unit)),
    drug:drugs(name, generic_name, form, strength)
  `

  const [{ data: nearRaw }, { data: expiredRaw }] = await Promise.all([
    supabase.from('drug_batches').select(batchSelect)
      .gt('expiry', today).lte('expiry', in30).gt('qty_available', 0).order('expiry'),
    supabase.from('drug_batches').select(batchSelect)
      .lte('expiry', today).gt('qty_available', 0).order('expiry'),
  ])

  type MasterJoin = { name: string; generic_name: string | null; form: string | null; strength: string | null; drug_brands?: Array<{ brand_name: string; manufacturer: string | null; hsn_code: string | null; pack_size: number | null; pack_unit: string | null }> }
  type DrugJoin   = { name: string; generic_name: string | null; form: string | null; strength: string | null }

  const mapBatch = (b: Record<string, unknown>) => {
    const master = b.master as MasterJoin | null
    const drug   = b.drug   as DrugJoin   | null
    const brands = master?.drug_brands ?? []
    return {
      ...(b as unknown as DrugBatch),
      drug_name:    master?.name ?? drug?.name ?? '—',
      generic_name: master?.generic_name ?? drug?.generic_name ?? null,
      form:         master?.form ?? drug?.form ?? null,
      strength:     master?.strength ?? drug?.strength ?? null,
      brand_name:   brands[0]?.brand_name ?? null,
      manufacturer: brands[0]?.manufacturer ?? null,
      hsn_code:     brands[0]?.hsn_code ?? null,
      pack_size:    brands[0]?.pack_size ?? null,
      pack_unit:    brands[0]?.pack_unit ?? null,
      all_brands:   brands,
    }
  }

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

  const dispensedSet = new Set((dispensed ?? []).map((d) => d.prescription_id as string))
  const undispensed = prescriptions.filter((p) => !dispensedSet.has(p.id))
  if (!undispensed.length) return []

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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const parsed = DispenseSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, prescription_id, admission_id, drug_id, qty } = parsed.data
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // FEFO: pick earliest non-expired batch with enough stock.
  // drug_id here is a generic ref — could be drug_master.id or drugs.id.
  const { data: batches } = await supabase
    .from('drug_batches')
    .select('id, mrp, expiry, qty_available, drug_id, drug_master_id')
    .or(`drug_master_id.eq.${drug_id},drug_id.eq.${drug_id}`)
    .gt('expiry', today)
    .gte('qty_available', qty)
    .order('expiry', { ascending: true })
    .limit(1)

  if (!batches?.length) {
    return { success: false, error: 'Insufficient stock or no valid batch available' }
  }

  const batch = batches[0] as { id: string; mrp: number; drug_id: string | null; drug_master_id: string | null }
  const isMasterDrug = !!batch.drug_master_id

  const dispenseId = crypto.randomUUID()

  const { data: result, error: rpcErr } = await supabase.rpc('dispense_drug', {
    p_dispense_id:     dispenseId,
    p_patient_id:      patient_id,
    p_prescription_id: prescription_id ?? null,
    p_drug_id:         isMasterDrug ? null : drug_id,
    p_drug_master_id:  isMasterDrug ? drug_id : null,
    p_batch_id:        batch.id,
    p_qty:             qty,
    p_price_snapshot:  batch.mrp,
    p_dispensed_by:    actor.id,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Dispense failed' }

  if (admission_id) {
    await supabase.from('dispenses').update({ admission_id }).eq('id', dispenseId)
  }

  await logAudit(actor.id, 'dispense', 'drug', drug_id, {
    patient_id, qty, batch_id: batch.id, price: batch.mrp,
    is_master: isMasterDrug, admission_id: admission_id ?? null,
  })
  return { success: true, dispenseId }
}

// Auto-generate one combined bill for all dispenses of a patient (called after "All Packed").
export async function generatePharmacyBill(params: {
  patientId: string
  dispenseIds: string[]
}): Promise<{ success: true; billId: string; billNo: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const { patientId, dispenseIds } = params
  if (!dispenseIds.length) return { success: false, error: 'No dispenses provided' }

  const supabase = await createClient()

  // Load ALL unbilled dispenses for this patient (not just current-session IDs —
  // prior-session dispenses may be unbilled and must be included in the same bill)
  const { data: rows, error: rowErr } = await supabase
    .from('dispenses')
    .select('id, qty, price_snapshot, master:drug_master(name, drug_brands(brand_name)), drug:drugs(name), prescription:prescriptions(visit_id)')
    .eq('patient_id', patientId)
    .eq('billing_status', 'unbilled')

  if (rowErr) return { success: false, error: rowErr.message }
  if (!rows?.length) return { success: false, error: 'No unbilled dispenses found — they may already be billed' }

  // Derive visit_id from the first dispense that has a prescription linked to an OPD visit
  const visitId = (rows.find((r) => {
    const rx = r.prescription as unknown as { visit_id: string | null } | null
    return rx?.visit_id
  })?.prescription as unknown as { visit_id: string | null } | null)?.visit_id ?? null

  const subtotal = rows.reduce((s, r) => s + (r.qty as number) * (r.price_snapshot as number), 0)

  const { data: billNoData, error: billNoErr } = await supabase.rpc('get_next_bill_no')
  if (billNoErr || !billNoData) return { success: false, error: 'Failed to generate bill number' }

  const billId = crypto.randomUUID()
  const billNo = billNoData as string

  const { error: billErr } = await supabase.from('bills').insert({
    id: billId,
    tenant_id: actor.tenant_id,
    patient_id: patientId,
    visit_id: visitId,
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
    rows.map((r) => {
      const master = r.master as unknown as { name: string; drug_brands?: { brand_name: string }[] } | null
      const brandName = master?.drug_brands?.[0]?.brand_name ?? null
      const genericName = master?.name ?? (r.drug as unknown as { name: string } | null)?.name ?? 'Medication'
      return {
        id: crypto.randomUUID(),
        tenant_id: actor.tenant_id,
        bill_id: billId,
        source: 'pharmacy',
        ref_id: r.id,
        description: brandName ?? genericName,
        qty: r.qty as number,
        unit_price: r.price_snapshot as number,
        amount: (r.qty as number) * (r.price_snapshot as number),
      }
    })
  )
  if (itemErr) {
    await supabase.from('bills').delete().eq('id', billId)
    return { success: false, error: itemErr.message }
  }

  await supabase
    .from('dispenses')
    .update({ billing_status: 'billed' })
    .eq('patient_id', patientId)
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
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')
  const { patientId, dispenseIds, billId } = params

  const supabase = await createClient()

  const { data: bill } = await supabase.from('bills').select('id, status, visit_id, admission_id').eq('id', billId).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  // Cashless-approved patients don't pay cash up front — an eligibility-approved
  // claim on this bill's encounter lifts the dispatch gate.
  if (bill.status !== 'paid' && !(await isBillCashlessCovered(supabase, bill as { id: string; status: string; visit_id: string | null; admission_id: string | null }))) {
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

// Returns patients with packed (dispensed) but not dispatched medicines.
export async function listPackedAwaitingDispatch(): Promise<AwaitingDispatchPatient[]> {
  const supabase = await createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data: dispenses } = await supabase
    .from('dispenses')
    .select('id, patient_id, drug_id, drug_master_id')
    .is('dispatched_at', null)
    .gte('dispensed_at', sevenDaysAgo)
    .order('dispensed_at', { ascending: false })

  if (!dispenses?.length) return []

  const dispenseIdsByPatient = new Map<string, string[]>()
  const drugRefsByPatient = new Map<string, { id: string; isMaster: boolean }[]>()

  for (const d of dispenses) {
    const pid = d.patient_id as string
    dispenseIdsByPatient.set(pid, [...(dispenseIdsByPatient.get(pid) ?? []), d.id as string])
    const refId = (d.drug_master_id ?? d.drug_id) as string
    const isMaster = !!d.drug_master_id
    if (refId) {
      drugRefsByPatient.set(pid, [...(drugRefsByPatient.get(pid) ?? []), { id: refId, isMaster }])
    }
  }

  const patientIds = [...dispenseIdsByPatient.keys()]

  // Filter: only fully-packed patients (no remaining undispensed prescriptions)
  const { data: undispensedRxs } = await supabase
    .from('prescriptions')
    .select('patient_id, id')
    .in('patient_id', patientIds)

  if (undispensedRxs?.length) {
    const dispensedRxIds = new Set(
      (await supabase.from('dispenses').select('prescription_id').not('prescription_id', 'is', null))
        .data?.map((d) => d.prescription_id as string) ?? []
    )
    const stillPackingPatients = new Set(
      undispensedRxs.filter((rx) => !dispensedRxIds.has(rx.id as string)).map((rx) => rx.patient_id as string)
    )
    for (const pid of stillPackingPatients) {
      const idx = patientIds.indexOf(pid)
      if (idx >= 0) patientIds.splice(idx, 1)
    }
  }

  if (!patientIds.length) return []

  // Collect drug refs for remaining patients
  const masterRefIds = [...new Set(
    dispenses
      .filter(d => patientIds.includes(d.patient_id as string) && d.drug_master_id)
      .map(d => d.drug_master_id as string)
  )]
  const tenantDrugIds = [...new Set(
    dispenses
      .filter(d => patientIds.includes(d.patient_id as string) && d.drug_id)
      .map(d => d.drug_id as string)
  )]

  // Resolve the SPECIFIC pharmacy bill for each patient's undispatched dispenses
  // via bill_items (source='pharmacy', ref_id = dispense id) — the same way lab
  // and radiology resolve their order's bill. Previously this took the patient's
  // most-recently-created bill, so an unrelated newer bill (e.g. a fresh
  // consultation/bed bill) would mask the real pharmacy bill's paid status and
  // wrongly block dispatch even after the medicines were paid for.
  const allDispenseIds = patientIds.flatMap((pid) => dispenseIdsByPatient.get(pid) ?? [])
  const [{ data: patients }, { data: pharmaItems }] = await Promise.all([
    supabase.from('patients').select('id, full_name, uhid').in('id', patientIds),
    allDispenseIds.length
      ? supabase.from('bill_items').select('bill_id, ref_id').eq('source', 'pharmacy').in('ref_id', allDispenseIds)
      : Promise.resolve({ data: [] as { bill_id: string; ref_id: string }[] }),
  ])

  // dispense id -> its pharmacy bill id
  const billIdByDispense = new Map<string, string>()
  for (const it of (pharmaItems ?? []) as { bill_id: string; ref_id: string }[]) {
    billIdByDispense.set(it.ref_id, it.bill_id)
  }
  // patient -> the pharmacy bill covering their undispatched dispenses
  const billIdByPatient = new Map<string, string>()
  for (const pid of patientIds) {
    for (const did of dispenseIdsByPatient.get(pid) ?? []) {
      const bid = billIdByDispense.get(did)
      if (bid) { billIdByPatient.set(pid, bid); break }
    }
  }
  const neededBillIds = [...new Set(billIdByPatient.values())]
  const { data: bills } = neededBillIds.length
    ? await supabase.from('bills').select('id, bill_no, status, total, paid').in('id', neededBillIds)
    : { data: [] as { id: string; bill_no: string; status: string; total: number; paid: number }[] }

  const drugNameMap = new Map<string, string>()
  if (masterRefIds.length) {
    const [{ data: mDrugs }, { data: mBrands }] = await Promise.all([
      supabase.from('drug_master').select('id, name').in('id', masterRefIds),
      supabase.from('drug_brands').select('drug_master_id, brand_name').in('drug_master_id', masterRefIds),
    ])
    const firstBrand = new Map<string, string>()
    for (const br of (mBrands ?? []) as { drug_master_id: string; brand_name: string }[]) {
      if (!firstBrand.has(br.drug_master_id)) firstBrand.set(br.drug_master_id, br.brand_name)
    }
    for (const d of (mDrugs ?? [])) {
      drugNameMap.set(d.id as string, firstBrand.get(d.id as string) ?? (d.name as string))
    }
  }
  if (tenantDrugIds.length) {
    const { data: tDrugs } = await supabase.from('drugs').select('id, name').in('id', tenantDrugIds)
    for (const d of (tDrugs ?? [])) drugNameMap.set(d.id as string, d.name as string)
  }

  const patientMap = new Map((patients ?? []).map((p) => [p.id as string, p]))

  const billById = new Map<string, { id: string; bill_no: string; status: string; total: number; paid: number }>()
  for (const b of (bills ?? [])) {
    billById.set(b.id as string, {
      id: b.id as string, bill_no: b.bill_no as string, status: b.status as string,
      total: b.total as number, paid: b.paid as number,
    })
  }
  const billByPatient = new Map<string, { id: string; bill_no: string; status: string; total: number; paid: number }>()
  for (const pid of patientIds) {
    const bid = billIdByPatient.get(pid)
    const b = bid ? billById.get(bid) : undefined
    if (b) billByPatient.set(pid, b)
  }

  return patientIds.map((pid) => {
    const p = patientMap.get(pid)
    const refs = [...new Map((drugRefsByPatient.get(pid) ?? []).map(r => [r.id, r])).values()]
    return {
      patient_id: pid,
      patient_name: (p?.full_name as string) ?? '—',
      patient_uhid: (p?.uhid as string) ?? '—',
      dispense_ids: dispenseIdsByPatient.get(pid) ?? [],
      drug_names: refs.map(r => drugNameMap.get(r.id) ?? '—'),
      bill: billByPatient.get(pid) ?? null,
    }
  })
}

export interface DispatchedPatientHistory {
  patient_id: string
  patient_name: string
  patient_uhid: string
  dispatched_at: string
  items: Array<{ name: string; qty: number; unit_price: number; total: number }>
  total: number
}

export async function listDispatchedHistory(limitDays = 7): Promise<DispatchedPatientHistory[]> {
  const supabase = await createClient()
  const since = new Date(Date.now() - limitDays * 86400_000).toISOString()

  const { data } = await supabase
    .from('dispenses')
    .select('id, patient_id, qty, price_snapshot, dispatched_at, drug_id, drug_master_id')
    .not('dispatched_at', 'is', null)
    .gte('dispatched_at', since)
    .order('dispatched_at', { ascending: false })
    .limit(200)

  if (!data?.length) return []

  const rows = data as Array<{
    id: string; patient_id: string; qty: number; price_snapshot: number
    dispatched_at: string; drug_id: string | null; drug_master_id: string | null
  }>

  const patientIds    = [...new Set(rows.map(r => r.patient_id))]
  const masterIds     = [...new Set(rows.map(r => r.drug_master_id).filter(Boolean) as string[])]
  const tenantDrugIds = [...new Set(rows.map(r => r.drug_id).filter(Boolean) as string[])]

  const [{ data: patients }, { data: masterDrugs }, { data: tenantDrugs }] = await Promise.all([
    supabase.from('patients').select('id, full_name, uhid').in('id', patientIds),
    masterIds.length
      ? supabase.from('drug_master').select('id, name').in('id', masterIds)
      : Promise.resolve({ data: [] }),
    tenantDrugIds.length
      ? supabase.from('drugs').select('id, name').in('id', tenantDrugIds)
      : Promise.resolve({ data: [] }),
  ])

  const patientMap  = new Map((patients ?? []).map(p => [p.id as string, p as { id: string; full_name: string; uhid: string }]))
  const drugNameMap = new Map<string, string>()
  for (const d of (masterDrugs ?? [])) drugNameMap.set(d.id as string, d.name as string)
  for (const d of (tenantDrugs ?? [])) drugNameMap.set(d.id as string, d.name as string)

  const byPatient = new Map<string, DispatchedPatientHistory>()
  for (const r of rows) {
    const pid = r.patient_id
    const patient = patientMap.get(pid)
    if (!byPatient.has(pid)) {
      byPatient.set(pid, {
        patient_id: pid,
        patient_name: patient?.full_name ?? '—',
        patient_uhid: patient?.uhid ?? '',
        dispatched_at: r.dispatched_at,
        items: [],
        total: 0,
      })
    }
    const group = byPatient.get(pid)!
    const drugId = r.drug_master_id ?? r.drug_id ?? ''
    const itemTotal = r.qty * r.price_snapshot
    group.items.push({ name: drugNameMap.get(drugId) ?? 'Drug', qty: r.qty, unit_price: r.price_snapshot, total: itemTotal })
    group.total += itemTotal
    if (r.dispatched_at > group.dispatched_at) group.dispatched_at = r.dispatched_at
  }

  return Array.from(byPatient.values()).sort((a, b) => b.dispatched_at.localeCompare(a.dispatched_at))
}

export async function getFefoPreview(
  drugId: string, qty: number
): Promise<{ batch: DrugBatch; price: number } | null> {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  // drugId is a generic ref — could be drug_master.id or drugs.id
  const { data: batches } = await supabase
    .from('drug_batches')
    .select('*')
    .or(`drug_master_id.eq.${drugId},drug_id.eq.${drugId}`)
    .gt('expiry', today)
    .gte('qty_available', qty)
    .order('expiry', { ascending: true })
    .limit(1)
  if (!batches?.length) return null
  const b = batches[0] as DrugBatch
  return { batch: b, price: b.mrp * qty }
}
