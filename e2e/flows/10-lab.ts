// Laboratory: labels, collection, results (with limits), critical value,
// verification, report — and the doctor sees it.
import type { Locator, Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, popupPath, savePrint, shot } from '../lib/browser'
import { buttonIn } from '../lib/ui'
import { account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const resultDlg = (page: Page, name: string) => page.getByRole('heading', { name: `Enter Results — ${name}` }).locator('xpath=ancestor::*[.//button[normalize-space()="Save Results"]][1]')
/** The number box on the row named like `re` (falls back to index `i`). */
async function analyte(dlg: Locator, re: RegExp, i: number): Promise<Locator> {
  const byName = dlg.getByText(re).first().locator('xpath=following::input[@type="number"][1]')
  return (await byName.count()) ? byName : dlg.locator('input[type=number]').nth(i)
}

export default {
  name: 'lab', title: '10 Laboratory',
  async run(r: Run) {
    const m = r.patient('murugan'), l = r.patient('lakshmi'); const LT = 'lab_tech'
    await withRole('lab_tech', async ({ page }) => {
      await go(page, '/lab')
      for (const p of [m, l]) {
        const label = await buttonIn(page, 'Label', [p.full_name]).catch(() => null)
        if (label) {
          await label.click(); await wait(page, 1200)
          const tab = await popupPath(page, () => page.getByRole('button', { name: /^Print \d+ labels?/ }).or(page.getByRole('link', { name: /^Print \d+ labels?/ })).first().click())
          r.check({ id: `LB-01-${p.key}`, role: LT, screen: '/lab', title: `Print tube labels for ${p.full_name}`, ok: !!tab, detail: tab ?? '' })
          await page.getByRole('button', { name: /^(Close|Cancel|Done)$/ }).last().click().catch(() => {}); await wait(page, 500)
        }
        const col = await buttonIn(page, 'Collect Sample', [p.full_name]).catch(() => null)
        if (!col) { r.check({ id: `LB-02-${p.key}`, role: LT, screen: '/lab', title: `Collect ${p.full_name}'s samples`, ok: false, detail: 'no "Collect Sample" (unpaid or not ordered?)' }); continue }
        await col.click(); await wait(page, 2000)
        const confirm = page.getByRole('button', { name: /^(Confirm|Mark collected|Collected|Collect)$/ }).last()
        if (await confirm.isVisible().catch(() => false)) { await confirm.click(); await wait(page, 2500) }
        await go(page, '/lab')
        r.check({ id: `LB-02-${p.key}`, role: LT, screen: '/lab', title: `Collect ${p.full_name}'s samples`, ok: !(await buttonIn(page, 'Collect Sample', [p.full_name]).then(() => true).catch(() => false)) })
      }

      // Lakshmi: CBC + urine. Hb 250 must be refused.
      await go(page, '/lab'); await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 2000)
      await (await buttonIn(page, 'Enter Results', [l.full_name])).click(); await wait(page, 2000)
      let dlg = resultDlg(page, l.full_name)
      const hb = await analyte(dlg, /Ha?emoglobin/, 0)
      await hb.fill('250'); await dlg.getByRole('button', { name: 'Save Results' }).click(); await wait(page, 3000)
      const hbT = await bodyText(page)
      const hbRefused = await dlg.isVisible().catch(() => false) && /(range|impossible|check|too high|not valid)/i.test(hbT)
      r.check({ id: 'LB-10', role: LT, screen: '/lab → Result Entry', title: 'Haemoglobin 250 g/dL (impossible) is refused or flagged as an entry error', ok: hbRefused, bug: 'BUG-023', detail: hbT.match(/[^.]*(range|impossible|check|HIGH)[^.]*/i)?.[0]?.slice(0, 120) })
      if (!(await dlg.isVisible().catch(() => false))) { await (await buttonIn(page, /^(Enter Results|Edit Results)$/, [l.full_name])).click(); await wait(page, 2000); dlg = resultDlg(page, l.full_name) }
      const vals: Record<number, string> = { 0: '11.0', 1: '4.1', 2: '34', 3: '84', 4: '28', 5: '33', 6: '13', 7: '15.2', 8: '84', 9: '12', 10: '4', 18: '260' }
      const nums = dlg.locator('input[type=number]')
      for (const [i, v] of Object.entries(vals)) await nums.nth(Number(i)).fill(v).catch(() => {})
      await (await analyte(dlg, /Ha?emoglobin/, 0)).fill('11.0')
      // The urine panel (choice boxes): the first, normal answer for each — the
      // order cannot be verified while a whole test has no result.
      const picks = dlg.locator('select')
      for (let k = 0; k < await picks.count(); k++) {
        const box = picks.nth(k)
        if (await box.inputValue().catch(() => 'x')) continue
        const first = (await box.locator('option').allTextContents()).find((o) => o.trim() && !/^—|select/i.test(o.trim()))
        if (first) await box.selectOption({ label: first }).catch(() => {})
      }
      await dlg.getByRole('button', { name: 'Save Results' }).click(); await wait(page, 3500)
      // An "unusual value" asks for a second Save (BUG-023 fix).
      if (await dlg.getByRole('button', { name: 'Save Results' }).isVisible().catch(() => false)) { await dlg.getByRole('button', { name: 'Save Results' }).click(); await wait(page, 3500) }
      await go(page, '/lab'); await page.getByRole('button', { name: /^To Release|^Result Entry/ }).first().click(); await wait(page, 2000)
      const lc = await text(page)
      const cbcFlag = lc.match(new RegExp(`${l.full_name}[^#]{0,300}Complete Blood Count \\(CBC\\)\\s*(\\w+)`))?.[1] ?? ''
      r.check({ id: 'LB-11', role: LT, screen: '/lab', title: 'A CBC with high and low values is not summarised as just "LOW"', ok: cbcFlag !== 'LOW', bug: 'BUG-024', detail: `card flag: ${cbcFlag}` })

      // Murugan: RBS 480 → critical alert naming the value
      await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 2000)
      await (await buttonIn(page, 'Enter Results', [m.full_name])).click(); await wait(page, 2000)
      const md = resultDlg(page, m.full_name)
      await (await analyte(md, /Random Blood Sugar|Glucose/, 37)).fill('480')
      await md.getByRole('button', { name: 'Save Results' }).click(); await wait(page, 3500)
      await go(page, '/lab')
      const top = await text(page)
      const banner = top.slice(0, 900)
      r.check({ id: 'LB-12', role: LT, screen: '/lab', title: 'Blood sugar 480 raises a critical-result alert for Murugan', ok: banner.includes(m.full_name) && /critical/i.test(banner) })
      r.check({ id: 'LB-13', role: LT, screen: '/lab', title: 'The critical alert states the value (480)', ok: new RegExp(`${m.full_name}[^#]{0,160}480`).test(banner), bug: 'BUG-025', detail: banner.match(new RegExp(`${m.full_name}.{0,120}`))?.[0] })
      const rec = await buttonIn(page, 'Record notification', [m.full_name]).catch(() => null)
      if (rec) {
        await rec.click(); await wait(page, 1500)
        const boxes = page.locator('input[type=text]:visible, textarea:visible').filter({ hasNot: page.locator('[aria-label*="Scan"]') })
        await boxes.first().fill(account('doctor').name); if (await boxes.count() > 1) await boxes.nth(1).fill('Phoned at once; doctor will review')
        await page.getByRole('button', { name: /^(Record|Save|Confirm)/ }).last().click(); await wait(page, 3000)
        await go(page, '/lab')
        r.check({ id: 'LB-14', role: LT, screen: '/lab', title: 'Record who was told — the critical alert clears', ok: !new RegExp(`${m.full_name}[^#]{0,80}480`).test((await text(page)).slice(0, 900)) })
      }

      // Verify Lakshmi (urine left blank → release as interim)
      await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 2000)
      const v = await buttonIn(page, 'Verify', [l.full_name]).catch(() => null)
      if (v) {
        await v.click(); await wait(page, 2500)
        const interim = page.getByRole('button', { name: 'Release as interim', exact: true })
        const asked = await interim.isVisible().catch(() => false)
        r.check({ id: 'LB-15', role: LT, screen: '/lab', title: 'Verifying with blank analytes asks "release as interim?"', ok: asked })
        if (asked) { await interim.click(); await wait(page, 3500) }
      }
      // Verified results wait in "To Release" until someone releases the report.
      await go(page, '/lab'); await page.getByRole('button', { name: /^To Release/ }).click(); await wait(page, 2000)
      const rel = await buttonIn(page, 'Release Report', [l.full_name]).catch(() => null)
      if (rel) {
        await rel.click(); await wait(page, 2000)
        const ok = page.getByRole('dialog').getByRole('button', { name: /^(Release|Yes|Confirm)/ }).last()
        if (await ok.isVisible().catch(() => false)) { await ok.click(); await wait(page, 3000) }
      }
      await go(page, '/lab'); await page.getByRole('button', { name: /^Reported/ }).click(); await wait(page, 2000)
      const vr = await buttonIn(page, 'View Report', [l.full_name]).catch(() => null)
      if (vr) {
        const tab = await popupPath(page, () => vr.click())
        if (tab) { const pr = await savePrint(r, page, tab, 'lab_report_lakshmi'); r.check({ id: 'LB-16', role: LT, screen: '/print/lab', title: 'Lakshmi\'s lab report prints', ok: pr.status === 200 && /pdf/.test(pr.type), detail: `${pr.bytes} B` }) }
      } else r.check({ id: 'LB-16', role: LT, screen: '/lab', title: 'Lakshmi\'s lab report reaches "Reported"', ok: false })
      await shot(r, page, 'lab_end')
    })
    await withRole('doctor', async ({ page }) => {
      await go(page, l.ipd); await page.getByRole('button', { name: 'Labs', exact: true }).click(); await wait(page, 3000)
      r.check({ id: 'LB-20', role: 'doctor', screen: '/ipd/[id] Labs', title: 'The doctor sees Lakshmi\'s CBC on the admission', ok: /Complete Blood Count|Ha?emoglobin|WBC/i.test(await text(page)) })
    })
  },
} satisfies Flow
