// Operation theatre: schedule, pre-op, WHO checklist, anaesthesia record,
// operation note, complete, print.
import type { Locator, Page } from 'playwright-core'
import { withRole, go, wait, text, pathOf, savePrint, popupPath } from '../lib/browser'
import { chooseIn } from '../lib/ui'
import { ymd, hm, local, minutesFromNow } from '../lib/people'
import { E, account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const card = (page: Page, h: string) => page.getByRole('heading', { name: h }).locator('xpath=ancestor::div[contains(@class,"p-4") or contains(@class,"p-5")][1]')
const lab = (scope: Page | Locator, l: string) => scope.locator('label').filter({ hasText: new RegExp(`^${l.replace(/[()]/g, '\\$&')}\\*?$`) }).first().locator('xpath=..').locator('input, select, textarea').first()
const SIGN_IN = ['Patient has confirmed identity, site, procedure and consent', 'Site marked (or not applicable)', 'Anaesthesia machine and medication check complete', 'Pulse oximeter on the patient and working', 'Known allergy checked', 'Difficult airway / aspiration risk assessed, equipment ready', 'Risk of >500 ml blood loss (7 ml/kg in children) assessed, access and fluids ready']
const TIME_OUT = ['All team members introduced by name and role', 'Surgeon, anaesthetist and nurse confirm patient, site and procedure', 'Antibiotic prophylaxis given within the last 60 minutes (or not applicable)', 'Anticipated critical events reviewed (surgeon, anaesthetist, nursing)', 'Sterility confirmed, equipment issues raised', 'Essential imaging displayed (or not applicable)']
const SIGN_OUT = ['Name of the procedure recorded', 'Instrument, sponge and needle counts correct', 'Specimen labelled, including the patient’s name', 'Equipment problems addressed', 'Key concerns for recovery and management reviewed']

async function whoStep(page: Page, items: string[]) {
  const who = card(page, 'WHO Surgical Safety Checklist')
  for (const t of items) await who.getByText(t, { exact: true }).click().catch(() => {})
  await who.getByRole('button', { name: 'Sign', exact: true }).first().click(); await wait(page, 3000)
  return (await card(page, 'WHO Surgical Safety Checklist').innerText()).replace(/\s+/g, ' ')
}

export default {
  name: 'ot', title: '08 Operation theatre',
  async run(r: Run) {
    const l = r.patient('lakshmi'); const doc = account('doctor').name
    await withRole('doctor', async ({ page }) => {
      await go(page, l.ipd)
      await page.getByRole('button', { name: 'Schedule Surgery', exact: true }).click(); await wait(page, 1500)
      const dlg = page.locator('label').filter({ hasText: /^Surgeon\*?$/ }).first().locator('xpath=ancestor::*[.//button[normalize-space()="Cancel"]][1]')
      const sel = (label: string) => dlg.locator('label').filter({ hasText: new RegExp(`^${label.replace(/[/]/g, '\\/')}\\*?$`) }).first().locator('xpath=..').locator('select').first()
      const st = minutesFromNow(30), en = minutesFromNow(120)
      const fill = async (a: Date, b: Date) => {
        await chooseIn(sel('Surgeon'), doc); await chooseIn(sel('Anaesthetist'), E.anaesthetist)
        await chooseIn(sel('OT Room'), /^OT/); await chooseIn(sel('Procedure / Surgery Name'), /Appendectomy/)
        await dlg.locator('input[type=date]').fill(ymd(a)); await dlg.locator('input[type=time]').nth(0).fill(hm(a)); await dlg.locator('input[type=time]').nth(1).fill(hm(b))
      }
      const submit = async () => { await dlg.getByRole('button').filter({ hasText: /^(Schedule|Save|Book)/ }).last().click(); await wait(page, 3500) }
      await fill(en, st); await submit()
      r.check({ id: 'OT-01', role: 'doctor', screen: '/ipd/[id] → Schedule Surgery', title: 'A surgery ending before it starts is refused', ok: await dlg.isVisible().catch(() => false) })
      await fill(st, en); await submit()
      await go(page, '/ot')
      await page.getByText(l.full_name).first().click(); await page.waitForURL(/\/ot\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {})
      const ot = pathOf(page)
      r.check({ id: 'OT-02', role: 'doctor', screen: '/ot', title: 'Schedule the appendectomy (surgeon, anaesthetist, OT 1)', ok: /\/ot\/[0-9a-f-]{36}/.test(ot), detail: ot })
      r.setPatient('lakshmi', { ot })
    })
    const ot = r.patient('lakshmi').ot
    await withRole('nurse', async ({ page }) => {
      await go(page, ot)
      const pre = card(page, 'Before surgery')
      const sels = pre.locator('select')
      await sels.nth(0).selectOption({ label: 'Yes' }).catch(() => {}); await sels.nth(1).selectOption({ label: 'Not needed' }).catch(() => {})
      await pre.getByRole('button', { name: /^Save/ }).first().click(); await wait(page, 3000)
      r.check({ id: 'OT-03', role: 'nurse', screen: '/ot/[id]', title: 'Pre-op checklist saved (site marked, blood not needed)', ok: /Saved|Yes/.test((await card(page, 'Before surgery').innerText())) })
      const who = card(page, 'WHO Surgical Safety Checklist')
      await who.getByText(SIGN_IN[0], { exact: true }).click()
      r.check({ id: 'OT-04', role: 'nurse', screen: '/ot/[id] WHO', title: 'Sign-in cannot be signed with 1 of 7 ticked', ok: await who.getByRole('button', { name: 'Sign', exact: true }).first().isDisabled() })
      const t = await whoStep(page, SIGN_IN.slice(1))
      r.check({ id: 'OT-05', role: 'nurse', screen: '/ot/[id] WHO', title: 'WHO sign-in signed — shows who signed it', ok: t.includes(account('nurse').name), bug: 'BUG-021', detail: t.match(/Signed[^U]{0,60}/)?.[0] })
    })
    await withRole('doctor', async ({ page }) => {
      await go(page, ot)
      const t = await whoStep(page, TIME_OUT)
      r.check({ id: 'OT-06', role: 'doctor', screen: '/ot/[id] WHO', title: 'WHO time-out signed', ok: (t.match(/Signed(?: by [^\n]+?)? \d{1,2} [A-Z][a-z]{2}/g) ?? []).length >= 2 })
      await page.getByRole('button', { name: 'Mark In Progress', exact: true }).click(); await wait(page, 3000)
      await page.getByRole('button', { name: 'Mark Completed', exact: true }).click(); await wait(page, 2000)
      const warned = await page.getByRole('button', { name: 'Fill the record first', exact: true }).isVisible().catch(() => false)
      r.check({ id: 'OT-07', role: 'doctor', screen: '/ot/[id]', title: 'Completing with an empty record asks to fill it first', ok: warned })
      if (warned) await page.getByRole('button', { name: 'Fill the record first', exact: true }).click()
      const an = card(page, 'Anaesthesia & times')
      await chooseIn(lab(an, 'Anaesthesia'), /General/).catch(() => {})
      const asa = lab(an, 'ASA grade'); if ((await asa.evaluate((e: Element) => e.tagName)) === 'SELECT') await chooseIn(asa, 'II').catch(() => {}); else await asa.fill('II')
      const t0 = minutesFromNow(-50)
      await lab(an, 'Anaesthesia start').fill(local(t0)); await lab(an, 'Incision').fill(local(new Date(t0.getTime() + 10 * 60000)))
      await lab(an, 'Closure').fill(local(new Date(t0.getTime() + 40 * 60000))); await lab(an, 'Anaesthesia end').fill(local(new Date(t0.getTime() + 45 * 60000)))
      await an.getByRole('button', { name: /^Save/ }).first().click(); await wait(page, 3000)
      const op = card(page, 'Operation note')
      await lab(op, 'Pre-operative diagnosis').fill('Acute appendicitis'); await lab(op, 'Post-operative diagnosis').fill('Acute inflamed appendix, no perforation')
      await lab(op, 'Findings').fill('Inflamed oedematous retrocaecal appendix; no pus, no perforation')
      await lab(op, 'Procedure details').fill('Open appendectomy via grid-iron incision. Base ligated, stump buried. Closed in layers.')
      await lab(op, 'Blood loss (ml)').fill('50').catch(() => {})
      await op.getByRole('button', { name: /^Save/ }).first().click(); await wait(page, 3000)
      const t2 = await whoStep(page, SIGN_OUT)
      r.check({ id: 'OT-08', role: 'doctor', screen: '/ot/[id] WHO', title: 'WHO sign-out signed', ok: (t2.match(/Signed(?: by [^\n]+?)? \d{1,2} [A-Z][a-z]{2}/g) ?? []).length >= 3 })
      await page.getByRole('button', { name: 'Mark Completed', exact: true }).click(); await wait(page, 3000)
      const c = page.getByRole('button', { name: /^(Complete|Confirm|Yes)/ }).last(); if (await c.isVisible().catch(() => false)) { await c.click(); await wait(page, 3000) }
      await go(page, ot)
      r.check({ id: 'OT-09', role: 'doctor', screen: '/ot/[id]', title: 'Surgery marked completed', ok: /completed/i.test((await text(page)).slice(0, 400)) })
      const pr = await popupPath(page, () => page.getByRole('button', { name: /Print|PDF/ }).or(page.getByRole('link', { name: /Print|PDF/ })).first().click())
      if (pr) { const p = await savePrint(r, page, pr, 'ot_record'); r.check({ id: 'OT-10', role: 'doctor', screen: '/print/ot', title: 'Print the OT record', ok: p.status === 200 && /pdf/.test(p.type), detail: `${p.bytes} B, ${p.pages} pages` }) }
    })
  },
} satisfies Flow
