import type { SupabaseClient } from '@supabase/supabase-js'
import { recomputeBillGstTotals } from '@/lib/billing/gst'

export interface OrderBillOutcome {
  /** Bills that existed only for this order and were cancelled. */
  cancelledBills: string[]
  /** Shared bills (e.g. a day's pooled IPD lab bill) the order's lines were removed from. */
  trimmedBills: string[]
  /** Bills where the patient had already paid more than now remains — refund via credit note. */
  refundNeeded: string[]
  /** Advance credit returned to the admission's pool. */
  advanceReleased: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Takes a cancelled lab/radiology order or OT surgery off its bill(s) without touching
 * anything else on them.
 *
 * Orders don't always own their bill: IPD orders are pooled onto one bill per
 * admission + day + source, and a multi-test lab order has one line per test.
 * The old "find the bill_item, cancel its bill" logic therefore either cancelled
 * other orders' charges with it, or failed on multiple lines and removed nothing.
 *
 * - Bill holds only this order → cancel it (advance credit returned), unless the
 *   patient paid for it, in which case it is left for a refund.
 * - Bill also holds other charges → delete just this order's lines, recompute the
 *   GST totals, release any advance now applied beyond the new total, and reset
 *   paid/status. Cash paid beyond the new total is reported for a credit note.
 */
export async function removeOrderFromBills(
  supabase: SupabaseClient,
  source: 'lab' | 'radiology' | 'ot',
  refId: string,
): Promise<OrderBillOutcome> {
  const out: OrderBillOutcome = { cancelledBills: [], trimmedBills: [], refundNeeded: [], advanceReleased: 0 }

  const { data: lines } = await supabase
    .from('bill_items').select('bill_id').eq('source', source).eq('ref_id', refId)
  const billIds = [...new Set((lines ?? []).map((l) => l.bill_id as string))]

  for (const billId of billIds) {
    const { data: bill } = await supabase.from('bills').select('id, status').eq('id', billId).maybeSingle()
    if (!bill || bill.status === 'cancelled') continue

    const [{ data: allLines }, { data: pays }] = await Promise.all([
      supabase.from('bill_items').select('source, ref_id').eq('bill_id', billId),
      supabase.from('payments').select('id, amount, method, received_at').eq('bill_id', billId),
    ])
    const payments = (pays ?? []) as Array<{ id: string; amount: number; method: string; received_at: string }>
    const advances = payments.filter((p) => p.method === 'advance')
    const patientPaid = round2(payments.filter((p) => p.method !== 'advance').reduce((s, p) => s + Number(p.amount), 0))
    const others = (allLines ?? []).filter((l) => !(l.source === source && l.ref_id === refId))

    // ── Bill exists only for this order ─────────────────────────────────────────
    if (others.length === 0) {
      if (patientPaid > 0) { out.refundNeeded.push(billId); continue }
      if (advances.length) {
        await supabase.from('payments').delete().eq('bill_id', billId).eq('method', 'advance')
        out.advanceReleased = round2(out.advanceReleased + advances.reduce((s, p) => s + Number(p.amount), 0))
      }
      await supabase.from('bills').update({ status: 'cancelled', paid: 0 }).eq('id', billId)
      out.cancelledBills.push(billId)
      continue
    }

    // ── Shared bill: remove only this order's lines ─────────────────────────────
    await supabase.from('bill_items').delete().eq('bill_id', billId).eq('source', source).eq('ref_id', refId)
    const newTotal = await recomputeBillGstTotals(supabase, billId)

    let paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0))
    let excess = round2(paid - newTotal)
    // Release advance first (latest application first) — it returns to the pool.
    for (const p of [...advances].sort((a, b) => (a.received_at < b.received_at ? 1 : -1))) {
      if (excess <= 0) break
      const amount = Number(p.amount)
      const cut = Math.min(amount, excess)
      if (cut >= amount) await supabase.from('payments').delete().eq('id', p.id)
      else await supabase.from('payments').update({ amount: round2(amount - cut) }).eq('id', p.id)
      excess = round2(excess - cut)
      paid = round2(paid - cut)
      out.advanceReleased = round2(out.advanceReleased + cut)
    }
    if (excess > 0) out.refundNeeded.push(billId)

    const status =
      bill.status === 'draft' && paid === 0 ? 'draft'
        : paid <= 0 ? 'unpaid'
        : paid >= newTotal ? 'paid'
        : 'partial'
    await supabase.from('bills').update({ paid, status }).eq('id', billId)
    out.trimmedBills.push(billId)
  }

  return out
}
