// Values a living patient cannot have — a typing slip, not a result. A
// haemoglobin of 250 g/dL was saved with only a "HIGH" flag (BUG-023).
// "impossible" is refused; "unusual" (far beyond the range, where no limit is
// known) needs the technician to confirm. Limits are wide on purpose — they
// only catch slips, never a real extreme result.

interface Limit { codes: string[]; unit?: RegExp; min: number; max: number }

const LIMITS: Limit[] = [
  { codes: ['HGB', 'HB', 'BG_THB'], unit: /g\/dl/i, min: 1, max: 25 },
  { codes: ['HCT', 'BG_HCT'], unit: /%/, min: 5, max: 80 },
  { codes: ['RBC'], unit: /10\*12|million/i, min: 0.3, max: 10 },
  { codes: ['WBC'], unit: /10\*9/i, min: 0.05, max: 500 },
  { codes: ['WBC'], unit: /µl|ul|cumm/i, min: 50, max: 500000 },
  { codes: ['PLT'], unit: /10\*9/i, min: 1, max: 3000 },
  { codes: ['PLT'], unit: /µl|ul|cumm/i, min: 1000, max: 3000000 },
  { codes: ['MCV'], min: 40, max: 160 },
  { codes: ['MCH'], min: 10, max: 60 },
  { codes: ['MCHC'], min: 15, max: 50 },
  { codes: ['NEUT_PCT', 'LYMPH_PCT', 'MONO_PCT', 'EOS_PCT', 'BASO_PCT', 'SO2', 'RETIC'], min: 0, max: 100 },
  { codes: ['HBA1C'], min: 2, max: 25 },
  { codes: ['ESR'], min: 0, max: 200 },
  { codes: ['BG_PH'], min: 6.5, max: 8 },
  { codes: ['NA'], min: 90, max: 200 },
  { codes: ['K'], min: 1, max: 15 },
  { codes: ['CL'], min: 50, max: 160 },
  { codes: ['HCO3'], min: 0, max: 60 },
  { codes: ['RBS', 'FBG', 'PPBG', 'GLU', 'RBSG', 'BG_GLU', 'FBS', 'PPBS'], unit: /mg\/dl/i, min: 5, max: 3000 },
  { codes: ['CREAT'], unit: /mg\/dl/i, min: 0.05, max: 40 },
  { codes: ['UREA'], unit: /mg\/dl/i, min: 1, max: 600 },
  { codes: ['BUN'], unit: /mg\/dl/i, min: 1, max: 300 },
  { codes: ['TBIL'], unit: /mg\/dl/i, min: 0, max: 80 },
  { codes: ['ALB'], unit: /g\/dl/i, min: 0.5, max: 7 },
  { codes: ['CA'], unit: /mg\/dl/i, min: 2, max: 20 },
  { codes: ['INR'], min: 0.5, max: 20 },
]

export type Plausibility = { level: 'impossible' | 'unusual'; message: string } | null

export function checkPlausible(a: {
  code?: string | null; name: string; unit?: string | null; value: number; refHigh?: number | null
}): Plausibility {
  if (!Number.isFinite(a.value)) return null
  const code = (a.code ?? '').toUpperCase()
  const unit = a.unit ?? ''
  const lim = LIMITS.find((l) => l.codes.includes(code) && (!l.unit || l.unit.test(unit)))
  const u = unit ? ` ${unit}` : ''
  if (lim) {
    if (a.value < lim.min || a.value > lim.max) {
      return { level: 'impossible', message: `${a.name} ${a.value}${u} is not possible (expected ${lim.min}–${lim.max}${u}) — check the value` }
    }
    return null
  }
  if (a.refHigh != null && a.refHigh > 0 && a.value > a.refHigh * 20) {
    return { level: 'unusual', message: `${a.name} ${a.value}${u} is over 20 times the upper limit (${a.refHigh})` }
  }
  return null
}
