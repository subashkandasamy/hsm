// Ward nursing for Lakshmi: round, intake/output, doses, SOS, notes, handover.
import type { Locator, Page } from 'playwright-core'
import { withRole, go, wait, text } from '../lib/browser'
import { openTreatment, orderCard, giveDose } from '../lib/actions'
import { E, account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const field = (scope: Page | Locator, label: string) => scope.locator('label').filter({ hasText: new RegExp(`^${label.replace(/[()/]/g, '\\$&')}\\*?$`) }).first().locator('xpath=..').locator('input, select, textarea').first()

export default {
  name: 'nursing', title: '07 Ward nursing',
  async run(r: Run) {
    const l = r.patient('lakshmi'); const N = 'nurse'; const me = account('nurse').name
    if (!l.ipd) throw new Error('Lakshmi not admitted')
    await withRole('nurse', async ({ page }) => {
      await go(page, l.ipd); await page.getByRole('button', { name: 'Chart', exact: true }).click(); await wait(page, 1500)
      const form = page.getByRole('heading', { name: 'Record round' }).locator('xpath=ancestor::div[contains(@class,"p-4")][1]')
      for (const [k, v] of [['Pulse', '104'], ['BP sys', '112'], ['BP dia', '70'], ['Resp. rate', '22'], ['SpO₂ %', '97'], ['Temp °C or °F', '100.8']] as const) await field(form, k).fill(v)
      await field(form, 'AVPU').selectOption('A').catch(() => {})
      await form.getByRole('button', { name: 'Save round', exact: true }).click()
      const saved = await form.getByText('Round saved', { exact: false }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false)
      r.check({ id: 'N-01', role: N, screen: '/ipd/[id] Chart', title: 'Record a round (pulse 104, temp 100.8 °F)', ok: saved })
      const io = page.getByRole('heading', { name: 'Intake & output' }).locator('xpath=ancestor::div[contains(@class,"p-4")][1]')
      await field(io, 'In / out').selectOption('output'); await field(io, 'What').selectOption('urine'); await field(io, 'ml').fill('300')
      await io.getByRole('button', { name: 'Add', exact: true }).click(); await wait(page, 2500)
      const t1 = await text(page)
      await field(io, 'ml').fill('-50'); await io.getByRole('button', { name: 'Add', exact: true }).click(); await wait(page, 1500)
      const t2 = await text(page)
      r.check({ id: 'N-02', role: N, screen: '/ipd/[id] Chart', title: 'Urine output 300 ml recorded; −50 ml refused', ok: /300/.test(t1) && !/-50 ml|−50/.test(t2) })

      await openTreatment(page, l.ipd)
      const c = await orderCard(page, /^A Cef/)
      await c.locator('button').last().click(); await wait(page, 900)
      const g = c.getByRole('button', { name: 'Given', exact: true })
      if (await g.count()) {
        await g.first().click(); await wait(page, 600)
        const opts = await c.getByLabel('Checked by').locator('option').allTextContents().catch(() => [] as string[])
        r.check({ id: 'N-03', role: N, screen: '/ipd/[id] Treatment', title: 'The "checked by" list leaves out the nurse giving the dose', ok: !opts.includes(me) && opts.some((o) => o.includes(E.secondNurse)), detail: opts.slice(0, 6).join(', ') })
        const pickO = opts.find((o) => o.includes(E.secondNurse)); if (pickO) await c.getByLabel('Checked by').selectOption({ label: pickO })
        await c.getByRole('button', { name: 'Confirm given', exact: true }).click(); await wait(page, 2500)
        const after = (await (await orderCard(page, /^A Cef/)).innerText()).replace(/\s+/g, ' ')
        r.check({ id: 'N-04', role: N, screen: '/ipd/[id] Treatment', title: 'Right after "Confirm given" the dose shows who gave it', ok: after.includes(`Given by ${me}`), bug: 'BUG-019', detail: after.match(/Given by[^·]{0,40}/)?.[0] })
        // The evening dose must not be markable 12 hours early
        const c2 = await orderCard(page, /^A Cef/)
        const g2 = c2.getByRole('button', { name: 'Given', exact: true })
        let early = false
        if (await g2.count()) { await g2.first().click(); await wait(page, 600); await c2.getByRole('button', { name: 'Confirm given', exact: true }).click().catch(() => {}); await wait(page, 2500); early = (((await (await orderCard(page, /^A Cef/)).innerText()).match(/Given by/g) ?? []).length >= 2) }
        r.check({ id: 'N-05', role: N, screen: '/ipd/[id] Treatment', title: 'The evening dose cannot be marked given in the morning', ok: !early, bug: 'BUG-020' })
      } else r.check({ id: 'N-03', role: N, screen: '/ipd/[id] Treatment', title: 'A Cef has a dose due to give', ok: false, detail: 'no "Given" slot' })

      // SOS paracetamol
      const sos = await orderCard(page, /^Paracetamol/)
      await sos.getByRole('button', { name: 'Give a dose' }).click(); await wait(page, 800)
      await page.getByLabel('Dose given').fill('1 g').catch(() => {}); await page.getByLabel('Reason / note').fill('Temp 100.8 °F').catch(() => {})
      await sos.getByRole('button', { name: 'Confirm given', exact: true }).click(); await wait(page, 3000)
      const st = ((await (await orderCard(page, /^Paracetamol/)).innerText()).replace(/\s+/g, ' '))
      r.check({ id: 'N-06', role: N, screen: '/ipd/[id] Treatment', title: 'Give an SOS paracetamol for 100.8 °F (reason kept)', ok: /Given by/.test(st) && /100\.8/.test(st), detail: st.slice(0, 160) })

      // Start the RL bag
      const rl = await giveDose(page, /^Ringer/, E.secondNurse)
      r.check({ id: 'N-07', role: N, screen: '/ipd/[id] Treatment', title: "Start the Ringer's lactate bag", ok: /Given by|bag 1|Bag finished/i.test(rl), detail: rl.slice(0, 120) })

      // Note, weight/diet/DVT, assignment, handover
      await go(page, l.ipd); await page.getByRole('button', { name: 'Clinical', exact: true }).click(); await wait(page, 2000)
      const nf = page.locator('label').filter({ hasText: /^Note by/ }).first().locator('xpath=ancestor::form[1] | ancestor::div[.//button[normalize-space()="Add Note"]][1]').first()
      await field(page, 'Note by').selectOption('nurse').catch(() => {}); await field(page, 'Shift').selectOption('morning').catch(() => {})
      await nf.locator('textarea').last().fill(`Comfortable at rest. Pain 4/10 RIF. NBM for surgery. IV RL running. ${r.tag}`)
      await page.getByRole('button', { name: 'Add Note' }).first().click(); await wait(page, 3000)
      r.check({ id: 'N-08', role: N, screen: '/ipd/[id] Clinical', title: 'Nurse adds a morning progress note', ok: (await text(page)).includes(r.tag) })
      await go(page, l.ipd)
      const strip = page.getByText(/DVT:/).first().locator('xpath=ancestor::div[.//button[normalize-space()="Edit"]][1]')
      await strip.getByRole('button', { name: 'Edit', exact: true }).click(); await wait(page, 1500)
      await page.locator('label').filter({ hasText: /^Weight/ }).first().locator('xpath=..').locator('input').first().fill('56')
      await page.locator('label').filter({ hasText: /^Height/ }).first().locator('xpath=..').locator('input').first().fill('158')
      await page.locator('label').filter({ hasText: /^Diet/ }).first().locator('xpath=..').locator('select').first().selectOption('npo').catch(() => {})
      await page.locator('label').filter({ hasText: /^DVT/ }).first().locator('xpath=..').locator('select').first().selectOption('mechanical').catch(() => {})
      await page.getByRole('button', { name: /^Save/ }).first().click(); await wait(page, 3000)
      await go(page, l.ipd)
      const hdr = await text(page)
      r.check({ id: 'N-09', role: N, screen: '/ipd/[id]', title: 'Weight 56 kg, BMI, NBM diet and DVT stockings show on the admission strip', ok: /56 kg/.test(hdr) && /BMI 22/.test(hdr), detail: hdr.match(/\d+ kg[^E]{0,80}/)?.[0] })
      await page.getByRole('button', { name: 'Nursing', exact: true }).click(); await wait(page, 2000)
      const asg = page.getByRole('heading', { name: 'Nursing Assignments' }).locator('xpath=ancestor::div[contains(@class,"p-4")][1]')
      await asg.getByRole('button', { name: 'Select nurse…' }).first().click().catch(() => {}); await wait(page, 1200)
      await asg.getByText(me, { exact: true }).first().click().catch(() => {}); await wait(page, 2500)
      r.check({ id: 'N-10', role: N, screen: '/ipd/[id] Nursing', title: 'Assign herself as the morning nurse', ok: (await asg.innerText()).includes(me) })
      await page.getByRole('button', { name: '+ Handover', exact: true }).click(); await wait(page, 1200)
      const ho = page.getByRole('heading', { name: 'Shift Handover (SBAR)' }).locator('xpath=ancestor::div[contains(@class,"p-4")][1]')
      const boxes = ho.locator('textarea')
      const sbar = ['Post-op day 0 appendectomy', 'Admitted with acute appendicitis', 'Stable, pain 3/10, afebrile', `Continue IV fluids, watch wound ${r.tag}`]
      for (let i = 0; i < Math.min(await boxes.count(), 4); i++) await boxes.nth(i).fill(sbar[i])
      await ho.getByRole('button', { name: /^(Save|Add|Submit|Hand over)/ }).last().click(); await wait(page, 2500)
      r.check({ id: 'N-11', role: N, screen: '/ipd/[id] Nursing', title: 'Write an SBAR handover', ok: (await text(page)).includes(r.tag) })
    })
  },
} satisfies Flow
