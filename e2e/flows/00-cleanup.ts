// Before a run: test patients an EARLIER run left admitted (a run that stopped
// before its discharge flow) fill beds the next run needs — Ramasamy's
// semi-private room has two beds. Each is discharged as "absconded" (no bill
// is held), through the screens. Only names the suite makes ("E2E … R<tag>")
// from another run are touched; the demo hospital's own patients never are.
import { withRole, go, wait, bodyText, pathOf } from '../lib/browser'
import type { Flow, Run } from '../lib/run'

export default {
  name: 'cleanup', title: '00 Clean-up of earlier test runs',
  async run(r: Run) {
    await withRole('doctor', async ({ page }) => {
      await go(page, '/ipd'); await wait(page, 2000)
      const names = [...new Set((await bodyText(page)).match(/E2E [A-Z][a-z]+(?: [A-Z][a-z]+)* R\d{8}/g) ?? [])]
        .filter((n) => !n.endsWith(r.tag))
      let done = 0
      for (const n of names) {
        await go(page, '/ipd'); await wait(page, 1500)
        await page.getByText(n, { exact: true }).first().click().catch(() => {}); await wait(page, 2500)
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
