// Pharmacy: receive stock on a GRN, then dispense the ward's requests.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText } from '../lib/browser'
import { buttonIn } from '../lib/ui'
import type { Flow, Run } from '../lib/run'

const line = (page: Page, i: number, ph: string) => page.getByPlaceholder(ph, { exact: true }).nth(i)

export default {
  name: 'pharmacy', title: '06 Pharmacy',
  async run(r: Run) {
    const l = r.patient('lakshmi')
    await withRole('pharmacist', async ({ page }) => {
      const P = 'pharmacist'
      const startGrn = async () => {
        await go(page, '/pharmacy/receive')
        await page.getByPlaceholder('e.g. Apex Pharma Distributors').fill('E2E Karur Pharma Distributors')
        await page.getByPlaceholder('INV-2291').fill(`E2E-INV-${r.tag}`)
        await page.getByPlaceholder('Type brand or salt, or scan…').first().fill('A Cef'); await wait(page, 2500)
        await page.locator('button, li, [role=option]').filter({ hasText: /A Cef 1gm/i }).first().click(); await wait(page, 800)
      }
      // An expired batch must be refused
      await startGrn()
      await line(page, 0, 'B2291').fill(`OLD-${r.tag}`); await line(page, 0, 'MM/YY').fill('01/25'); await line(page, 0, '10').fill('5')
      await line(page, 0, '80').fill('45'); await line(page, 0, '10.50').fill('60')
      await page.getByRole('button', { name: 'Receive stock', exact: true }).last().click(); await wait(page, 3500)
      const exp = await bodyText(page)
      r.check({ id: 'PH-01', role: P, screen: '/pharmacy/receive', title: 'A batch that expired in 01/25 is refused', ok: /expired|expiry/i.test(exp) && !/received|saved/i.test(exp.slice(0, 300)), detail: exp.match(/[^.]*expir[^.]*/i)?.[0]?.slice(0, 120) })
      await startGrn()
      await line(page, 0, 'B2291').fill(`ACF-${r.tag}`); await line(page, 0, 'MM/YY').fill('12/28'); await line(page, 0, '10').fill('10')
      await line(page, 0, '80').fill('45'); await line(page, 0, '10.50').fill('60')
      await page.getByRole('button', { name: 'Receive stock', exact: true }).last().click(); await wait(page, 3500)
      const ok = await bodyText(page)
      r.check({ id: 'PH-02', role: P, screen: '/pharmacy/receive', title: 'Receive 10 packs of A Cef 1 g (batch, expiry, MRP)', ok: /received|saved|GRN/i.test(ok), detail: ok.match(/[^.]*(received|saved|GRN)[^.]*/i)?.[0]?.slice(0, 120) })

      await go(page, '/pharmacy'); await page.getByRole('button', { name: /^Stock/ }).click(); await wait(page, 2500)
      const stock = await text(page)
      const dolo = stock.match(/Dolo 650[^₹]{0,60}/)?.[0] ?? ''
      r.check({ id: 'PH-03', role: P, screen: '/pharmacy → Stock', title: 'Stock shows brands with their real strength (Dolo 650 is 650 mg)', ok: !dolo || !/500\s?mg/i.test(dolo), bug: 'BUG-017', detail: dolo })

      // Ward requests
      await go(page, '/pharmacy'); await page.getByRole('button', { name: /^IPD Ward/ }).click(); await wait(page, 2500)
      const q = await text(page)
      const pan = q.match(/Pantoprazole[^₹]{0,160}?(Not in stock|\d+ in stock)/)?.[0] ?? ''
      r.check({ id: 'PH-04', role: P, screen: '/pharmacy → IPD Ward', title: 'A ward request typed as a generic (Pantoprazole) is matched to the brand in stock', ok: /\d+ in stock/.test(pan), bug: 'BUG-018', detail: pan.slice(0, 160) })
      let n = 0
      for (let k = 0; k < 12; k++) {
        const b = await buttonIn(page, 'Dispense', [l.full_name]).catch(() => null)
        if (!b) break
        await b.click(); await wait(page, 1500)
        // Same medicine on the shelf under a brand (BUG-018 fix): dispense that one.
        const sub = page.getByLabel('Dispense from stock')
        if (await sub.isVisible().catch(() => false)) { await sub.selectOption({ index: 1 }).catch(() => {}); await wait(page, 600) }
        await page.getByRole('button', { name: 'Confirm Dispense', exact: true }).click(); await wait(page, 3500); n++
        await go(page, '/pharmacy'); await page.getByRole('button', { name: /^IPD Ward/ }).click(); await wait(page, 2500)
      }
      r.check({ id: 'PH-05', role: P, screen: '/pharmacy → IPD Ward', title: `Dispense Lakshmi's ward requests (${n})`, ok: n >= 3 && !(await buttonIn(page, 'Dispense', [l.full_name]).catch(() => null)), detail: `${n} dispensed` })
    })
  },
} satisfies Flow
