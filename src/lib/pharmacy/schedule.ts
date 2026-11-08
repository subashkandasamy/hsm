/**
 * Drug schedules under the Drugs and Cosmetics Rules, as the catalogue
 * (drug_master.schedule) records them. Stored upper-case; the H1 register
 * trigger (log_h1_supply, 0168) acts on H1 and X.
 *
 * Shared by the server and the screens, so a value the screen offers is always
 * one the server accepts.
 */

export const DRUG_SCHEDULES = ['H', 'H1', 'X', 'G'] as const
export type DrugSchedule = typeof DRUG_SCHEDULES[number]

export function isDrugSchedule(v: unknown): v is DrugSchedule {
  return typeof v === 'string' && (DRUG_SCHEDULES as readonly string[]).includes(v)
}

/** What each schedule obliges the pharmacy to do — shown where the schedule is chosen. */
export const SCHEDULE_HINT: Record<DrugSchedule, string> = {
  H:  'Prescription only.',
  H1: 'Prescription only, and every supply is entered in the H1 register.',
  X:  'Prescription only, a separate register, and the prescription is kept by the pharmacy.',
  G:  'To be used only under medical supervision.',
}

/**
 * The reason for supplying a Schedule X medicine (0269): a few words in the
 * pharmacist's own terms — "pain", "fever" — as KMCH writes in its paper
 * ledger. Not a diagnosis. Required for X only.
 */
export const SUPPLY_REASON_MAX = 200
export const NEEDS_REASON_MESSAGE = 'This is a Schedule X medicine. Enter the reason it is being supplied — a few words, e.g. "pain" — for the X register.'

export function requiresSupplyReason(schedule: string | null | undefined): boolean {
  return (schedule ?? '').toUpperCase() === 'X'
}

/** Trimmed reason, or null when blank. Over-long input is cut, not refused. */
export function cleanSupplyReason(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t.length >= 2 ? t.slice(0, SUPPLY_REASON_MAX) : null
}
