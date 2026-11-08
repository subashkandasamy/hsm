'use server'

import { createClient } from '@/lib/supabase/server'
import { explainStockShortfall } from '@/lib/pharmacy/stockShortfall'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { unpaidAllowed } from '@/lib/payGate'
import { computeLineGst } from '@/lib/gst'
import { getTenantGstConfig, resolveLineGst, recomputeBillGstTotals } from '@/lib/billing/gst'
import { DrugSchema, DrugBatchSchema, DispenseSchema } from '@/lib/schemas'
import type { Drug, DrugBatch, DrugWithStock, Dispense, PrescriptionWithVisit } from '@/lib/types'
import { istToday, istAddDays, istDayStartISO, istDayEndISO } from '@/lib/istDate'
import { cleanDrugName } from '@/lib/pharmacy/invoiceFile'
import { pageAll } from '@/lib/supabase/pageAll'
import { nameMatchScore, SURE, WEAK } from '@/lib/pharmacy/nameMatch'
import { isDrugSchedule, requiresSupplyReason, cleanSupplyReason, NEEDS_REASON_MESSAGE } from '@/lib/pharmacy/schedule'
import { scheduleOfDrug } from '@/lib/pharmacy/scheduleOf'
import { parseScan, type ScannedCode } from '@/lib/pharmacy/scan'

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

/**
 * Creates the medicines an imported file names but the catalogue does not have.
 *
 * Without this, a stock migration dead-ends. The importer matches what it can
 * and leaves the rest with no medicine, the save refuses on the first such line,
 * and the only way forward is to pick a medicine on every unmatched row by hand
 * — roughly 400 of them on a real hospital's opening stock, and impossible for
 * the ~200 items that are gloves, catheters and forceps, which exist in no drug
 * catalogue at all and cannot be picked because they are not there.
 *
 * These go to the hospital's OWN list (`drugs`, carrying tenant_id), never to
 * `drug_master`. The master has no tenant_id — every hospital on the platform
 * reads it — and it is a drug catalogue where all 242,699 brands carry an HSN
 * code, a GST rate, a pack size and a manufacturer. One hospital's forceps,
 * with none of those, do not belong in it.
 *
 * Nothing is invented. The name comes from the file; the form is the category
 * word the file already appended; strength is left NULL rather than guessed,
 * because a wrong strength on a medicine record is worse than a missing one.
 *
 * Idempotent by name within the hospital, so running an import twice adds
 * nothing the second time.
 */
export async function createDrugsBulk(
  items: Array<{ name: string; form?: string | null }>,
): Promise<{ success: true; drugs: Drug[]; created: number; existing: number } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')

  const wanted = new Map<string, { name: string; form: string | null }>()
  for (const it of items) {
    const name = (it.name ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (!wanted.has(key)) wanted.set(key, { name, form: (it.form ?? null) || null })
  }
  if (!wanted.size) return { success: true, drugs: [], created: 0, existing: 0 }
  if (wanted.size > 2000) return { success: false, error: 'Too many medicines in one go — split the file.' }

  const supabase = await createClient()

  // Anything the hospital already has keeps its existing record.
  const { data: have } = await supabase
    .from('drugs').select('*').in('name', [...wanted.values()].map((w) => w.name))
  const byName = new Map<string, Drug>()
  for (const d of (have ?? []) as Drug[]) byName.set(d.name.trim().toLowerCase(), d)

  const toInsert = [...wanted.entries()]
    .filter(([k]) => !byName.has(k))
    .map(([, w]) => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      name: w.name,
      form: w.form,
      strength: null,
      reorder_level: 0,
      is_active: true,
    }))

  if (toInsert.length) {
    const { error } = await supabase.from('drugs').insert(toInsert)
    if (error) return { success: false, error: error.message }
    const { data: made } = await supabase
      .from('drugs').select('*').in('id', toInsert.map((d) => d.id))
    for (const d of (made ?? []) as Drug[]) byName.set(d.name.trim().toLowerCase(), d)
    await logAudit(actor.id, 'create_bulk', 'drug', null, {
      created: toInsert.length,
      names: toInsert.slice(0, 50).map((d) => d.name),
    })
  }

  return {
    success: true,
    drugs: [...wanted.keys()].map((k) => byName.get(k)).filter(Boolean) as Drug[],
    created: toInsert.length,
    existing: wanted.size - toInsert.length,
  }
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

/**
 * The category shown beside a medicine's name — "Syringe / needle", "Tablet".
 *
 * Its own action rather than `updateDrug`, for a reason worth writing down:
 * `updateDrug` validates with `DrugSchema`, which requires `name` and declares
 * `reorder_level: z.number().default(0)`. Calling it with just a form would
 * therefore reset the reorder level to zero and switch off the running-low
 * warning for that medicine, silently. A narrow action cannot do that.
 *
 * Only a hospital's own records can be edited here. A `drug_master` row is
 * shared by every hospital on the platform, so its form is not one tenant's to
 * change — the UI does not offer the field for those, and this refuses it.
 */
/**
 * A hospital's own medicine's schedule (H / H1 / X / G, or none).
 *
 * Its own action rather than `updateDrug`, for the reason updateDrugCategory
 * gives: DrugSchema defaults reorder_level to 0, so a partial update through it
 * silently switches off the running-low alert. And only the hospital's own
 * records — a catalogue medicine's schedule is national and shared by every
 * hospital, so it is read, never edited here.
 *
 * This is what makes the H1 register work for the hospital's own catalogue:
 * log_h1_supply (0168) reads drugs.schedule, which nothing could set before.
 */
export async function updateDrugSchedule(drugId: string, schedule: string | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')

  const value = schedule === null || schedule === '' ? null : schedule
  if (value !== null && !isDrugSchedule(value)) return { success: false, error: 'Choose H, H1, X, G or none' }

  const supabase = await createClient()
  const { data: drug } = await supabase.from('drugs').select('id, name, schedule')
    .eq('id', drugId).eq('tenant_id', actor.tenant_id).maybeSingle()
  if (!drug) {
    return { success: false, error: 'This medicine comes from the national catalogue — its schedule is set there and cannot be changed here.' }
  }
  if ((drug.schedule ?? null) === value) return { success: true }

  const { error } = await supabase.from('drugs').update({ schedule: value }).eq('id', drugId).eq('tenant_id', actor.tenant_id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update_schedule', 'drug', drugId, { from: drug.schedule, to: value, name: drug.name })
  return { success: true }
}

export async function updateDrugCategory(drugId: string, form: string | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')

  const value = (form ?? '').trim().slice(0, 60) || null
  const supabase = await createClient()

  // RLS already confines this to the caller's hospital; the tenant_id test is
  // belt and braces on a write that names a row by id.
  const { data: drug } = await supabase.from('drugs').select('id, name, form')
    .eq('id', drugId).eq('tenant_id', actor.tenant_id).maybeSingle()
  if (!drug) {
    return { success: false, error: 'This medicine comes from the shared catalogue — its category is the same for every hospital and cannot be changed here.' }
  }
  if ((drug.form ?? null) === value) return { success: true }

  const { error } = await supabase.from('drugs').update({ form: value }).eq('id', drugId).eq('tenant_id', actor.tenant_id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update_category', 'drug', drugId, { from: drug.form, to: value, name: drug.name })
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

export interface StockReceiptLine {
  drug_master_id?: string | null
  drug_id?: string | null
  brand_name?: string | null
  manufacturer?: string | null
  batch_no: string
  /** 'YYYY-MM-DD' — the UI sends the last day of the printed MM/YY. */
  expiry: string
  qty_available: number
  free_qty?: number
  purchase_price?: number | null
  mrp: number
  pack_size?: number | null
  pack_unit?: string | null
  mfg_date?: string | null
  hsn_code?: string | null
  gst_rate?: number | null
  reorder_level?: number
  storage_location?: string | null
}

export interface StockReceiptHeader {
  supplier_name?: string | null
  invoice_no?: string | null
  invoice_date?: string | null
  invoice_total?: number | null
  opening_stock?: boolean
  notes?: string | null
}

/**
 * Receives a whole purchase invoice: the receipt and every batch, or nothing
 * (receive_stock_v1, migration 0162). A line whose drug + batch + expiry already
 * exists adds to that batch instead of creating a duplicate.
 */
export async function receiveStock(
  header: StockReceiptHeader,
  lines: StockReceiptLine[],
): Promise<{ success: true; created: number; merged: number; units: number; receiptId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')

  if (!lines.length) return { success: false, error: 'Add at least one medicine' }
  const today = istToday()
  for (const l of lines) {
    if (!l.drug_master_id && !l.drug_id) return { success: false, error: 'Every line needs a medicine' }
    if (!l.batch_no?.trim()) return { success: false, error: 'Every line needs a batch number' }
    if (!l.expiry || l.expiry <= today) return { success: false, error: `Batch ${l.batch_no}: the expiry has passed` }
    if (!Number.isFinite(l.qty_available) || l.qty_available + (l.free_qty ?? 0) <= 0) return { success: false, error: `Batch ${l.batch_no}: enter a quantity` }
    if (!Number.isFinite(l.mrp) || l.mrp <= 0) return { success: false, error: `Batch ${l.batch_no}: enter the MRP` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('receive_stock_v1', { p_header: header, p_lines: lines })
  if (error) return { success: false, error: error.message }
  const r = data as { receipt_id: string; created: number; merged: number; units: number }
  await logAudit(actor.id, 'receive_stock', 'pharmacy', r.receipt_id, {
    supplier: header.supplier_name ?? null, invoice: header.invoice_no ?? null,
    lines: lines.length, created: r.created, merged: r.merged, units: r.units,
  })
  return { success: true, created: r.created, merged: r.merged, units: r.units, receiptId: r.receipt_id }
}

export interface StockReceiptSummary {
  id: string; supplier_name: string | null; invoice_no: string | null; invoice_date: string | null
  invoice_total: number | null; opening_stock: boolean; created_at: string; lines: number; units: number
}

/** Recent purchases, for "what did we receive lately" and repeating an order. */
export async function listStockReceipts(limit = 10): Promise<StockReceiptSummary[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const { data } = await supabase
    .from('stock_receipts')
    .select('id, supplier_name, invoice_no, invoice_date, invoice_total, opening_stock, created_at, batches:drug_batches(qty_available)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const batches = (r.batches as Array<{ qty_available: number }> | null) ?? []
    return {
      id: r.id as string,
      supplier_name: (r.supplier_name as string | null) ?? null,
      invoice_no: (r.invoice_no as string | null) ?? null,
      invoice_date: (r.invoice_date as string | null) ?? null,
      invoice_total: (r.invoice_total as number | null) ?? null,
      opening_stock: !!r.opening_stock,
      created_at: r.created_at as string,
      lines: batches.length,
      units: batches.reduce((n, b) => n + (b.qty_available ?? 0), 0),
    }
  })
}

export interface PrefillLine {
  drugMasterId: string | null
  drugId: string | null
  name: string
  strength: string | null
  form: string | null
  unit: string | null
  brandName: string | null
  manufacturer: string | null
  packSize: number | null
  packUnit: string | null
  hsn: string | null
  gst: number | null
  mrp: number | null
  rate: number | null
  reorderLevel: number
  inStock: number
  /** Packs to buy to get back above the reorder level — a starting point, editable. */
  suggestedPacks: number | null
}

/**
 * Medicines at or below their reorder level, with last-purchase details, so a
 * purchase can start from what is actually low instead of a blank screen.
 */
export async function lowStockPrefill(): Promise<PrefillLine[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const stock = await getStock()
  const low = stock.filter((d) => d.total_qty <= (d.reorder_level ?? 0) && (d.reorder_level ?? 0) > 0)
  if (!low.length) return []

  // getStock trims batch columns, so read the full last batch of each medicine:
  // its pack, price, HSN and GST are what the new purchase should start from.
  const supabase = await createClient()
  const masterIds = low.filter((d) => d.is_global).map((d) => d.id)
  const tenantIds = low.filter((d) => !d.is_global).map((d) => d.id)
  const { data: batchRows } = await supabase.from('drug_batches')
    .select('drug_master_id, drug_id, brand_name, manufacturer, pack_size, pack_unit, hsn_code, gst_rate, mrp, purchase_price, purchase_date, expiry')
    .or([
      masterIds.length ? `drug_master_id.in.(${masterIds.join(',')})` : null,
      tenantIds.length ? `drug_id.in.(${tenantIds.join(',')})` : null,
    ].filter(Boolean).join(','))
    .order('purchase_date', { ascending: false, nullsFirst: false })
    .order('expiry', { ascending: false })
  const lastByDrug = new Map<string, NonNullable<typeof batchRows>[number]>()
  for (const b of batchRows ?? []) {
    const key = (b.drug_master_id as string | null) ?? (b.drug_id as string)
    if (key && !lastByDrug.has(key)) lastByDrug.set(key, b)
  }

  return low.map((d) => {
    const last = lastByDrug.get(d.id)
    const packSize = last?.pack_size ?? null
    const shortfall = Math.max((d.reorder_level ?? 0) - d.total_qty, 0)
    return {
      drugMasterId: d.is_global ? d.id : null,
      drugId: d.is_global ? null : d.id,
      name: d.name, strength: d.strength, form: d.form, unit: d.unit,
      brandName: last?.brand_name ?? d.brand_aliases?.[0] ?? null,
      manufacturer: last?.manufacturer ?? null,
      packSize, packUnit: last?.pack_unit ?? null,
      hsn: last?.hsn_code ?? null, gst: last?.gst_rate ?? null,
      mrp: last?.mrp ?? null, rate: last?.purchase_price ?? null,
      reorderLevel: d.reorder_level ?? 0,
      inStock: d.total_qty,
      suggestedPacks: packSize && packSize > 0 ? Math.max(1, Math.ceil(shortfall / packSize)) : null,
    }
  })
}

/** The supplier on the last receipt — most purchases come from the same distributor. */
export async function lastSupplier(): Promise<string | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const { data } = await supabase.from('stock_receipts')
    .select('supplier_name').not('supplier_name', 'is', null)
    .order('created_at', { ascending: false }).limit(1)
  return (data?.[0]?.supplier_name as string | null) ?? null
}

// ---- Schedule H1 register ---------------------------------------------------

/** One line of the register, as an inspector reads it. */
export interface H1Entry {
  entry_no: number
  supplied_on: string
  schedule: string
  patient_name: string
  patient_uhid: string | null
  patient_address: string | null
  prescriber_name: string | null
  drug_name: string
  brand_name: string | null
  batch_no: string | null
  qty: number
  supplied_by_name: string | null
  /** Why it was supplied (required for Schedule X since 0269); null on older entries. */
  reason: string | null
  /** Supplied to an admitted patient on a ward, not over the counter. */
  ward: boolean
}

/**
 * The Schedule H1 register for a date range.
 *
 * Rule 65(11A) requires this to be kept for three years and produced on
 * inspection. Nothing writes to it from here — a database trigger fills it as
 * medicines are dispensed, so there is no path that supplies an H1 medicine and
 * forgets the entry.
 */
/** A Schedule H, H1 or X medicine handed over with no prescription linked to it. */
export interface UnprescribedSupply {
  dispensed_at: string
  schedule: string
  patient_name: string | null
  patient_uhid: string | null
  drug_name: string
  brand_name: string | null
  batch_no: string | null
  qty: number
  /** An admitted patient — their drugs are ordered on the ward, so check the order rather than a prescription. */
  inpatient: boolean
  dispensed_by: string | null
}

/**
 * Schedule H, H1 and X medicines that left the pharmacy with no prescription
 * attached. Prescription-only medicines must be sold against one; this is the
 * list of where the record does not show it. Every handover through
 * dispense_drug is a `dispenses` row — prescription dispenses and counter
 * sales alike — so this one table covers both.
 */
export async function listDispensedWithoutPrescription(from: string, to: string): Promise<UnprescribedSupply[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()

  type Row = {
    dispensed_at: string; qty: number; admission_id: string | null
    patient: { full_name: string; uhid: string | null } | null
    master: { name: string; schedule: string | null } | null
    drug: { name: string; schedule: string | null } | null
    batch: { brand_name: string | null; batch_no: string | null } | null
    dispenser: { full_name: string } | null
  }
  const rows = await pageAll<Record<string, unknown>>((f, t) => supabase.from('dispenses')
    .select('dispensed_at, qty, admission_id, patient:patients(full_name, uhid), master:drug_master(name, schedule), drug:drugs(name, schedule), batch:drug_batches(brand_name, batch_no), dispenser:profiles(full_name)')
    .is('prescription_id', null)
    .gte('dispensed_at', istDayStartISO(from)).lte('dispensed_at', istDayEndISO(to))
    .order('dispensed_at', { ascending: false }).order('id').range(f, t)) as unknown as Row[]

  return rows.flatMap((r) => {
    const schedule = String(r.master?.schedule ?? r.drug?.schedule ?? '').toUpperCase()
    if (!['H', 'H1', 'X'].includes(schedule)) return []
    return [{
      dispensed_at: r.dispensed_at, schedule,
      patient_name: r.patient?.full_name ?? null, patient_uhid: r.patient?.uhid ?? null,
      drug_name: r.master?.name ?? r.drug?.name ?? 'Unknown',
      brand_name: r.batch?.brand_name ?? null, batch_no: r.batch?.batch_no ?? null,
      qty: r.qty, inpatient: !!r.admission_id, dispensed_by: r.dispenser?.full_name ?? null,
    }]
  })
}

/** One batch as it arrived from the supplier. */
export interface PurchaseLine {
  purchase_date: string | null
  supplier_name: string | null
  supplier_invoice_no: string | null
  drug_name: string
  brand_name: string | null
  batch_no: string
  expiry: string
  qty_received: number
  free_qty: number
  purchase_price: number | null
  mrp: number
  gst_rate: number | null
  hsn_code: string | null
  /** Stock entered when the hospital started on Uyirly — not a purchase in the period. */
  opening_stock: boolean
}

/**
 * Every batch bought in a period, as it arrived: supplier, invoice, quantity
 * received (not what is left — qty_received exists for exactly this, 0205),
 * purchase price, MRP and GST. Opening stock entered at migration is marked
 * (stock_receipts.opening_stock) so the screen can leave it out: KMCH's whole
 * migrated stock is dated the day it was entered, and would otherwise read as
 * that month's purchases.
 */
export async function listPurchaseRegister(from: string, to: string): Promise<PurchaseLine[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()

  type Row = Omit<PurchaseLine, 'drug_name' | 'opening_stock'> & { master: { name: string } | null; drug: { name: string } | null; receipt: { opening_stock: boolean } | null }
  const rows = await pageAll<Record<string, unknown>>((f, t) => supabase.from('drug_batches')
    .select('purchase_date, supplier_name, supplier_invoice_no, brand_name, batch_no, expiry, qty_received, free_qty, purchase_price, mrp, gst_rate, hsn_code, master:drug_master(name), drug:drugs(name), receipt:stock_receipts(opening_stock)')
    .gte('purchase_date', from).lte('purchase_date', to)
    .order('purchase_date', { ascending: false }).order('id').range(f, t)) as unknown as Row[]

  return rows.map(({ master, drug, receipt, ...r }) => ({ ...r, drug_name: master?.name ?? drug?.name ?? 'Unknown', opening_stock: !!receipt?.opening_stock }))
}

/**
 * The H1 register, or the X register — they are separate registers in law, so
 * they are read separately (one table holds both; `schedule` says which).
 *
 * Paged: this asked for 2,000 rows, but every read is capped at 1,000 with no
 * error, so a busy month's statutory register would have been cut short
 * without anyone knowing (see lib/supabase/pageAll).
 */
export async function listH1Register(from: string, to: string, schedule?: 'H1' | 'X'): Promise<H1Entry[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()

  const data = await pageAll<Record<string, unknown>>((f, t) => {
    let q = supabase.from('h1_register')
      .select('entry_no, supplied_on, schedule, patient_name, patient_uhid, patient_address, prescriber_name, drug_name, brand_name, batch_no, qty, reason, ipd_request_id, supplier:profiles!h1_register_supplied_by_fkey(full_name)')
      .gte('supplied_on', from).lte('supplied_on', to)
    if (schedule) q = q.eq('schedule', schedule)
    return q.order('entry_no', { ascending: false }).range(f, t)
  })

  return data.map((r) => ({
    entry_no: r.entry_no as number,
    supplied_on: r.supplied_on as string,
    schedule: r.schedule as string,
    patient_name: r.patient_name as string,
    patient_uhid: (r.patient_uhid as string | null) ?? null,
    patient_address: (r.patient_address as string | null) ?? null,
    prescriber_name: (r.prescriber_name as string | null) ?? null,
    drug_name: r.drug_name as string,
    brand_name: (r.brand_name as string | null) ?? null,
    batch_no: (r.batch_no as string | null) ?? null,
    qty: r.qty as number,
    supplied_by_name: ((r.supplier as unknown as { full_name: string } | null)?.full_name) ?? null,
    reason: (r.reason as string | null) ?? null,
    ward: !!r.ipd_request_id,
  }))
}

// ---- Our own labels ---------------------------------------------------------

/** No 0/O, 1/I/L or U: a code read off a shelf must not be guessable wrongly. */
const LABEL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

function mintLabelCode(): string {
  let out = 'UY'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  for (const b of bytes) out += LABEL_ALPHABET[b % LABEL_ALPHABET.length]
  return out
}

/**
 * Gives every one of these batches a code of its own, printed on the label we
 * stick to the box. Batches that already have one keep it, so reprinting a lost
 * label produces the same barcode.
 */
export async function ensureBatchLabels(batchIds: string[]): Promise<{ success: true; count: number } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:manage')
  if (!batchIds.length) return { success: false, error: 'Nothing to label' }

  const supabase = await createClient()
  const { data: rows } = await supabase.from('drug_batches').select('id, label_code').in('id', batchIds.slice(0, 200))
  const missing = (rows ?? []).filter((r) => !r.label_code).map((r) => r.id as string)

  for (const id of missing) {
    // A clash is vanishingly unlikely, but a label that means two boxes never ships.
    let done = false
    for (let attempt = 0; attempt < 5 && !done; attempt++) {
      const { error } = await supabase.from('drug_batches').update({ label_code: mintLabelCode() }).eq('id', id)
      if (!error) done = true
      else if (error.code !== '23505') return { success: false, error: error.message }
    }
    if (!done) return { success: false, error: 'Could not allocate a label code — try again' }
  }
  return { success: true, count: (rows ?? []).length }
}

/** The batches that came in on one purchase, ready to be labelled. */
export async function ensureReceiptLabels(receiptId: string): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const { data } = await supabase.from('drug_batches').select('id').eq('receipt_id', receiptId)
  const ids = (data ?? []).map((r) => r.id as string)
  if (!ids.length) return { success: false, error: 'That purchase added nothing new to label' }
  return ensureBatchLabels(ids)
}

// ---- Scanned packs ----------------------------------------------------------

/** A medicine as the counter needs it after a scan. */
export interface ScannedProduct {
  id: string
  isGlobal: boolean
  name: string
  brandName: string | null
  form: string | null
  strength: string | null
  /** Units in date and on the shelf — 0 means there is nothing to sell. */
  available: number
  /** What the catalogue knows about this brand's pack, for a first purchase. */
  brand: { pack_size: number | null; pack_unit: string | null; hsn_code: string | null; gst_rate: number | null; manufacturer: string | null } | null
}

/** The exact box a label of ours points at. */
export interface ScannedBatch {
  id: string
  batchNo: string
  /** 'YYYY-MM-DD' */
  expiry: string
  mrp: number
  available: number
  /** False when another batch of the same medicine expires sooner. */
  isEarliestExpiring: boolean
  expired: boolean
}

export type CodeLookup =
  | { status: 'unreadable' }
  | { status: 'known'; product: ScannedProduct; batch?: ScannedBatch; scanned: ScannedCode }
  | { status: 'unknown'; scanned: ScannedCode }

/** Loads a medicine and its sellable quantity, for either catalogue. */
async function scannedProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ref: { masterId: string | null; drugId: string | null },
  brandName: string | null,
): Promise<ScannedProduct | null> {
  const id = ref.masterId ?? ref.drugId
  if (!id) return null
  const { data: row } = ref.masterId
    ? await supabase.from('drug_master').select('id, name, form, strength').eq('id', ref.masterId).maybeSingle()
    : await supabase.from('drugs').select('id, name, form, strength').eq('id', ref.drugId!).maybeSingle()
  if (!row) return null

  const column = ref.masterId ? 'drug_master_id' : 'drug_id'
  const { data: batches } = await supabase.from('drug_batches')
    .select('qty_available').eq(column, id).gt('expiry', istToday()).gt('qty_available', 0)

  // The pack the catalogue describes for this brand — what a first purchase of it
  // should start from, exactly as picking it by hand would.
  const { data: brandRow } = ref.masterId && brandName
    ? await supabase.from('drug_brands')
        .select('pack_size, pack_unit, hsn_code, gst_rate, manufacturer')
        .eq('drug_master_id', ref.masterId).eq('brand_name', brandName).maybeSingle()
    : { data: null }

  return {
    id: row.id as string,
    isGlobal: !!ref.masterId,
    name: row.name as string,
    brandName,
    form: (row.form as string | null) ?? null,
    strength: (row.strength as string | null) ?? null,
    available: (batches ?? []).reduce((sum, b) => sum + ((b.qty_available as number) ?? 0), 0),
    brand: brandRow
      ? {
          pack_size: (brandRow.pack_size as number | null) ?? null,
          pack_unit: (brandRow.pack_unit as string | null) ?? null,
          hsn_code: (brandRow.hsn_code as string | null) ?? null,
          gst_rate: (brandRow.gst_rate as number | null) ?? null,
          manufacturer: (brandRow.manufacturer as string | null) ?? null,
        }
      : null,
  }
}

/**
 * Says what a scanned pack is.
 *
 * A code the counter has been taught before comes back as a medicine. Anything
 * else comes back as 'unknown' with whatever the code itself carried, so the
 * screen can offer to learn it.
 */
export async function resolveProductCode(rawCode: string): Promise<CodeLookup> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')

  const scanned = parseScan(rawCode)
  if (!scanned) return { status: 'unreadable' }

  const supabase = await createClient()

  // Our own label names one box, not just the product.
  if (/^UY[0-9A-Z]{8}$/.test(scanned.key)) {
    const found = await resolveOwnLabel(supabase, scanned.key)
    if (found) return { status: 'known', product: found.product, batch: found.batch, scanned }
  }

  const { data: known } = await supabase.from('product_codes')
    .select('id, drug_master_id, drug_id, brand_name, times_used')
    .eq('code', scanned.key).maybeSingle()

  if (!known) return { status: 'unknown', scanned }

  const product = await scannedProduct(
    supabase,
    { masterId: (known.drug_master_id as string | null) ?? null, drugId: (known.drug_id as string | null) ?? null },
    (known.brand_name as string | null) ?? null,
  )
  // The medicine behind a taught code was removed — treat the code as unknown
  // again rather than failing the scan.
  if (!product) return { status: 'unknown', scanned }

  await supabase.from('product_codes')
    .update({ times_used: ((known.times_used as number) ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq('id', known.id as string)

  return { status: 'known', product, scanned }
}

/** Reads one of our printed stock labels back into a medicine and its box. */
async function resolveOwnLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  code: string,
): Promise<{ product: ScannedProduct; batch: ScannedBatch } | null> {
  const { data: b } = await supabase.from('drug_batches')
    .select('id, batch_no, expiry, mrp, qty_available, brand_name, drug_master_id, drug_id')
    .eq('label_code', code).maybeSingle()
  if (!b) return null

  const product = await scannedProduct(
    supabase,
    { masterId: (b.drug_master_id as string | null) ?? null, drugId: (b.drug_id as string | null) ?? null },
    (b.brand_name as string | null) ?? null,
  )
  if (!product) return null

  const today = istToday()
  const expiry = b.expiry as string
  // Is anything of the same medicine going out of date sooner? If so the counter
  // should be told, because that is the box that ought to leave first.
  const column = b.drug_master_id ? 'drug_master_id' : 'drug_id'
  const { data: earlier } = await supabase.from('drug_batches')
    .select('id').eq(column, (b.drug_master_id ?? b.drug_id) as string)
    .gt('expiry', today).lt('expiry', expiry).gt('qty_available', 0).limit(1)

  return {
    product,
    batch: {
      id: b.id as string,
      batchNo: b.batch_no as string,
      expiry,
      mrp: Number(b.mrp ?? 0),
      available: (b.qty_available as number) ?? 0,
      isEarliestExpiring: !(earlier ?? []).length,
      expired: expiry <= today,
    },
  }
}

/**
 * Teaches the counter what a code is. The first person to scan an unknown pack
 * says once what it is; everyone after that just scans.
 */
export async function rememberProductCode(
  rawCode: string,
  ref: { id: string; isGlobal: boolean },
  brandName: string | null,
  options?: { replace?: boolean },
): Promise<{ success: true; product: ScannedProduct } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:sale')

  const scanned = parseScan(rawCode)
  if (!scanned) return { success: false, error: 'That code could not be read' }

  const supabase = await createClient()
  const row = {
    tenant_id: actor.tenant_id,
    code: scanned.key,
    kind: scanned.kind,
    drug_master_id: ref.isGlobal ? ref.id : null,
    drug_id: ref.isGlobal ? null : ref.id,
    brand_name: brandName,
    created_by: actor.id,
  }

  const { error } = options?.replace
    ? await supabase.from('product_codes').upsert(row, { onConflict: 'tenant_id,code' })
    : await supabase.from('product_codes').insert(row)

  if (error) {
    // Two counters taught the same pack at once — the first one stands.
    if (error.code === '23505') return { success: false, error: 'That code was just taught to another medicine — scan it again to see' }
    return { success: false, error: error.message }
  }

  const product = await scannedProduct(supabase, { masterId: row.drug_master_id, drugId: row.drug_id }, brandName)
  if (!product) return { success: false, error: 'That medicine could not be loaded' }

  await logAudit(actor.id, options?.replace ? 'product_code_replace' : 'product_code_teach', 'pharmacy', ref.id, {
    code: scanned.key, kind: scanned.kind, brand: brandName,
  })
  return { success: true, product }
}

/** One invoice line paired with what the catalogue thinks it is. */
export interface NameMatch {
  /** The medicine name exactly as the file spells it. */
  raw: string
  drug: Drug | null
  brand: string | null
  /** 'sure' when the brand matched outright, 'likely' when it only starts with it. */
  confidence: 'sure' | 'likely' | 'none'
  /** Other candidates, so a wrong guess is one click from right. */
  options: Drug[]
}

/**
 * Matches the medicine names on a distributor's invoice to the catalogue.
 *
 * Invoice lines read "DOLO 650 TAB 15'S" where the catalogue holds "Paracetamol"
 * with a brand "Dolo 650", so each name is stripped of pack and form words before
 * it is searched. Names are searched together rather than one round trip each.
 */
export async function matchInvoiceNames(names: string[]): Promise<NameMatch[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  if (!names.length) return []

  // 200 was fine for a distributor invoice and far too small for a migration:
  // a hospital's opening stock report carried 712 distinct names, so 512 of them
  // were returned unmatched without ever being looked up — which reads as "the
  // catalogue does not have it" when nothing was asked. The work is still
  // batched 8 at a time below, so the ceiling costs round trips, not load.
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 1500)
  const found = new Map<string, NameMatch>()

  // A handful at a time: enough to hide the network, not enough to flood the pool.
  for (let i = 0; i < unique.length; i += 8) {
    const slice = unique.slice(i, i + 8)
    const results = await Promise.all(slice.map(async (raw) => {
      const cleaned = cleanDrugName(raw)
      let hits = cleaned.length >= 2 ? await searchDrugs(cleaned, 6) : []
      // "Augmentin 625 Duo" finds nothing whole; its first words do.
      if (!hits.length) {
        const words = cleaned.split(' ').filter(Boolean)
        for (const attempt of [words.slice(0, 2).join(' '), words[0]]) {
          if (!attempt || attempt.length < 2) continue
          hits = await searchDrugs(attempt, 6)
          if (hits.length) break
        }
      }
      return { raw, cleaned, hits }
    }))
    for (const { raw, cleaned, hits } of results) found.set(raw, scoreMatch(raw, cleaned, hits))
  }

  return names.map((n) => found.get(n.trim()) ?? { raw: n, drug: null, brand: null, confidence: 'none', options: [] })
}

/** Picks the brand an invoice line means, and says how sure that is. */
function scoreMatch(raw: string, cleaned: string, hits: Drug[]): NameMatch {
  if (!hits.length) return { raw, drug: null, brand: null, confidence: 'none', options: [] }

  // Word by word, not whole string (see lib/pharmacy/nameMatch). The old test
  // compared the two as single strings, so "GLYMIPRL M1" never reached
  // "Glymiprl M 1mg/500mg Tablet" — one space apart. On a real 712-name
  // migration it matched 42.
  let best: { drug: Drug; brand: string | null; score: number } | null = null
  for (const d of hits) {
    for (const brand of d.brand_aliases ?? []) {
      const score = nameMatchScore(cleaned, brand)
      if (score && (!best || score > best.score)) best = { drug: d, brand, score }
    }
    // The molecule's own name, for a line written as the generic.
    const nameScore = nameMatchScore(cleaned, d.name)
    if (nameScore && (!best || nameScore > best.score)) best = { drug: d, brand: null, score: nameScore }
  }

  if (!best || best.score < WEAK) return { raw, drug: null, brand: null, confidence: 'none', options: hits }
  return {
    raw, drug: best.drug, brand: best.brand,
    // Below SURE the brand agrees but the strength does not, or none was given.
    // Those are shown with the "check this" marker rather than accepted quietly.
    confidence: best.score >= SURE ? 'sure' : 'likely',
    options: hits.filter((d) => d.id !== best!.drug.id),
  }
}

/** The last batch received for a medicine — "same as last time" when receiving again. */
export async function lastBatchFor(drugRef: { id: string; isGlobal: boolean }): Promise<DrugBatch | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()
  const { data } = await supabase.from('drug_batches').select('*')
    .eq(drugRef.isGlobal ? 'drug_master_id' : 'drug_id', drugRef.id)
    .order('purchase_date', { ascending: false, nullsFirst: false })
    .order('expiry', { ascending: false })
    .limit(1)
  return (data?.[0] as DrugBatch | undefined) ?? null
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

  // `drug_master` holds 14,866 molecules. Unpaged this returned the first
  // thousand by name — everything from "Abacavir" to roughly the letter C —
  // and nothing else existed as far as the caller was concerned.
  const [masterDrugs, tenantDrugs] = await Promise.all([
    pageAll<Record<string, unknown>>((f, t) => supabase.from('drug_master')
      .select('id, name, generic_name, form, strength, unit, is_active, drug_brands(brand_name, manufacturer, hsn_code, gst_rate, pack_size, pack_unit)')
      .eq('is_active', true).order('name').order('id').range(f, t)),
    pageAll<Record<string, unknown>>((f, t) => supabase.from('drugs')
      .select('id, name, generic_name, form, strength, unit, reorder_level, is_active')
      .eq('is_active', true).order('name').order('id').range(f, t)),
  ])

  const global: Drug[] = masterDrugs.map(d => {
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

  const cleaned = query.replace(/[,()*%]/g, ' ').trim()
  if (cleaned.length < 2) return []

  // One database call (search_drugs_v1): over a network the round trips cost far
  // more than the queries themselves.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('search_drugs_v1', { p_query: cleaned, p_limit: limit })
  if (error || !data) return []

  type BrandRow = { brand_name: string; manufacturer: string | null; hsn_code: string | null; gst_rate: number | null; pack_size: number | null; pack_unit: string | null }
  type GlobalRow = { id: string; name: string; generic_name: string | null; form: string | null; strength: string | null; unit: string | null; brands: BrandRow[] }
  type TenantRow = { id: string; name: string; generic_name: string | null; form: string | null; strength: string | null; unit: string | null; reorder_level: number | null }
  const payload = data as { globals: GlobalRow[]; tenant: TenantRow[]; matched?: Record<string, string> }

  const globals: Drug[] = (payload.globals ?? []).map((m) => {
    // The brand that matched what was typed comes first; the rest are a sample.
    const hit = payload.matched?.[m.id]
    const sample = m.brands ?? []
    const aliases = hit ? [hit, ...sample.filter((b) => b.brand_name !== hit).map((b) => b.brand_name)] : sample.map((b) => b.brand_name)
    const data = hit && !sample.some((b) => b.brand_name === hit)
      ? [{ drug_master_id: m.id, brand_name: hit, manufacturer: null, hsn_code: null, gst_rate: null, pack_size: null, pack_unit: null }, ...sample.map((b) => ({ drug_master_id: m.id, ...b }))]
      : sample.map((b) => ({ drug_master_id: m.id, ...b }))
    return {
      id: m.id, name: m.name, generic_name: m.generic_name, form: m.form, strength: m.strength, unit: m.unit,
      is_active: true, is_global: true, brand_aliases: aliases, brand_data: data,
    }
  })
  const tenant: Drug[] = (payload.tenant ?? []).map((d) => ({
    id: d.id, name: d.name, generic_name: d.generic_name, form: d.form, strength: d.strength, unit: d.unit,
    reorder_level: d.reorder_level ?? 0, is_active: true, is_global: false,
  }))

  // Rank what the user most likely meant: a name or brand that starts with what
  // they typed beats a match buried inside a longer name ("Dolo 650" before "Pindolol").
  const q = cleaned.toLowerCase()
  const word = new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  const rank = (d: Drug) => {
    const name = d.name.toLowerCase()
    const generic = (d.generic_name ?? '').toLowerCase()
    const brands = (d.brand_aliases ?? []).map((b) => b.toLowerCase())
    const hitBrands = brands.filter((b) => b.startsWith(q))
    // "Dolo 500" (the word ends there) beats "Dologel" (the word continues).
    const wordBrands = hitBrands.filter((b) => !/[a-z]/.test(b.slice(q.length, q.length + 1)))
    const brandLen = hitBrands.length ? Math.min(...hitBrands.map((b) => b.length)) : Infinity
    if (name === q || brands.includes(q)) return { s: 0, brandLen }
    if (name.startsWith(q) || generic.startsWith(q)) return { s: 1, brandLen }
    if (wordBrands.length) return { s: 2, brandLen: Math.min(...wordBrands.map((b) => b.length)) }
    if (hitBrands.length) return { s: 3, brandLen }
    if (brands.some((b) => word.test(b))) return { s: 4, brandLen }
    if (word.test(name) || word.test(generic)) return { s: 5, brandLen }
    return { s: 6, brandLen }
  }
  return [...tenant, ...globals]
    .map((d, i) => ({ d, ...rank(d), i }))
    .sort((a, b) => a.s - b.s || a.brandLen - b.brandLen || a.d.name.length - b.d.name.length || a.i - b.i)
    .map((x) => x.d)
    .slice(0, limit)
}

// ---- Stock ----

export async function getStock(): Promise<DrugWithStock[]> {
  const supabase = await createClient()
  const today = istToday()

  // All batches for this tenant (all expiry/qty states — to show full inventory).
  //
  // Paged, because PostgREST stops at 1,000 rows and says nothing. A hospital
  // with 1,027 batches saw this screen under-report its stock by 49 units and
  // ₹48,007 — and because the order is by expiry, what disappeared was the
  // equipment, whose placeholder expiries sort last. See lib/supabase/pageAll.
  const allBatches = await pageAll<{
    id: string; drug_id: string | null; drug_master_id: string | null; batch_no: string
    expiry: string; qty_available: number; purchase_price: number | null; mrp: number
    reorder_level: number | null; storage_location: string | null; brand_name: string | null
    supplier_name: string | null; purchase_date: string | null
  }>((from, to) => supabase
    .from('drug_batches')
    .select('id, drug_id, drug_master_id, batch_no, expiry, qty_available, purchase_price, mrp, reorder_level, storage_location, brand_name, supplier_name, purchase_date')
    .order('expiry', { ascending: true }).order('id')
    .range(from, to))

  if (!allBatches.length) return []

  // Separate by source
  const masterIds = [...new Set(allBatches.filter(b => b.drug_master_id).map(b => b.drug_master_id as string))]
  const tenantIds  = [...new Set(allBatches.filter(b => b.drug_id).map(b => b.drug_id as string))]

  type MRow = { id: string; name: string; generic_name: string | null; form: string | null; strength: string | null; unit: string | null; schedule: string | null }
  type TRow = MRow & { reorder_level: number }

  type BrandDetail = { drug_master_id: string; brand_name: string; manufacturer: string | null; hsn_code: string | null; gst_rate: number | null; pack_size: number | null; pack_unit: string | null }

  const masterMap = new Map<string, MRow>()
  const tenantMap = new Map<string, TRow>()
  const masterBrandAliases = new Map<string, string[]>()
  const masterBrandData    = new Map<string, BrandDetail[]>()

  if (masterIds.length) {
    const { data: mDrugs } = await supabase.from('drug_master').select('id, name, generic_name, form, strength, unit, schedule').in('id', masterIds)
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
    const { data: tDrugs } = await supabase.from('drugs').select('id, name, generic_name, form, strength, unit, reorder_level, schedule').in('id', tenantIds).eq('is_active', true)
    for (const d of (tDrugs ?? [])) { const r = d as unknown as TRow; tenantMap.set(r.id, r) }
  }

  // Medicines this hospital uses as vaccines, so the stock list can single them out.
  const { data: vaxLinks } = await supabase.from('vaccine_products').select('drug_master_id, drug_id')
  const vaccineKeys = new Set((vaxLinks ?? []).map(v => (v.drug_master_id ?? v.drug_id) as string).filter(Boolean))

  // Group active batches by drug reference key
  const activeBatchesByKey = new Map<string, DrugBatch[]>()
  const reorderByKey = new Map<string, number>()
  /** Brands actually received, newest purchase first — what the shelf really holds. */
  const stockedBrandsByKey = new Map<string, string[]>()
  const byNewestPurchase = [...allBatches].sort((a, b) =>
    String(b.purchase_date ?? '').localeCompare(String(a.purchase_date ?? '')))
  for (const b of byNewestPurchase) {
    const key = (b.drug_master_id ?? b.drug_id) as string
    const brand = (b.brand_name as string | null)?.trim()
    if (!key || !brand) continue
    const list = stockedBrandsByKey.get(key) ?? []
    if (!list.includes(brand)) list.push(brand)
    stockedBrandsByKey.set(key, list)
  }

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
        schedule: info.schedule ?? null,
        stocked_brands: stockedBrandsByKey.get(key) ?? [],
        is_vaccine: vaccineKeys.has(key),
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
  const today = istToday()
  const in30 = istAddDays(istToday(), 30)

  const stock = await getStock()
  const lowStock = stock.filter((d) => d.total_qty <= (d.reorder_level ?? 0))

  const batchSelect = `
    *,
    master:drug_master(name, generic_name, form, strength, drug_brands(brand_name, manufacturer, hsn_code, pack_size, pack_unit)),
    drug:drugs(name, generic_name, form, strength)
  `

  // Paged for the same reason getStock is: a long-running hospital accumulates
  // expired batches it has not written off, and the 1,001st would vanish from
  // the alert silently — the one place where a missing row is the whole point.
  const [nearRaw, expiredRaw] = await Promise.all([
    pageAll<Record<string, unknown>>((from, to) => supabase.from('drug_batches').select(batchSelect)
      .gt('expiry', today).lte('expiry', in30).gt('qty_available', 0).order('expiry').order('id').range(from, to)),
    pageAll<Record<string, unknown>>((from, to) => supabase.from('drug_batches').select(batchSelect)
      .lte('expiry', today).gt('qty_available', 0).order('expiry').order('id').range(from, to)),
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

/**
 * The dispense queue: prescriptions not yet dispensed, newest visit first, with
 * the patient's name and UHID.
 *
 * Read through list_pending_prescriptions (0270), not from `visits`: a
 * pharmacist cannot read visits (visits_tenant_read), so the old two-query
 * merge gave them every patient as "—" and a dispense with no patient. The
 * function returns only the visit date and the patient — never the visit's
 * clinical content — and only for the caller's hospital.
 */
export async function listPendingPrescriptions(): Promise<PrescriptionWithVisit[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:read')
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('list_pending_prescriptions', { p_limit: 200 })
  if (error) {
    console.error('[listPendingPrescriptions] read failed:', error.message)
    return []
  }

  type Row = {
    id: string; visit_id: string; drug_name: string; dosage: string | null; frequency: string | null
    duration: string | null; instructions: string | null; visit_date: string; patient_id: string
    patient_name: string | null; patient_uhid: string | null
  }
  return ((data ?? []) as Row[]).map((p) => ({
    id: p.id,
    visit_id: p.visit_id,
    drug_name: p.drug_name,
    dosage: p.dosage ?? null,
    frequency: p.frequency ?? null,
    duration: p.duration ?? null,
    instructions: p.instructions ?? null,
    visit_date: p.visit_date ?? '',
    patient_id: p.patient_id,
    patient_name: p.patient_name ?? '—',
    patient_uhid: p.patient_uhid ?? '—',
  }))
}

// ---- Dispense ----

export async function dispense(
  input: Record<string, unknown>
): Promise<{ success: true; dispenseId: string } | { success: false; error: string; needsReason?: boolean }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'pharmacy:dispense')

  const parsed = DispenseSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { patient_id, prescription_id, admission_id, drug_id, qty } = parsed.data
  const supabase = await createClient()
  const today = istToday()

  // A Schedule X supply goes in the X register with the reason it was given.
  const reason = cleanSupplyReason(parsed.data.reason)
  if (!reason && requiresSupplyReason(await scheduleOfDrug(supabase, drug_id))) {
    return { success: false, error: NEEDS_REASON_MESSAGE, needsReason: true }
  }

  // FEFO: pick earliest non-expired batch with enough stock.
  //
  // Worth stating plainly, because the audit read it the other way round
  // (F-47): FEFO here is enforced by this query, not by the dispensing screen.
  // The counter is given no batch to choose. The one place an operator's choice
  // is honoured is a SCANNED batch in the counter-sale path, which is
  // deliberate — they are holding that box — and `resolveOwnLabel` already
  // tells them when something expires sooner.
  //
  // The real weakness is `.gte('qty_available', qty)`: it demands a single
  // batch, so stock split across two boxes is unreachable and the older box can
  // be stepped over. See explainStockShortfall.
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
    // The query above wants ONE batch big enough for the whole quantity, so
    // "no batch" does not mean "no stock" (F-47/F-75). Say which it is.
    const why = await explainStockShortfall(supabase, drug_id, qty, today)
    return { success: false, error: why.message }
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
    p_reason:          reason,
  })

  if (rpcErr) return { success: false, error: rpcErr.message }

  const rpcResult = result as { ok: boolean; error?: string }
  if (!rpcResult.ok) return { success: false, error: rpcResult.error ?? 'Dispense failed' }

  if (admission_id) {
    await supabase.from('dispenses').update({ admission_id }).eq('id', dispenseId)
  }

  await logAudit(actor.id, 'dispense', 'drug', drug_id, {
    patient_id, qty, batch_id: batch.id, price: batch.mrp,
    is_master: isMasterDrug, admission_id: admission_id ?? null, reason,
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
    .select('id, qty, price_snapshot, master:drug_master(name, drug_brands(brand_name)), drug:drugs(name), batch:drug_batches(hsn_code, gst_rate), prescription:prescriptions(visit_id)')
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

  const gstCfg = await getTenantGstConfig(supabase, actor.tenant_id)

  const { error: itemErr } = await supabase.from('bill_items').insert(
    rows.map((r) => {
      const master = r.master as unknown as { name: string; drug_brands?: { brand_name: string }[] } | null
      const brandName = master?.drug_brands?.[0]?.brand_name ?? null
      const genericName = master?.name ?? (r.drug as unknown as { name: string } | null)?.name ?? 'Medication'
      const amount = (r.qty as number) * (r.price_snapshot as number)
      // HSN + GST from the dispense's batch (captured at goods-receipt).
      const batch = r.batch as unknown as { hsn_code: string | null; gst_rate: number | null } | null
      const { rate, inclusive, hsn } = resolveLineGst('pharmacy', gstCfg, { gst_rate: batch?.gst_rate ?? null, hsn_sac: batch?.hsn_code ?? null })
      const { taxableValue, taxAmount } = computeLineGst(amount, rate, inclusive)
      return {
        id: crypto.randomUUID(),
        tenant_id: actor.tenant_id,
        bill_id: billId,
        source: 'pharmacy',
        ref_id: r.id,
        description: brandName ?? genericName,
        qty: r.qty as number,
        unit_price: r.price_snapshot as number,
        amount,
        gst_rate: rate,
        tax_inclusive: inclusive,
        hsn_sac: hsn,
        taxable_value: taxableValue,
        tax_amount: taxAmount,
      }
    })
  )
  if (itemErr) {
    // Void, don't delete: the invoice number is already issued and must stay in sequence.
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
    return { success: false, error: itemErr.message }
  }

  // Set GST aggregates + total from the stamped items.
  await recomputeBillGstTotals(supabase, billId)

  // Only the dispenses on this bill — one dispensed after the bill was built stays
  // unbilled for the next bill instead of being marked billed with no charge.
  await supabase
    .from('dispenses')
    .update({ billing_status: 'billed' })
    .in('id', rows.map((r) => r.id as string))
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
  if (bill.status !== 'paid' && !(await unpaidAllowed(supabase, actor.tenant_id, 'pharmacy', bill as { id: string; visit_id: string | null; admission_id: string | null }))) {
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
    // Every dispense the hospital has ever made, so it must be paged: a short
    // read here does not error, it silently forgets that a prescription was
    // dispensed and leaves the patient showing as still waiting at the counter.
    const dispensedRxIds = new Set(
      (await pageAll<{ prescription_id: string }>((f, t) => supabase
        .from('dispenses').select('prescription_id').not('prescription_id', 'is', null)
        .order('id').range(f, t))).map((d) => d.prescription_id)
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
  const today = istToday()
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
