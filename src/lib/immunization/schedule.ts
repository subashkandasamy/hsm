// Vaccination status for a child, dose by dose, from the UIP schedule rules
// (immunization_schedule: earliest age, upper age limit, previous dose and gap).

const DAY = 86400000
const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)

export interface ScheduleRow {
  vaccine: string
  dose_label: string
  due_age_days: number
  min_age_days: number | null
  max_age_days: number | null
  prev_vaccine: string | null
  prev_dose_label: string | null
  min_interval_days: number | null
  note: string | null
  sort_order: number
}

export interface GivenDose {
  id: string
  vaccine: string
  dose_label: string
  given_date: string
  date_known: boolean
  visit_id: string | null
  /** Pharmacy side: not_required (free / given elsewhere), pending, dispensed, cancelled. */
  fulfilment?: 'not_required' | 'pending' | 'dispensed' | 'cancelled'
  charge_amount?: number | null
  batch_no?: string | null
  expiry_date?: string | null
  bill?: { bill_no: string; status: string; paid: number; total: number } | null
}

export interface Deferral { vaccine: string; dose_label: string; reason: string; deferred_on: string }

/**
 * given     — recorded
 * overdue   — can be given today; the recommended age has passed
 * due       — can be given today (or within 30 days it becomes due)
 * waiting   — the previous dose is not recorded, or the minimum gap has not passed
 * missed    — past the upper age limit; no longer given
 * upcoming  — later
 */
export type DoseState = 'given' | 'overdue' | 'due' | 'waiting' | 'missed' | 'upcoming'

export interface DoseStatus {
  key: string
  vaccine: string
  dose_label: string
  label: string
  state: DoseState
  dueDate: string
  /** Earliest date it can be given (age and gap rules), when known. */
  earliestDate: string | null
  /** Last date it can be given (upper age limit). */
  lastDate: string | null
  canGiveToday: boolean
  /** Why it cannot be given today (waiting / missed / too young). */
  reason: string | null
  note: string | null
  given: GivenDose | null
  deferral: Deferral | null
  dueAgeDays: number
}

export const doseKey = (vaccine: string, dose: string) => `${vaccine}|${dose}`
export const doseLabel = (vaccine: string, dose: string) =>
  /^\d+$/.test(dose) ? `${vaccine} ${dose}` : dose.toLowerCase().startsWith(vaccine.toLowerCase()) ? dose : `${vaccine} ${dose}`

export function vaccinationStatus(opts: { dob: string; today: string; schedule: ScheduleRow[]; given: GivenDose[]; deferrals: Deferral[] }): DoseStatus[] {
  const { dob, today } = opts
  const ageToday = diffDays(dob, today)
  const soon = addDays(today, 30)
  const givenBy = new Map(opts.given.map((g) => [doseKey(g.vaccine, g.dose_label), g]))
  const deferralBy = new Map<string, Deferral>()
  for (const d of opts.deferrals) {
    const k = doseKey(d.vaccine, d.dose_label)
    const cur = deferralBy.get(k)
    if (!cur || cur.deferred_on < d.deferred_on) deferralBy.set(k, d)
  }
  const rows = [...opts.schedule].sort((a, b) => a.sort_order - b.sort_order)
  const labelOf = new Map(rows.map((r) => [doseKey(r.vaccine, r.dose_label), doseLabel(r.vaccine, r.dose_label)]))

  const computed = new Map<string, DoseStatus>()
  return rows.map((r) => {
    const st = compute(r)
    computed.set(st.key, st)
    return st
  })

  function compute(r: ScheduleRow): DoseStatus {
    const key = doseKey(r.vaccine, r.dose_label)
    const given = givenBy.get(key) ?? null
    const dueDate = addDays(dob, r.due_age_days)
    const lastDate = r.max_age_days != null ? addDays(dob, r.max_age_days) : null
    const base = {
      key, vaccine: r.vaccine, dose_label: r.dose_label, label: labelOf.get(key)!, dueDate, lastDate,
      note: r.note, given, deferral: given ? null : deferralBy.get(key) ?? null, dueAgeDays: r.due_age_days,
    }
    if (given) return { ...base, state: 'given' as const, earliestDate: null, canGiveToday: false, reason: null }

    if (r.max_age_days != null && ageToday > r.max_age_days) {
      return { ...base, state: 'missed' as const, earliestDate: null, canGiveToday: false, reason: r.note ?? 'Past the age limit' }
    }

    let earliest = addDays(dob, r.min_age_days ?? r.due_age_days)
    let reason: string | null = null
    let catchUpNote: string | null = null
    if (r.prev_vaccine && r.prev_dose_label) {
      const pk = doseKey(r.prev_vaccine, r.prev_dose_label)
      const prev = givenBy.get(pk)
      if (!prev && computed.get(pk)?.state === 'missed') {
        // The earlier dose can no longer be given (e.g. Pentavalent after 1 year) — don't block this one.
        catchUpNote = `${labelOf.get(pk)} was missed — follow the catch-up plan`
      } else if (!prev) {
        reason = `Give ${labelOf.get(pk) ?? `${r.prev_vaccine} ${r.prev_dose_label}`} first`
      } else if (prev.date_known && r.min_interval_days) {
        const afterGap = addDays(prev.given_date, r.min_interval_days)
        if (afterGap > earliest) earliest = afterGap
      }
    }
    if (reason) {
      const state = dueDate <= soon ? 'waiting' : 'upcoming'
      return { ...base, state, earliestDate: null, canGiveToday: false, reason }
    }
    if (earliest > today) {
      const gapBlocked = earliest > addDays(dob, r.min_age_days ?? r.due_age_days)
      return {
        ...base, state: (gapBlocked && dueDate <= today ? 'waiting' : 'upcoming') as DoseState, earliestDate: earliest, canGiveToday: false,
        reason: gapBlocked ? 'Minimum gap after the previous dose' : 'Too young for this dose',
      }
    }
    if (lastDate && lastDate < today) {
      return { ...base, state: 'missed' as const, earliestDate: null, canGiveToday: false, reason: r.note ?? 'Past the age limit' }
    }
    return { ...base, note: catchUpNote ?? base.note, state: (dueDate < today ? 'overdue' : 'due') as DoseState, earliestDate: earliest, canGiveToday: true, reason: null }
  }
}

/** Doses a child should have had by now — the list for the first-visit history check. */
export function dosesDueByNow(status: DoseStatus[], ageDays: number): DoseStatus[] {
  return status.filter((s) => s.dueAgeDays <= ageDays)
}
