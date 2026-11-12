/** Kinds of progress note and KMCH's nursing shifts. */

export const NOTE_KINDS = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'rt', label: 'Respiratory therapist' },
  { value: 'physio', label: 'Physiotherapy' },
  { value: 'dietitian', label: 'Dietitian' },
  { value: 'wound', label: 'Wound care' },
] as const
export type NoteKind = (typeof NOTE_KINDS)[number]['value'] | 'system'

export const SHIFTS = [
  { value: 'morning', label: 'Morning (7 am – 1 pm)' },
  { value: 'evening', label: 'Evening (1 pm – 7 pm)' },
  { value: 'night', label: 'Night (7 pm – 7 am)' },
] as const
export type Shift = (typeof SHIFTS)[number]['value']

/** The KMCH shift an instant falls in, by IST clock: 07–13 morning, 13–19 evening, else night. */
export function shiftOf(at: Date): Shift {
  const h = new Date(at.getTime() + 5.5 * 3600_000).getUTCHours()
  return h >= 7 && h < 13 ? 'morning' : h >= 13 && h < 19 ? 'evening' : 'night'
}

export function noteKindLabel(k: string | null | undefined): string {
  if (k === 'system') return 'System'
  return NOTE_KINDS.find((x) => x.value === k)?.label ?? 'Doctor'
}

/**
 * The typed vitals of a progress note ("120/80", "72", "98.6", "98%") as an
 * observation row, so a note's vitals land on the chart too. Fahrenheit
 * (anything above 45) is converted to °C. Null when nothing parses.
 */
export function noteVitalsToObservation(v: { bp?: string | null; pulse?: string | null; temp?: string | null; spo2?: string | null } | null | undefined) {
  if (!v) return null
  const int = (s?: string | null) => { const m = s?.match(/\d+/); return m ? parseInt(m[0], 10) : null }
  const bp = v.bp?.match(/(\d{2,3})\s*\/\s*(\d{2,3})/)
  let temp = v.temp ? parseFloat(v.temp.replace(/[^\d.]/g, '')) : NaN
  if (Number.isFinite(temp) && temp > 45) temp = Math.round(((temp - 32) * 5) / 9 * 10) / 10
  const row = {
    sbp: bp ? parseInt(bp[1], 10) : null, dbp: bp ? parseInt(bp[2], 10) : null,
    hr: int(v.pulse), spo2: int(v.spo2), temp: Number.isFinite(temp) && temp >= 25 && temp <= 45 ? temp : null,
  }
  if (row.spo2 != null && (row.spo2 < 0 || row.spo2 > 100)) row.spo2 = null
  if (Object.values(row).every((x) => x == null)) return null
  const map = row.sbp != null && row.dbp != null ? Math.round((row.sbp + 2 * row.dbp) / 3) : null
  return { ...row, map }
}

// ── Wound assessment (KMCH ICU chart, 0290) ───────────────────────────────────

export const WOUND_CONDITIONS = [
  { value: 'worsening', label: 'Worsening' },
  { value: 'same', label: 'Same' },
  { value: 'improved', label: 'Improved' },
] as const

/** KMCH's T-I-M-E lines, with the words a nurse would write in each. */
export const WOUND_FIELDS = [
  { key: 't', label: 'T — Tissue', hint: 'e.g. granulation 70%, slough 30%' },
  { key: 'i', label: 'I — Infection / inflammation', hint: 'e.g. no signs / redness, warmth, pus' },
  { key: 'm', label: 'M — Moisture', hint: 'e.g. moderate serous exudate' },
  { key: 'e', label: 'E — Edge', hint: 'e.g. advancing / undermined / rolled' },
] as const

export interface WoundData {
  site: string; t?: string | null; i?: string | null; m?: string | null; e?: string | null
  condition?: 'worsening' | 'same' | 'improved' | null; dressing?: string | null
}

/** The wound note as words — for the timeline, the day sheet and the print. */
export function woundText(w: WoundData): string {
  const cond = WOUND_CONDITIONS.find((c) => c.value === w.condition)?.label
  return [
    `Wound — ${w.site}`,
    w.t ? `T: ${w.t}` : null, w.i ? `I: ${w.i}` : null, w.m ? `M: ${w.m}` : null, w.e ? `E: ${w.e}` : null,
    cond ? `Condition: ${cond}` : null, w.dressing ? `Dressing done: ${w.dressing}` : null,
  ].filter(Boolean).join('. ')
}
