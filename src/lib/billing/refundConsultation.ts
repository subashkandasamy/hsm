import type { SupabaseClient } from '@supabase/supabase-js'

const CREDIT_NOTE_METHODS = ['cash', 'card', 'upi', 'bank_transfer'] as const

export interface RefundOutcome {
  credited: Array<{ credit_no: string; method: string; amount: number }>
  /** Insurance-paid amount — goes back through the insurer, not refunded to the patient. */
  insuranceNotRefunded: number
  errors: string[]
}

/**
 * Refunds a cancelled consultation bill's payments as credit notes, one per
 * ORIGINAL payment method (net of anything already credit-noted). A UPI or card
 * payment is refunded as UPI/card — not cash — so the shift close's per-method
 * drawer totals stay right. Credit notes are the refund record the cash book and
 * shift close already read, and get a proper CN number (no invoice number used).
 */
export async function refundCancelledConsultation(
  supabase: SupabaseClient,
  actor: { id: string; tenant_id: string },
  billId: string,
): Promise<RefundOutcome> {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const out: RefundOutcome = { credited: [], insuranceNotRefunded: 0, errors: [] }

  const [{ data: pays }, { data: notes }] = await Promise.all([
    supabase.from('payments').select('amount, method').eq('bill_id', billId).neq('method', 'advance'),
    supabase.from('credit_notes').select('amount, method').eq('bill_id', billId),
  ])
  const byMethod = new Map<string, number>()
  for (const p of pays ?? []) byMethod.set(p.method as string, (byMethod.get(p.method as string) ?? 0) + Number(p.amount))
  for (const c of notes ?? []) byMethod.set(c.method as string, (byMethod.get(c.method as string) ?? 0) - Number(c.amount))

  for (const [method, remaining] of byMethod) {
    const amount = round2(remaining)
    if (amount <= 0) continue
    if (!(CREDIT_NOTE_METHODS as readonly string[]).includes(method)) {
      if (method === 'insurance') out.insuranceNotRefunded = round2(out.insuranceNotRefunded + amount)
      continue
    }
    const { data: creditNo, error: noErr } = await supabase.rpc('get_next_credit_no', { p_tenant_id: actor.tenant_id })
    if (noErr || !creditNo) { out.errors.push(`${method}: could not get a credit note number`); continue }
    const { error } = await supabase.from('credit_notes').insert({
      id: crypto.randomUUID(), tenant_id: actor.tenant_id, bill_id: billId, credit_no: creditNo as string,
      amount, method, reason: 'Appointment cancelled — consultation fee refund', refunded_by: actor.id,
    })
    if (error) out.errors.push(`${method}: ${error.message}`)
    else out.credited.push({ credit_no: creditNo as string, method, amount })
  }
  if (out.errors.length) console.error('[cancelAppointment] refund credit note failed', { billId, errors: out.errors })
  return out
}
