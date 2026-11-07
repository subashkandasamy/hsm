/**
 * The minimum stock quantity that makes a medicine show up as "running low".
 *
 * `getAlerts` counts a medicine only when `total_qty <= reorder_level AND
 * reorder_level > 0`, so **0 means "never alert me about this"**. That is
 * deliberate: a hospital stocks plenty it will never reorder — a one-off
 * device, a discontinued brand, a sample — and those should not nag.
 *
 * The figure is therefore never guessed. Deriving one from pack size was tried
 * and dropped: KMCH's export carries no pack size, so every one of 1,127
 * batches would have been written at 1, which alerts only when the last unit
 * is gone and makes 456 medicines look configured when nobody had chosen a
 * thing. A wrong number that looks deliberate is worse than a blank.
 *
 * So the only rule is: use what somebody typed, else what this medicine was
 * last stocked at, else leave it off.
 */

/**
 * What to store for a received line.
 *
 * @param typed  the field as the counter left it — '' when untouched
 * @param lastReorderLevel  what this medicine's previous batch was set to
 */
export function minQtyForLine(
  typed: string | null | undefined,
  lastReorderLevel: number | null | undefined,
): number {
  const t = (typed ?? '').trim()
  if (t !== '') {
    const n = Number(t)
    // A typed 0 is an instruction — it turns the alert off.
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  if (lastReorderLevel != null && Number.isFinite(lastReorderLevel) && lastReorderLevel > 0) {
    return Math.floor(lastReorderLevel)
  }
  return 0
}

/** What to show in the box when a line is first built, so 0 stays blank. */
export function minQtyField(lastReorderLevel: number | null | undefined): string {
  return lastReorderLevel != null && lastReorderLevel > 0 ? String(Math.floor(lastReorderLevel)) : ''
}
