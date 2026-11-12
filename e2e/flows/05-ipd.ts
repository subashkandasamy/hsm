// IPD: treatment declaration, the doctor's orders for Lakshmi.
import { withRole, go, wait, text, bodyText } from '../lib/browser'
import { openTreatment, orderMed, orderIv, orderForm, confirmStop } from '../lib/actions'
import type { Flow, Run } from '../lib/run'

export default {
  name: 'ipd', title: '05 IPD admission and orders',
  async run(r: Run) {
    const l = r.patient('lakshmi')
    if (!l.ipd) throw new Error('Lakshmi was not admitted (OPD flow)')

    await withRole('nurse', async ({ page }) => {
      await go(page, '/ipd')
      const rowL = page.locator('tr, div').filter({ hasText: l.full_name }).filter({ has: page.getByRole('button', { name: /Start Treatment/ }) }).last()
      await rowL.getByRole('button', { name: /Start Treatment/ }).first().click(); await wait(page, 1500)
      await page.getByRole('button', { name: /sign digitally|sign (on|here)|on screen/i }).first().click().catch(() => {}); await wait(page, 800)
      await page.locator('input[type=text]:visible').last().fill('Ravi')
      await page.locator('label').filter({ hasText: /Relationship to Patient/ }).first().locator('xpath=..').locator('select').first().selectOption('spouse').catch(() => {})
      const submit = page.getByRole('button', { name: /^(Sign|Confirm|Save|Submit|Start Treatment)/ }).last()
      await submit.click(); await wait(page, 2000)
      const stillOpen = await page.getByRole('heading', { name: /Treatment Declaration/ }).isVisible().catch(() => false)
      r.check({ id: 'I-01', role: 'nurse', screen: '/ipd → Start Treatment', title: 'Declaration with an empty signature pad is refused', ok: stillOpen, bug: 'BUG-015' })
      if (stillOpen) {
        const box = await page.locator('canvas').last().boundingBox()
        if (box) { await page.mouse.move(box.x + 20, box.y + box.height / 2); await page.mouse.down(); for (let i = 0; i <= 20; i++) await page.mouse.move(box.x + 20 + i * (box.width - 40) / 20, box.y + box.height / 2 + Math.sin(i / 2) * 20, { steps: 2 }); await page.mouse.up() }
        await submit.click(); await wait(page, 4000)
      }
      const closed = !(await page.getByRole('heading', { name: /Treatment Declaration/ }).isVisible().catch(() => false))
      r.check({ id: 'I-02', role: 'nurse', screen: '/ipd → Start Treatment', title: 'Husband signs the declaration on screen; treatment unlocks', ok: closed })
    })

    await withRole('doctor', async ({ page }) => {
      await openTreatment(page, l.ipd)
      await page.getByRole('button', { name: 'New Order' }).first().click().catch(() => {}); await wait(page, 800)
      await orderForm(page).getByRole('button', { name: 'Add Order', exact: true }).click(); await wait(page, 2000)
      const refused = await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false)
      r.check({ id: 'I-10', role: 'doctor', screen: '/ipd/[id] Treatment', title: 'An order with no drug name is refused', ok: refused, bug: 'BUG-016' })
      if (refused) await orderForm(page).getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {})
      else { // stop the blank order it made
        const c = page.locator('div.rounded-xl.overflow-hidden').filter({ hasText: /^— mg/ }).first()
        await c.getByRole('button', { name: 'Stop' }).click().catch(() => {}); await confirmStop(page)
      }
      const orders = [
        { id: 'I-11', t: 'A Cef 1 g IV BD (from stock)', o: { search: 'A Cef', pick: /A Cef 1gm/i, dose: '1', unit: 'g', route: 'IV', freq: 'twice_daily', days: '3d', notes: 'Pre-op antibiotic' } },
        { id: 'I-12', t: 'Pantoprazole 40 mg IV OD (typed as a generic)', o: { search: 'Pantoprazole', dose: '40', unit: 'mg', route: 'IV', freq: 'daily', days: '3d' } },
        { id: 'I-13', t: 'Paracetamol 1 g IV SOS for fever', o: { search: 'Paracetamol', dose: '1', unit: 'g', route: 'IV', freq: 'sos', notes: 'If temp > 100.4 °F' } },
      ]
      for (const x of orders) {
        const res = await orderMed(page, x.o)
        r.check({ id: x.id, role: 'doctor', screen: '/ipd/[id] Treatment', title: `Order ${x.t}`, ok: res.added, detail: `${res.picked}${res.message ? ' — ' + res.message : ''}` })
      }
      const iv = await orderIv(page, { fluid: "Ringer's Lactate", vol: '500', rate: '100', freq: 'Continuous', added: 'KCl 10 mEq' })
      r.check({ id: 'I-14', role: 'doctor', screen: '/ipd/[id] Treatment', title: "Order Ringer's lactate 500 ml + KCl @ 100 ml/h", ok: iv })
      await go(page, l.ipd)
      const t = await text(page)
      r.check({ id: 'I-15', role: 'doctor', screen: '/ipd/[id]', title: 'No "Dr. Dr." on the admission page', ok: !/Dr\. Dr\./.test(t), bug: 'BUG-014' })
      r.set('lakshmiOrdersAt', new Date().toISOString())
      void bodyText
    })
  },
} satisfies Flow
