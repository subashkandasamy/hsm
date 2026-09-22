/**
 * Catching a slipped unit before it becomes a measurement.
 *
 * Grams typed into a kilogram box, millimetres into a centimetre one, or a head
 * circumference typed into the MUAC box: each produces a number the growth chart
 * will happily plot and the clinician will read. The guard used to be one
 * combined test with one message — "a value looks out of range" — which told
 * nobody which of four boxes was wrong. Each value is now checked on its own and
 * named, with the range it should sit in.
 */

export interface PlausibleRange {
  label: string
  min: number
  max: number
  unit: string
}

/** Wide on purpose: this rejects unit slips, not unusual children. */
export const GROWTH_RANGES = {
  weight_kg:    { label: 'Weight', min: 0.3, max: 150, unit: 'kg' },
  height_cm:    { label: 'Length or height', min: 15, max: 220, unit: 'cm' },
  head_circ_cm: { label: 'Head circumference', min: 15, max: 70, unit: 'cm' },
  muac_cm:      { label: 'MUAC', min: 5, max: 40, unit: 'cm' },
} satisfies Record<string, PlausibleRange>

/** The antenatal check's own fields. */
export const ANC_RANGES = {
  weight_kg:        { label: 'Weight', min: 25, max: 250, unit: 'kg' },
  hb:               { label: 'Haemoglobin', min: 2, max: 25, unit: 'g/dL' },
  fundal_height_cm: { label: 'Fundal height', min: 5, max: 60, unit: 'cm' },
  fetal_heart_rate: { label: 'Fetal heart rate', min: 50, max: 250, unit: 'beats/min' },
} satisfies Record<string, PlausibleRange>

/** A number as typed, so the message can quote it back. */
const show = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))))

/**
 * The first value that cannot be right, named. Returns null when everything
 * given is plausible; fields that are absent are not checked.
 */
export function firstImplausible<K extends string>(
  values: Partial<Record<K, number | null | undefined>>,
  ranges: Record<K, PlausibleRange>,
): { key: K; message: string } | null {
  for (const key of Object.keys(ranges) as K[]) {
    const v = values[key]
    if (v == null || !Number.isFinite(v)) continue
    const r = ranges[key]
    if (v < r.min || v > r.max) {
      return {
        key,
        message: `${r.label} of ${show(v)} ${r.unit} looks wrong — it should be between ${r.min} and ${r.max} ${r.unit}. Check the value and the unit.`,
      }
    }
  }
  return null
}
