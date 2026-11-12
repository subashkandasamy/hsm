import type { SupabaseClient } from '@supabase/supabase-js'
import { recomputeBillGstTotals } from '@/lib/billing/gst'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type ReconcileResult =
  | { ok: true; total: number; paid: number; status: string; advanceReleased: number; overpaid: number }
  /** New total is below what the patient actually paid (cash/card/UPI/bank/insurance). Nothing was changed. */
  | { ok: false; total: number; patientPaid: number; overpaidBy: number }

/**
 * Brings a bill's totals, paid amount and status back in line after anything
 * that changes its total (discount, GST edit, fee change, line added/removed).
 *
 * The payments table is the source of truth for `paid` — the cached bills.paid
 * drifted (e.g. an advance applied twice left paid ₹850 against ₹1,150 of
 * payments), and edits that lowered the total never touched paid/status, so a
 * part-paid bill could end up with paid > total, stuck as "partial".
 *
 * 1. Recompute GST totals from the lines.
 * 2. If the new total is below what the patient really paid and `allowOverpaid`
 *    is false, stop (ok: false) so the caller can undo its edit — an edit must
 *    not silently leave money owed back to the patient.
 * 3. Release advance credit applied beyond the new total (latest first) — it
 *    returns to the admission's advance pool.
 * 4. Set paid = sum of payments and derive status.
 */
export async function reconcileBill(
  supabase: SupabaseClient,
  billId: string,
  opts: { allowOverpaid?: boolean } = {},
): Promise<ReconcileResult> {
  const total = round2(await recomputeBillGstTotals(supabase, billId))

  const [{ data: bill }, { data: pays }] = await Promise.all([
    supabase.from('bills').select('status, discount').eq('id', billId).maybeSingle(),
    supabase.from('payments').select('id, amount, method, received_at').eq('bill_id', billId),
  ])
  const payments = (pays ?? []) as Array<{ id: string; amount: number; method: string; received_at: string }>
  const patientPaid = round2(payments.filter((p) => p.method !== 'advance').reduce((s, p) => s + Number(p.amount), 0))

  if (!opts.allowOverpaid && patientPaid > total + 0.005) {
    return { ok: false, total, patientPaid, overpaidBy: round2(patientPaid - total) }
  }

  let paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0))
  let excess = round2(paid - total)
  let advanceReleased = 0
  const advances = payments.filter((p) => p.method === 'advance').sort((a, b) => (a.received_at < b.received_at ? 1 : -1))
  for (const p of advances) {
    if (excess <= 0) break
    const amount = Number(p.amount)
    const cut = round2(Math.min(amount, excess))
    if (cut >= amount) await supabase.from('payments').delete().eq('id', p.id)
    else await supabase.from('payments').update({ amount: round2(amount - cut) }).eq('id', p.id)
    excess = round2(excess - cut)
    paid = round2(paid - cut)
    advanceReleased = round2(advanceReleased + cut)
  }

  const current = (bill?.status as string | undefined) ?? 'unpaid'
  // Discounted down to nothing is settled — such a bill sat "unpaid" (BUG-062).
  // (An empty draft stays a draft: it has had no discount.)
  const waived = total <= 0 && Number(bill?.discount ?? 0) > 0
  const status =
    current === 'cancelled' ? 'cancelled'
      : current === 'draft' && paid === 0 && !waived ? 'draft'
      : waived ? 'paid'
      : paid <= 0 ? 'unpaid'
      : paid >= total ? 'paid'
      : 'partial'
  await supabase.from('bills').update({ paid, status }).eq('id', billId)

  return { ok: true, total, paid, status, advanceReleased, overpaid: Math.max(0, round2(paid - total)) }
}

/** Human message for an edit that would drop a bill below what was already paid. */
export function overpaidMessage(r: { total: number; patientPaid: number }): string {
  return `This would make the bill ₹${r.total.toFixed(2)}, less than the ₹${r.patientPaid.toFixed(2)} already paid. Issue a refund first, or make a smaller change.`
}
