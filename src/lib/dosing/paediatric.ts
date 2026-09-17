// Weight-based dose check for children (1 month – 17 years).
//
// Dose ranges are the usual treatment doses from BNF for Children (2023–24), the WHO
// Model Formulary for Children (2010) and the IAP Drug Formulary; the maximum single
// and daily doses are the usual adult caps. They cover common indications — some
// conditions (meningitis, typhoid, severe infections) use higher doses, so a dose
// above the maximum can be prescribed with an explicit override. Neonates (< 28 days)
// are not covered: their dosing is gestation- and age-specific.

export type Route = 'oral' | 'iv' | 'im' | 'rectal'

export interface DoseRule {
  key: string
  label: string
  /** Lower-case generic name fragments that identify the drug. */
  match: string[]
  routes: Route[]
  /** Usual dose in mg/kg per dose, or per day (split by doses per day). */
  perDose?: [number, number]
  perDay?: [number, number]
  dosesPerDay: [number, number]
  /** Hard ceilings. */
  maxSingleMg?: number
  maxDailyMg?: number
  maxMgPerKgDay?: number
  minAgeDays?: number
  /** Only for children up to this weight (e.g. IV paracetamol ≤ 10 kg). */
  maxWeightKg?: number
  minWeightKg?: number
  note?: string
}

export const DOSE_RULES: DoseRule[] = [
  { key: 'paracetamol', label: 'Paracetamol', match: ['paracetamol', 'acetaminophen'], routes: ['oral', 'rectal'], perDose: [10, 15], dosesPerDay: [1, 4], maxSingleMg: 1000, maxDailyMg: 4000, maxMgPerKgDay: 75, note: 'At least 4 hours between doses; not more than 4 doses in 24 hours.' },
  { key: 'paracetamol_iv_small', label: 'Paracetamol IV (≤ 10 kg)', match: ['paracetamol', 'acetaminophen'], routes: ['iv'], perDose: [7.5, 7.5], dosesPerDay: [1, 4], maxMgPerKgDay: 30, maxWeightKg: 10 },
  { key: 'paracetamol_iv', label: 'Paracetamol IV', match: ['paracetamol', 'acetaminophen'], routes: ['iv'], perDose: [15, 15], dosesPerDay: [1, 4], maxSingleMg: 1000, maxDailyMg: 4000, maxMgPerKgDay: 60, minWeightKg: 10.01 },
  { key: 'ibuprofen', label: 'Ibuprofen', match: ['ibuprofen'], routes: ['oral'], perDose: [5, 10], dosesPerDay: [1, 4], maxSingleMg: 400, maxDailyMg: 2400, maxMgPerKgDay: 40, minAgeDays: 90, note: 'Avoid in dehydration, dengue and chickenpox.' },
  { key: 'amoxicillin', label: 'Amoxicillin', match: ['amoxicillin', 'amoxycillin'], routes: ['oral'], perDay: [25, 90], dosesPerDay: [2, 3], maxSingleMg: 1000, maxDailyMg: 4000, note: 'High dose (80–90 mg/kg/day) for otitis media / pneumonia.' },
  { key: 'azithromycin', label: 'Azithromycin', match: ['azithromycin'], routes: ['oral'], perDay: [5, 12], dosesPerDay: [1, 1], maxDailyMg: 500, note: 'Typhoid uses 20 mg/kg/day (override the maximum).' },
  { key: 'cefixime', label: 'Cefixime', match: ['cefixime'], routes: ['oral'], perDay: [8, 20], dosesPerDay: [1, 2], maxDailyMg: 400, note: '20 mg/kg/day is the typhoid dose.' },
  { key: 'cephalexin', label: 'Cephalexin', match: ['cephalexin', 'cefalexin'], routes: ['oral'], perDay: [25, 100], dosesPerDay: [2, 4], maxSingleMg: 1000, maxDailyMg: 4000 },
  { key: 'cefpodoxime', label: 'Cefpodoxime', match: ['cefpodoxime'], routes: ['oral'], perDay: [8, 10], dosesPerDay: [2, 2], maxSingleMg: 200, maxDailyMg: 400 },
  { key: 'cefuroxime_oral', label: 'Cefuroxime (oral)', match: ['cefuroxime'], routes: ['oral'], perDay: [20, 30], dosesPerDay: [2, 2], maxSingleMg: 500, maxDailyMg: 1000 },
  { key: 'ceftriaxone', label: 'Ceftriaxone', match: ['ceftriaxone'], routes: ['iv', 'im'], perDay: [50, 100], dosesPerDay: [1, 2], maxSingleMg: 2000, maxDailyMg: 4000, note: '100 mg/kg/day for meningitis.' },
  { key: 'cefotaxime', label: 'Cefotaxime', match: ['cefotaxime'], routes: ['iv', 'im'], perDay: [100, 200], dosesPerDay: [3, 4], maxSingleMg: 3000, maxDailyMg: 12000 },
  { key: 'ampicillin', label: 'Ampicillin', match: ['ampicillin'], routes: ['iv', 'im'], perDay: [100, 200], dosesPerDay: [4, 4], maxDailyMg: 12000, note: 'Meningitis: up to 400 mg/kg/day.' },
  { key: 'gentamicin', label: 'Gentamicin', match: ['gentamicin'], routes: ['iv', 'im'], perDay: [5, 7.5], dosesPerDay: [1, 3], note: 'Once daily preferred; check levels and kidney function.' },
  { key: 'amikacin', label: 'Amikacin', match: ['amikacin'], routes: ['iv', 'im'], perDay: [15, 20], dosesPerDay: [1, 2], maxDailyMg: 1500, note: 'Once daily preferred; check levels and kidney function.' },
  { key: 'meropenem', label: 'Meropenem', match: ['meropenem'], routes: ['iv'], perDose: [10, 40], dosesPerDay: [3, 3], maxSingleMg: 2000, maxDailyMg: 6000, note: '40 mg/kg per dose for meningitis.' },
  { key: 'metronidazole', label: 'Metronidazole', match: ['metronidazole'], routes: ['oral', 'iv'], perDay: [20, 50], dosesPerDay: [3, 3], maxSingleMg: 800, maxDailyMg: 2400, note: '35–50 mg/kg/day for amoebiasis.' },
  { key: 'aciclovir_oral', label: 'Aciclovir (oral)', match: ['acyclovir', 'aciclovir'], routes: ['oral'], perDose: [10, 20], dosesPerDay: [4, 5], maxSingleMg: 800, maxDailyMg: 4000 },
  { key: 'ondansetron', label: 'Ondansetron', match: ['ondansetron'], routes: ['oral', 'iv', 'im'], perDose: [0.1, 0.15], dosesPerDay: [1, 3], maxSingleMg: 8, maxDailyMg: 24 },
  { key: 'domperidone', label: 'Domperidone', match: ['domperidone'], routes: ['oral'], perDose: [0.25, 0.25], dosesPerDay: [1, 3], maxDailyMg: 30, maxMgPerKgDay: 0.75, note: 'Use the lowest dose for the shortest time.' },
  { key: 'prednisolone', label: 'Prednisolone', match: ['prednisolone'], routes: ['oral'], perDay: [1, 2], dosesPerDay: [1, 2], maxDailyMg: 60 },
  { key: 'dexamethasone', label: 'Dexamethasone', match: ['dexamethasone'], routes: ['oral', 'iv', 'im'], perDay: [0.15, 0.6], dosesPerDay: [1, 4], maxDailyMg: 16, note: 'Croup: single dose 0.15–0.6 mg/kg.' },
]

export const DOSE_SOURCE = 'BNF for Children 2023–24, WHO Model Formulary for Children, IAP Drug Formulary'

// ── Parsing ────────────────────────────────────────────────────────────────────

const toMg = (value: number, unit: string) => {
  const u = unit.toLowerCase()
  return u === 'g' || u === 'gm' ? value * 1000 : u === 'mcg' || u === 'µg' || u === 'ug' ? value / 1000 : value
}
const NUM = '(\\d+(?:\\.\\d+)?|½|1/2)'
const n = (s: string) => (s === '½' || s === '1/2' ? 0.5 : Number(s))

/** mg per mL from text like "125mg/5ml" or "40 mg/ml". */
export function parseConcentration(text: string | null | undefined): number | null {
  const m = new RegExp(`${NUM}\\s*(mg|mcg|µg|g|gm)\\s*/\\s*(\\d+(?:\\.\\d+)?)?\\s*ml`, 'i').exec(text ?? '')
  if (!m) return null
  return toMg(n(m[1]), m[2]) / (m[3] ? Number(m[3]) : 1)
}

/** mg per tablet / capsule / suppository from text like "Paracetamol 500mg Tablet". */
export function parseUnitStrength(text: string | null | undefined): number | null {
  const t = text ?? ''
  if (/\/\s*\d*\s*ml/i.test(t)) return null
  const m = new RegExp(`${NUM}\\s*(mg|mcg|µg|g|gm)\\b`, 'i').exec(t)
  return m ? toMg(n(m[1]), m[2]) : null
}

export const isCombination = (text: string) => /\S\s*\+\s*\S/.test(text)

export type ParsedDose = { mg: number; shown: string } | { error: string } | null

/** Dose in mg from the OPD "Dosage" text, using the drug's strength when the dose is in mL or tablets. */
export function parseDoseText(dosage: string, drugText: string): ParsedDose {
  const d = dosage.trim()
  if (!d) return null
  if (parseConcentration(d)) return { error: `"${d}" is the strength — enter the dose, e.g. 5 ml` }
  let m = new RegExp(`^${NUM}\\s*(mg|mcg|µg|ug|g|gm)$`, 'i').exec(d)
  if (m) return { mg: toMg(n(m[1]), m[2]), shown: d }
  m = new RegExp(`^${NUM}\\s*(ml|mL)$`, 'i').exec(d)
  if (m) {
    const c = parseConcentration(drugText)
    return c ? { mg: n(m[1]) * c, shown: d } : { error: 'Add the syrup strength (e.g. 125mg/5ml) to the drug name to check a dose in ml' }
  }
  m = new RegExp(`^${NUM}\\s*(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|supp|suppository)s?$`, 'i').exec(d)
  if (m) {
    const s = parseUnitStrength(drugText)
    return s ? { mg: n(m[1]) * s, shown: d } : { error: 'Add the tablet strength (e.g. 250mg) to the drug name to check this dose' }
  }
  return { error: 'Write the dose as mg, ml or tablets (e.g. 250 mg, 5 ml, 1 tab)' }
}

/** Doses per day from OPD frequency text ("1-0-1", "TDS", "q6h"); prn = as needed. */
export function parseFrequencyText(text: string): { perDay: number; prn: boolean } | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  if (/^[\d½.]+(\s*-\s*[\d½.]+){1,5}$/.test(t)) {
    const parts = t.split('-').map((p) => p.trim())
    return { perDay: parts.filter((p) => p !== '0').length, prn: false }
  }
  const q = /(?:q|every)\s*(\d+)\s*(?:h|hr|hrs|hours?)/.exec(t)
  if (q) return { perDay: Math.floor(24 / Number(q[1])), prn: false }
  if (/\b(sos|prn|as needed|when needed)\b/.test(t)) return { perDay: 0, prn: true }
  if (/\b(stat|once only|single dose)\b/.test(t)) return { perDay: 1, prn: false }
  if (/\b(qid|qds|four times)\b/.test(t)) return { perDay: 4, prn: false }
  if (/\b(tds|tid|thrice|three times)\b/.test(t)) return { perDay: 3, prn: false }
  if (/\b(bd|bid|twice|two times)\b/.test(t)) return { perDay: 2, prn: false }
  if (/\b(od|qd|once|daily|hs|at night)\b/.test(t)) return { perDay: 1, prn: false }
  return null
}

/** Route from an IPD route value or the drug's name / form. */
export function inferRoute(route: string | null | undefined, drugText: string): Route {
  const r = (route ?? '').toLowerCase()
  if (/\biv\b|intraven/.test(r)) return 'iv'
  if (/\bim\b|intramus/.test(r)) return 'im'
  if (/\bpr\b|rectal/.test(r)) return 'rectal'
  if (r && /oral|po\b|\bsl\b|ng/.test(r)) return 'oral'
  const t = drugText.toLowerCase()
  if (/suppos/.test(t)) return 'rectal'
  if (/inj|injection|infusion|\bvial\b|\biv\b/.test(t)) return 'iv'
  return 'oral'
}

export function findRule(genericOrName: string, route: Route, weightKg: number | null): { rule: DoseRule | null; routeMismatch: boolean } {
  const t = genericOrName.toLowerCase()
  const byName = DOSE_RULES.filter((r) => r.match.some((m) => t.includes(m)))
  if (!byName.length) return { rule: null, routeMismatch: false }
  const byRoute = byName.filter((r) => r.routes.includes(route))
  const byWeight = byRoute.filter((r) => weightKg == null || ((r.maxWeightKg == null || weightKg <= r.maxWeightKg) && (r.minWeightKg == null || weightKg >= r.minWeightKg)))
  if (byWeight.length) return { rule: byWeight[0], routeMismatch: false }
  return { rule: null, routeMismatch: byRoute.length === 0 }
}

// ── The check ──────────────────────────────────────────────────────────────────

export type DoseStatus = 'ok' | 'low' | 'high' | 'over_max' | 'unchecked'

export interface DoseCheck {
  status: DoseStatus
  rule: { key: string; label: string; note: string | null } | null
  weightKg: number | null
  /** Usual dose for this child and frequency, in mg per dose (and mL if a syrup strength is known). */
  suggestion: { perDoseMg: [number, number]; perDoseMl: [number, number] | null; dosesPerDay: [number, number]; basis: string } | null
  mgPerKgDose: number | null
  mgPerKgDay: number | null
  messages: Array<{ level: 'severe' | 'moderate' | 'watch' | 'info'; text: string }>
}

const round = (v: number) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100)

export function checkDose(input: {
  drugText: string
  /** Generic name from the drug master when the prescribed name is a brand. */
  generic?: string | null
  strengthText?: string | null
  route: Route
  ageDays: number | null
  weightKg: number | null
  doseMg: number | null
  dosesPerDay: number | null
  prn?: boolean
}): DoseCheck {
  const { route, ageDays, weightKg, doseMg, prn } = input
  const nameForRules = `${input.drugText} ${input.generic ?? ''}`
  const base: DoseCheck = { status: 'unchecked', rule: null, weightKg, suggestion: null, mgPerKgDose: null, mgPerKgDay: null, messages: [] }

  if (ageDays != null && ageDays < 28) {
    return { ...base, messages: [{ level: 'watch', text: 'Newborn (under 28 days) — use neonatal dosing; not checked here' }] }
  }
  if (isCombination(`${input.drugText} ${input.strengthText ?? ''}`)) {
    return { ...base, messages: [{ level: 'info', text: 'Combination product — check each ingredient against the formulary' }] }
  }
  const { rule, routeMismatch } = findRule(nameForRules, route, weightKg)
  if (!rule) {
    return routeMismatch
      ? { ...base, messages: [{ level: 'info', text: `No ${route.toUpperCase()} dose rule for this drug — check the formulary` }] }
      : base
  }
  const out: DoseCheck = { ...base, rule: { key: rule.key, label: rule.label, note: rule.note ?? null } }
  if (weightKg == null) {
    out.messages.push({ level: 'moderate', text: 'Enter the child’s weight to check this dose' })
    return out
  }
  if (rule.minAgeDays != null && ageDays != null && ageDays < rule.minAgeDays) {
    out.messages.push({ level: 'moderate', text: `${rule.label} is not usually given under ${Math.round(rule.minAgeDays / 30)} months` })
  }

  // Usual range per dose for the frequency written (or the rule's usual frequency).
  const freq = input.dosesPerDay && input.dosesPerDay > 0 ? input.dosesPerDay : null
  const splitBy = freq ?? rule.dosesPerDay[1]
  let lo: number, hi: number, basis: string
  if (rule.perDose) { [lo, hi] = [rule.perDose[0] * weightKg, rule.perDose[1] * weightKg]; basis = `${rule.perDose[0] === rule.perDose[1] ? rule.perDose[0] : rule.perDose.join('–')} mg/kg per dose` }
  else { [lo, hi] = [rule.perDay![0] * weightKg / splitBy, rule.perDay![1] * weightKg / splitBy]; basis = `${rule.perDay!.join('–')} mg/kg/day in ${splitBy} dose${splitBy > 1 ? 's' : ''}` }
  const capSingle = Math.min(rule.maxSingleMg ?? Infinity, rule.maxDailyMg != null ? rule.maxDailyMg / splitBy : Infinity, rule.maxMgPerKgDay != null ? rule.maxMgPerKgDay * weightKg / splitBy : Infinity)
  hi = Math.min(hi, capSingle)
  lo = Math.min(lo, hi)
  const conc = parseConcentration(input.strengthText) ?? parseConcentration(input.drugText)
  out.suggestion = {
    perDoseMg: [round(lo), round(hi)],
    perDoseMl: conc ? [round(lo / conc), round(hi / conc)] : null,
    dosesPerDay: rule.dosesPerDay,
    basis,
  }
  if (rule.note) out.messages.push({ level: 'info', text: rule.note })
  if (doseMg == null) return out

  out.mgPerKgDose = round(doseMg / weightKg)
  const perDay = freq ?? (prn ? rule.dosesPerDay[1] : null)
  const daily = perDay != null ? doseMg * perDay : null
  if (daily != null) out.mgPerKgDay = round(daily / weightKg)
  const kgText = `${weightKg} kg`

  const overs: string[] = []
  if (rule.maxSingleMg != null && doseMg > rule.maxSingleMg * 1.001) overs.push(`above the maximum single dose of ${rule.maxSingleMg} mg`)
  if (daily != null && rule.maxDailyMg != null && daily > rule.maxDailyMg * 1.001) overs.push(`${round(daily)} mg/day is above the daily maximum of ${rule.maxDailyMg} mg${prn ? ' (if given as often as allowed)' : ''}`)
  if (daily != null && rule.maxMgPerKgDay != null && daily / weightKg > rule.maxMgPerKgDay * 1.05) overs.push(`${round(daily / weightKg)} mg/kg/day is above the maximum of ${rule.maxMgPerKgDay} mg/kg/day`)

  if (overs.length) {
    out.status = 'over_max'
    out.messages.unshift({ level: 'severe', text: `${round(doseMg)} mg (${out.mgPerKgDose} mg/kg) — ${overs.join('; ')}` })
  } else if (doseMg > hi * 1.1) {
    out.status = 'high'
    out.messages.unshift({ level: 'moderate', text: `${round(doseMg)} mg (${out.mgPerKgDose} mg/kg) is higher than the usual ${round(lo)}–${round(hi)} mg per dose for ${kgText}` })
  } else if (doseMg < lo * 0.9) {
    out.status = 'low'
    out.messages.unshift({ level: 'watch', text: `${round(doseMg)} mg (${out.mgPerKgDose} mg/kg) is lower than the usual ${round(lo)}–${round(hi)} mg per dose for ${kgText}` })
  } else {
    out.status = 'ok'
  }
  if (freq != null && (freq < rule.dosesPerDay[0] || freq > rule.dosesPerDay[1])) {
    const [a, b] = rule.dosesPerDay
    out.messages.push({ level: 'watch', text: `${rule.label} is usually given ${a === b ? a : `${a}–${b}`} time${b > 1 ? 's' : ''} a day` })
  }
  return out
}
