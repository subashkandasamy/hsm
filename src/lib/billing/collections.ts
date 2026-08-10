// Shared "money collected" definition used by the Billing page, the Dashboard,
// and the Cash Book so all three always agree.
//
// Cash-in on a day = real bill payments (excluding method='advance', which is
// just applying an already-collected deposit) + advance deposits collected
// − advance refunds − credit-note refunds.

import type { SupabaseClient } from '@supabase/supabase-js'

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100 }

export interface CollectionSummary {
  total: number         // net cash-in
  billPayments: number  // real payments recorded against bills (cash/card/upi/bank/insurance)
  advances: number      // advance deposits collected
  refunds: number       // advance refunds + credit notes (money paid out)
}

/** Today's date in IST (YYYY-MM-DD) — matches how the app reckons a "day". */
export function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

/** UTC ISO bounds [from, to) for a given IST calendar day. */
export function istDayBoundsISO(dateIST: string): { from: string; to: string } {
  const startMs = new Date(`${dateIST}T00:00:00+05:30`).getTime()
  return { from: new Date(startMs).toISOString(), to: new Date(startMs + 86400000).toISOString() }
}

export async function getCollectionSummary(
  supabase: SupabaseClient,
  tenantId: string,
  fromISO: string,
  toISO: string,
): Promise<CollectionSummary> {
  const [pRes, aRes, arRes, cnRes] = await Promise.all([
    supabase.from('payments').select('amount, method').eq('tenant_id', tenantId)
      .gte('received_at', fromISO).lt('received_at', toISO),
    supabase.from('admission_advances').select('amount').eq('tenant_id', tenantId)
      .gte('received_at', fromISO).lt('received_at', toISO),
    supabase.from('admission_advance_refunds').select('amount').eq('tenant_id', tenantId)
      .gte('refunded_at', fromISO).lt('refunded_at', toISO),
    supabase.from('credit_notes').select('amount').eq('tenant_id', tenantId)
      .gte('created_at', fromISO).lt('created_at', toISO),
  ])

  const billPayments = ((pRes.data ?? []) as Array<{ amount: number; method: string }>)
    .filter((p) => p.method !== 'advance')
    .reduce((s, p) => s + Number(p.amount), 0)
  const advances = ((aRes.data ?? []) as Array<{ amount: number }>).reduce((s, a) => s + Number(a.amount), 0)
  const refunds = ((arRes.data ?? []) as Array<{ amount: number }>).reduce((s, r) => s + Number(r.amount), 0)
    + ((cnRes.data ?? []) as Array<{ amount: number }>).reduce((s, c) => s + Number(c.amount), 0)

  return {
    total: round2(billPayments + advances - refunds),
    billPayments: round2(billPayments),
    advances: round2(advances),
    refunds: round2(refunds),
  }
}
