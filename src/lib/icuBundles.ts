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

export const BUNDLES: Array<{ key: 'fast_hug' | 'vap' | 'crbsi' | 'cauti'; title: string; appliesTo?: string; items: Array<{ key: string; label: string }> }> = [
  {
    key: 'fast_hug', title: 'FAST HUG BID',
    items: [
      { key: 'feeding', label: 'Feeding' }, { key: 'analgesia', label: 'Analgesia' }, { key: 'sedation', label: 'Sedation' },
      { key: 'thrombo', label: 'Thromboprophylaxis' }, { key: 'hob', label: 'Head of bed 30–45°' }, { key: 'ulcer', label: 'Ulcer prophylaxis' },
      { key: 'glucose', label: 'Glucose control' }, { key: 'bowel', label: 'Bowel care' },
      { key: 'catheter', label: 'Indwelling catheters reviewed' }, { key: 'deescalation', label: 'Antibiotic de-escalation' },
    ],
  },
  {
    key: 'vap', title: 'VAP bundle', appliesTo: 'Ventilated',
    items: [
      { key: 'hob', label: 'Head of bed 30–45°' }, { key: 'sedation_hold', label: 'Daily sedation hold / SBT' },
      { key: 'oral_care', label: 'Oral care (chlorhexidine)' }, { key: 'cuff', label: 'Cuff pressure 20–30 cmH₂O' },
      { key: 'suction', label: 'Closed / subglottic suction' }, { key: 'prophylaxis', label: 'DVT & ulcer prophylaxis' },
    ],
  },
  {
    key: 'crbsi', title: 'Central line (CRBSI) bundle', appliesTo: 'Central line',
    items: [
      { key: 'hand_hygiene', label: 'Hand hygiene before touching the line' }, { key: 'dressing', label: 'Dressing clean, dry, intact' },
      { key: 'scrub_hub', label: 'Hub scrubbed before access' }, { key: 'need_reviewed', label: 'Need for the line reviewed today' },
    ],
  },
  {
    key: 'cauti', title: 'Urinary catheter (CAUTI) bundle', appliesTo: 'Urinary catheter',
    items: [
      { key: 'need_reviewed', label: 'Need for the catheter reviewed today' }, { key: 'closed', label: 'Closed drainage maintained' },
      { key: 'bag_below', label: 'Bag below bladder, off the floor' }, { key: 'perineal', label: 'Perineal care done' },
      { key: 'secured', label: 'Catheter secured' },
    ],
  },
]
