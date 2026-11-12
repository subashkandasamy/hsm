/**
 * The nurse's round, the patient strip and the insulin sliding scale — shared
 * by the round form, the chart, the strip and the server actions.
 */

export const AVPU = [
  { value: 'A', label: 'A — Alert' },
  { value: 'C', label: 'C — New confusion' },
  { value: 'V', label: 'V — Voice' },
  { value: 'P', label: 'P — Pain' },
  { value: 'U', label: 'U — Unresponsive' },
] as const
export type Avpu = (typeof AVPU)[number]['value']

export const O2_DEVICES = [
  { value: 'air', label: 'Room air' },
  { value: 'nasal_prongs', label: 'Nasal prongs' },
  { value: 'face_mask', label: 'Face mask' },
  { value: 'nrbm', label: 'Non-rebreather mask' },
  { value: 'hfnc', label: 'High-flow nasal' },
  { value: 'niv', label: 'NIV / BiPAP' },
  { value: 'ventilator', label: 'Ventilator' },
] as const
export type O2Device = (typeof O2_DEVICES)[number]['value']

export const DIETS = [
  { value: 'npo', label: 'Nil by mouth' },
  { value: 'oral', label: 'Normal oral' },
  { value: 'soft', label: 'Soft' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'diabetic', label: 'Diabetic' },
  { value: 'renal', label: 'Renal' },
  { value: 'rt_feed', label: 'Ryles tube feed' },
  { value: 'peg_feed', label: 'PEG feed' },
  { value: 'tpn', label: 'TPN' },
] as const

export const DVT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'pharmacological', label: 'Heparin / LMWH' },
  { value: 'mechanical', label: 'Stockings / pump' },
  { value: 'both', label: 'Drug + mechanical' },
  { value: 'contraindicated', label: 'Contraindicated' },
] as const

// ── The rest of KMCH's ICU chart (0288) ───────────────────────────────────────

export const POSITIONS = [
  { value: 'supine', label: 'Supine' },
  { value: 'left', label: 'Left lateral' },
  { value: 'right', label: 'Right lateral' },
  { value: 'prone', label: 'Prone' },
  { value: 'head_up', label: 'Head up 30°' },
  { value: 'sitting', label: 'Sitting up' },
] as const

/** Suction done this hour — and how much came up. */
export const SUCTION = [
  { value: 'none', label: 'Suctioned — nil' },
  { value: 'scanty', label: 'Suctioned — scanty' },
  { value: 'moderate', label: 'Suctioned — moderate' },
  { value: 'copious', label: 'Suctioned — copious' },
] as const

export const INSULIN_ROUTES = [
  { value: 'sc', label: 'SC' },
  { value: 'iv', label: 'IV' },
] as const

export const HUMIDIFIERS = [
  { value: 'hme', label: 'HME' },
  { value: 'heated', label: 'Heated humidifier' },
] as const

/**
 * A temperature typed in either scale, as °C. KMCH charts in °F; Uyirly
 * stores °C (the early-warning score is calibrated in it). No human reading
 * is above 45 °C or below 80 °F, so the number itself says which scale.
 */
export function toCelsius(v: number | null): number | null {
  if (v == null || Number.isNaN(v)) return v
  return v >= 80 ? Math.round(((v - 32) * 5) / 9 * 10) / 10 : v
}
export const toFahrenheit = (c: number | null | undefined) => (c == null ? null : Math.round((c * 9 / 5 + 32) * 10) / 10)

/** Cerebral perfusion pressure: MAP − ICP. */
export const cppOf = (map: number | null | undefined, icp: number | null | undefined) => (map != null && icp != null ? map - icp : null)

export const labelOf = (list: ReadonlyArray<{ value: string; label: string }>, v: string | null | undefined) =>
  list.find((x) => x.value === v)?.label ?? null

/** On supplemental oxygen, for NEWS2: any device but room air, any flow, FiO₂ above air, or ventilated. */
export function onOxygen(o: { o2_device?: string | null; o2_lpm?: number | null; fio2?: number | null }, ventilated = false): boolean {
  return ventilated
    || (!!o.o2_device && o.o2_device !== 'air')
    || (o.o2_lpm != null && o.o2_lpm > 0)
    || (o.fio2 != null && o.fio2 > 21)
}

export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null
  const v = weightKg / ((heightCm / 100) ** 2)
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

// ── Insulin sliding scale ─────────────────────────────────────────────────────

export interface ScaleRow { from: number; to: number; units: number }

/** The dose the scale gives for a reading, or null (below the scale, or no scale). */
export function scaleDose(scale: ScaleRow[] | null | undefined, glucose: number | null | undefined): number | null {
  if (!scale?.length || glucose == null) return null
  const row = scale.find((r) => glucose >= r.from && glucose <= r.to)
  return row ? row.units : null
}

/** A scale that can be trusted: each band low < high, in order, not overlapping. Null when fine. */
export function scaleProblem(scale: ScaleRow[]): string | null {
  const rows = [...scale].sort((a, b) => a.from - b.from)
  for (const [i, r] of rows.entries()) {
    if (!(r.from < r.to)) return `${r.from}–${r.to}: the lower figure must be below the upper`
    if (r.units < 0 || r.units > 100) return `${r.from}–${r.to}: units must be 0 to 100`
    if (i > 0 && r.from <= rows[i - 1].to) return `${rows[i - 1].from}–${rows[i - 1].to} and ${r.from}–${r.to} overlap`
  }
  return null
}
