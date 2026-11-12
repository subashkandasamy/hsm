// ICU: the ventilated head-injury patient from Emergency.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, savePrint, popupPath, shot } from '../lib/browser'
import { fill, pick, tick, lab, chooseIn, buttonIn } from '../lib/ui'
import { openTreatment, orderMed, orderIv, orderCard, giveDose, startTreatment, orderForm, confirmStop } from '../lib/actions'
import { local, minutesFromNow } from '../lib/people'
import { E, account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const news = async (page: Page) => Number((await text(page)).match(/NEWS2 (\d+)/)?.[1] ?? -1)

export default {
  name: 'icu', title: '13 ICU',
  async run(r: Run) {
    const u = r.patient('unknown')
    if (!u.ipd) throw new Error('ICU patient not admitted (Emergency flow)')
    // ── Doctor: ventilator + code status, declaration, orders ──
    await withRole('doctor', async ({ page }) => {
      const D = 'doctor'
      await go(page, u.ipd); await page.getByRole('button', { name: 'Critical Care', exact: true }).click(); await wait(page, 2500)
      if (!/On Ventilator ON/.test(await text(page))) { await page.getByRole('button', { name: /On Ventilator/ }).first().click(); await wait(page, 2500) }
      await chooseIn(page.locator('select').filter({ has: page.locator('option', { hasText: 'Full Code' }) }).first(), 'Full Code'); await wait(page, 2000)
      await go(page, u.ipd); await page.getByRole('button', { name: 'Critical Care', exact: true }).click(); await wait(page, 2500)
      const cs = await text(page)
      r.check({ id: 'ICU-01', role: D, screen: '/ipd/[id] Critical Care', title: 'Ventilator ON and Full Code kept after reload', ok: /On Ventilator ON/.test(cs) && /Code Status Full Code/.test(cs) })
      await startTreatment(page, u.full_name, { manual: { signer: `${account('doctor').name} (treating doctor) — no relative, patient unconscious`, relation: 'Other' } })
      await go(page, '/ipd')
      r.check({ id: 'ICU-02', role: D, screen: '/ipd', title: 'Declaration marked manual for an unconscious patient with no relative', ok: new RegExp(`${u.full_name.replace(/[~]/g, '.')}[^#]{0,140}Upload Pending`).test(await text(page)) })

      await go(page, u.ipd); await page.getByRole('button', { name: 'Treatment', exact: true }).click(); await wait(page, 1500)
      await page.getByRole('button', { name: 'New Order' }).first().click(); await wait(page, 1000)
      r.check({ id: 'ICU-03', role: D, screen: '/ipd/[id] Treatment', title: '"New Order" opens the form even with no orders yet', ok: await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false), bug: 'BUG-038' })
      await openTreatment(page, u.ipd)
      // Search list should mark what the pharmacy stocks
      await page.getByRole('button', { name: 'New Order' }).first().click().catch(() => {}); await wait(page, 800)
      if (!(await orderForm(page).isVisible().catch(() => false))) { await page.getByRole('button', { name: /^Medications \/ IV/ }).first().click(); await page.getByRole('button', { name: 'New Order' }).first().click(); await wait(page, 800) }
      await orderForm(page).getByPlaceholder('Search pharmacy or type new drug name…').fill('Ceftriaxone'); await wait(page, 2500)
      const list = (await page.locator('button, li, [role=option]').filter({ hasText: /Ceftriaxone/i }).allInnerTexts()).join(' | ')
      r.check({ id: 'ICU-04', role: D, screen: '/ipd/[id] Treatment', title: 'Order search marks which drugs the pharmacy stocks', ok: /in stock|stocked|available/i.test(list), bug: 'BUG-041', detail: list.slice(0, 160) })
      await orderForm(page).getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {})
      const tab = await orderMed(page, { search: 'Pantoprazole', pick: /Pantoprazole 40mg\s*40mg\s*Tablet/i, dose: '40', unit: 'mg', route: 'IV', freq: 'daily', days: '5d' })
      r.check({ id: 'ICU-05', role: D, screen: '/ipd/[id] Treatment', title: 'A tablet ordered by the IV route is caught', ok: !tab.added || /tablet|route/i.test(tab.message), bug: 'BUG-039', detail: `${tab.picked} · ${tab.message || (tab.added ? 'added' : '')}` })
      if (tab.added) { const c = await orderCard(page, /^Pantoprazole 40mg 40mg/); await c.getByRole('button', { name: 'Stop' }).click(); await confirmStop(page) }
      r.check({ id: 'ICU-06', role: D, screen: '/ipd/[id] Treatment', title: 'Order NS 500 ml @ 80 ml/h continuous', ok: await orderIv(page, { fluid: 'Normal Saline (NS)', vol: '500', rate: '80', freq: 'Continuous' }) })
      const meds = [
        { id: 'ICU-07', t: 'Mannitol 20% 100 ml IV TDS', o: { search: 'Mannitol', pick: /Mannitol 20%\s*Infusion/i, dose: '100', unit: 'ml', route: 'IV', freq: 'thrice_daily', days: '3d' } },
        { id: 'ICU-08', t: 'Phenytoin 100 mg IV TDS', o: { search: 'Phenytoin', pick: /Phenytoin Sodium 100mg\s*Injection/i, dose: '100', unit: 'mg', route: 'IV', freq: 'thrice_daily', days: '5d' } },
        { id: 'ICU-09', t: 'Ceftriaxone 1 g IV BD (1 g vial)', o: { search: 'Ceftriaxone', pick: /Ceftriaxone 1gm\s*1gm\s*injection/i, dose: '1', unit: 'g', route: 'IV', freq: 'twice_daily', days: '5d' } },
        { id: 'ICU-10', t: 'Pantoprazole 40 mg IV OD (injection)', o: { search: 'Pantoprazole', pick: /Pantoprazole 40mg\s*40mg\s*Injection/i, dose: '40', unit: 'mg', route: 'IV', freq: 'daily', days: '5d' } },
        { id: 'ICU-11', t: 'Paracetamol 1 g IV SOS', o: { search: 'Paracetamol', pick: /Paracetamol 1000mg\s*1000mg\s*infusion/i, dose: '1', unit: 'g', route: 'IV', freq: 'sos', notes: 'If temp > 38.5 °C' } },
        { id: 'ICU-12', t: 'Insulin regular SC SOS (sliding scale)', o: { search: 'Insulin', pick: /(Actrapid|Regular|Huminsulin)/i, dose: '4', unit: 'units', route: 'SC', freq: 'sos', notes: 'GRBS 180-250: 4 u; 251-300: 6 u; >300: 8 u' } },
        { id: 'ICU-13', t: 'Ondansetron 4 mg IV TDS (to be stopped)', o: { search: 'Ondansetron', dose: '4', unit: 'mg', route: 'IV', freq: 'thrice_daily', days: '3d' } },
      ]
      for (const x of meds) { const res = await orderMed(page, x.o); r.check({ id: x.id, role: D, screen: '/ipd/[id] Treatment', title: `Order ${x.t}`, ok: res.added, detail: res.picked }) }
      const ond = await orderCard(page, /^Ondansetron/)
      await ond.getByRole('button', { name: 'Stop' }).click(); await wait(page, 1500)
      const dlg = page.locator('[role=dialog]')
      const asked = (await dlg.count()) > 0 && /stop/i.test(await dlg.innerText())
      r.check({ id: 'ICU-14', role: D, screen: '/ipd/[id] Treatment', title: 'Stopping an order asks to confirm', ok: asked, bug: 'BUG-040' })
      if (asked) { await dlg.getByRole('button', { name: /Stop/ }).last().click(); await wait(page, 2500) }
      await page.getByRole('button', { name: /^Drug chart by day/ }).click(); await wait(page, 2500)
      const chart = await text(page)
      const ondRow = chart.match(/Ondansetron[^]{0,200}/)?.[0] ?? ''
      r.check({ id: 'ICU-15', role: D, screen: '/ipd/[id] Drug chart', title: 'A stopped order\'s remaining doses are shown as stopped, not "H" (held)', ok: !/\bH\b/.test(ondRow.replace(/\(stopped\)/, '')), bug: 'BUG-043', detail: ondRow.slice(0, 140) })
    })
    // ── Pharmacist dispenses ──
    await withRole('pharmacist', async ({ page }) => {
      let n = 0
      for (let k = 0; k < 9; k++) {
        await go(page, '/pharmacy'); await page.getByRole('button', { name: /^IPD Ward/ }).click(); await wait(page, 2500)
        const b = await buttonIn(page, 'Dispense', [u.full_name]).catch(() => null); if (!b) break
        await b.click(); await wait(page, 1500); await page.getByRole('button', { name: 'Confirm Dispense', exact: true }).click(); await wait(page, 3000); n++
      }
      r.check({ id: 'ICU-20', role: 'pharmacist', screen: '/pharmacy → IPD Ward', title: `Dispense the ICU requests (${n})`, ok: n >= 6 })
    })
    // ── Nurse: observations, I/O, lines, bundles, doses ──
    await withRole('nurse', async ({ page }) => {
      const N = 'nurse'
      await go(page, u.ipd); await page.getByRole('button', { name: 'Critical Care', exact: true }).click(); await wait(page, 2500)
      const disabled = await page.locator('select').filter({ has: page.locator('option', { hasText: 'Full Code' }) }).first().isDisabled().catch(() => true)
      r.note({ id: 'ICU-30', role: N, screen: '/ipd/[id] Critical Care', title: 'Nurse cannot change ventilator / code status', detail: disabled ? 'read-only for the nurse' : 'editable' })
      await page.getByRole('button', { name: '+ Record Observation' }).click(); await wait(page, 2000)
      await fill(page, 'HR', '108'); await fill(page, 'FiO₂ %', '150')
      await page.getByRole('button', { name: 'Save Observation' }).click(); await wait(page, 2500)
      const stillOpen = await page.getByRole('button', { name: 'Save Observation' }).isVisible().catch(() => false)
      r.check({ id: 'ICU-31', role: N, screen: '/ipd/[id] Critical Care', title: 'An observation with FiO₂ 150 % is refused', ok: stillOpen, bug: 'BUG-035' })
      if (!stillOpen) { await page.getByRole('button', { name: '+ Record Observation' }).click(); await wait(page, 1500) }
      await fill(page, 'FiO₂ %', '')
      for (const [k, v] of [['HR', '104'], ['SBP', '112'], ['DBP', '70'], ['CVP', '9'], ['ICP', '18'], ['SpO₂', '98'], ['RR', '14'], ['Temp °C or °F', '37.6'], ['GCS E', '2'], ['GCS M', '5'], ['FiO₂ %', '50'], ['PEEP', '6'], ['TV', '450'], ['Vent RR', '14'], ['PIP', '22'], ['Cuff cmH₂O', '26'], ['Pupil R mm', '4'], ['Pupil L mm', '3'], ['Vent Mode', 'SIMV-VC'], ['I:E', '1:2'], ['RASS', '-3'], ['Pain', '2']] as const) await fill(page, k, v).catch(() => {})
      await pick(page, 'Pupil R reacts', 'Sluggish').catch(() => {}); await pick(page, 'Suction', 'Suctioned — moderate').catch(() => {}); await pick(page, 'Position', 'Head up 30°').catch(() => {})
      await tick(page, 'ET tube / tracheostomy (GCS "T")').catch(() => {}); await tick(page, 'Ryles tube position checked').catch(() => {})
      await page.getByRole('button', { name: 'Save Observation' }).click(); await wait(page, 3000)
      const flow = await text(page)
      r.check({ id: 'ICU-32', role: N, screen: '/ipd/[id] Critical Care', title: 'Full ventilated observation saved (GCS E2 VT M5, ICP 18, FiO₂ 50)', ok: /E2VTM5/.test(flow) })
      const score = await news(page)
      r.check({ id: 'ICU-33', role: N, screen: '/ipd/[id]', title: 'NEWS2 counts reduced consciousness for an intubated patient (score ≥ 6)', ok: score >= 6, bug: 'BUG-036', detail: `NEWS2 ${score}` })
      // Partial observation must not wipe the alert
      await page.getByRole('button', { name: '+ Record Observation' }).click(); await wait(page, 1500)
      await fill(page, 'HR', '106'); await page.getByRole('button', { name: 'Save Observation' }).click(); await wait(page, 3000)
      const after = await news(page)
      r.check({ id: 'ICU-34', role: N, screen: '/ipd/[id]', title: 'A pulse-only observation does not drop the NEWS2 / alert', ok: after >= score || /incomplete/i.test(await text(page)), bug: 'BUG-036', detail: `before ${score}, after ${after}` })
      // Intake / output
      const io = page.locator('div').filter({ has: page.getByText('Intake / Output (Fluid Balance)') }).filter({ has: page.getByPlaceholder('ml', { exact: true }) }).last()
      const ios = io.locator('select')
      const entry = async (dir: string, kind: string, ml: string) => { await ios.nth(0).selectOption({ label: dir }); await wait(page, 300); const ko = await ios.nth(1).locator('option').allInnerTexts(); await ios.nth(1).selectOption({ label: ko.find((o) => o.toLowerCase().startsWith(kind))! }); await io.getByPlaceholder('ml').fill(ml); await io.getByRole('button', { name: 'Add' }).click(); await wait(page, 2500) }
      const before = (await text(page)).match(/(\d[\d,]*) ml Today Intake/)?.[1]
      await entry('Intake', 'ng', '-50')
      r.check({ id: 'ICU-35', role: N, screen: '/ipd/[id] Critical Care', title: 'Intake of −50 ml is refused', ok: (await text(page)).match(/(\d[\d,]*) ml Today Intake/)?.[1] === before })
      await entry('Intake', 'iv', '500'); await entry('Intake', 'ng', '100'); await entry('Output', 'urine', '300')
      r.check({ id: 'ICU-36', role: N, screen: '/ipd/[id] Critical Care', title: 'Fluid balance adds up (600 in, 300 out)', ok: /600 ml Today Intake/.test(await text(page)) && /300 ml Today Output/.test(await text(page)) })

      // Lines & tubes
      await go(page, u.ipd)
      const typeSel = () => page.locator('select').filter({ has: page.locator('option', { hasText: 'Endotracheal tube' }) }).first()
      const addLine = async (type: string, site: string, size: string, at: Date) => {
        await page.getByRole('button', { name: '+ Add' }).first().click(); await wait(page, 800)
        await chooseIn(typeSel(), type); await wait(page, 500)
        await page.getByPlaceholder(/^Site/).fill(site); await page.getByPlaceholder(/^Size/).fill(size)
        await page.locator('input[type=datetime-local]:visible').last().fill(local(at))
        if (type === 'Endotracheal tube') { await page.getByPlaceholder(/Lip level/).fill('22').catch(() => {}); const h = page.locator('select').filter({ has: page.locator('option', { hasText: /HME/ }) }).first(); if (await h.count()) await chooseIn(h, /HME/) }
        await page.getByRole('button', { name: 'Save line' }).click(); await wait(page, 2500)
      }
      await addLine('Central line', 'R IJV', '7 Fr', minutesFromNow(60))
      r.check({ id: 'ICU-37', role: N, screen: '/ipd/[id] Day sheet', title: 'A line inserted in the future is refused', ok: /in the future/i.test(await text(page)) })
      await page.getByRole('button', { name: 'Cancel' }).last().click().catch(() => {})
      await addLine('Endotracheal tube', 'Oral', '8.0', minutesFromNow(-40)); await addLine('Central line', 'R IJV', '7 Fr triple lumen', minutesFromNow(-30))
      await addLine('Urinary catheter', 'Foley', '16 Fr', minutesFromNow(-25)); await addLine('Ryles tube', 'Right nostril', '16 Fr', minutesFromNow(-20))
      const lt = await text(page)
      r.check({ id: 'ICU-38', role: N, screen: '/ipd/[id] Day sheet', title: 'ETT (lip 22 cm, HME), central line, Foley and Ryles tube listed', ok: ['Endotracheal tube', 'Central line', 'Urinary catheter', 'Ryles tube'].every((x) => lt.includes(x)) && /lip 22 cm/.test(lt) })
      // Bundles
      const signUti = page.getByRole('button', { name: 'Sign UTI' })
      r.check({ id: 'ICU-39', role: N, screen: '/ipd/[id] Day sheet', title: 'A care bundle cannot be signed with nothing ticked', ok: await signUti.isDisabled().catch(() => false), bug: 'BUG-037' })
      for (const x of ['Feeding', 'Analgesic', 'Sedation', 'DVT prophylaxis', 'Head end elevation', 'Ulcer prophylaxis', 'Glycemic control', 'Bedsore', 'Lines']) await tick(page, x).catch(() => {})
      await page.getByRole('button', { name: 'Sign FAST HUG BSNL' }).click(); await wait(page, 2500)
      for (const x of ['Oral hygiene', 'Cuff pressure', 'Subglottic ETT', 'HME', 'Oral Ryles tube only']) await tick(page, x).catch(() => {})
      await page.getByRole('button', { name: 'Sign VAP' }).click(); await wait(page, 2500)
      await go(page, u.ipd)
      const cb = await text(page)
      r.check({ id: 'ICU-40', role: N, screen: '/ipd/[id] Day sheet', title: 'FAST HUG 9/11 and VAP 5/6 signed with the nurse\'s name', ok: /9\/11 · /.test(cb) && /5\/6 · /.test(cb) && cb.includes(account('nurse').name) })

      // Doses
      await openTreatment(page, u.ipd)
      const ns = await giveDose(page, /^Normal Saline \(NS\) 500ml/, E.secondNurse)
      r.check({ id: 'ICU-41', role: N, screen: '/ipd/[id] Treatment', title: 'Start NS bag 1 (checked by a second nurse)', ok: /Given by|Bag finished/.test(ns) })
      for (const [id, re, t] of [['ICU-42', /^Ceftriaxone 1gm/, 'Ceftriaxone'], ['ICU-43', /^Mannitol/, 'Mannitol'], ['ICU-44', /^Phenytoin/, 'Phenytoin']] as const) {
        const res = await giveDose(page, re, E.secondNurse); r.check({ id, role: N, screen: '/ipd/[id] Treatment', title: `Give ${t}`, ok: /Given by/.test(res), detail: res.slice(0, 100) })
      }
      const pc = await orderCard(page, /^Paracetamol 1000mg/)
      await pc.getByRole('button', { name: 'Give a dose' }).click(); await wait(page, 800)
      const reasonBox = await pc.getByLabel(/Reason/).count()
      r.note({ id: 'ICU-45', role: N, screen: '/ipd/[id] Treatment', title: 'SOS dose form asks why it is given', detail: reasonBox ? 'reason box present' : 'only "Checked by"' })
      await pc.getByRole('button', { name: 'Confirm given', exact: true }).click(); await wait(page, 3000)
      // Drip charting right after the bag started
      await go(page, u.ipd); await page.getByRole('button', { name: 'Chart', exact: true }).click(); await wait(page, 3000)
      const quick = page.getByRole('button', { name: /^Chart \d+ ml since/ }).first()
      if (await quick.count()) {
        await quick.click(); await wait(page, 3000)
        const dt = await text(page)
        const charted0 = /charted 0 of/.test(dt)
        r.check({ id: 'ICU-46', role: N, screen: '/ipd/[id] Chart', title: 'Right after a bag starts the drip panel does not claim "Already charted"', ok: !(charted0 && /Already charted up to/.test(dt)), bug: 'BUG-042', detail: dt.match(/Already charted[^.]*|charted \d+ of \d+ ml/)?.[0] })
      }
      // Insulin from the round
      await lab(page, 'Blood sugar mg/dl').locator('xpath=..').locator('input').fill('262')
      await lab(page, 'Insulin given (units)').locator('xpath=..').locator('input').fill('6'); await wait(page, 600)
      await page.getByPlaceholder('e.g. Actrapid').fill('Actrapid')
      const ord = page.getByLabel('Insulin order').locator('xpath=..').locator('select')
      if (await ord.count()) await ord.selectOption({ index: 0 })
      await page.getByRole('button', { name: 'Save round' }).click(); await wait(page, 3500)
      r.check({ id: 'ICU-47', role: N, screen: '/ipd/[id] Chart', title: 'GRBS 262 + 6 u insulin from the round lands on the drug chart', ok: /insulin on the drug chart/i.test(await text(page)) })
      // Wound note
      await go(page, u.ipd); await page.getByRole('button', { name: 'Clinical', exact: true }).click(); await wait(page, 2500)
      await pick(page, 'Note by', /Wound/); await wait(page, 600)
      r.check({ id: 'ICU-48', role: N, screen: '/ipd/[id] Clinical', title: 'A wound note cannot be added without a site', ok: await page.getByRole('button', { name: 'Add Note' }).first().isDisabled() })
      await fill(page, 'Wound site', `Right parietal scalp — sutured ${r.tag}`); await pick(page, 'Condition', 'Same')
      await fill(page, 'T — Tissue', 'Clean, edges apposed'); await fill(page, 'I — Infection / inflammation', 'No redness'); await fill(page, 'M — Moisture', 'Dry'); await fill(page, 'E — Edge', 'Apposed')
      await fill(page, 'Dressing done', 'Povidone, dry gauze')
      await page.getByRole('button', { name: 'Add Note' }).first().click(); await wait(page, 3500)
      r.check({ id: 'ICU-49', role: N, screen: '/ipd/[id] Clinical', title: 'Wound assessment (T-I-M-E) saved', ok: (await text(page)).includes(r.tag) })
    })
    // ── Prints ──
    await withRole('doctor', async ({ page }) => {
      await go(page, u.ipd)
      const a3 = await popupPath(page, () => page.getByRole('link', { name: /Print A3/ }).or(page.getByRole('button', { name: /Print A3/ })).first().click())
      if (a3) { const p = await savePrint(r, page, a3, 'icu_day_a3'); r.check({ id: 'ICU-50', role: 'doctor', screen: '/print/ipd/icu-day', title: 'Print the ICU Day sheet (A3)', ok: p.status === 200 && /pdf/.test(p.type), detail: `${p.bytes} B` }) }
      const dc = await savePrint(r, page, `${u.ipd.replace('/ipd/', '/print/ipd/')}/drug-chart/pdf`, 'drug_chart')
      r.check({ id: 'ICU-51', role: 'doctor', screen: '/print/ipd/drug-chart', title: 'Print the Drug & Fluid chart', ok: dc.status === 200 && /pdf/.test(dc.type), detail: `${dc.bytes} B` })
      await shot(r, page, 'icu_end')
    })
  },
} satisfies Flow
