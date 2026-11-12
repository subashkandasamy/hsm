/**
 * Lines & tubes and the ICU care bundles (KMCH ICU Critical Care Chart).
 * Shift letters follow KMCH's sheet: A morning, B evening, N night — the same
 * three shifts as the nursing notes (src/lib/noteKinds.ts).
 */

export const LINE_KINDS = [
  { value: 'peripheral_iv', label: 'Peripheral IV', watchDays: 3 },
  { value: 'central_line', label: 'Central line', watchDays: 7 },
  { value: 'arterial_line', label: 'Arterial line', watchDays: 5 },
  { value: 'picc', label: 'PICC', watchDays: 14 },
  { value: 'dialysis_catheter', label: 'Dialysis catheter', watchDays: 7 },
  { value: 'urinary_catheter', label: 'Urinary catheter', watchDays: 5 },
  { value: 'et_tube', label: 'Endotracheal tube', watchDays: 7 },
  { value: 'tracheostomy', label: 'Tracheostomy', watchDays: 30 },
  { value: 'ryles_tube', label: 'Ryles tube', watchDays: 14 },
  { value: 'drain', label: 'Drain', watchDays: 7 },
  { value: 'other', label: 'Other', watchDays: 7 },
] as const
export type LineKind = (typeof LINE_KINDS)[number]['value']

export function lineKind(k: string) {
  return LINE_KINDS.find((x) => x.value === k) ?? LINE_KINDS[LINE_KINDS.length - 1]
}

/** Day of a line in place, insertion day = day 1 (IST calendar days). */
export function lineDay(insertedAt: string, at: Date = new Date()): number {
  const d = (x: Date) => Math.floor((x.getTime() + 5.5 * 3600_000) / 86_400_000)
  return d(at) - d(new Date(insertedAt)) + 1
}

export const BUNDLE_SHIFTS = [
  { value: 'morning', letter: 'A' },
  { value: 'evening', letter: 'B' },
  { value: 'night', letter: 'N' },
] as const
export type BundleShift = (typeof BUNDLE_SHIFTS)[number]['value']

/**
 * KMCH's own lists, item for item and in the sheet's order (ICU Critical Care
 * Chart, back side): FAST HUG BSNL and the infection prevention bundles.
 * Keys kept from the first version where the meaning is the same, so a
 * shift already signed still counts.
 */
export const BUNDLES: Array<{ key: 'fast_hug' | 'vap' | 'crbsi' | 'cauti'; title: string; appliesTo?: string; items: Array<{ key: string; label: string }> }> = [
  {
    key: 'fast_hug', title: 'FAST HUG BSNL',
    items: [
      { key: 'feeding', label: 'Feeding' }, { key: 'analgesia', label: 'Analgesic' }, { key: 'sedation', label: 'Sedation' },
      { key: 'thrombo', label: 'DVT prophylaxis' }, { key: 'hob', label: 'Head end elevation' }, { key: 'ulcer', label: 'Ulcer prophylaxis' },
      { key: 'glucose', label: 'Glycemic control' }, { key: 'bedsore', label: 'Bedsore' }, { key: 'bowel', label: 'Stools' },
      { key: 'neck', label: 'Neck stiffness' }, { key: 'catheter', label: 'Lines' },
    ],
  },
  {
    key: 'vap', title: 'VAP', appliesTo: 'Ventilated',
    items: [
      { key: 'oral_care', label: 'Oral hygiene' }, { key: 'cuff', label: 'Cuff pressure' }, { key: 'sedation_hold', label: 'SBT' },
      { key: 'suction', label: 'Subglottic ETT' }, { key: 'hme', label: 'HME' }, { key: 'oral_rt', label: 'Oral Ryles tube only' },
    ],
  },
  {
    key: 'crbsi', title: 'CRBSI', appliesTo: 'Central line',
    items: [
      { key: 'dressing', label: 'Proper dressing' }, { key: 'admin_set', label: 'Administration set changed as per protocol' },
      { key: 'scrub_hub', label: 'Infection port disinfected' },
    ],
  },
  {
    key: 'cauti', title: 'UTI', appliesTo: 'Urinary catheter',
    items: [
      { key: 'secured', label: 'Anterior thigh placement' }, { key: 'bag_below', label: 'Dependent drainage' },
      { key: 'no_kink', label: 'Avoid tube kinking' }, { key: 'empty_bag', label: 'Urobag emptied before shifting' },
      { key: 'recath', label: 'Recatheterised (size in notes)' },
    ],
  },
]
