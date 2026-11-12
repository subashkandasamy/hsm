/**
 * How a patient left the hospital. One list, used by the discharge form, the
 * server action, the IPD list, the patient profile and the printed summary.
 */

export const DISCHARGE_TYPES = ['normal', 'referred', 'dama', 'absconded', 'death'] as const
export type DischargeType = (typeof DISCHARGE_TYPES)[number]

export const DISCHARGE_TYPE_OPTIONS: Array<{ value: DischargeType; label: string; hint: string }> = [
  { value: 'normal',    label: 'Normal discharge',          hint: 'Treated and sent home on the doctor’s advice' },
  { value: 'referred',  label: 'Referred to another hospital', hint: 'Give the referral letter from Refer Out' },
  { value: 'dama',      label: 'Against medical advice',    hint: 'Family takes the patient home against advice — print the declaration for signature' },
  { value: 'absconded', label: 'Absconded',                 hint: 'Left without informing the staff' },
  { value: 'death',     label: 'Death',                     hint: 'Record the time and cause of death' },
]

/** Short label for chips and lists. Null (discharges before types existed) reads plainly. */
export function dischargeTypeLabel(t: string | null | undefined): string {
  switch (t) {
    case 'normal':    return 'Discharged'
    case 'referred':  return 'Referred'
    case 'dama':      return 'Against advice'
    case 'absconded': return 'Absconded'
    case 'death':     return 'Died'
    default:          return 'Discharged'
  }
}

/**
 * The patient's balance does not hold these discharges back.
 *
 * Under the Charter of Patients' Rights a hospital may not detain a patient, or
 * the body of one who has died, over an unpaid bill. Someone who absconded has
 * already gone. A patient referred on is going for care this hospital cannot
 * give — an unconscious, unidentified MLC patient's transfer was blocked by the
 * bill (BUG-059). The amount stays due on the bills and is recorded with the
 * discharge — it is not written off.
 */
export function dischargeSkipsBalanceGate(t: DischargeType): boolean {
  return t === 'dama' || t === 'absconded' || t === 'death' || t === 'referred'
}

/** Printed title of the summary for each type. */
export function dischargeDocumentTitle(t: string | null | undefined): string {
  switch (t) {
    case 'death':     return 'DEATH SUMMARY'
    case 'dama':      return 'DISCHARGE AGAINST MEDICAL ADVICE'
    case 'absconded': return 'SUMMARY — PATIENT ABSCONDED'
    case 'referred':  return 'DISCHARGE SUMMARY — REFERRED'
    default:          return 'DISCHARGE SUMMARY'
  }
}
