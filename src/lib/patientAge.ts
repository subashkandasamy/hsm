/**
 * A patient's age when only the age is known.
 *
 * Uyirly keeps a date of birth, never an age, so the age goes up by itself.
 * An age given at the counter becomes an estimated date — the registration day
 * that many years and months back — flagged `dob_estimated`, and is never shown
 * as a real birthday.
 */

/** 'YYYY-MM-DD' that many years and months before `today` (a day past the month's end clamps to its last day). */
export function estimatedDob(years: number, months: number, today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const total = y * 12 + (m - 1) - (years * 12 + months)
  const yy = Math.floor(total / 12)
  const mm = total - yy * 12
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate()
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** Whole years and months from a date of birth to `today`. */
export function ageParts(dob: string, today: string): { years: number; months: number } {
  const [by, bm, bd] = dob.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const total = Math.max(0, (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0))
  return { years: Math.floor(total / 12), months: total % 12 }
}

/** "about 46 years", "about 1 year 3 months", "about 8 months" — for an estimated date of birth. */
export function approxAgeText(dob: string, today: string): string {
  const { years, months } = ageParts(dob, today)
  if (!years && !months) return 'under a month'
  const y = years ? `${years} year${years === 1 ? '' : 's'}` : ''
  const m = years < 2 && (months || !years) ? `${months} month${months === 1 ? '' : 's'}` : ''
  return `about ${[y, m].filter(Boolean).join(' ')}`
}

/** What a registration or edit form says is wrong with its date of birth / age, or null. */
export function dobAgeError(v: { dob: string; years: string; months: string }, today: string): string | null {
  if (v.dob) return v.dob > today ? 'The date of birth cannot be in the future' : null
  const years = v.years.trim(), months = v.months.trim()
  if (!years && !months) return 'Enter the date of birth, or the age in years'
  if (years && !/^\d{1,3}$/.test(years)) return 'Enter the age in whole years'
  if (Number(years) > 120) return 'Enter an age up to 120'
  if (months && (!/^\d{1,2}$/.test(months) || Number(months) > 11)) return 'Months are 0 to 11'
  // A baby's age in years alone could be a year out — vaccines and doses go by months.
  if (Number(years || 0) < 2 && !months) return 'For a child under 2, enter the months too (or the date of birth)'
  return null
}
