// IPD money at the counter: the admission advance.
import { withRole, go, wait, text } from '../lib/browser'
import { openIpdRow } from '../lib/actions'
import type { Flow, Run } from '../lib/run'

export default {
  name: 'advance', title: '09 IPD advance',
  async run(r: Run) {
    const l = r.patient('lakshmi'); const R = 'receptionist'
    await withRole('receptionist', async ({ page }) => {
      await go(page, '/billing')
      const top = await text(page)
      const card = top.slice(top.indexOf(l.full_name), top.indexOf(l.full_name) + 200)
      r.check({ id: 'B-01', role: R, screen: '/billing', title: 'A pending IPD advance can be collected from the patient\'s card (not four clicks deep)', ok: /Collect/.test(card), bug: 'BUG-022', detail: card.slice(0, 140) })
      await openIpdRow(page, l.full_name)
      const due = (await text(page)).match(/Advance Deposit pending ₹([\d,]+)/)?.[1]
      const collect = page.locator('main button').filter({ hasText: /^Collect$/ }).first()
      if (!(await collect.count())) { r.check({ id: 'B-02', role: R, screen: '/billing → IPD', title: 'Collect the admission advance', ok: false, detail: 'no Collect button' }); return }
      await collect.click(); await wait(page, 800)
      await page.locator('main select').last().selectOption('cash').catch(() => {})
      await page.locator('main button').filter({ hasText: /^Confirm$/ }).first().click(); await wait(page, 3500)
      await openIpdRow(page, l.full_name)
      const t = await text(page)
      r.check({ id: 'B-02', role: R, screen: '/billing → IPD', title: `Collect the admission advance (₹${due ?? '?'}) in cash`, ok: /Deposit collected/.test(t), detail: t.match(/Advance Deposit[^·]{0,60}/)?.[0] })
      r.setPatient('lakshmi', { advance: Number((due ?? '0').replace(/,/g, '')) })
      await go(page, '/billing/cash-book')
      r.check({ id: 'B-03', role: R, screen: '/billing/cash-book', title: 'The advance shows in the cash book', ok: (await text(page)).includes(l.full_name) })
    })
  },
} satisfies Flow
