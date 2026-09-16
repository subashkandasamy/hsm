// India Standard Time (UTC+5:30) calendar helpers — the one place the app works
// out "what day is it" and a day's time range.
//
// The server runs in UTC, so `new Date().toISOString().split('T')[0]` is the UTC
// date: between 00:00 and 05:30 IST it is still "yesterday". Queries built from
// `${date}T00:00:00` (no offset) are read as UTC too, so a "day" ran from 05:30 to
// 05:30 IST. Use these instead.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** Today's date in IST as 'YYYY-MM-DD'. */
export function istToday(): string {
  return istDate(new Date())
}

/** The IST calendar date of a moment (Date, ISO string or epoch ms) as 'YYYY-MM-DD'. */
export function istDate(d: Date | string | number = new Date()): string {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Adds whole days to a 'YYYY-MM-DD' date (pure date maths, timezone-independent). */
export function istAddDays(ymd: string, days: number): string {
  const t = new Date(`${ymd}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

/** Day of week (0 = Sunday) of a 'YYYY-MM-DD' date. */
export function istWeekday(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

/** Start of an IST day as a UTC ISO timestamp (use with gte). */
export function istDayStartISO(ymd: string): string {
  return new Date(`${ymd}T00:00:00+05:30`).toISOString()
}

/** Last millisecond of an IST day as a UTC ISO timestamp (use with lte). */
export function istDayEndISO(ymd: string): string {
  return new Date(new Date(`${ymd}T00:00:00+05:30`).getTime() + 86_400_000 - 1).toISOString()
}

/** UTC ISO bounds [from, to) for an IST calendar day (use gte from, lt to). */
export function istDayBoundsISO(ymd: string): { from: string; to: string } {
  const startMs = new Date(`${ymd}T00:00:00+05:30`).getTime()
  return { from: new Date(startMs).toISOString(), to: new Date(startMs + 86_400_000).toISOString() }
}
