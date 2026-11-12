// NEWS2-style early-warning score. Each present parameter contributes 0–3;
// `complete` says whether all were measured (only a complete set is NEWS2). Bands follow NEWS2 escalation:
//   0–4 low, 5–6 (or any single 3) medium, ≥7 high.
// A safety aid — not a substitute for clinical judgement.

export interface NewsVitals {
  rr?: number | null           // respiratory rate
  spo2?: number | null         // %
  sbp?: number | null          // systolic BP
  hr?: number | null           // heart rate
  temp?: number | null         // °C
  gcs_total?: number | null    // Glasgow Coma Scale (proxy for consciousness)
  /** ACVPU from a ward round; preferred over GCS when both are given. */
  avpu?: string | null
  on_oxygen?: boolean          // supplemental O2 / ventilated
  /** GCS parts, for a total that was not kept (V = T, tube): eyes or motor
   *  below full still means "not alert". */
  gcs_e?: number | null
  gcs_m?: number | null
}

export type NewsBand = 'low' | 'medium' | 'high'

export interface NewsResult {
  score: number
  band: NewsBand
  params: number   // how many parameters contributed (0 = not scorable)
  anyThree: boolean
  /** Every NEWS2 parameter was measured. A partial set under-scores — a
   *  ventilated GCS 7 patient with only HR charted dropped from 14 to 3 and
   *  the High alert vanished (BUG-036) — so only a complete one is "the" score. */
  complete: boolean
  /** The parameters not measured, for "incomplete — no BP, RR". */
  missing: string[]
}

function band(score: number, anyThree: boolean, params: number): NewsBand {
  if (params === 0) return 'low'
  if (score >= 7) return 'high'
  if (score >= 5 || anyThree) return 'medium'
  return 'low'
}

export function computeNews(v: NewsVitals): NewsResult {
  let score = 0, params = 0, anyThree = false
  const add = (pts: number) => { score += pts; params++; if (pts === 3) anyThree = true }

  if (v.rr != null)   add(v.rr <= 8 ? 3 : v.rr <= 11 ? 1 : v.rr <= 20 ? 0 : v.rr <= 24 ? 2 : 3)
  if (v.spo2 != null) add(v.spo2 >= 96 ? 0 : v.spo2 >= 94 ? 1 : v.spo2 >= 92 ? 2 : 3)
  if (v.on_oxygen)    { score += 2; params++ }
  if (v.temp != null) add(v.temp <= 35 ? 3 : v.temp <= 36 ? 1 : v.temp <= 38 ? 0 : v.temp <= 39 ? 1 : 2)
  if (v.sbp != null)  add(v.sbp <= 90 ? 3 : v.sbp <= 100 ? 2 : v.sbp <= 110 ? 1 : v.sbp <= 219 ? 0 : 3)
  if (v.hr != null)   add(v.hr <= 40 ? 3 : v.hr <= 50 ? 1 : v.hr <= 90 ? 0 : v.hr <= 110 ? 1 : v.hr <= 130 ? 2 : 3)
  // Consciousness: anything but Alert (new confusion, voice, pain, unresponsive) scores 3.
  let conscious = true
  if (v.avpu) add(v.avpu === 'A' ? 0 : 3)
  else if (v.gcs_total != null) add(v.gcs_total < 15 ? 3 : 0)
  else if ((v.gcs_e != null && v.gcs_e < 4) || (v.gcs_m != null && v.gcs_m < 6)) add(3)
  else conscious = false

  const missing = [
    v.rr == null && 'RR', v.spo2 == null && 'SpO₂', v.temp == null && 'temp',
    v.sbp == null && 'BP', v.hr == null && 'HR', !conscious && 'consciousness',
  ].filter(Boolean) as string[]
  return { score, band: band(score, anyThree, params), params, anyThree, complete: missing.length === 0, missing }
}

/** The newest row with a complete score (rows newest first), or null. */
export function latestCompleteNews<T>(rows: readonly T[], score: (o: T) => NewsResult): { row: T; news: NewsResult } | null {
  for (const row of rows) {
    const news = score(row)
    if (news.complete) return { row, news }
  }
  return null
}

export const NEWS_BAND_STYLE: Record<NewsBand, { bg: string; color: string; label: string }> = {
  low:    { bg: '#DCFCE7', color: '#15803D', label: 'Low' },
  medium: { bg: '#FEF3C7', color: '#B45309', label: 'Medium' },
  high:   { bg: '#FEE2E2', color: '#DC2626', label: 'High' },
}
