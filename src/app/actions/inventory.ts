'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import {
  SupplierSchema, InventoryItemSchema, CreatePOSchema,
  ReceivePOSchema, StockIssueSchema, StockAdjustSchema,
} from '@/lib/schemas'
import type { Supplier, InventoryItem, PurchaseOrder, StockMovement, InventoryBatch } from '@/lib/types'
import { istToday, istAddDays } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }
type SB = Awaited<ReturnType<typeof createClient>>

// ---- Batch helpers ----

// qty_in_stock is a cached total; keep it equal to SUM(batch qty_available).
async function recomputeItemQty(supabase: SB, itemId: string): Promise<void> {
  const { data } = await supabase
    .from('inventory_batches').select('qty_available').eq('item_id', itemId)
  const total = (data ?? []).reduce((s, b) => s + ((b.qty_available as number) ?? 0), 0)
  await supabase.from('inventory_items').update({ qty_in_stock: total }).eq('id', itemId)
}

// Consume `qty` from an item's batches, oldest-expiry-first (FEFO); undated
// batches go last. Writes a stock_movement per batch touched. Returns false if
// total available is short. (Small-hospital concurrency: fetch-then-update is
// acceptable here, matching the pharmacy dispense pattern.)
async function consumeFEFO(
  supabase: SB, tenantId: string, itemId: string, qty: number,
  reason: 'issue' | 'adjustment', note: string | null, actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: batches } = await supabase
    .from('inventory_batches')
    .select('id, qty_available, expiry, created_at')
    .eq('item_id', itemId)
    .gt('qty_available', 0)
    .order('expiry', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const rows = (batches ?? []) as Array<{ id: string; qty_available: number }>
  const total = rows.reduce((s, b) => s + b.qty_available, 0)
  if (total < qty) return { ok: false, error: 'Insufficient stock' }

  let remaining = qty
  for (const b of rows) {
    if (remaining <= 0) break
    const take = Math.min(remaining, b.qty_available)
    await supabase.from('inventory_batches')
      .update({ qty_available: b.qty_available - take }).eq('id', b.id)
    await supabase.from('stock_movements').insert({
      id: crypto.randomUUID(), tenant_id: tenantId, item_id: itemId,
      change: -take, reason, batch_id: b.id, note, created_by: actorId,
    })
    remaining -= take
  }
  return { ok: true }
}

// ---- Suppliers ----

export async function listSuppliers(): Promise<Supplier[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('suppliers').select('*').order('name')
  return (data ?? []) as Supplier[]
}

export async function createSupplier(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = SupplierSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('suppliers').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'supplier', id, { name: parsed.data.name })
  return { success: true }
}

export async function updateSupplier(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = SupplierSchema.partial().safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('suppliers').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'supplier', id, parsed.data as Record<string, unknown>)
  return { success: true }
}

// ---- Items ----

export async function listItems(): Promise<InventoryItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inventory_items').select('*').eq('is_active', true).order('name')
  return (data ?? []) as InventoryItem[]
}

export async function createItem(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = InventoryItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const { error } = await supabase.from('inventory_items').insert({ id, tenant_id: actor.tenant_id, ...parsed.data })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'create', 'inventory_item', id, { name: parsed.data.name })
  return { success: true }
}

export async function updateItem(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = InventoryItemSchema.partial().safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const supabase = await createClient()
  const { error } = await supabase.from('inventory_items').update(parsed.data).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'update', 'inventory_item', id, parsed.data as Record<string, unknown>)
  return { success: true }
}

export async function getStockAlerts(): Promise<InventoryItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inventory_items').select('*').eq('is_active', true).order('qty_in_stock')
  return ((data ?? []) as InventoryItem[]).filter((i) => i.qty_in_stock <= i.reorder_level)
}

export async function getItemHistory(itemId: string): Promise<StockMovement[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('stock_movements')
    .select('*, creator:profiles(id, full_name)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as StockMovement[]
}

// ---- Purchase Orders ----

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('purchase_orders')
    .select('*, supplier:suppliers(id, name), items:po_items(*, item:inventory_items(id, name, unit))')
    .order('created_at', { ascending: false })
    .limit(200)
  return (data ?? []) as unknown as PurchaseOrder[]
}

export async function createPO(
  input: Record<string, unknown>
): Promise<{ success: true; poId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = CreatePOSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: poNo, error: seqErr } = await supabase.rpc('get_next_po_no')
  if (seqErr || !poNo) return { success: false, error: 'Failed to generate PO number' }

  const total = parsed.data.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)
  const poId = crypto.randomUUID()

  const { error: poErr } = await supabase.from('purchase_orders').insert({
    id: poId, tenant_id: actor.tenant_id, po_no: poNo as string,
    supplier_id: parsed.data.supplier_id ?? null,
    status: 'draft', total, created_by: actor.id,
  })
  if (poErr) return { success: false, error: poErr.message }

  const { error: itemsErr } = await supabase.from('po_items').insert(
    parsed.data.lines.map((l) => ({
      id: crypto.randomUUID(), tenant_id: actor.tenant_id, po_id: poId,
      item_id: l.item_id, qty: l.qty, unit_price: l.unit_price, received_qty: 0,
    }))
  )
  if (itemsErr) {
    await supabase.from('purchase_orders').delete().eq('id', poId)
    return { success: false, error: itemsErr.message }
  }

  await logAudit(actor.id, 'create', 'purchase_order', poId, { po_no: poNo, total })
  return { success: true, poId }
}

export async function markOrdered(poId: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const supabase = await createClient()
  const { error } = await supabase
    .from('purchase_orders').update({ status: 'ordered' }).eq('id', poId).eq('status', 'draft')
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'ordered', 'purchase_order', poId)
  return { success: true }
}

export async function receivePO(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = ReceivePOSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status, supplier_id, items:po_items(id, item_id, qty, received_qty, unit_price)')
    .eq('id', parsed.data.po_id)
    .single()

  if (!po) return { success: false, error: 'PO not found' }
  if ((po.status as string) === 'received' || (po.status as string) === 'cancelled')
    return { success: false, error: `PO is already ${po.status}` }

  const poSupplierId = (po.supplier_id as string | null) ?? null
  const items = (po.items ?? []) as Array<{ id: string; item_id: string; qty: number; received_qty: number; unit_price: number }>

  for (const receipt of parsed.data.receipts) {
    if (receipt.received_qty <= 0) continue
    const poItem = items.find((i) => i.id === receipt.po_item_id)
    if (!poItem) continue

    const newReceived = poItem.received_qty + receipt.received_qty
    await supabase.from('po_items').update({ received_qty: newReceived }).eq('id', receipt.po_item_id)

    // Each goods receipt becomes a batch (with its lot no / expiry / cost),
    // so expiry and FEFO are tracked from the moment stock arrives.
    const batchId = crypto.randomUUID()
    await supabase.from('inventory_batches').insert({
      id: batchId,
      tenant_id: actor.tenant_id,
      item_id: poItem.item_id,
      batch_no: receipt.batch_no?.trim() || null,
      expiry: receipt.expiry || null,
      qty_available: receipt.received_qty,
      unit_cost: receipt.unit_cost ?? poItem.unit_price ?? null,
      supplier_id: poSupplierId,
      po_id: parsed.data.po_id,
      created_by: actor.id,
    })

    await supabase.from('stock_movements').insert({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      item_id: poItem.item_id,
      change: receipt.received_qty,
      reason: 'purchase',
      ref_id: parsed.data.po_id,
      batch_id: batchId,
      note: 'Received on PO',
      created_by: actor.id,
    })

    await recomputeItemQty(supabase, poItem.item_id)
  }

  // Determine new PO status from updated po_items
  const { data: updatedItems } = await supabase
    .from('po_items').select('qty, received_qty').eq('po_id', parsed.data.po_id)
  const rows = (updatedItems ?? []) as Array<{ qty: number; received_qty: number }>
  const fullyReceived = rows.length > 0 && rows.every((r) => r.received_qty >= r.qty)
  const anyReceived   = rows.some((r) => r.received_qty > 0)
  const newStatus = fullyReceived ? 'received' : anyReceived ? 'partially_received' : po.status

  await supabase.from('purchase_orders').update({
    status: newStatus,
    received_at: fullyReceived ? new Date().toISOString() : undefined,
  }).eq('id', parsed.data.po_id)

  await logAudit(actor.id, 'receive', 'purchase_order', parsed.data.po_id, { status: newStatus })
  return { success: true }
}

// ---- Issue stock (concurrency-safe decrement) ----

export async function issueStock(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = StockIssueSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // FEFO: consume from the oldest-expiry batches first.
  const res = await consumeFEFO(
    supabase, actor.tenant_id, parsed.data.item_id, parsed.data.qty,
    'issue', parsed.data.note ?? null, actor.id,
  )
  if (!res.ok) return { success: false, error: res.error }
  await recomputeItemQty(supabase, parsed.data.item_id)

  await logAudit(actor.id, 'issue', 'inventory_item', parsed.data.item_id, { qty: parsed.data.qty })
  return { success: true }
}

// ---- Manual adjustment ----

export async function adjustStock(input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = StockAdjustSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  if (parsed.data.change < 0) {
    // Negative adjustment (damage/loss/correction) → remove FEFO across batches.
    const res = await consumeFEFO(
      supabase, actor.tenant_id, parsed.data.item_id, -parsed.data.change,
      'adjustment', parsed.data.note, actor.id,
    )
    if (!res.ok) return { success: false, error: 'Adjustment would result in negative stock' }
  } else {
    // Positive adjustment (found stock/opening correction) → an undated batch.
    const batchId = crypto.randomUUID()
    const { error } = await supabase.from('inventory_batches').insert({
      id: batchId, tenant_id: actor.tenant_id, item_id: parsed.data.item_id,
      batch_no: 'ADJ', expiry: null, qty_available: parsed.data.change, created_by: actor.id,
    })
    if (error) return { success: false, error: error.message }
    await supabase.from('stock_movements').insert({
      id: crypto.randomUUID(), tenant_id: actor.tenant_id, item_id: parsed.data.item_id,
      change: parsed.data.change, reason: 'adjustment', batch_id: batchId,
      note: parsed.data.note, created_by: actor.id,
    })
  }

  await recomputeItemQty(supabase, parsed.data.item_id)
  await logAudit(actor.id, 'adjust', 'inventory_item', parsed.data.item_id, {
    change: parsed.data.change, note: parsed.data.note,
  })
  return { success: true }
}

// ---- Expiry & batches ----

// Batches expiring within `withinDays` (default 90) OR already expired, plus a
// derived days-to-expiry, for the Expiry alerts tab.
export async function getExpiryAlerts(withinDays = 90): Promise<Array<InventoryBatch & { days_to_expiry: number }>> {
  const supabase = await createClient()
  const cutoff = istAddDays(istToday(), withinDays)
  const { data } = await supabase
    .from('inventory_batches')
    .select('*, item:inventory_items(id, name, unit)')
    .gt('qty_available', 0)
    .not('expiry', 'is', null)
    .lte('expiry', cutoff)
    .order('expiry', { ascending: true })

  const today = Date.now()
  return ((data ?? []) as unknown as InventoryBatch[]).map((b) => ({
    ...b,
    days_to_expiry: Math.ceil((new Date(b.expiry as string).getTime() - today) / 86400000),
  }))
}

export async function listItemBatches(itemId: string): Promise<InventoryBatch[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('item_id', itemId)
    .gt('qty_available', 0)
    .order('expiry', { ascending: true, nullsFirst: false })
  return (data ?? []) as unknown as InventoryBatch[]
}
