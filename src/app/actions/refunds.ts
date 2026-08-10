'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import type { CreditNote } from '@/lib/types'

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100 }

/** How much of a bill's collected money is still refundable (paid − credited). */
export async function getRefundable(billId: string): Promise<number> {
  const supabase = await createClient()
  const { data: bill } = await supabase.from('bills').select('paid').eq('id', billId).maybeSingle()
  const { data: cns } = await supabase.from('credit_notes').select('amount').eq('bill_id', billId)
  const credited = (cns ?? []).reduce((s, c) => s + Number(c.amount), 0)
  return Math.max(0, round2((Number(bill?.paid) || 0) - credited))
}

export async function listCreditNotes(billId: string): Promise<CreditNote[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('credit_notes')
    .select('id, bill_id, credit_no, amount, method, reason, created_at, refunder:profiles!credit_notes_refunded_by_fkey(full_name)')
    .eq('bill_id', billId)
    .order('created_at', { ascending: false })
  return ((data ?? []) as Array<Record<string, unknown>>).map((c) => ({
    id: c.id as string, bill_id: c.bill_id as string, credit_no: c.credit_no as string,
    amount: Number(c.amount), method: c.method as string, reason: (c.reason as string | null) ?? null,
    created_at: c.created_at as string,
    refunded_by_name: (c.refunder as unknown as { full_name: string } | null)?.full_name ?? null,
  }))
}

export async function issueCreditNote(input: {
  bill_id: string; amount: number; method: string; reason: string
}): Promise<{ success: true; id: string; credit_no: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')

  const amount = round2(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Enter a valid refund amount' }
  if (!['cash', 'card', 'upi', 'bank_transfer'].includes(input.method)) return { success: false, error: 'Choose a refund method' }
  const reason = (input.reason ?? '').trim()
  if (!reason) return { success: false, error: 'Enter a reason for the refund' }

  const supabase = await createClient()
  const { data: bill } = await supabase.from('bills').select('paid, status').eq('id', input.bill_id).maybeSingle()
  if (!bill) return { success: false, error: 'Bill not found' }
  if ((bill.status as string) === 'cancelled') return { success: false, error: 'Bill is cancelled' }

  const refundable = await getRefundable(input.bill_id)
  if (amount > refundable + 0.001) {
    return { success: false, error: `Refund exceeds refundable amount (₹${refundable.toFixed(2)})` }
  }

  const { data: noData, error: noErr } = await supabase.rpc('get_next_credit_no')
  if (noErr || !noData) return { success: false, error: 'Failed to generate credit note number' }

  const id = crypto.randomUUID()
  const { error } = await supabase.from('credit_notes').insert({
    id, tenant_id: actor.tenant_id, bill_id: input.bill_id, credit_no: noData as string,
    amount, method: input.method, reason, refunded_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'refund', 'bill', input.bill_id, { credit_no: noData, amount, method: input.method, reason })
  return { success: true, id, credit_no: noData as string }
}
