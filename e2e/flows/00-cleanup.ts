// Before a run: test patients an EARLIER run left admitted (a run that stopped
// before its discharge flow) fill beds the next run needs — Ramasamy's
// semi-private room has two beds. Each is discharged as "absconded" (no bill
// is held), through the screens. Only names the suite makes ("E2E … R<tag>")
// from another run are touched; the demo hospital's own patients never are.
import fs from 'fs'
import path from 'path'
import { withRole, go, wait, bodyText, pathOf } from '../lib/browser'
import type { Flow, Run } from '../lib/run'

export default {
  name: 'cleanup', title: '00 Clean-up of earlier test runs',
  async run(r: Run) {
    await withRole('doctor', async ({ page }) => {
      await go(page, '/ipd'); await wait(page, 2000)
      // A run's tag is R + MMDDHHMM (UTC). Leave alone any run started in the last two
      // hours — it may still be going, in another terminal.
      const startedAt = (tag: string) => {
        const m = /R(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(tag)
        return m ? Date.UTC(new Date().getUTCFullYear(), Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4])) : 0   // the tag is UTC (run.ts)
      }
      const names = [...new Set((await bodyText(page)).match(/E2E [A-Z][a-z]+(?: [A-Z][a-z]+)* R\d{8}/g) ?? [])]
        .filter((n) => !n.endsWith(r.tag) && Date.now() - startedAt(n) > 2 * 3600_000)
      // Where each earlier run's patients were admitted, from its ctx.json. A row
      // whose treatment never started opens "Start Treatment", not the admission.
      const known = new Map<string, string>()
      const root = path.dirname(r.dir)
      for (const d of fs.readdirSync(root)) {
        try {
          const c = JSON.parse(fs.readFileSync(path.join(root, d, 'ctx.json'), 'utf8')) as { patients?: Record<string, { full_name?: string; ipd?: string }> }
          for (const p of Object.values(c.patients ?? {})) if (p.full_name && p.ipd) known.set(p.full_name, p.ipd)
        } catch { /* not a run folder */ }
      }
      let done = 0
      for (const n of names) {
        const ipd = known.get(n)
        if (ipd) { await go(page, ipd); await wait(page, 1500) }
        else {
          await go(page, '/ipd'); await wait(page, 1500)
          // The list is drawn twice (phone cards, desk table) — click the one shown.
          await page.getByText(n, { exact: true }).locator('visible=true').first().click().catch(() => {}); await wait(page, 2500)
        }
        if (!/\/ipd\/[0-9a-f-]{36}/.test(pathOf(page))) continue
        const dis = page.getByRole('button', { name: 'Discharge', exact: true })
        if (!(await dis.isVisible().catch(() => false))) continue
        await dis.click(); await wait(page, 1500)
        await page.getByText('Absconded', { exact: true }).click().catch(() => {}); await wait(page, 600)
        await page.locator('textarea:visible').last().fill(`E2E clean-up: left admitted by an earlier test run (this run is ${r.tag}).`).catch(() => {})
        await page.getByRole('button', { name: /Discharge Patient|Record/ }).last().click().catch(() => {}); await wait(page, 4000)
        done++
      }
      r.note({ id: 'CL-01', role: 'doctor', screen: '/ipd', title: 'Test patients left admitted by earlier runs discharged', detail: names.length ? `${done} of ${names.length}: ${names.join(', ')}` : 'none' })
    })
  },
} satisfies Flow
