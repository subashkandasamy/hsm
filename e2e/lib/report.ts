// Build results/<run>/report.html: totals, which known bugs are still open or
// now fixed, new failures, and every check by flow.
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { ROOT } from './env'
import type { Check, KnownBug } from './run'

const e = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const SEV = ['Blocker', 'Major', 'Minor', 'Cosmetic'] as const

function thumb(dir: string, rel?: string): string {
  if (!rel) return ''
  const p = path.join(dir, rel)
  if (!fs.existsSync(p)) return ''
  const out = p.replace(/\.png$/, '_t.jpg')
  try {
    if (!fs.existsSync(out)) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '55', '--resampleWidth', '900', p, '--out', out], { stdio: 'ignore' })
    return 'data:image/jpeg;base64,' + fs.readFileSync(out).toString('base64')
  } catch { return '' }
}

export function buildReport(runDir: string): string {
  const checks: Check[] = JSON.parse(fs.readFileSync(path.join(runDir, 'checks.json'), 'utf8'))
  const known: KnownBug[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'known-bugs.json'), 'utf8'))
  const ctx = JSON.parse(fs.readFileSync(path.join(runDir, 'ctx.json'), 'utf8'))
  const tot = { pass: 0, fail: 0, blocked: 0, note: 0 } as Record<string, number>
  for (const c of checks) tot[c.result]++

  // A known bug is "still open" if any check guarding it failed, "fixed" if
  // every check guarding it passed, "not checked" if no check ran for it.
  const guard = new Map<string, Check[]>()
  for (const c of checks) if (c.bug) for (const b of c.bug.split(/[ ,]+/)) guard.set(b, [...(guard.get(b) ?? []), c])
  const status = (id: string) => {
    const cs = guard.get(id); if (!cs?.length) return 'unchecked'
    if (cs.some((c) => c.result === 'fail')) return 'open'
    if (cs.every((c) => c.result === 'pass')) return 'fixed'
    return 'unchecked'
  }
  const open = known.filter((b) => status(b.id) === 'open')
  const fixed = known.filter((b) => status(b.id) === 'fixed')
  const newFails = checks.filter((c) => c.result === 'fail' && !c.bug)

  const bugCard = (b: KnownBug) => {
    const st = status(b.id)
    const chip = st === 'fixed' ? '<span class="chip ok">Fixed in this run</span>' : st === 'open' ? `<span class="chip ${b.sev.toLowerCase()}">${b.sev} · still open</span>` : `<span class="chip cosmetic">${b.sev} · not checked</span>`
    const cs = (guard.get(b.id) ?? []).map((c) => `<li><code>${e(c.id)}</code> ${e(c.title)} — <b>${c.result}</b>${c.detail ? ` · ${e(c.detail.slice(0, 160))}` : ''}</li>`).join('')
    const img = thumb(runDir, (guard.get(b.id) ?? []).find((c) => c.shot)?.shot)
    return `<article class="bug"><header><span class="bid">${b.id}</span>${chip}<h3>${e(b.title)}</h3></header>
<dl><div><dt>Who / where</dt><dd>${e(b.role)} · <code>${e(b.screen)}</code></dd></div><div><dt>Expected</dt><dd>${e(b.expected)}</dd></div><div><dt>Found 12 Nov</dt><dd>${e(b.actual)}</dd></div></dl>
${cs ? `<details><summary>Checks in this run</summary><ul>${cs}</ul></details>` : ''}${img ? `<details><summary>Screenshot</summary><img src="${img}" alt="Screenshot for ${b.id}" loading="lazy"></details>` : ''}</article>`
  }

  const flows: string[] = []
  for (const c of checks) if (!flows.includes(c.flow)) flows.push(c.flow)
  const flowBlocks = flows.map((f) => {
    const fc = checks.filter((c) => c.flow === f)
    const ok = fc.filter((c) => c.result === 'pass').length
    const rows = fc.map((c) => `<tr><td><code>${e(c.id)}</code></td><td>${e(c.role)}</td><td>${e(c.title)}</td><td><span class="res ${c.result}">${c.result}</span>${c.bug ? ` <span class="bid">${e(c.bug)}</span>` : c.result === 'fail' ? ' <span class="chip blocker">new</span>' : ''}</td><td class="det">${e((c.detail ?? '').slice(0, 220))}</td></tr>`).join('')
    return `<details class="phase"${fc.some((c) => c.result !== 'pass') ? ' open' : ''}><summary><b>${e(f)}</b><span>${ok} of ${fc.length} pass</span></summary><div class="scroll"><table><thead><tr><th>Check</th><th>Role</th><th>What was tested</th><th>Result</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div></details>`
  }).join('')

  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Uyirly E2E Report</title>
<style>
:root{--bg:#F5F7F7;--paper:#fff;--ink:#13201F;--muted:#5E6E6C;--line:#DCE3E2;--accent:#0F766E;--ok:#15803D;--ok-s:#E5F3EA;--bad:#B42318;--bad-s:#FCE8E6;--maj:#B54708;--maj-s:#FDF0DE;--min:#6941C6;--min-s:#F0EBFC;--cos:#475467;--cos-s:#EEF0F3;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0F1515;--paper:#162020;--ink:#E4ECEB;--muted:#93A5A3;--line:#2A3938;--accent:#2DD4BF;--ok:#4ADE80;--ok-s:#14301E;--bad:#F97066;--bad-s:#3A1715;--maj:#FDB022;--maj-s:#33270F;--min:#B692F6;--min-s:#261C3B;--cos:#98A2B3;--cos-s:#222A33;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0F1515;--paper:#162020;--ink:#E4ECEB;--muted:#93A5A3;--line:#2A3938;--accent:#2DD4BF;--ok:#4ADE80;--ok-s:#14301E;--bad:#F97066;--bad-s:#3A1715;--maj:#FDB022;--maj-s:#33270F;--min:#B692F6;--min-s:#261C3B;--cos:#98A2B3;--cos-s:#222A33;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,sans-serif;padding:28px 16px 64px}.wrap{max-width:1100px;margin:0 auto;display:grid;gap:28px}
h1{font-size:27px;margin:0}h2{font-size:19px;margin:0 0 10px}h3{font-size:15px;margin:0;font-weight:600;flex-basis:100%}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:600}.lede{color:var(--muted);max-width:70ch;margin:6px 0 0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.stat{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.stat b{display:block;font-size:26px;font-variant-numeric:tabular-nums;line-height:1.1}.stat span{color:var(--muted);font-size:13px}
.chip{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:5px;white-space:nowrap}.chip.blocker{background:var(--bad-s);color:var(--bad)}.chip.major{background:var(--maj-s);color:var(--maj)}
.chip.minor{background:var(--min-s);color:var(--min)}.chip.cosmetic{background:var(--cos-s);color:var(--cos)}.chip.ok{background:var(--ok-s);color:var(--ok)}
.bug{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:grid;gap:8px}.bug header{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.bid{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--muted)}dl{margin:0;display:grid;gap:4px}dl div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px}
dt{color:var(--muted);font-size:13px}dd{margin:0;font-size:14px}code{font-family:ui-monospace,Menlo,monospace;font-size:.86em}details summary{cursor:pointer;color:var(--accent);font-size:13px}
img{max-width:100%;border:1px solid var(--line);border-radius:8px;margin-top:8px}.phase{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
.phase summary{display:flex;justify-content:space-between;gap:12px;color:var(--ink);font-size:14.5px}.phase summary span{color:var(--muted)}.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:720px;font-size:13px;margin-top:8px}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}.det{color:var(--muted);max-width:340px}
.res{font-size:11.5px;font-weight:600;padding:1px 7px;border-radius:5px;text-transform:uppercase}.res.pass{background:var(--ok-s);color:var(--ok)}.res.fail{background:var(--bad-s);color:var(--bad)}.res.blocked,.res.note{background:var(--cos-s);color:var(--cos)}
.list{display:grid;gap:10px}@media (max-width:560px){dl div{grid-template-columns:minmax(0,1fr);gap:0}}
</style><div class="wrap">
<header><div class="eyebrow">${e(ctx.base ?? '')} · run ${e(path.basename(runDir))} · tag ${e(ctx.tag)}</div><h1>Uyirly end-to-end test</h1>
<p class="lede">Each check drives the real screens as hospital staff would. Checks tagged with a bug ID guard a bug found on 12 Nov 2026: they fail while the bug is there and pass once it is fixed.</p></header>
<section class="stats"><div class="stat"><b>${checks.length}</b><span>checks</span></div><div class="stat"><b>${tot.pass}</b><span>passed</span></div>
<div class="stat"><b>${tot.fail}</b><span>failed (${newFails.length} new)</span></div><div class="stat"><b>${open.length}</b><span>known bugs still open</span></div><div class="stat"><b>${fixed.length}</b><span>known bugs now fixed</span></div></section>
${newFails.length ? `<section><h2>New failures (not a known bug)</h2><div class="list">${newFails.map((c) => `<article class="bug"><header><span class="bid">${e(c.id)}</span><span class="chip blocker">new</span><h3>${e(c.title)}</h3></header><dl><div><dt>Who / where</dt><dd>${e(c.role)} · <code>${e(c.screen)}</code></dd></div><div><dt>Detail</dt><dd>${e(c.detail)}</dd></div></dl>${thumb(runDir, c.shot) ? `<details><summary>Screenshot</summary><img src="${thumb(runDir, c.shot)}" alt="" loading="lazy"></details>` : ''}</article>`).join('')}</div></section>` : ''}
<section><h2>Known bugs</h2><div class="list">${[...known].sort((a, b) => ['open', 'unchecked', 'fixed'].indexOf(status(a.id)) - ['open', 'unchecked', 'fixed'].indexOf(status(b.id)) || SEV.indexOf(a.sev) - SEV.indexOf(b.sev)).map(bugCard).join('')}</div></section>
<section><h2>Checks by flow</h2><div class="list">${flowBlocks}</div></section></div>`
  const out = path.join(runDir, 'report.html')
  fs.writeFileSync(out, html)
  return out
}

if (require.main === module) {
  const dir = process.argv[2] ? path.resolve(process.argv[2]) : (() => {
    const base = path.join(ROOT, 'results'); const runs = fs.readdirSync(base).filter((d) => d.startsWith('run-')).sort()
    return path.join(base, runs[runs.length - 1])
  })()
  console.log('report:', buildReport(dir))
}
