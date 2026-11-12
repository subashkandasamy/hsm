// npm run e2e                      → every flow, new run
// npm run e2e -- front-desk opd    → only those flows (new run)
// npm run e2e -- --run run-202611121530 icu   → continue an earlier run (reuses its patients)
// npm run e2e -- --from icu --run <id>        → that flow and everything after it
// npm run e2e -- --list            → flow names
import { Run, Blocked } from './lib/run'
import { E, assertSafeTarget } from './lib/env'
import { buildReport } from './lib/report'
import { FLOWS } from './flows'

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--list')) { for (const f of FLOWS) console.log(`${f.name.padEnd(16)} ${f.title}`); return }
  assertSafeTarget()
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
  const runId = opt('--run'); const from = opt('--from')
  const names = args.filter((a, i) => !a.startsWith('--') && !['--run', '--from'].includes(args[i - 1]))
  let pick = FLOWS
  if (names.length) pick = FLOWS.filter((f) => names.includes(f.name))
  if (from) pick = FLOWS.slice(Math.max(0, FLOWS.findIndex((f) => f.name === from)))
  if (!pick.length) throw new Error(`no such flow: ${names.join(', ') || from}. Try --list`)

  const r = new Run(runId)
  r.set('base', E.base)
  console.log(`Run ${r.id} · tag ${r.tag} · ${E.base} · flows: ${pick.map((f) => f.name).join(', ')}`)
  for (const f of pick) {
    r.flow = f.title
    console.log(`\n── ${f.title} ─────────────────────────`)
    const t0 = Date.now()
    try { await f.run(r) }
    catch (e) {
      const msg = (e as Error).message.split('\n')[0].slice(0, 300)
      r.blocked({ id: `${f.name}:stopped`, role: '-', screen: '-', title: `${f.title} stopped early`, detail: msg })
      if (!(e instanceof Blocked)) console.log((e as Error).stack?.split('\n').slice(0, 4).join('\n'))
    }
    console.log(`   (${Math.round((Date.now() - t0) / 1000)} s)`)
  }
  const out = buildReport(r.dir)
  const tot = (k: string) => r.checks.filter((c) => c.result === k).length
  console.log(`\n${r.checks.length} checks · ${tot('pass')} pass · ${tot('fail')} fail (${r.checks.filter((c) => c.result === 'fail' && !c.bug).length} new) · ${tot('blocked')} blocked`)
  console.log(`Report: ${out}`)
}
main().catch((e) => { console.error(e.message); process.exit(1) })
