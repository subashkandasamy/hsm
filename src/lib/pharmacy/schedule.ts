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
