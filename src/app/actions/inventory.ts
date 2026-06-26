'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import {
  SupplierSchema, InventoryItemSchema, CreatePOSchema,
  ReceivePOSchema, StockIssueSchema, StockAdjustSchema,
} from '@/lib/schemas'
import type { Supplier, InventoryItem, PurchaseOrder, StockMovement } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Suppliers ----

export async function listSuppliers(): Promise<Supplier[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('suppliers').select('*').order('name')
  return (data ?? []) as Supplier[]
}

export async function createSupplier(input: Record<string, unknown>): Promise<SimpleResult> {
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
      id: crypto.randomUUID(), po_id: poId,
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
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = ReceivePOSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('status, items:po_items(id, item_id, qty, received_qty)')
    .eq('id', parsed.data.po_id)
    .single()

  if (!po) return { success: false, error: 'PO not found' }
  if ((po.status as string) === 'received' || (po.status as string) === 'cancelled')
    return { success: false, error: `PO is already ${po.status}` }

  const items = (po.items ?? []) as Array<{ id: string; item_id: string; qty: number; received_qty: number }>

  for (const receipt of parsed.data.receipts) {
    if (receipt.received_qty <= 0) continue
    const poItem = items.find((i) => i.id === receipt.po_item_id)
    if (!poItem) continue

    const newReceived = poItem.received_qty + receipt.received_qty
    await supabase.from('po_items').update({ received_qty: newReceived }).eq('id', receipt.po_item_id)

    // Additive increment — safe to fetch-then-update (no race risk for additions)
    const { data: current } = await supabase
      .from('inventory_items').select('qty_in_stock').eq('id', poItem.item_id).single()
    const newQty = ((current?.qty_in_stock as number) ?? 0) + receipt.received_qty
    await supabase.from('inventory_items').update({ qty_in_stock: newQty }).eq('id', poItem.item_id)

    await supabase.from('stock_movements').insert({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      item_id: poItem.item_id,
      change: receipt.received_qty,
      reason: 'purchase',
      ref_id: parsed.data.po_id,
      note: 'Received on PO',
      created_by: actor.id,
    })
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
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = StockIssueSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Conditional UPDATE: only touches the row when qty_in_stock >= requested qty.
  // If the filter doesn't match (insufficient stock or race), data will be empty.
  const { data, error } = await supabase
    .from('inventory_items')
    .select('id, qty_in_stock')
    .eq('id', parsed.data.item_id)
    .gte('qty_in_stock', parsed.data.qty)
    .single()

  if (error || !data) return { success: false, error: 'Insufficient stock' }

  const newQty = (data.qty_in_stock as number) - parsed.data.qty
  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ qty_in_stock: newQty })
    .eq('id', parsed.data.item_id)
    .gte('qty_in_stock', parsed.data.qty) // double-guard
  if (updateErr) return { success: false, error: updateErr.message }

  await supabase.from('stock_movements').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    item_id: parsed.data.item_id,
    change: -parsed.data.qty,
    reason: 'issue',
    note: parsed.data.note ?? null,
    created_by: actor.id,
  })

  await logAudit(actor.id, 'issue', 'inventory_item', parsed.data.item_id, { qty: parsed.data.qty })
  return { success: true }
}

// ---- Manual adjustment ----

export async function adjustStock(input: Record<string, unknown>): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'inventory:manage')
  const parsed = StockAdjustSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: item } = await supabase
    .from('inventory_items').select('qty_in_stock').eq('id', parsed.data.item_id).single()
  if (!item) return { success: false, error: 'Item not found' }

  const newQty = (item.qty_in_stock as number) + parsed.data.change
  if (newQty < 0) return { success: false, error: 'Adjustment would result in negative stock' }

  const { error } = await supabase
    .from('inventory_items').update({ qty_in_stock: newQty }).eq('id', parsed.data.item_id)
  if (error) return { success: false, error: error.message }

  await supabase.from('stock_movements').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    item_id: parsed.data.item_id,
    change: parsed.data.change,
    reason: 'adjustment',
    note: parsed.data.note,
    created_by: actor.id,
  })

  await logAudit(actor.id, 'adjust', 'inventory_item', parsed.data.item_id, {
    change: parsed.data.change, note: parsed.data.note,
  })
  return { success: true }
}
