/**
 * What a lab report prints as a line's normal.
 *
 * One place for the rule, so the on-screen report, the PDF and the patient
 * portal cannot drift apart:
 *   - a panel line prints the range kept with its result (ref_low/ref_high),
 *     or — for a graded or written line — its normal words (normal_text, 0298);
 *   - a one-box test prints the range kept with its result (0298), and only
 *     for a result from before that, the catalog's range as it is today.
 */

/** "4 – 10", "< 200", "> 60", or null when neither bound is set. */
export function boundsText(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (lo != null && hi != null) return `${lo} – ${hi}`
  if (hi != null) return `< ${hi}`
  if (lo != null) return `> ${lo}`
  return null
}

/** A panel line's normal. */
export function analyteNormal(a: {
  ref_low: number | null; ref_high: number | null; normal_text?: string | null
}): string | null {
  return boundsText(a.ref_low, a.ref_high) ?? (a.normal_text?.trim() || null)
}

/** A one-box test's normal. */
export function itemNormal(item: {
  ref_low?: number | null; ref_high?: number | null; ref_text?: string | null
  test?: { reference_range?: string | null; ref_low?: number | null; ref_high?: number | null } | null
}): string | null {
  const kept = item.ref_text?.trim() || boundsText(item.ref_low, item.ref_high)
  if (kept) return kept
  const t = item.test
  return t?.reference_range?.trim() || boundsText(t?.ref_low, t?.ref_high)
}

/** The flags that mean "look at this one". */
export const OUT_OF_RANGE = new Set(['high', 'low', 'abnormal', 'critical_high', 'critical_low'])

/** When the first tube was drawn, from the order's samples. */
export function firstCollected(samples?: Array<{ collected_at?: string | null }> | null): string | null {
  const times = (samples ?? []).map((s) => s.collected_at).filter((t): t is string => !!t).sort()
  return times[0] ?? null
}
