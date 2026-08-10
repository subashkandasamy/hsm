'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission, hasPermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { recomputeBillGstTotals } from '@/lib/billing/gst'
import type { DiscountLimitRow, DiscountRequestRow, Role } from '@/lib/types'

type Result = { success: true } | { success: false; error: string }

// Roles that can be given a discount cap in settings (admin is always unlimited).
const DISCOUNT_ROLES: Role[] = ['accountant', 'receptionist']

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100 }

async function roleCap(
  supabase: Awaited<ReturnType<typeof createClient>>, role: string,
): Promise<number> {
  if (role === 'admin') return 100
  const { data } = await supabase.from('discount_limits').select('max_percent').eq('role', role).maybeSingle()
  return data ? Number(data.max_percent) : 0
}

// ── Settings: per-role caps ───────────────────────────────────────────────────
export async function getDiscountLimits(): Promise<DiscountLimitRow[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')
  const supabase = await createClient()
  const { data } = await supabase.from('discount_limits').select('role, max_percent')
  const byRole = new Map((data ?? []).map((r) => [r.role as string, Number(r.max_percent)]))
  return DISCOUNT_ROLES.map((role) => ({ role, max_percent: byRole.get(role) ?? 0 }))
}

export async function setDiscountLimit(role: string, maxPercent: number): Promise<Result> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'tariffs:manage')
  const pct = Number(maxPercent)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { success: false, error: 'Enter a percentage between 0 and 100' }
  const supabase = await createClient()
  const { error } = await supabase.from('discount_limits')
    .upsert({ tenant_id: actor.tenant_id, role, max_percent: pct }, { onConflict: 'tenant_id,role' })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'set_discount_limit', 'discount', role, { max_percent: pct })
  return { success: true }
}

async function applyDiscountToBill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  billId: string, amount: number, pct: number, reason: string | null,
): Promise<void> {
  await supabase.from('bills')
    .update({ discount: amount, discount_pct: pct, discount_reason: reason }).eq('id', billId)
  await recomputeBillGstTotals(supabase, billId)
}

// ── Apply within cap, else raise an approval request ──────────────────────────
export async function applyOrRequestDiscount(input: {
  bill_id: string; mode: 'percent' | 'amount'; value: number; reason: string
}): Promise<{ success: true; status: 'applied' | 'pending' } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const reason = (input.reason ?? '').trim()
  if (!reason) return { success: false, error: 'Select a discount reason' }
  const value = Number(input.value)
  if (!Number.isFinite(value) || value < 0) return { success: false, error: 'Enter a valid discount' }

  const supabase = await createClient()
  const { data: bill } = await supabase
    .from('bills').select('subtotal, status').eq('id', input.bill_id).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'paid' || (bill.status as string) === 'cancelled')
    return { success: false, error: 'Cannot modify a paid or cancelled bill' }

  const subtotal = Number(bill.subtotal) || 0
  let amount: number, pct: number
  if (input.mode === 'percent') {
    if (value > 100) return { success: false, error: 'Percentage cannot exceed 100' }
    pct = value; amount = round2(subtotal * value / 100)
  } else {
    if (value > subtotal) return { success: false, error: 'Discount cannot exceed the bill value' }
    amount = round2(value); pct = subtotal > 0 ? round2(value / subtotal * 100) : 0
  }

  const cap = await roleCap(supabase, actor.role)
  if (pct <= cap + 0.001) {
    await applyDiscountToBill(supabase, input.bill_id, amount, pct, reason)
    await logAudit(actor.id, 'discount', 'bill', input.bill_id, { amount, pct, reason })
    return { success: true, status: 'applied' }
  }

  // Over cap → replace any existing pending request with a fresh one.
  await supabase.from('discount_requests').delete().eq('bill_id', input.bill_id).eq('status', 'pending')
  const { error } = await supabase.from('discount_requests').insert({
    tenant_id: actor.tenant_id, bill_id: input.bill_id, requested_by: actor.id,
    requested_pct: pct, requested_amount: amount, reason, status: 'pending',
  })
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'discount_request', 'bill', input.bill_id, { amount, pct, reason })
  return { success: true, status: 'pending' }
}

// ── Approval queue ────────────────────────────────────────────────────────────
export async function getPendingDiscountForBill(billId: string): Promise<DiscountRequestRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('discount_requests')
    .select('id, bill_id, requested_pct, requested_amount, reason, status, created_at, requester:profiles!discount_requests_requested_by_fkey(full_name), bill:bills(bill_no, patient:patients(full_name))')
    .eq('bill_id', billId).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  const bill = data.bill as unknown as { bill_no: string; patient: { full_name: string } | null } | null
  return {
    id: data.id as string, bill_id: data.bill_id as string,
    bill_no: bill?.bill_no ?? '', patient_name: bill?.patient?.full_name ?? '',
    requested_by_name: (data.requester as unknown as { full_name: string } | null)?.full_name ?? '',
    requested_pct: Number(data.requested_pct), requested_amount: Number(data.requested_amount),
    reason: (data.reason as string | null) ?? null, status: data.status as 'pending',
    created_at: data.created_at as string,
  }
}

export async function listDiscountRequests(status: 'pending' | 'approved' | 'rejected' = 'pending'): Promise<DiscountRequestRow[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  const { data } = await supabase
    .from('discount_requests')
    .select('id, bill_id, requested_pct, requested_amount, reason, status, created_at, requester:profiles!discount_requests_requested_by_fkey(full_name), bill:bills(bill_no, patient:patients(full_name))')
    .eq('status', status)
    .order('created_at', { ascending: false }).limit(200)
  return ((data ?? []) as Array<Record<string, unknown>>).map((d) => {
    const bill = d.bill as unknown as { bill_no: string; patient: { full_name: string } | null } | null
    return {
      id: d.id as string, bill_id: d.bill_id as string,
      bill_no: bill?.bill_no ?? '', patient_name: bill?.patient?.full_name ?? '',
      requested_by_name: (d.requester as unknown as { full_name: string } | null)?.full_name ?? '',
      requested_pct: Number(d.requested_pct), requested_amount: Number(d.requested_amount),
      reason: (d.reason as string | null) ?? null, status: d.status as DiscountRequestRow['status'],
      created_at: d.created_at as string,
    }
  })
}

export async function approveDiscountRequest(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const supabase = await createClient()
  const { data: req } = await supabase
    .from('discount_requests').select('*').eq('id', id).maybeSingle()
  if (!req || (req.status as string) !== 'pending') return { success: false, error: 'Request not found or already decided' }
  if ((req.requested_by as string) === actor.id) return { success: false, error: 'You cannot approve your own discount request.' }

  // Approver must be admin, or have a cap covering the requested %.
  const cap = await roleCap(supabase, actor.role)
  if (!hasPermission(actor.role, 'admin:all') && Number(req.requested_pct) > cap + 0.001) {
    return { success: false, error: 'This discount is above your own limit — a higher authority must approve it.' }
  }

  const { data: bill } = await supabase.from('bills').select('status').eq('id', req.bill_id as string).single()
  if (!bill || (bill.status as string) === 'paid' || (bill.status as string) === 'cancelled')
    return { success: false, error: 'The bill is already paid or cancelled' }

  await applyDiscountToBill(supabase, req.bill_id as string, Number(req.requested_amount), Number(req.requested_pct), (req.reason as string | null) ?? null)
  await supabase.from('discount_requests')
    .update({ status: 'approved', decided_by: actor.id, decided_at: new Date().toISOString() }).eq('id', id)
  await logAudit(actor.id, 'discount_approve', 'bill', req.bill_id as string, { request_id: id, pct: req.requested_pct })
  return { success: true }
}

export async function rejectDiscountRequest(id: string): Promise<Result> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  const supabase = await createClient()
  const { data: req } = await supabase.from('discount_requests').select('bill_id, status').eq('id', id).maybeSingle()
  if (!req || (req.status as string) !== 'pending') return { success: false, error: 'Request not found or already decided' }
  const { error } = await supabase.from('discount_requests')
    .update({ status: 'rejected', decided_by: actor.id, decided_at: new Date().toISOString() }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'discount_reject', 'bill', req.bill_id as string, { request_id: id })
  return { success: true }
}
