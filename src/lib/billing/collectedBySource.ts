/**
 * Money collected, by department.
 *
 * A payment belongs to a bill, not to a department; a bill's lines say which
 * departments it is for (`bill_items.source`). So each payment is shared across
 * its bill's departments in proportion to the bill. For a bill with one
 * department — 473 of 475 in production when this was written — that is exact;
 * for a mixed bill it is the fair reading.
 *
 * Each share is rounded to the paisa and any rounding remainder goes to the
 * largest share, so the departments of a payment always add up to the payment
 * itself and the day's total reconciles to the money that arrived. A payment
 * whose bill has no lines cannot be placed and is reported as unattributed
 * rather than guessed.
 *
 * Pure, so it can be tested: `npm run verify:collected-by-source`.
 */

export interface PaymentRow { bill_id: string; amount: number }
export interface ItemRow { bill_id: string; source: string; amount: number }
export interface SourceCollected { source: string; amount: number; lines: number }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function collectedBySource(
  payments: PaymentRow[],
  items: ItemRow[],
): { bySource: SourceCollected[]; unattributed: number } {
  // Each bill as its departments and their values.
  const bills = new Map<string, Map<string, number>>()
  for (const it of items) {
    const amount = Number(it.amount)
    if (!(amount > 0)) continue
    const m = bills.get(it.bill_id) ?? new Map<string, number>()
    m.set(it.source, (m.get(it.source) ?? 0) + amount)
    bills.set(it.bill_id, m)
  }

  const out = new Map<string, { amount: number; lines: number }>()
  let unattributed = 0
  for (const p of payments) {
    const paid = r2(Number(p.amount))
    if (!paid) continue
    const parts = bills.get(p.bill_id)
    const billTotal = parts ? [...parts.values()].reduce((s, v) => s + v, 0) : 0
    if (!parts || billTotal <= 0) { unattributed = r2(unattributed + paid); continue }

    const entries = [...parts.entries()].sort((a, b) => b[1] - a[1])
    const shares = entries.map(([source, v]) => ({ source, share: r2(paid * v / billTotal) }))
    const remainder = r2(paid - shares.reduce((s, x) => s + x.share, 0))
    if (remainder) shares[0].share = r2(shares[0].share + remainder)

    for (const { source, share } of shares) {
      const cur = out.get(source) ?? { amount: 0, lines: 0 }
      cur.amount = r2(cur.amount + share)
      cur.lines += 1
      out.set(source, cur)
    }
  }

  const bySource = [...out.entries()]
    .map(([source, v]) => ({ source, amount: v.amount, lines: v.lines }))
    .filter((x) => x.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
  return { bySource, unattributed }
}
