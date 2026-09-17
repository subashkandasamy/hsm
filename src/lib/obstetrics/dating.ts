// Pregnancy dating — gestational age (GA) and expected date of delivery (EDD).
// Dates are 'YYYY-MM-DD' calendar dates; the maths is timezone-independent.

import { istAddDays } from '@/lib/istDate'

export const TERM_DAYS = 280

/** Whole days from a to b ('YYYY-MM-DD'). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

/** "24w 3d". */
export function formatGa(days: number | null): string {
  if (days == null || days < 0) return '—'
  return `${Math.floor(days / 7)}w ${days % 7}d`
}

export function trimester(days: number): 1 | 2 | 3 {
  return days < 14 * 7 ? 1 : days < 28 * 7 ? 2 : 3
}

/**
 * Most accurate EDD, per ACOG Committee Opinion 700 (2017, reaffirmed): the first
 * ultrasound re-dates the pregnancy when its GA differs from the LMP GA by more than
 *   ≤ 8w6d: 5 days · 9w0d–13w6d: 7 · 14w0d–15w6d: 7 · 16w0d–21w6d: 10 ·
 *   22w0d–27w6d: 14 · ≥ 28w0d: 21 days.
 * With no LMP the scan dates the pregnancy; a first scan at ≥ 22 weeks is flagged
 * as suboptimally dated.
 */
export function chooseEdd(input: { lmp: string | null; scanDate: string | null; scanGaDays: number | null }): {
  edd: string | null
  basis: 'lmp' | 'scan' | null
  lmpEdd: string | null
  scanEdd: string | null
  discrepancyDays: number | null
  suboptimal: boolean
} {
  const { lmp, scanDate, scanGaDays } = input
  const lmpEdd = lmp ? istAddDays(lmp, TERM_DAYS) : null
  const scanEdd = scanDate && scanGaDays != null ? istAddDays(scanDate, TERM_DAYS - scanGaDays) : null
  const suboptimal = scanGaDays != null && scanGaDays >= 22 * 7 && !lmp
  if (!scanEdd) return { edd: lmpEdd, basis: lmpEdd ? 'lmp' : null, lmpEdd, scanEdd, discrepancyDays: null, suboptimal }
  if (!lmpEdd || !lmp) return { edd: scanEdd, basis: 'scan', lmpEdd, scanEdd, discrepancyDays: null, suboptimal }

  const lmpGaAtScan = daysBetween(lmp, scanDate!)
  const discrepancy = Math.abs(lmpGaAtScan - scanGaDays!)
  const w = lmpGaAtScan / 7
  const limit = w < 9 ? 5 : w < 16 ? 7 : w < 22 ? 10 : w < 28 ? 14 : 21
  const useScan = discrepancy > limit
  return { edd: useScan ? scanEdd : lmpEdd, basis: useScan ? 'scan' : 'lmp', lmpEdd, scanEdd, discrepancyDays: discrepancy, suboptimal }
}

/** GA on a date, counted back from the EDD in use (so ultrasound re-dating applies). */
export function gaOn(edd: string | null, on: string): number | null {
  if (!edd) return null
  return TERM_DAYS - daysBetween(on, edd)
}
