// WHO Child Growth Standards (0–5 years) z-scores, percentiles and classification.
// Server-side only (imports the 130 KB reference table).
//
// Method: WHO LMS — z = ((X/M)^L − 1) / (L·S). For the skewed indicators (weight-
// for-age, weight-for-length/height) WHO restricts the LMS curve beyond ±3 SD and
// extrapolates with the 2–3 SD distance ("restricted application of the LMS
// method", WHO Anthro technical documentation). Length/height and head
// circumference have L = 1 and need no restriction.

import who from './who-lms.json'

export type Sex = 'male' | 'female'
export type Indicator = 'wfa' | 'lhfa' | 'hcfa' | 'wfl' | 'wfh'

type Row = [number, number, number, number] // key (day or cm), L, M, S
const TABLES = who as unknown as Record<Indicator, Record<Sex, Row[]>>

export const AGE_MAX_DAYS = 1856 // WHO standards cover birth to 60 months

/** L, M, S at `key` (age in days, or length/height in cm), linearly interpolated. */
export function lmsAt(ind: Indicator, sex: Sex, key: number): { L: number; M: number; S: number } | null {
  const rows = TABLES[ind][sex]
  if (key < rows[0][0] || key > rows[rows.length - 1][0]) return null
  let lo = 0, hi = rows.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (rows[mid][0] <= key) lo = mid; else hi = mid
  }
  const a = rows[lo], b = rows[hi]
  const f = b[0] === a[0] ? 0 : (key - a[0]) / (b[0] - a[0])
  return { L: a[1] + (b[1] - a[1]) * f, M: a[2] + (b[2] - a[2]) * f, S: a[3] + (b[3] - a[3]) * f }
}

/** Measurement value at a given z (the SD lines of a growth chart). */
export function valueAtZ(lms: { L: number; M: number; S: number }, z: number): number {
  const { L, M, S } = lms
  return L === 0 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L)
}

function rawZ(x: number, { L, M, S }: { L: number; M: number; S: number }): number {
  return L === 0 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S)
}

export function zScore(ind: Indicator, sex: Sex, key: number, x: number): number | null {
  if (!(x > 0)) return null
  const lms = lmsAt(ind, sex, key)
  if (!lms) return null
  const z = rawZ(x, lms)
  const restricted = ind === 'wfa' || ind === 'wfl' || ind === 'wfh'
  if (!restricted || Math.abs(z) <= 3) return z
  if (z > 3) {
    const sd3 = valueAtZ(lms, 3), sd23 = sd3 - valueAtZ(lms, 2)
    return 3 + (x - sd3) / sd23
  }
  const sd3 = valueAtZ(lms, -3), sd23 = valueAtZ(lms, -2) - sd3
  return -3 + (x - sd3) / sd23
}

/** Percentile (0–100) for a z-score — standard normal CDF. */
export function percentile(z: number): number {
  // Abramowitz & Stegun 7.1.26 (error < 1.5e-7)
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  const cdf = z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
  return Math.min(100, Math.max(0, cdf * 100))
}

export type Severity = 'normal' | 'watch' | 'moderate' | 'severe'
export interface Assessment {
  indicator: Indicator
  label: string
  z: number
  percentile: number
  status: string
  severity: Severity
}

const LABEL: Record<Indicator, string> = {
  wfa: 'Weight-for-age', lhfa: 'Length/height-for-age', hcfa: 'Head circumference-for-age',
  wfl: 'Weight-for-length', wfh: 'Weight-for-height',
}

/** WHO classification cut-offs for each indicator. */
export function classify(ind: Indicator, z: number): { status: string; severity: Severity } {
  switch (ind) {
    case 'wfa':
      if (z < -3) return { status: 'Severely underweight', severity: 'severe' }
      if (z < -2) return { status: 'Underweight', severity: 'moderate' }
      if (z > 2) return { status: 'Above range — check weight-for-length', severity: 'watch' }
      return { status: 'Normal', severity: 'normal' }
    case 'lhfa':
      if (z < -3) return { status: 'Severely stunted', severity: 'severe' }
      if (z < -2) return { status: 'Stunted', severity: 'moderate' }
      if (z > 3) return { status: 'Very tall', severity: 'watch' }
      return { status: 'Normal', severity: 'normal' }
    case 'hcfa':
      if (z < -3) return { status: 'Severe microcephaly', severity: 'severe' }
      if (z < -2) return { status: 'Microcephaly', severity: 'moderate' }
      if (z > 3) return { status: 'Severe macrocephaly', severity: 'severe' }
      if (z > 2) return { status: 'Macrocephaly', severity: 'moderate' }
      return { status: 'Normal', severity: 'normal' }
    case 'wfl':
    case 'wfh':
      if (z < -3) return { status: 'Severe wasting (SAM)', severity: 'severe' }
      if (z < -2) return { status: 'Wasted (MAM)', severity: 'moderate' }
      if (z > 3) return { status: 'Obese', severity: 'severe' }
      if (z > 2) return { status: 'Overweight', severity: 'moderate' }
      if (z > 1) return { status: 'Possible risk of overweight', severity: 'watch' }
      return { status: 'Normal', severity: 'normal' }
  }
}

export interface Measurement { weight_kg?: number | null; height_cm?: number | null; head_circ_cm?: number | null; muac_cm?: number | null }

/**
 * All WHO assessments available for one measurement.
 * Under 2 years (731 days) length is recumbent and weight-for-length applies;
 * from 2 years height is standing and weight-for-height applies (WHO convention —
 * measurements are assumed to follow it).
 */
export function assessGrowth(sex: Sex, ageDays: number, m: Measurement): { assessments: Assessment[]; muac: { status: string; severity: Severity } | null; outOfRange: boolean } {
  const out: Assessment[] = []
  const add = (ind: Indicator, key: number, x: number | null | undefined) => {
    if (x == null) return
    const z = zScore(ind, sex, key, x)
    if (z == null) return
    out.push({ indicator: ind, label: LABEL[ind], z, percentile: percentile(z), ...classify(ind, z) })
  }
  const inRange = ageDays >= 0 && ageDays <= AGE_MAX_DAYS
  if (inRange) {
    add('wfa', ageDays, m.weight_kg)
    add('lhfa', ageDays, m.height_cm)
    add('hcfa', ageDays, m.head_circ_cm)
    if (m.weight_kg != null && m.height_cm != null) {
      if (ageDays < 731) add('wfl', Math.round(m.height_cm * 10) / 10, m.weight_kg)
      else add('wfh', Math.round(m.height_cm * 10) / 10, m.weight_kg)
    }
  }
  // MUAC cut-offs (WHO/UNICEF) apply from 6 to 59 months.
  let muac: { status: string; severity: Severity } | null = null
  if (m.muac_cm != null && ageDays >= 183 && ageDays < 1826) {
    muac = m.muac_cm < 11.5 ? { status: 'MUAC < 11.5 cm — severe acute malnutrition', severity: 'severe' }
      : m.muac_cm < 12.5 ? { status: 'MUAC 11.5–12.5 cm — moderate acute malnutrition', severity: 'moderate' }
      : { status: 'MUAC normal', severity: 'normal' }
  }
  return { assessments: out, muac, outOfRange: !inRange }
}

/** SD lines (−3, −2, 0, +2, +3) for a growth chart, one point per `stepDays`. */
export function sdCurves(ind: 'wfa' | 'lhfa' | 'hcfa', sex: Sex, stepDays = 30.4375): Array<{ day: number; sd: Record<string, number> }> {
  const pts: Array<{ day: number; sd: Record<string, number> }> = []
  for (let d = 0; d <= AGE_MAX_DAYS; d += stepDays) {
    const day = Math.min(AGE_MAX_DAYS, Math.round(d))
    const lms = lmsAt(ind, sex, day)
    if (!lms) continue
    pts.push({ day, sd: { '-3': valueAtZ(lms, -3), '-2': valueAtZ(lms, -2), '0': lms.M, '2': valueAtZ(lms, 2), '3': valueAtZ(lms, 3) } })
  }
  return pts
}
