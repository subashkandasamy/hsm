'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import { getCollectionSummary, SERVICE_BILLS_ONLY } from '@/lib/billing/collections'
import { istDayBoundsISO } from '@/lib/istDate'
import type { DayEndSheet, DayEndSourceLine } from '@/lib/types'

/**
 * One day of money, as an accountant reads it.
 *
 * ── Why collected and billed are two separate blocks ───────────────────────
 *
 * They are different measures and they are not meant to agree. A payment is
 * attached to a *bill*, not to a bill *item*, so revenue splits by department
 * exactly and money does not: a single ₹10,000 payment against a consolidated
 * IPD bill cannot be divided between the bed, the lab and the pharmacy without
 * inventing a rule. And an advance has no department at all — it is a deposit
 * taken before anyone knows what will be used.
 *
 * So this returns three facts that are each true on their own — what came in,
 * what was raised, and what is still owed — rather than one blended number
 * that would be wrong in a way nobody could see. The hospital owner asked for
 * "collected separately and yet to collect separately", which is the same
 * conclusion reached from the other end.
 *
 * ── Why the breakdown reconciles ──────────────────────────────────────────
 *
 * The per-department figures are gross line amounts, which sum to the bills'
 * subtotal; discount, tax and rounding are then shown as their own lines down
 * to the billed total. Checked against every non-cancelled bill in the demo
 * tenant: `sum(items.amount) = subtotal` and
 * `subtotal − discount + tax + round_off = total`, with no exceptions. An
 * accountant can therefore add the column up and arrive at the figure printed
 * underneath it, which is the whole point of giving them a sheet.
 */
export async function getDayEndSheet(date: string): Promise<DayEndSheet> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')

  const supabase = await createClient()
  const { from, to } = istDayBoundsISO(date)

  const [collection, billsRes, outstandingRes] = await Promise.all([
    // The shared definition, so this sheet can never disagree with the Cash
    // Book or the Dashboard about what "collected" means.
    getCollectionSummary(supabase, actor.tenant_id, from, to),

    supabase.from('bills')
      .select('id, subtotal, discount, tax, round_off, total, items:bill_items(source, amount)')
      .gte('created_at', from).lt('created_at', to)
      .neq('status', 'cancelled')
      .or(SERVICE_BILLS_ONLY),

    supabase.from('bills')
      .select('total, paid, created_at')
      .in('status', ['unpaid', 'partial'])
      .or(SERVICE_BILLS_ONLY),
  ])

  if (billsRes.error) throw new Error(`Could not read the day's bills: ${billsRes.error.message}`)
  if (outstandingRes.error) throw new Error(`Could not read outstanding bills: ${outstandingRes.error.message}`)

  type BillRow = {
    id: string; subtotal: number; discount: number; tax: number
    round_off: number | null; total: number
    items: Array<{ source: string; amount: number }> | null
  }
  const bills = (billsRes.data ?? []) as unknown as BillRow[]

  const bySource = new Map<string, { amount: number; count: number }>()
  let subtotal = 0, discount = 0, tax = 0, roundOff = 0, billedTotal = 0
  for (const b of bills) {
    subtotal    += Number(b.subtotal ?? 0)
    discount    += Number(b.discount ?? 0)
    tax         += Number(b.tax ?? 0)
    roundOff    += Number(b.round_off ?? 0)
    billedTotal += Number(b.total ?? 0)
    for (const it of b.items ?? []) {
      const cur = bySource.get(it.source) ?? { amount: 0, count: 0 }
      cur.amount += Number(it.amount ?? 0)
      cur.count  += 1
      bySource.set(it.source, cur)
    }
  }

  const sources: DayEndSourceLine[] = [...bySource.entries()]
    .map(([source, v]) => ({ source, amount: round2(v.amount), lines: v.count }))
    .sort((a, b) => b.amount - a.amount)

  // Outstanding is split by when the bill was raised, because "owed from
  // today" and "owed from before" are different problems: one is a patient
  // still at the counter, the other is a debt somebody has to chase.
  let outstandingToday = 0, outstandingEarlier = 0, outstandingCount = 0
  for (const b of (outstandingRes.data ?? []) as Array<{ total: number; paid: number; created_at: string }>) {
    const due = Math.max(0, Number(b.total) - Number(b.paid))
    if (due <= 0) continue
    outstandingCount++
    if (b.created_at >= from && b.created_at < to) outstandingToday += due
    else outstandingEarlier += due
  }

  return {
    date,
    collected: {
      total:        collection.total,
      billPayments: collection.billPayments,
      advances:     collection.advances,
      refunds:      collection.refunds,
      byMethod:     await collectedByMethod(supabase, actor.tenant_id, from, to),
    },
    billed: {
      bills:    bills.length,
      sources,
      subtotal: round2(subtotal),
      discount: round2(discount),
      tax:      round2(tax),
      roundOff: round2(roundOff),
      total:    round2(billedTotal),
    },
    outstanding: {
      today:    round2(outstandingToday),
      earlier:  round2(outstandingEarlier),
      total:    round2(outstandingToday + outstandingEarlier),
      bills:    outstandingCount,
    },
  }
}

/**
 * Cash in, split by how it arrived.
 *
 * `advance` is excluded for the same reason `getCollectionSummary` excludes
 * it: applying a deposit already counted is not money arriving twice. The
 * deposits themselves come from `admission_advances`, which carries its own
 * method, and are added to the same buckets.
 */
async function collectedByMethod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string, from: string, to: string,
): Promise<Record<string, number>> {
  const [pays, advs] = await Promise.all([
    supabase.from('payments').select('amount, method').eq('tenant_id', tenantId)
      .gte('received_at', from).lt('received_at', to).neq('method', 'advance'),
    supabase.from('admission_advances').select('amount, method').eq('tenant_id', tenantId)
      .gte('received_at', from).lt('received_at', to),
  ])
  if (pays.error) throw new Error(`Could not read payments: ${pays.error.message}`)
  if (advs.error) throw new Error(`Could not read advances: ${advs.error.message}`)

  const out: Record<string, number> = {}
  for (const r of [...(pays.data ?? []), ...(advs.data ?? [])] as Array<{ amount: number; method: string | null }>) {
    const k = (r.method ?? 'other').toLowerCase()
    out[k] = round2((out[k] ?? 0) + Number(r.amount))
  }
  return out
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
