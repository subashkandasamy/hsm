/**
 * Reading past PostgREST's 1,000-row ceiling.
 *
 *   npm run verify:page-all
 *
 * The bug this exists for was found in production, not in a test. A hospital
 * loaded 1,027 drug batches; `getStock()` asked for all of them without a range;
 * PostgREST returned exactly 1,000 with `error` null; and the pharmacy screen
 * reported 40,360 units against a true 40,409. The 27 rows lost were the ones
 * sorting last — the hospital's equipment.
 *
 * Nothing about that failure is visible to the caller, so the only defence is
 * that every unbounded read goes through `pageAll`, and that `pageAll` keeps
 * asking until a page comes back short.
 */
import { pageAll } from '../src/lib/supabase/pageAll'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

/** A table of `total` rows behind a server that never returns more than 1,000. */
function server(total: number) {
  const calls: Array<[number, number]> = []
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to])
    const end = Math.min(to, total - 1)
    const rows = []
    for (let i = from; i <= end; i++) rows.push({ i })
    return { data: rows, error: null }
  }
  return { fetchPage, calls }
}

async function main() {
  console.log('\nThe exact production case: 1,027 rows behind a 1,000-row cap')
  {
    const s = server(1027)
    const rows = await pageAll<{ i: number }>(s.fetchPage)
    check(rows.length === 1027, 'all 1,027 rows are read', rows.length)
    check(s.calls.length === 2, 'in two requests', s.calls)
    check(rows[1026]?.i === 1026, 'including the very last row', rows[1026])
    const seen = new Set(rows.map((r) => r.i))
    check(seen.size === 1027, 'with nothing repeated', seen.size)
  }

  console.log('\nA page that comes back short is the last page')
  for (const n of [0, 1, 999]) {
    const s = server(n)
    const rows = await pageAll<{ i: number }>(s.fetchPage)
    check(rows.length === n && s.calls.length === 1, `${n} rows → one request`, { got: rows.length, calls: s.calls.length })
  }

  console.log('\nExactly 1,000 needs a second request to learn there is no more')
  {
    const s = server(1000)
    const rows = await pageAll<{ i: number }>(s.fetchPage)
    check(rows.length === 1000, '1,000 rows read', rows.length)
    check(s.calls.length === 2, 'and a second request confirmed the end', s.calls.length)
  }

  console.log('\nSeveral pages')
  {
    const s = server(4300)
    const rows = await pageAll<{ i: number }>(s.fetchPage)
    check(rows.length === 4300, '4,300 rows read', rows.length)
    check(s.calls.length === 5, 'in five requests', s.calls.length)
  }

  console.log('\nAn error stops it rather than looping')
  {
    let n = 0
    const rows = await pageAll<{ i: number }>(async (from, to) => {
      n++
      if (n > 1) return { data: null, error: new Error('boom') }
      const r = []; for (let i = from; i <= to; i++) r.push({ i })
      return { data: r, error: null }
    })
    check(rows.length === 1000 && n === 2, 'returns what it had and stops', { rows: rows.length, calls: n })
  }

  console.log('\nThe ceiling is a ceiling, not a suggestion')
  {
    const s = server(1_000_000)
    const rows = await pageAll<{ i: number }>(s.fetchPage, { max: 3000 })
    check(rows.length === 3000, 'max caps the work', rows.length)
  }

  console.log(failed === 0
    ? '\nEvery row is read, however many there are.\n'
    : `\n${failed} check(s) FAILED.\n`)
}

main().then(() => process.exit(failed === 0 ? 0 : 1))
