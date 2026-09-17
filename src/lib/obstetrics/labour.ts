// Labour, delivery and immediate postpartum — clinical rules shared by the IPD
// screen and the PDFs. They prompt the team; they do not replace clinical judgement.
//  - WHO modified partograph (2000; used in India's SBA / LaQshya training): active
//    labour from 4 cm; alert line 1 cm/hour from the first active reading; action
//    line 4 hours to its right; latent phase over 8 hours is abnormal.
//  - Fetal heart rate 110–160 bpm (FIGO 2015). Tachysystole: > 5 contractions in 10 min.
//  - Second stage: up to 3 h in a first birth, 2 h after that (WHO 2018 intrapartum care).
//  - PPH: blood loss ≥ 500 mL, severe ≥ 1000 mL (WHO 2012/2017).
//  - Newborn: low birth weight < 2.5 kg, very low < 1.5 kg, extremely low < 1.0 kg (WHO);
//    5-minute APGAR < 7 needs follow-up (AAP/ACOG 2015).
//  - Postpartum checks every 15 min in the first hour, every 30 min in the second,
//    then 4-hourly to 24 hours (WHO postnatal care / MoHFW SBA guidelines).
//  - Shock index (pulse ÷ systolic BP) ≥ 0.9 after birth suggests significant blood loss.

import { parseBp, type ClinicalAlert } from './alerts'

const HOUR = 3600000

export interface PartographReading {
  id: string
  recorded_at: string
  cervix_cm: number | null
  descent: string | null
  contractions_per10: number | null
  contraction_duration: string | null
  fetal_heart_rate: number | null
  liquor: string | null
  moulding: string | null
  bp: string | null
  pulse: number | null
  temp: number | null
  urine_protein?: string | null
  oxytocin?: string | null
  notes: string | null
}

export const LIQUOR_OPTIONS = [
  { value: 'I', label: 'I — membranes intact' },
  { value: 'C', label: 'C — clear' },
  { value: 'M1', label: 'M — thin meconium' },
  { value: 'M3', label: 'M — thick meconium' },
  { value: 'B', label: 'B — blood-stained' },
  { value: 'A', label: 'A — absent (dry)' },
]
export const MOULDING_OPTIONS = ['0', '+', '++', '+++']
export const DESCENT_OPTIONS = ['5/5', '4/5', '3/5', '2/5', '1/5', '0/5']

export type LabourProgress =
  | { phase: 'none' }
  | { phase: 'latent'; since: string; hours: number; prolonged: boolean }
  | { phase: 'active'; start: { at: string; cm: number }; latestCm: number; hoursActive: number; line: 'on_track' | 'alert' | 'action'; alertAt: string; actionAt: string; fullAt: string | null }

/** Where labour stands against the WHO partograph lines, from the readings (any order). */
export function labourProgress(readings: PartographReading[], now: Date = new Date()): LabourProgress {
  const withCx = readings.filter((r) => r.cervix_cm != null).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  if (!withCx.length) return { phase: 'none' }
  const first = withCx.find((r) => r.cervix_cm! >= 4)
  if (!first) {
    const since = withCx[0].recorded_at
    const hours = (now.getTime() - Date.parse(since)) / HOUR
    return { phase: 'latent', since, hours, prolonged: hours > 8 }
  }
  const t0 = Date.parse(first.recorded_at)
  const c0 = first.cervix_cm!
  const latest = withCx[withCx.length - 1]
  const tl = Date.parse(latest.recorded_at)
  const cl = latest.cervix_cm!
  const full = withCx.find((r) => r.cervix_cm! >= 10)
  // Once fully dilated the lines no longer apply; judge by the time the cervix got there.
  const judgeT = full ? Date.parse(full.recorded_at) : Math.max(tl, now.getTime())
  const judgeC = full ? 10 : cl
  const expectedOnAlert = c0 + (judgeT - t0) / HOUR
  const expectedOnAction = c0 + (judgeT - t0) / HOUR - 4
  const line = judgeC >= expectedOnAlert || judgeC >= 10 ? 'on_track' : judgeC >= expectedOnAction ? 'alert' : 'action'
  // When would a cervix still at `cl` cross each line? (cl reached at tl)
  const alertAt = new Date(t0 + (cl - c0) * HOUR).toISOString()
  const actionAt = new Date(t0 + (cl - c0 + 4) * HOUR).toISOString()
  return {
    phase: 'active', start: { at: first.recorded_at, cm: c0 }, latestCm: cl,
    hoursActive: (judgeT - t0) / HOUR, line, alertAt, actionAt, fullAt: full?.recorded_at ?? null,
  }
}

export function partographAlerts(readings: PartographReading[], opts: { parity: number | null; delivered: boolean; now?: Date }): ClinicalAlert[] {
  const out: ClinicalAlert[] = []
  const sorted = [...readings].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
  const last = sorted[0]
  if (!last) return out
  const now = opts.now ?? new Date()

  if (!opts.delivered) {
    const p = labourProgress(readings, now)
    if (p.phase === 'latent' && p.prolonged) out.push({ level: 'moderate', text: `Latent phase over 8 hours (${Math.floor(p.hours)} h) — reassess; consider augmentation or referral` })
    if (p.phase === 'active' && !p.fullAt) {
      if (p.line === 'action') out.push({ level: 'severe', text: 'Crossed the action line — full assessment now: augment, or caesarean if obstructed' })
      else if (p.line === 'alert') out.push({ level: 'moderate', text: 'Right of the alert line — slow progress; reassess, consider transfer / augmentation' })
    }
    if (p.phase === 'active' && p.fullAt) {
      const hours = (now.getTime() - Date.parse(p.fullAt)) / HOUR
      const limit = (opts.parity ?? 0) === 0 ? 3 : 2
      if (hours > limit) out.push({ level: 'severe', text: `Fully dilated for ${hours.toFixed(1)} h (limit ${limit} h ${limit === 3 ? 'in a first birth' : 'after a previous birth'}) — assess for assisted delivery / caesarean` })
    }
  }

  // The most recent value of each finding.
  const latest = <K extends keyof PartographReading>(k: K) => sorted.find((r) => r[k] != null && r[k] !== '')?.[k] ?? null
  const fhr = latest('fetal_heart_rate') as number | null
  if (fhr != null && (fhr < 110 || fhr > 160)) out.push({ level: 'severe', text: `Fetal heart rate ${fhr}/min — outside 110–160; change position, check, prepare for delivery if persistent` })
  const liquor = latest('liquor') as string | null
  if (liquor === 'M3') out.push({ level: 'severe', text: 'Thick meconium — continuous fetal monitoring; neonatal resuscitation team at birth' })
  else if (liquor === 'M1') out.push({ level: 'watch', text: 'Thin meconium in liquor — monitor fetal heart closely' })
  else if (liquor === 'B') out.push({ level: 'moderate', text: 'Blood-stained liquor — exclude abruption' })
  const moulding = latest('moulding') as string | null
  if (moulding === '+++') out.push({ level: 'severe', text: 'Severe moulding (+++) — suspect obstructed labour' })
  const contractions = latest('contractions_per10') as number | null
  if (contractions != null && contractions > 5) out.push({ level: 'moderate', text: `${contractions} contractions in 10 min — tachysystole${latest('oxytocin') ? '; reduce / stop oxytocin' : ''}` })
  const bp = parseBp(latest('bp') as string | null)
  if (bp && (bp.sys >= 160 || bp.dia >= 110)) out.push({ level: 'severe', text: `BP ${bp.sys}/${bp.dia} — severe hypertension in labour; treat, give magnesium sulphate if pre-eclampsia` })
  else if (bp && (bp.sys >= 140 || bp.dia >= 90)) out.push({ level: 'moderate', text: `BP ${bp.sys}/${bp.dia} — hypertension in labour; check urine protein, repeat` })
  const pulse = latest('pulse') as number | null
  if (pulse != null && pulse > 100) out.push({ level: pulse > 120 ? 'moderate' : 'watch', text: `Maternal pulse ${pulse}/min — check for dehydration, infection, bleeding` })
  const temp = latest('temp') as number | null
  if (temp != null && temp >= 38) out.push({ level: 'moderate', text: `Temperature ${temp} °C — intrapartum fever; screen for infection, start antibiotics` })
  return out
}

export const DELIVERY_MODES = [
  { value: 'normal_vaginal', label: 'Normal vaginal' },
  { value: 'vacuum', label: 'Vacuum-assisted' },
  { value: 'forceps', label: 'Forceps-assisted' },
  { value: 'vaginal_breech', label: 'Vaginal breech' },
  { value: 'caesarean_elective', label: 'Caesarean — elective' },
  { value: 'caesarean_emergency', label: 'Caesarean — emergency' },
] as const
export type DeliveryMode = typeof DELIVERY_MODES[number]['value']
export const isCaesarean = (m: string) => m.startsWith('caesarean')
export const deliveryModeLabel = (m: string) => DELIVERY_MODES.find((d) => d.value === m)?.label ?? m

export interface DeliveryFacts {
  mode: string
  gestation_days: number | null
  blood_loss_ml: number | null
  perineal_tear: string
  placenta: string | null
  amtsl_oxytocin: boolean | null
}

export function deliveryAlerts(d: DeliveryFacts): ClinicalAlert[] {
  const out: ClinicalAlert[] = []
  if (d.blood_loss_ml != null) {
    if (d.blood_loss_ml >= 1000) out.push({ level: 'severe', text: `Blood loss ${d.blood_loss_ml} mL — severe postpartum haemorrhage` })
    else if (d.blood_loss_ml >= 500) out.push({ level: 'moderate', text: `Blood loss ${d.blood_loss_ml} mL — postpartum haemorrhage; monitor closely, check Hb` })
  }
  if (d.placenta === 'incomplete') out.push({ level: 'severe', text: 'Placenta incomplete — risk of retained products and PPH; explore / evacuate' })
  if (d.perineal_tear === 'third' || d.perineal_tear === 'fourth') {
    out.push({ level: 'moderate', text: `${d.perineal_tear === 'third' ? 'Third' : 'Fourth'}-degree tear — repair in theatre by an experienced doctor, antibiotics, laxatives, follow-up` })
  }
  if (d.amtsl_oxytocin === false) out.push({ level: 'watch', text: 'Oxytocin not given in the third stage — watch closely for PPH' })
  if (d.gestation_days != null) {
    const w = Math.floor(d.gestation_days / 7)
    if (d.gestation_days < 34 * 7) out.push({ level: 'moderate', text: `Preterm birth at ${w} weeks` })
    else if (d.gestation_days < 37 * 7) out.push({ level: 'watch', text: `Late preterm birth at ${w} weeks` })
    else if (d.gestation_days >= 42 * 7) out.push({ level: 'watch', text: `Post-term birth at ${w} weeks` })
  }
  return out
}

export interface BabyFacts {
  outcome: string
  birth_weight_kg: number | null
  apgar_1: number | null
  apgar_5: number | null
  breastfed_within_1h: boolean | null
  vitamin_k: boolean | null
  resuscitation: boolean
}

export function babyAlerts(b: BabyFacts): ClinicalAlert[] {
  const out: ClinicalAlert[] = []
  if (b.outcome !== 'live_birth') return [{ level: 'severe', text: b.outcome === 'fresh_stillbirth' ? 'Fresh stillbirth — review intrapartum care; bereavement support' : 'Macerated stillbirth — investigate cause; bereavement support' }]
  const w = b.birth_weight_kg
  if (w != null) {
    if (w < 1.0) out.push({ level: 'severe', text: `${w} kg — extremely low birth weight; NICU care` })
    else if (w < 1.5) out.push({ level: 'severe', text: `${w} kg — very low birth weight; NICU / SNCU care` })
    else if (w < 2.5) out.push({ level: 'moderate', text: `${w} kg — low birth weight; kangaroo mother care, feeding support, keep warm` })
    else if (w >= 4.0) out.push({ level: 'watch', text: `${w} kg — large baby; check blood glucose` })
  }
  if (b.apgar_5 != null) {
    if (b.apgar_5 < 4) out.push({ level: 'severe', text: `APGAR ${b.apgar_5} at 5 minutes — continue resuscitation, NICU` })
    else if (b.apgar_5 < 7) out.push({ level: 'moderate', text: `APGAR ${b.apgar_5} at 5 minutes — observe closely, repeat at 10 minutes` })
  }
  if (b.breastfed_within_1h === false) out.push({ level: 'watch', text: 'Not breastfed within the first hour — support early breastfeeding' })
  if (b.vitamin_k === false) out.push({ level: 'watch', text: 'Vitamin K not given' })
  return out
}

export interface PostpartumReading {
  id: string
  recorded_at: string
  bp: string | null
  pulse: number | null
  temp: number | null
  uterus: string | null
  bleeding: string | null
  bladder: string | null
  wound: string | null
  notes: string | null
}

export function postpartumAlerts(r: PostpartumReading | null): ClinicalAlert[] {
  if (!r) return []
  const out: ClinicalAlert[] = []
  if (r.bleeding === 'heavy' || r.uterus === 'boggy') {
    out.push({ level: 'severe', text: `${r.bleeding === 'heavy' ? 'Heavy bleeding' : 'Uterus not contracted'} — possible PPH: massage uterus, oxytocin, call for help` })
  }
  const bp = parseBp(r.bp)
  if (bp && bp.sys < 90) out.push({ level: 'severe', text: `Systolic BP ${bp.sys} — hypotension; look for bleeding, start IV fluids` })
  else if (bp && r.pulse != null && r.pulse / bp.sys >= 0.9) {
    out.push({ level: 'moderate', text: `Shock index ${(r.pulse / bp.sys).toFixed(1)} (pulse ${r.pulse}, BP ${bp.sys}) — check for hidden blood loss` })
  }
  if (bp && (bp.sys >= 160 || bp.dia >= 110)) out.push({ level: 'severe', text: `BP ${bp.sys}/${bp.dia} — severe postpartum hypertension; treat now` })
  else if (bp && (bp.sys >= 140 || bp.dia >= 90)) out.push({ level: 'moderate', text: `BP ${bp.sys}/${bp.dia} — postpartum hypertension; check for pre-eclampsia` })
  if (r.temp != null && r.temp >= 38) out.push({ level: 'moderate', text: `Temperature ${r.temp} °C — screen for puerperal sepsis` })
  if (r.bladder === 'distended') out.push({ level: 'watch', text: 'Bladder distended — help to void or catheterise (a full bladder stops the uterus contracting)' })
  return out
}

/** When the next postpartum check is due, by time since delivery. Null once past 24 hours. */
export function nextPostpartumCheck(deliveredAt: string, lastAt: string | null, now: Date = new Date()): { dueAt: string; intervalMin: number; overdue: boolean } | null {
  const t0 = Date.parse(deliveredAt)
  const from = lastAt ? Date.parse(lastAt) : t0
  const since = (from - t0) / 60000
  const intervalMin = since < 60 ? 15 : since < 120 ? 30 : 240
  const due = lastAt ? from + intervalMin * 60000 : t0 + 15 * 60000
  if (due - t0 > 24 * HOUR) return null
  return { dueAt: new Date(due).toISOString(), intervalMin, overdue: now.getTime() > due }
}
