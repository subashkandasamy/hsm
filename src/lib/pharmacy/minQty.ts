/**
 * The minimum quantity that makes a medicine show up as "running low".
 *
 * This number is the whole of the low-stock feature. `getAlerts` only counts a
 * medicine when `total_qty <= reorder_level AND reorder_level > 0`, so a zero
 * means "never alert me about this" — a deliberate opt-out, and also the silent
 * default that left a 456-medicine pharmacy with a Running low count of 0 and a
 * purchase-order prefill with nothing to prefill from.
 *
 * So a received line is given a starting figure rather than a zero. The rule is
 * one pack's worth of units, because that is the smallest amount a hospital can
 * actually buy — asking for "half a strip" is not a purchase order. A flat 10
 * (what the old Add Batch modal used) means two different things on the same
 * shelf: a sensible strip of tablets, and ten 1,000 ml cans of disinfectant.
 *
 * It is a starting point, not a decision. A pharmacist who knows they burn four
 * strips a day should raise it, and the field is there on the line to do so.
 */

/** One pack's worth of units — at least 1, never fractional. */
export function defaultMinQty(packSize: number | string | null | undefined): number {
  const n = typeof packSize === 'string' ? Number(packSize.trim()) : packSize
  if (n == null || !Number.isFinite(n) || n <= 0) return 1
  return Math.max(1, Math.floor(n))
}

/**
 * What to store for a line: what was typed, else what the medicine was bought
 * at last time, else one pack. An explicit 0 is kept — that is how a hospital
 * turns the alert off for something it does not restock, like a one-off device.
 */
export function minQtyForLine(
  typed: string | null | undefined,
  lastReorderLevel: number | null | undefined,
  packSize: number | string | null | undefined,
): number {
  const t = (typed ?? '').trim()
  if (t !== '') {
    const n = Number(t)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  if (lastReorderLevel != null && lastReorderLevel > 0) return Math.floor(lastReorderLevel)
  return defaultMinQty(packSize)
}
