/**
 * When the laboratory worklist warns that an analyzer has stopped sending.
 *
 *   npm run verify:lab-alerts
 *
 * The rule matters more than it looks. An analyzer transmits once and forgets,
 * so anything measured while its link was down is sitting in the machine's own
 * memory and will be lost unless somebody goes and looks. This is the only
 * thing that tells them.
 *
 * Two ways to get it wrong, and both are tested here: staying silent when a
 * machine has genuinely stopped, and crying wolf every night after the lab
 * closes until people learn to ignore the bar.
 */

import { selectSilent, withinLabHours, type AnalyzerPulse } from '../src/lib/lab/silent'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — got ${JSON.stringify(detail)}` : ''}`)
}

/** A moment in IST, expressed the way a person would say it. */
const ist = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+05:30`)
const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3600_000).toISOString()

const NOON = ist('12:00')

console.log('\nThe working day, in IST')
check(!withinLabHours(ist('06:19')), 'early morning — says nothing')
check(withinLabHours(ist('08:00')), 'eight o\'clock — the day starts')
check(withinLabHours(ist('12:00')), 'midday')
check(withinLabHours(ist('20:59')), 'just before nine in the evening')
check(!withinLabHours(ist('21:00')), 'nine o\'clock — the day ends')
check(!withinLabHours(ist('23:30')), 'late evening — a closed lab is not an alarm')

console.log('\nWho gets reported')
{
  const rows: AnalyzerPulse[] = [
    { id: 'fresh',  model: 'H360',   status: 'live',       last_message_at: hoursAgo(NOON, 0.5) },
    { id: 'stale',  model: 'Chem5x', status: 'live',       last_message_at: hoursAgo(NOON, 7) },
    { id: 'quarantined', model: 'ECL105', status: 'quarantine', last_message_at: hoursAgo(NOON, 30) },
    { id: 'paused', model: 'Laura',  status: 'paused',     last_message_at: hoursAgo(NOON, 30) },
    { id: 'never',  model: 'iChroma', status: 'live',      last_message_at: null },
  ]
  const out = selectSilent(rows, 4, NOON)
  const ids = out.map((o) => o.id)

  check(ids.includes('stale'), 'a live analyzer silent for seven hours is reported', ids)
  check(!ids.includes('fresh'), 'one that sent half an hour ago is not', ids)
  check(!ids.includes('quarantined'), 'a quarantined analyzer is not — nobody is waiting on it', ids)
  check(!ids.includes('paused'), 'a paused one is not either', ids)
  check(ids.includes('never'), 'one that has never sent anything is reported', ids)
  check(out.length === 2, 'and nothing else', ids)

  const stale = out.find((o) => o.id === 'stale')
  check(stale?.hours_silent === 7, 'the silence is counted in whole hours', stale?.hours_silent)
  check(stale?.label === 'Chem5x', 'labelled the way the bench would name it', stale?.label)

  check(out[0]?.id === 'stale' && out[1]?.id === 'never',
    'longest real silence first, never-sent last', ids)
}

console.log('\nThe threshold itself')
{
  const rows: AnalyzerPulse[] = [
    { id: 'a', status: 'live', last_message_at: hoursAgo(NOON, 3.9) },
    { id: 'b', status: 'live', last_message_at: hoursAgo(NOON, 4.1) },
  ]
  const ids = selectSilent(rows, 4, NOON).map((o) => o.id)
  check(!ids.includes('a') && ids.includes('b'), 'four hours is the line', ids)
}

console.log('\nOutside the working day, nothing is said')
{
  const rows: AnalyzerPulse[] = [{ id: 'x', status: 'live', last_message_at: hoursAgo(NOON, 48) }]
  check(selectSilent(rows, 4, ist('23:30')).length === 0,
    'two days silent, but it is half past eleven at night')
  check(selectSilent(rows, 4, NOON).length === 1,
    'and the same machine is reported at midday')
}

console.log('\nA row written some other way')
{
  // Only reachable if something other than ingest created the analyzer, since
  // an analyzer is otherwise discovered BY sending. Reported rather than
  // skipped: hiding the unanticipated case is how a monitor becomes trusted
  // when it should not be.
  const rows: AnalyzerPulse[] = [{ id: 'odd', status: 'live', last_message_at: 'not a date' }]
  const out = selectSilent(rows, 4, NOON)
  check(out.length === 1 && out[0].hours_silent === -1,
    'an unreadable timestamp is surfaced, not swallowed', out)
}

console.log(failed === 0 ? '\nAll checks passed.\n' : `\n${failed} FAILED\n`)
process.exit(failed ? 1 : 0)
