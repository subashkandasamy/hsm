/**
 * Test packages — who gets which test, and each test's share of the price.
 *
 * Pure, so it can be checked: `npm run verify:package-price`.
 */

export type PackageAppliesTo = 'all' | 'female' | 'male'

/**
 * Whether a package test is for this patient.
 *
 * A check-up holding CA-125 (women) and PSA (men) gives each patient only
 * theirs. When the record says neither male nor female — not recorded, or
 * 'other' — both are kept: leaving a test out silently is worse than the
 * laboratory being told it has one it may not need.
 */
export function appliesToPatient(appliesTo: PackageAppliesTo, gender: string | null | undefined): boolean {
  if (appliesTo === 'female') return gender !== 'male'
  if (appliesTo === 'male') return gender !== 'female'
  return true
}

/**
 * Share a package price across its tests in proportion to each test's own
 * price, so every bill line stays in its own department and the shares add up
 * to exactly the package price.
 *
 * Works in paise and hands the rounding paise to the largest remainders, so
 * ₹100 over three equal tests is 33.34 + 33.33 + 33.33, never 99.99. When every
 * test is free on its own, the price is shared equally.
 */
export function sharePackagePrice<K extends string>(
  total: number,
  members: Array<{ key: K; price: number }>,
): Map<K, number> {
  const out = new Map<K, number>()
  if (!members.length) return out
  const totalPaise = Math.round(total * 100)
  const weights = members.map((m) => Math.max(0, Number(m.price) || 0))
  const weightSum = weights.reduce((s, w) => s + w, 0)
  const w = weightSum > 0 ? weights : members.map(() => 1)
  const wSum = weightSum > 0 ? weightSum : members.length

  const raw = w.map((x) => (totalPaise * x) / wSum)
  const base = raw.map((x) => Math.floor(x))
  let left = totalPaise - base.reduce((s, x) => s + x, 0)
  // Largest remainder first; ties go to the earlier test, so the result never
  // depends on anything but the order the package lists its tests in.
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i))
  for (const { i } of order) {
    if (left <= 0) break
    base[i] += 1
    left -= 1
  }
  members.forEach((m, i) => out.set(m.key, base[i] / 100))
  return out
}
