// Clinical warnings for an antenatal check and a gynaecology consultation.
// They prompt the doctor; they do not replace clinical judgement.
//  - Hypertension in pregnancy: ≥ 140/90, severe range ≥ 160/110; with proteinuria
//    after 20 weeks = pre-eclampsia (ACOG Practice Bulletin 222; ISSHP 2021).
//  - Anaemia in pregnancy (WHO / MoHFW): Hb < 11 mild, < 10 moderate, < 7 severe g/dL.
//  - Fetal heart rate baseline 110–160 bpm (FIGO 2015).
//  - Symphysis-fundal height ≈ weeks of gestation ± 2 cm from 24 weeks.
//  - Reduced fetal movements from 28 weeks need same-day assessment (RCOG GTG 57).
//  - Induction of labour offered from 41 weeks (WHO 2018).
//  - Menstrual cycle: normal frequency 24–38 days, duration ≤ 8 days (FIGO AUB System 1, 2018).
//  - Cervical screening age 30–65: VIA or HPV test every 5 years (MoHFW NPCDCS), Pap every 3 years.

import { daysBetween } from './dating'

export type AlertLevel = 'severe' | 'moderate' | 'watch'
export interface ClinicalAlert { level: AlertLevel; text: string }

export const DANGER_SIGNS: Array<{ key: string; label: string }> = [
  { key: 'bleeding', label: 'Bleeding per vaginum' },
  { key: 'leaking', label: 'Leaking fluid' },
  { key: 'headache_vision', label: 'Severe headache / blurred vision' },
  { key: 'reduced_fm', label: 'Baby moving less' },
  { key: 'abdominal_pain', label: 'Severe abdominal pain' },
  { key: 'fever', label: 'Fever' },
  { key: 'convulsions', label: 'Fits / convulsions' },
  { key: 'breathless', label: 'Breathlessness' },
]

export function parseBp(bp: string | null | undefined): { sys: number; dia: number } | null {
  const m = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(bp ?? '')
  return m ? { sys: Number(m[1]), dia: Number(m[2]) } : null
}

const PROTEIN_POSITIVE = /^(1\+|2\+|3\+|4\+|\+{1,4})$/

export interface AncCheckInput {
  gaDays: number | null
  bp?: string | null
  urine_albumin?: string | null
  urine_sugar?: string | null
  hb?: number | null
  fetal_heart_rate?: number | null
  fundal_height_cm?: number | null
  fetal_movements?: string | null
  oedema?: string | null
  presentation?: string | null
  danger_signs?: string[]
  previous_caesareans?: number | null
}

export function ancAlerts(v: AncCheckInput): ClinicalAlert[] {
  const out: ClinicalAlert[] = []
  const ga = v.gaDays
  const weeks = ga != null ? ga / 7 : null

  for (const key of v.danger_signs ?? []) {
    const label = DANGER_SIGNS.find((d) => d.key === key)?.label ?? key
    out.push({ level: 'severe', text: `Danger sign: ${label} — assess now` })
  }

  const bp = parseBp(v.bp)
  const proteinuria = PROTEIN_POSITIVE.test((v.urine_albumin ?? '').trim())
  if (bp) {
    const severeRange = bp.sys >= 160 || bp.dia >= 110
    const high = bp.sys >= 140 || bp.dia >= 90
    if (high && weeks != null && weeks < 20) {
      out.push({ level: severeRange ? 'severe' : 'moderate', text: `BP ${bp.sys}/${bp.dia} before 20 weeks — chronic hypertension${severeRange ? ' in the severe range; treat urgently' : ''}` })
    } else if (high && proteinuria) {
      out.push({ level: 'severe', text: `BP ${bp.sys}/${bp.dia} with proteinuria — pre-eclampsia likely; admit / refer` })
    } else if (severeRange) {
      out.push({ level: 'severe', text: `BP ${bp.sys}/${bp.dia} in the severe range — treat urgently, check for pre-eclampsia` })
    } else if (high) {
      out.push({ level: 'moderate', text: `BP ${bp.sys}/${bp.dia} — gestational hypertension; check urine protein, recheck BP in 4 hours` })
    }
  }
  if (proteinuria && !(bp && (bp.sys >= 140 || bp.dia >= 90))) {
    out.push({ level: 'watch', text: 'Protein in urine with normal BP — repeat test, send urine culture' })
  }
  if (/facial|generali/i.test(v.oedema ?? '')) {
    out.push({ level: 'watch', text: 'Facial / generalised oedema — check BP and urine protein' })
  }

  if (v.hb != null) {
    if (v.hb < 7) out.push({ level: 'severe', text: `Hb ${v.hb} g/dL — severe anaemia; refer for treatment` })
    else if (v.hb < 10) out.push({ level: 'moderate', text: `Hb ${v.hb} g/dL — moderate anaemia; treatment dose iron, recheck` })
    else if (v.hb < 11) out.push({ level: 'watch', text: `Hb ${v.hb} g/dL — mild anaemia` })
  }

  if (v.fetal_heart_rate != null && (v.fetal_heart_rate < 110 || v.fetal_heart_rate > 160)) {
    out.push({ level: 'severe', text: `Fetal heart rate ${v.fetal_heart_rate}/min — outside 110–160; assess fetal wellbeing now` })
  }

  if (/reduced|absent|less|no\b/i.test(v.fetal_movements ?? '')) {
    out.push(weeks != null && weeks >= 28
      ? { level: 'severe', text: 'Reduced fetal movements after 28 weeks — same-day CTG / assessment' }
      : { level: 'watch', text: 'Reduced fetal movements reported' })
  }

  if (v.fundal_height_cm != null && weeks != null && weeks >= 24 && weeks <= 40) {
    const diff = v.fundal_height_cm - Math.floor(weeks)
    if (Math.abs(diff) > 2) {
      out.push({ level: 'watch', text: `Fundal height ${v.fundal_height_cm} cm at ${Math.floor(weeks)} weeks — ${diff < 0 ? 'small' : 'large'} for dates; consider a growth scan` })
    }
  }

  if (/^(\+|trace|1\+|2\+|3\+|4\+|present|positive)/i.test((v.urine_sugar ?? '').trim())) {
    out.push({ level: 'watch', text: 'Sugar in urine — do a 75 g OGTT if not done' })
  }

  if (weeks != null && weeks >= 36 && /breech|transverse|oblique/i.test(v.presentation ?? '')) {
    out.push({ level: 'watch', text: `${v.presentation} presentation at ${Math.floor(weeks)} weeks — discuss ECV / plan mode of delivery` })
  }
  if (ga != null && ga >= 41 * 7) {
    out.push({ level: 'moderate', text: `${Math.floor(ga / 7)}w ${ga % 7}d — offer induction of labour` })
  }
  if ((v.previous_caesareans ?? 0) > 0 && weeks != null && weeks >= 34) {
    out.push({ level: 'watch', text: `Previous caesarean (${v.previous_caesareans}) — plan VBAC or repeat caesarean` })
  }
  return out
}

/** Automatic risk factors from the pregnancy record and age. */
export function pregnancyRiskFlags(p: { age: number | null; gravida: number | null; previous_caesareans: number | null; bloodGroup: string | null }): string[] {
  const out: string[] = []
  if (p.age != null && p.age < 18) out.push('Teenage pregnancy')
  if (p.age != null && p.age >= 35) out.push('Age 35 or more')
  if ((p.gravida ?? 0) >= 5) out.push('Grand multipara')
  if ((p.previous_caesareans ?? 0) > 0) out.push('Previous caesarean')
  if (p.bloodGroup && /(-|neg)/i.test(p.bloodGroup)) out.push('Rh-negative')
  return out
}

export interface GynHistory {
  lmp: string | null
  cycle_days: number | null
  bleeding_days: number | null
  regularity: 'regular' | 'irregular' | null
  flow: 'scanty' | 'normal' | 'heavy' | null
  intermenstrual_bleeding: boolean
  postcoital_bleeding: boolean
  menopausal: boolean
  menopause_age: number | null
  postmenopausal_bleeding: boolean
}

export interface ScreeningRecord { test: 'pap' | 'hpv' | 'via' | null; date: string | null; result: string }

export const SCREENING_INTERVAL_YEARS = { pap: 3, hpv: 5, via: 5 } as const

export function gynAlerts(opts: { age: number | null; today: string; m: GynHistory; screening: ScreeningRecord; pregnant: boolean; hysterectomy?: boolean }): ClinicalAlert[] {
  const { age, today, m, screening, pregnant } = opts
  const out: ClinicalAlert[] = []
  if (m.menopausal && m.postmenopausal_bleeding) {
    out.push({ level: 'severe', text: 'Postmenopausal bleeding — needs endometrial assessment (TVS ± biopsy)' })
  }
  if (m.postcoital_bleeding) out.push({ level: 'moderate', text: 'Post-coital bleeding — examine the cervix and do cervical screening' })
  if (m.intermenstrual_bleeding) out.push({ level: 'watch', text: 'Intermenstrual bleeding — evaluate (pregnancy, cervix, endometrium)' })
  if (!m.menopausal) {
    if (m.cycle_days != null && (m.cycle_days < 24 || m.cycle_days > 38)) {
      out.push({ level: 'watch', text: `Cycle length ${m.cycle_days} days — outside the normal 24–38 days` })
    }
    if (m.bleeding_days != null && m.bleeding_days > 8) out.push({ level: 'watch', text: `Bleeding for ${m.bleeding_days} days — prolonged (normal ≤ 8)` })
    if (m.flow === 'heavy') out.push({ level: 'watch', text: 'Heavy menstrual bleeding — check Hb' })
    if (m.regularity === 'irregular') out.push({ level: 'watch', text: 'Irregular cycles — consider thyroid, prolactin, PCOS' })
    if (!pregnant && m.lmp && (age == null || (age >= 12 && age <= 55))) {
      const late = daysBetween(m.lmp, today) - (m.cycle_days ?? 28)
      if (late > 7) out.push({ level: 'watch', text: `Period late by ${late} days — do a urine pregnancy test` })
    }
  } else if (m.menopause_age != null && m.menopause_age < 40) {
    out.push({ level: 'watch', text: `Menopause at ${m.menopause_age} — premature ovarian insufficiency; consider HRT` })
  }

  if (age != null && age >= 30 && age <= 65 && !opts.hysterectomy) {
    if (screening.date && /positive|abnormal|ascus|lsil|hsil|agc|cin/i.test(screening.result)) {
      out.push({ level: 'moderate', text: `Last cervical screening abnormal (${screening.result}) — colposcopy / follow-up` })
    } else if (!screening.date || !screening.test) {
      out.push({ level: 'watch', text: 'No cervical screening on record — offer VIA / HPV test / Pap smear' })
    } else {
      const years = daysBetween(screening.date, today) / 365.25
      const interval = SCREENING_INTERVAL_YEARS[screening.test]
      if (years >= interval) out.push({ level: 'watch', text: `Cervical screening due — last ${screening.test.toUpperCase()} ${Math.floor(years)} years ago (repeat every ${interval})` })
    }
  }
  return out
}
