/**
 * Deciding that an analyzer has gone quiet.
 *
 * Kept apart from the database query so the rule can be tested without a
 * hospital, a clock or a login. The rule is the part worth being sure about;
 * the query is three lines.
 */

export interface AnalyzerPulse {
  id: string
  manufacturer?: string | null
  model?: string | null
  fingerprint?: string | null
  transport?: string | null
  status?: string | null
  last_message_at?: string | null
}

export interface SilentAnalyzer {
  id: string
  label: string
  transport: string | null
  last_message_at: string | null
  /** Whole hours since it last sent anything; -1 if it never has. */
  hours_silent: number
}

/**
 * The working day, in IST, because the hospital is in India and the server is
 * not.
 *
 * A lab that closes at eight has every analyzer "silent" by midnight, and a
 * warning that is always on is a warning nobody reads. Outside these hours the
 * check says nothing at all — a night shift that genuinely runs bloods will see
 * the gap in the morning, which is soon enough for a result that can be sent
 * again from the machine's own memory.
 */
export function withinLabHours(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false,
  }).format(now))
  return hour >= 8 && hour < 21
}

/**
 * Which live analyzers have stopped sending.
 *
 * Only `live` ones count. An analyzer still in quarantine is not expected to
 * send anything anybody is waiting for, and listing it would train people to
 * ignore the bar.
 */
export function selectSilent(
  rows: AnalyzerPulse[], hours: number, now: Date,
): SilentAnalyzer[] {
  if (!withinLabHours(now)) return []

  const cutoff = now.getTime() - hours * 3600_000
  const out: SilentAnalyzer[] = []

  for (const a of rows) {
    if (a.status !== 'live') continue

    const last = a.last_message_at ?? null
    const at = last ? new Date(last).getTime() : NaN

    // An analyzer is only ever discovered BY sending something, so a missing
    // or unreadable timestamp means a row written some other way. Reported
    // rather than skipped: hiding the one case nobody anticipated is how a
    // monitor comes to be trusted when it should not be.
    if (!Number.isNaN(at) && at > cutoff) continue

    out.push({
      id: a.id,
      label: [a.manufacturer, a.model].filter(Boolean).join(' ')
        || a.fingerprint
        || 'An analyzer',
      transport: a.transport ?? null,
      last_message_at: last,
      hours_silent: Number.isNaN(at) ? -1 : Math.floor((now.getTime() - at) / 3600_000),
    })
  }

  // Longest silence first; the never-sent ones (-1) last, because a machine
  // that has never spoken is usually a setup that was abandoned rather than a
  // link that broke this morning.
  return out.sort((x, y) => y.hours_silent - x.hours_silent)
}
