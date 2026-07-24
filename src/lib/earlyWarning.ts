// NEWS2-style early-warning score. Computed from whatever vitals are available;
// each present parameter contributes 0–3. Bands follow NEWS2 escalation:
//   0–4 low, 5–6 (or any single 3) medium, ≥7 high.
// A safety aid — not a substitute for clinical judgement.

export interface NewsVitals {
  rr?: number | null           // respiratory rate
  spo2?: number | null         // %
  sbp?: number | null          // systolic BP
  hr?: number | null           // heart rate
  temp?: number | null         // °C
  gcs_total?: number | null    // Glasgow Coma Scale (proxy for consciousness)
  on_oxygen?: boolean          // supplemental O2 / ventilated
}

export type NewsBand = 'low' | 'medium' | 'high'

export interface NewsResult {
  score: number
  band: NewsBand
  params: number   // how many parameters contributed (0 = not scorable)
  anyThree: boolean
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
  if (v.gcs_total != null) add(v.gcs_total < 15 ? 3 : 0)

  return { score, band: band(score, anyThree, params), params, anyThree }
}

export const NEWS_BAND_STYLE: Record<NewsBand, { bg: string; color: string; label: string }> = {
  low:    { bg: '#DCFCE7', color: '#15803D', label: 'Low' },
  medium: { bg: '#FEF3C7', color: '#B45309', label: 'Medium' },
  high:   { bg: '#FEE2E2', color: '#DC2626', label: 'High' },
}
