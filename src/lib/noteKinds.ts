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
