// OPD: the doctor sees Murugan (fever, penicillin allergy) and Lakshmi
// (appendicitis → admitted). Prescription safety checks live here.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, popupPath, savePrint, printText, pathOf, shot } from '../lib/browser'
import { buttonIn } from '../lib/ui'
import { openBill, recordPayment, admitDialog, fillAdmission, submitAdmission } from '../lib/actions'
import { account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const rxCard = (page: Page) => page.getByRole('heading', { name: /^Prescriptions/ }).locator('xpath=ancestor::*[.//button[normalize-space()="Add Prescription"]][1]')
async function choose(page: Page, label: string, choice: string) {
  await page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }).first().locator('xpath=..').getByRole('button').first().click()
  await wait(page, 500); await page.getByRole('button', { name: choice, exact: true }).click(); await wait(page, 400)
}
async function typeDrug(page: Page, name: string) {
  const box = rxCard(page).getByPlaceholder('e.g. Paracetamol')
  await box.fill(name); await wait(page, 1500); await box.press('Tab'); await wait(page, 2500)
}
async function addRx(page: Page, name: string, dose: string, dur: string, freq?: string, instr?: string) {
  await typeDrug(page, name)
  await rxCard(page).getByPlaceholder('500 mg').fill(dose); await rxCard(page).getByPlaceholder('5 days').fill(dur)
  if (freq) await choose(page, 'Frequency', freq)
  if (instr) await choose(page, 'Instructions', instr).catch(() => {})
  await rxCard(page).getByRole('button', { name: 'Add Prescription' }).click(); await wait(page, 3000)
  return (await rxCard(page).innerText()).replace(/\s+/g, ' ')
}
async function startConsult(page: Page, name: string) {
  await go(page, '/opd')
  const b = await buttonIn(page, 'Start Consultation', [name])
  await b.click(); await page.waitForURL(/\/opd\/[0-9a-f-]{36}/, { timeout: 30000 }); await wait(page, 2500)
  return pathOf(page)
}

export default {
  name: 'opd', title: '04 OPD consultation',
  async run(r: Run) {
    const D = 'doctor'
    const m = r.patient('murugan'), l = r.patient('lakshmi')
    await withRole('doctor', async ({ page }) => {
      await go(page, '/opd')
      const wl = await text(page)
      r.check({ id: 'O-01', role: D, screen: '/opd', title: 'Both checked-in, paid patients are on the doctor\'s list', ok: wl.includes(m.full_name) && wl.includes(l.full_name) })

      // ── Murugan ──
      const visit = await startConsult(page, m.full_name); r.setPatient('murugan', { visit })
      const byP = (ph: string) => page.getByPlaceholder(ph).first()
      await byP('120/80 mmHg').fill('abc'); await byP('72 bpm').fill('102')
      await page.getByRole('button', { name: 'Save Vitals' }).click(); await wait(page, 2500)
      await go(page, visit)
      const bpKept = await byP('120/80 mmHg').inputValue()
      r.check({ id: 'O-02', role: D, screen: '/opd/[visit]', title: 'BP "abc" is refused', ok: !/abc/.test(bpKept) && /BP|blood pressure|format/i.test(await bodyText(page)) || bpKept === '', bug: 'BUG-007', detail: `saved BP = "${bpKept}"` })
      await byP('120/80 mmHg').fill('130/84'); await byP('72 bpm').fill('102'); await byP('98.6 °F').fill('101.2'); await byP('98%').fill('97'); await byP('70 kg').fill('68'); await byP('175 cm').fill('168')
      await page.getByRole('button', { name: 'Save Vitals' }).click(); await wait(page, 2500)
      await go(page, visit)
      r.check({ id: 'O-03', role: D, screen: '/opd/[visit]', title: 'Vitals 130/84, 102, 101.2 °F saved', ok: (await byP('120/80 mmHg').inputValue()) === '130/84' })

      const allergyShown = /penicillin/i.test(await text(page))
      r.check({ id: 'O-04', role: D, screen: '/opd/[visit]', title: 'The allergy typed at registration (Penicillin) is shown to the doctor', ok: allergyShown, bug: 'BUG-008' })
      await byP("Patient's main complaint…").fill('Fever with chills for 3 days, body ache, headache.')
      await byP('Search ICD-10 (code or diagnosis)…').fill('typhoid'); await wait(page, 2500)
      await page.getByText(/A01\.?0/).locator('visible=true').first().click().catch(() => {}); await wait(page, 800)
      await byP('Additional clinical notes, follow-up instructions…').fill('Suspected enteric fever. Review with reports.')
      await page.getByRole('button', { name: 'Save', exact: true }).first().click(); await wait(page, 2500)
      const dx = await page.locator('textarea').filter({ hasText: /typhoid/i }).count() + (/A01/.test(await page.locator('main').innerHTML()) ? 1 : 0)
      r.check({ id: 'O-05', role: D, screen: '/opd/[visit]', title: 'Picking ICD A01.0 fills diagnosis and code', ok: dx > 0 })

      // Amoxicillin for a penicillin-allergic patient must warn
      await typeDrug(page, 'Amoxicillin')
      const amox = await bodyText(page)
      r.check({ id: 'O-06', role: D, screen: '/opd/[visit]', title: 'Amoxicillin warns: patient is allergic to penicillin', ok: /allerg/i.test(amox) && /penicillin|beta.?lactam/i.test(amox), bug: 'BUG-008', detail: amox.match(/[^.]*allerg[^.]*/i)?.[0]?.slice(0, 160) })
      r.check({ id: 'O-07', role: D, screen: '/opd/[visit]', title: 'A drug picked from the list is found in the drug catalogue', ok: !/Not found in the drug catalogue/i.test(amox), bug: 'BUG-009' })
      await rxCard(page).getByPlaceholder('e.g. Paracetamol').fill('')
      // No frequency → refused
      const noFreq = await addRx(page, 'Paracetamol', '650 mg', '3 days')
      const added = /Paracetamol/.test(noFreq) && /—/.test(noFreq.slice(noFreq.indexOf('Paracetamol'), noFreq.indexOf('Paracetamol') + 80))
      r.check({ id: 'O-08', role: D, screen: '/opd/[visit]', title: 'A prescription with no frequency is refused', ok: !added, bug: 'BUG-010' })
      if (added) { await rxCard(page).locator('tr').filter({ hasText: 'Paracetamol' }).first().locator('button').first().click(); await wait(page, 1200); await page.getByRole('button', { name: /^(Remove|Delete|Yes)/ }).last().click().catch(() => {}); await wait(page, 1500) }
      let rx = await addRx(page, 'Paracetamol', '650 mg', '3 days', '1-1-1 TDS', 'After food')
      rx = await addRx(page, 'Azithromycin', '500 mg', '3 days', '1-0-0 OD Morning', 'After food')
      r.check({ id: 'O-09', role: D, screen: '/opd/[visit]', title: 'Paracetamol TDS and Azithromycin OD on the prescription', ok: /Paracetamol/.test(rx) && /Azithromycin/.test(rx) })

      // Interactions
      await typeDrug(page, 'Theophylline'); const theo = await bodyText(page); await rxCard(page).getByPlaceholder('e.g. Paracetamol').fill('')
      r.note({ id: 'O-10a', role: D, screen: '/opd/[visit]', title: 'Theophylline (with azithromycin on the list)', detail: theo.match(/[^.]*interact[^.]*/i)?.[0]?.slice(0, 140) ?? 'no interaction message' })

      // Orders
      await page.getByRole('button', { name: 'Order Lab Tests' }).click(); await wait(page, 1500)
      const dlg = page.getByRole('heading', { name: 'Order Lab Tests' }).locator('xpath=ancestor::*[.//button[starts-with(normalize-space(),"Order ")]][1]')
      for (const n of ['Complete Blood Count (CBC)', 'Liver Function Test (LFT)', 'Urine Routine & Microscopy (R&M)', 'Random Blood Sugar']) await dlg.getByText(n, { exact: true }).click().catch(() => {})
      await dlg.getByRole('button', { name: /^Order \d+ Tests?/ }).click(); await wait(page, 3500)
      await page.getByRole('button', { name: 'Order Imaging' }).click(); await wait(page, 1500)
      const ix = page.getByRole('heading', { name: /Order Imaging/ }).last().locator('xpath=ancestor::*[.//button[starts-with(normalize-space(),"Order")]][1]')
      await ix.getByText(/Chest X-Ray/i).first().click(); await wait(page, 500)
      await ix.getByRole('button', { name: /^Order( \d+)?( Scans?| Imaging| Tests?)?/ }).last().click(); await wait(page, 3500)
      const ord = await text(page)
      r.check({ id: 'O-11', role: D, screen: '/opd/[visit]', title: 'Order 4 lab tests and a chest X-ray', ok: /Lab Tests Ordered/.test(ord) && /Imaging Ordered/.test(ord), detail: (ord.match(/(Lab Tests Ordered|Order Lab Tests)[^\n]{0,4}|(Imaging Ordered|Order Imaging)[^\n]{0,4}/g) ?? []).join(' · ') })
      await page.getByRole('button', { name: '1 week', exact: true }).click()
      await page.getByPlaceholder('Review reports, BP check…').fill('Review with blood reports')
      await page.getByRole('button', { name: 'Recommend Follow-up', exact: true }).click(); await wait(page, 3000)
      r.check({ id: 'O-12', role: D, screen: '/opd/[visit]', title: 'Recommend a 1-week follow-up', ok: /Follow-up requested|follow-up/i.test(await bodyText(page)) })
      const rxPath = await popupPath(page, () => page.getByRole('button', { name: 'Print Prescription' }).or(page.getByRole('link', { name: 'Print Prescription' })).first().click())
      if (rxPath) {
        const pr = await savePrint(r, page, rxPath.includes('/pdf') ? rxPath : rxPath.replace(/\/?$/, '/pdf'), 'opd_prescription_murugan')
        r.check({ id: 'O-13', role: D, screen: '/print/rx', title: 'Print the prescription (PDF)', ok: pr.status === 200 && /pdf/.test(pr.type), detail: `${pr.status} ${pr.bytes} B` })
        const pdfText = printText(r, pr.file)
        r.check({ id: 'O-14', role: D, screen: '/print/rx', title: 'Printed Rx carries the follow-up date and the tests ordered', ok: /follow/i.test(pdfText) && /(CBC|Blood Count)/i.test(pdfText), bug: 'BUG-011', detail: 'checked in the PDF text' })
      } else r.check({ id: 'O-13', role: D, screen: '/opd/[visit]', title: 'Print the prescription (PDF)', ok: false, detail: 'no print tab' })
      await page.getByRole('button', { name: 'Close Visit', exact: true }).click(); await wait(page, 1500)
      await page.getByRole('button', { name: /^(Close Visit|Yes|Confirm|Close)$/ }).last().click().catch(() => {}); await wait(page, 2500)
      await go(page, visit)
      r.check({ id: 'O-15', role: D, screen: '/opd/[visit]', title: 'Close the visit — it becomes read-only', ok: /closed|read-only/i.test(await text(page)) })

      // ── Lakshmi ──
      const lv = await startConsult(page, l.full_name); r.setPatient('lakshmi', { visit: lv })
      await byP('120/80 mmHg').fill('118/76'); await byP('72 bpm').fill('96'); await byP('98.6 °F').fill('99.8'); await byP('98%').fill('98'); await byP('70 kg').fill('56'); await byP('175 cm').fill('158')
      await page.getByRole('button', { name: 'Save Vitals' }).click(); await wait(page, 2000)
      await byP("Patient's main complaint…").fill("Pain right lower abdomen since yesterday, started around the navel. Nausea, one vomit. Tenderness at McBurney's point.")
      await byP('Search ICD-10 (code or diagnosis)…').fill('appendicitis'); await wait(page, 2500)
      await page.getByText(/K35/).locator('visible=true').first().click().catch(() => {})
      await page.getByRole('button', { name: 'Save', exact: true }).first().click(); await wait(page, 2000)
      await addRx(page, 'Ciprofloxacin', '500 mg', '5 days', '1-0-1 BD')
      await typeDrug(page, 'Tizanidine'); const tiz = await bodyText(page); await rxCard(page).getByPlaceholder('e.g. Paracetamol').fill('')
      r.check({ id: 'O-20', role: D, screen: '/opd/[visit]', title: 'Ciprofloxacin + tizanidine (contraindicated) gives an interaction warning', ok: /interact|contraindicat/i.test(tiz), bug: 'BUG-012', detail: tiz.match(/[^.]*(interact|contraindicat)[^.]*/i)?.[0]?.slice(0, 140) })
      await page.getByRole('button', { name: 'Order Imaging' }).click(); await wait(page, 1500)
      const ix2 = page.getByRole('heading', { name: /Order Imaging/ }).last().locator('xpath=ancestor::*[.//button[starts-with(normalize-space(),"Order")]][1]')
      await ix2.getByText(/Ultrasound Abdomen/i).first().click(); await ix2.getByRole('button', { name: /^Order/ }).last().click(); await wait(page, 3000)
      await page.getByRole('button', { name: 'Order Lab Tests' }).click(); await wait(page, 1500)
      const dl2 = page.getByRole('heading', { name: 'Order Lab Tests' }).locator('xpath=ancestor::*[.//button[starts-with(normalize-space(),"Order ")]][1]')
      for (const n of ['Complete Blood Count (CBC)', 'Urine Routine & Microscopy (R&M)']) await dl2.getByText(n, { exact: true }).click().catch(() => {})
      await dl2.getByRole('button', { name: /^Order \d+ Tests?/ }).click(); await wait(page, 3000)

      // Admit from the consultation
      await page.getByRole('button', { name: 'Admit to IPD', exact: true }).click(); await admitDialog(page).waitFor()
      const ward = admitDialog(page).locator('label').filter({ hasText: /^Ward\*?$/ }).first().locator('xpath=..').locator('select').first()
      const wardOpts = await ward.locator('option').allInnerTexts()
      const adm = await fillAdmission(page, { doctor: account('doctor').name, ward: /^General Ward/, reason: 'Acute appendicitis — admitted for appendectomy', procedure: /Appendectomy/ })
      const wardAvail = Number(adm.ward.match(/\((\d+) (?:beds? )?avail/)?.[1] ?? -1); const roomAvail = Number(adm.room.match(/(\d+) beds? avail/)?.[1] ?? -1)
      r.check({ id: 'O-21', role: D, screen: 'Admit to IPD', title: 'Ward list "avail." matches the free beds in its rooms', ok: roomAvail < 0 || wardAvail >= roomAvail, bug: 'BUG-013', detail: `${adm.ward} vs room ${adm.room} · options ${wardOpts.slice(1, 4).join(' | ')}` })
      const res = await submitAdmission(page)
      r.check({ id: 'O-22', role: D, screen: 'Admit to IPD', title: `Admit ${l.full_name} (General Ward ${adm.bed}, appendectomy)`, ok: res.ok, detail: res.error || res.url })
      if (res.ok) r.setPatient('lakshmi', { ipd: res.url, bed: adm.bed })
      const head = await text(page)
      r.check({ id: 'O-23', role: D, screen: '/ipd/[id]', title: 'Doctor names are not printed "Dr. Dr."', ok: !/Dr\. Dr\./.test(head), bug: 'BUG-014' })
      await shot(r, page, 'opd_lakshmi_admitted')
    })

    // Front desk takes payment for Murugan's tests so the lab can collect.
    await withRole('receptionist', async ({ page }) => {
      for (const kind of [/Lab/, /Radiology/]) {
        await openBill(page, m.full_name, kind).catch(() => {})
        const due = (await text(page)).match(/Balance Due ₹([\d,]+\.\d\d)/)?.[1]?.replace(/,/g, '')
        if (due && Number(due) > 0) {
          const after = await recordPayment(page, due, 'UPI')
          r.check({ id: `O-30-${kind.source}`, role: 'receptionist', screen: '/billing/[id]', title: `Murugan's ${kind.source} bill paid (₹${due})`, ok: /Balance Due ₹0\.00/.test(after) })
        }
      }
    })
  },
} satisfies Flow
