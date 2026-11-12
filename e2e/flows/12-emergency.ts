// Emergency: an unknown unconscious RTA victim — registration, triage, MLC,
// the full ER evaluation, charges, accident register, police, admit to ICU.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, pathOf, savePrint, printText, shot } from '../lib/browser'
import { fill, pick, tick, openSec, secState, lab, buttonIn, chooseIn } from '../lib/ui'
import { admitDialog, fillAdmission, submitAdmission } from '../lib/actions'
import { local, minutesFromNow } from '../lib/people'
import { account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const caseBtn = (page: Page, label: string, name: string) => buttonIn(page, label, [name], [], 'main')

export default {
  name: 'emergency', title: '12 Emergency',
  async run(r: Run) {
    const age = String(30 + (Number(r.tag.slice(-2)) % 20))
    const NAME = `Unknown Male ~${age}y`
    const complaint = `Road traffic accident — two-wheeler skid on Karur bypass, brought by 108. Unconscious, bleeding from scalp wound, smell of alcohol. ${r.tag}`
    // ── Front desk registers ──
    await withRole('receptionist', async ({ page }) => {
      const R = 'receptionist'
      await go(page, '/emergency')
      await page.getByRole('button', { name: 'Register Emergency' }).click(); await wait(page, 2000)
      // Pre-set = level 3 drawn differently from an unchosen level (4).
      const dlgEr = page.getByRole('dialog')
      const bgOf = (n: string) => dlgEr.locator('button').filter({ hasText: new RegExp(`^${n}$`) }).first().evaluate((b) => getComputedStyle(b).backgroundColor).catch(() => '')
      const triagePreset = (await bgOf('3')) !== (await bgOf('4'))
      await page.getByRole('button', { name: 'Register Case' }).click(); await wait(page, 1500)
      r.check({ id: 'ER-01', role: R, screen: '/emergency', title: 'Register with nothing filled is refused', ok: /Select a patient or mark as unknown/i.test(await bodyText(page)) })
      r.check({ id: 'ER-02', role: R, screen: '/emergency', title: 'Triage is not pre-set to 3 for an unknown patient', ok: !triagePreset, bug: 'BUG-028' })
      await dlgEr.getByText('Unknown patient', { exact: true }).first().click(); await wait(page, 1000)
      // Triage has no default now (BUG-028 fix) — the desk picks 3, the doctor re-triages to 1 below.
      await dlgEr.locator('button').filter({ hasText: /^3$/ }).first().click(); await wait(page, 300)
      await pick(page, 'Gender', 'Male'); await page.getByPlaceholder('~40').fill(age)
      await pick(page, 'Arrival Mode', 'Ambulance')
      await page.getByPlaceholder('Brief description of presenting complaint…').fill(complaint)
      const mlcBox = page.getByText('Medico-legal case', { exact: true }).locator('xpath=ancestor::label[1]').locator('input[type=checkbox]')
      r.check({ id: 'ER-03', role: R, screen: '/emergency', title: 'The MLC box ticks itself for an accident complaint', ok: await mlcBox.isChecked().catch(() => false) })
      await page.getByRole('button', { name: 'Register Case' }).click(); await wait(page, 4000)
      const t = await text(page)
      r.check({ id: 'ER-04', role: R, screen: '/emergency', title: 'Unknown unconscious RTA patient registered (MLC, ambulance)', ok: t.includes(r.tag) && t.includes(NAME), detail: t.match(new RegExp(`${NAME.replace(/[~]/g, '.')}.{0,60}`))?.[0] })
      const uhid = t.match(new RegExp(`${NAME.replace(/[~]/g, '.')}\\s*([A-Z]+-UH-\\d{4}-\\d{5})`))?.[1]
      r.setPatient('unknown', { full_name: NAME, uhid, complaint })
      r.check({ id: 'ER-05', role: R, screen: '/emergency', title: 'An unknown patient with no age/sex is not shown as "Unknown Unknown ~Unknowny"', ok: !/~Unknowny/.test(t), bug: 'BUG-034' })
    })
    const u = r.patient('unknown')
    // ── Doctor attends, re-triages, consults ──
    await withRole('doctor', async ({ page }) => {
      const D = 'doctor'; const me = account('doctor').name
      await go(page, '/emergency')
      await (await caseBtn(page, 'Attend', u.complaint.slice(0, 40))).click(); await wait(page, 1500)
      const shown = await page.locator('button[aria-haspopup="listbox"]:visible').last().innerText().catch(() => '')
      r.check({ id: 'ER-10', role: D, screen: '/emergency → Attend', title: 'Attend pre-selects the doctor who clicked it', ok: /Self|E2E Priya/.test(shown) || shown.includes(me), bug: 'BUG-029', detail: `pre-selected: ${shown}` })
      await chooseIn(page.locator('select').filter({ has: page.locator('option', { hasText: me }) }).last(), me)
      await page.getByRole('button', { name: 'Confirm Attend' }).click(); await wait(page, 3000)
      const strip = page.locator('main div').filter({ hasText: u.complaint.slice(0, 40) }).filter({ has: page.getByRole('button', { name: /^3\s*T3$/ }) }).last()
      await strip.getByRole('button', { name: /^3\s*T3$/ }).click().catch(() => {}); await wait(page, 1500)
      const ts = page.locator('select').filter({ has: page.locator('option', { hasText: 'Level 1' }) }).last()
      if (await ts.count()) { await chooseIn(ts, /^Level 1/); await page.getByRole('button', { name: 'Update Triage' }).click(); await wait(page, 3000) }
      r.check({ id: 'ER-11', role: D, screen: '/emergency', title: 'Re-triage to T1 (resuscitation)', ok: new RegExp(`1 T1 ${NAME.replace(/[~]/g, '.')}`).test(await text(page)) })
      await (await caseBtn(page, 'Consult', u.complaint.slice(0, 40))).click(); await page.waitForURL(/\/opd\//, { timeout: 30000 }); await wait(page, 4000)
      r.setPatient('unknown', { visit: pathOf(page) })

      // On arrival — limits, then real values
      await openSec(page, 'On arrival', 'GCS E (1–4)')
      await fill(page, 'GCS E (1–4)', '5'); await fill(page, 'SpO₂ %', '150'); await fill(page, 'Pulse /min', '118')
      await page.getByRole('button', { name: 'Save on arrival' }).click(); await wait(page, 2500)
      const lim = await bodyText(page)
      r.check({ id: 'ER-12', role: D, screen: 'ER evaluation', title: 'SpO₂ 150 / GCS E 5 are refused', ok: /Too big|must be|between|at most|100/i.test(lim) })
      r.check({ id: 'ER-13', role: D, screen: 'ER evaluation', title: 'The error names the wrong box (SpO₂, GCS E)', ok: /SpO|GCS/i.test(lim.match(/[^.]*(Too big|must be|between)[^.]*/i)?.[0] ?? ''), bug: 'BUG-030', detail: lim.match(/[^.]*(Too big|must be|between)[^.]*/i)?.[0]?.slice(0, 120) })
      await pick(page, 'AVPU', 'U — Unresponsive'); await pick(page, 'On arrival', 'Unresponsive')
      for (const [k, v] of [['Pulse /min', '118'], ['BP systolic', '96'], ['BP diastolic', '60'], ['Resp. rate', '24'], ['SpO₂ %', '91'], ['Temp °C or °F', '36.8'], ['GRBS mg/dl', '112'], ['Weight kg', '70'], ['GCS E (1–4)', '1'], ['GCS V (1–5)', '2'], ['GCS M (1–6)', '4']] as const) await fill(page, k, v)
      await fill(page, 'ID marks', 'Mole on right cheek; tattoo "Amma" left forearm'); await fill(page, 'Triage staff', account('nurse').name)
      await page.getByRole('button', { name: 'Save on arrival' }).click(); await wait(page, 3000)
      r.check({ id: 'ER-14', role: D, screen: 'ER evaluation', title: 'Arrival vitals, AVPU U, GCS 7, ID marks saved', ok: /GCS 7/.test(await secState(page, 'On arrival')) })
      const sec = async (id: string, name: string, probe: string, btn: string, title: string, fn: () => Promise<void>) => {
        await openSec(page, name, probe); await fn()
        await page.getByRole('button', { name: btn, exact: true }).click(); await wait(page, 2500)
        r.check({ id, role: D, screen: 'ER evaluation', title, ok: !/Not filled/.test(await secState(page, name)), detail: await secState(page, name) })
      }
      await sec('ER-15', 'Arrival & pre-hospital care', 'Brought by (bystander / relative / police)', 'Save arrival & pre-hospital care', 'Pre-hospital care and who brought him', async () => {
        await fill(page, 'Care before arrival (ambulance / referring hospital)', '108 EMT: collar, 500 ml NS, O2 by mask, pressure bandage'); await tick(page, 'IV fluids running')
        await fill(page, 'Brought by (bystander / relative / police)', 'Selvaraj (bystander), 9000001099') })
      await sec('ER-16', 'Primary survey (A B C D E)', 'Oxygen L/min', 'Save primary survey', 'Primary survey A–E', async () => {
        await tick(page, 'Secretions'); await fill(page, 'Oxygen L/min', '10'); await pick(page, 'C-spine (trauma)', 'Collar')
        await fill(page, 'Airway actions', 'Suctioned; intubated for GCS 7'); await pick(page, 'Trachea', 'Midline'); await pick(page, 'Surgical emphysema', 'No')
        await pick(page, 'Central pulse', 'Present'); await pick(page, 'Heart sound', 'Yes'); await pick(page, 'Peripheral pulse', 'Feeble')
        await fill(page, 'Pupil — right', '4 mm, sluggish'); await fill(page, 'Pupil — left', '3 mm, reacting'); await fill(page, 'CBG mg/dl', '112')
        await page.getByText(/Exposure & log roll/i).first().locator('xpath=following::textarea[1]').fill('Abrasions left elbow and knee; log roll normal') })
      await sec('ER-17', 'History (SAMPLE)', 'History of present illness', 'Save history', 'History (SAMPLE) from the bystander', async () => {
        await fill(page, 'History of present illness', 'Found on the road after a two-wheeler skid. No helmet. One vomit.'); await pick(page, 'Alcohol', 'Yes') })
      await sec('ER-18', 'eFAST', 'Screening ECHO', 'Save efast', 'eFAST negative', async () => {
        await pick(page, 'eFAST done', 'Yes'); await fill(page, 'Screening ECHO', 'No pericardial effusion'); await fill(page, 'eFAST remarks', 'eFAST negative') })
      await sec('ER-19', 'Examination (secondary survey)', 'General condition', 'Save examination', 'Secondary survey', async () => {
        await tick(page, 'Pallor'); await fill(page, 'General condition', 'Critically ill, intubated'); await fill(page, 'Other / Local', '6 cm right parietal scalp laceration') })
      await openSec(page, 'Burns', 'Depth')
      await pick(page, 'Front of trunk (18%)', 'Half'); await pick(page, 'Right arm (9%)', 'All of it'); await wait(page, 500)
      r.check({ id: 'ER-20', role: D, screen: 'ER evaluation', title: 'Burns rule of nines: half front trunk + right arm = 18 %', ok: /Total: 18%/.test(await text(page)) })
      await pick(page, 'Front of trunk (18%)', 'Not burnt'); await pick(page, 'Right arm (9%)', 'Not burnt')
      await sec('ER-21', 'Assessment & plan', 'Provisional diagnosis', 'Save assessment & plan', 'Assessment & plan (admit to ICU)', async () => {
        await fill(page, 'Provisional diagnosis', 'Severe head injury (GCS 7) — ?right EDH'); await fill(page, 'Plan', 'Ventilate, mannitol, CT brain, neurosurgery'); await pick(page, 'Disposition', 'Admit — ICU') })
      await page.getByRole('button', { name: /^Treatment given/ }).first().click(); await wait(page, 800)
      await page.getByRole('button', { name: 'Add treatment' }).click(); await page.getByRole('button', { name: 'Save treatment given', exact: true }).click(); await wait(page, 2000)
      r.check({ id: 'ER-22', role: D, screen: 'ER evaluation', title: 'A treatment row with no name is refused', ok: /Name the treatment/.test(await text(page)) })
      const rows = [['Inj. Mannitol 20%', '100 ml', 'IV'], ['Inj. Phenytoin', '1 g', 'IV over 30 min'], ['Inj. Tetanus toxoid', '0.5 ml', 'IM']]
      for (let i = 0; i < rows.length; i++) {
        if (i > 0) { await page.getByRole('button', { name: 'Add treatment' }).click(); await wait(page, 400) }
        await page.getByPlaceholder('Drug / fluid / procedure').nth(i).fill(rows[i][0]); await page.getByPlaceholder('Dose').nth(i).fill(rows[i][1]); await page.getByPlaceholder('Route').nth(i).fill(rows[i][2]); await page.getByPlaceholder('Given by').nth(i).fill(account('nurse').name)
      }
      await page.getByRole('button', { name: 'Save treatment given', exact: true }).click(); await wait(page, 2500)
      r.check({ id: 'ER-23', role: D, screen: 'ER evaluation', title: 'Log 3 treatments given in ER', ok: /3 entries/.test(await secState(page, 'Treatment given')) })
    })
    // ── Charges: front desk, then doctor ──
    await withRole('receptionist', async ({ page }) => {
      await go(page, '/emergency')
      await (await caseBtn(page, 'Charges', u.complaint.slice(0, 40))).click(); await wait(page, 2500)
      const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Casualty Attendance' }) }).last()
      await chooseIn(sel, /Casualty Attendance/); await page.getByRole('button', { name: /^(Add charge|Adding…)$/ }).click(); await wait(page, 6000)
      const t = await bodyText(page)
      r.check({ id: 'ER-30', role: 'receptionist', screen: '/emergency → Charges', title: 'Front desk adds the Casualty Attendance charge', ok: /Casualty Attendance\s*UDH/.test(t) || /Total ₹1,[0-9]{3}/.test(t.slice(t.indexOf('ER charges'))), bug: 'BUG-031', detail: /Adding…/.test(t) ? 'stuck on "Adding…"' : t.slice(t.indexOf('ER charges'), t.indexOf('ER charges') + 120) })
    })
    await withRole('doctor', async ({ page }) => {
      await go(page, '/emergency')
      await (await caseBtn(page, 'Charges', u.complaint.slice(0, 40))).click(); await wait(page, 2500)
      const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Casualty Attendance' }) }).last()
      const add = page.getByRole('button', { name: /^(Add charge|Adding…)$/ })
      if (!/Casualty Attendance\s*UDH/.test(await bodyText(page))) { await chooseIn(sel, /Casualty Attendance/); await add.click(); await wait(page, 4000) }
      await chooseIn(sel, /^Other/); await wait(page, 600); await page.getByPlaceholder('Amount ₹').fill('600')
      r.check({ id: 'ER-31', role: 'doctor', screen: '/emergency → Charges', title: '"Other" charge cannot be added without a description', ok: await add.isDisabled() })
      await page.getByPlaceholder('e.g. Nebulisation').fill('Scalp wound suturing (6 cm)'); await add.click(); await wait(page, 4000)
      const t = await bodyText(page)
      r.check({ id: 'ER-32', role: 'doctor', screen: '/emergency → Charges', title: 'ER bill: consultation + casualty attendance + suturing', ok: /Scalp wound suturing/.test(t) && /Casualty Attendance/.test(t), detail: t.match(/Total ₹[\d,.]+/)?.[0] })
    })
    // ── Accident register, police, sign ──
    await withRole('doctor', async ({ page }) => {
      const D = 'doctor'
      await go(page, '/emergency')
      const entry = await buttonIn(page, /^(Start entry|Finish entry)$/, [NAME], [], 'main').catch(() => null)
      if (!entry) { r.check({ id: 'ER-40', role: D, screen: '/emergency', title: 'MLC case listed with "Start entry"', ok: false }); return }
      await entry.click(); await page.waitForURL(/\/emergency\/mlc\//, { timeout: 20000 }).catch(() => {}); await wait(page, 3000)
      r.setPatient('unknown', { mlc: pathOf(page) })
      const pre = { age: await lab(page, 'Age').locator('xpath=..').locator('input').inputValue().catch(() => ''), id1: await lab(page, 'Identification mark 1').locator('xpath=..').locator('input').inputValue().catch(() => '') }
      r.check({ id: 'ER-40', role: D, screen: '/emergency/mlc', title: 'Accident register entry carries age and ID marks from the ER evaluation', ok: !!pre.age && /Mole/.test(pre.id1), bug: 'BUG-032', detail: JSON.stringify(pre) })
      if (!pre.age) await fill(page, 'Age', age)
      await lab(page, 'Address').locator('xpath=..').locator('input, textarea').first().fill('Not known — unidentified')
      await fill(page, 'Identification mark 1', 'Mole on right cheek'); await fill(page, 'Identification mark 2', 'Tattoo "Amma" on left forearm')
      const who = page.locator('div').filter({ has: page.getByText('Who brought the patient', { exact: true }) }).filter({ has: page.getByText('Relationship to the patient') }).last()
      await who.locator('label', { hasText: /^Name/ }).locator('xpath=..').locator('input').fill('Selvaraj (bystander), with 108 crew EMT Ravi')
      await fill(page, 'Relationship to the patient', 'Bystander — not related'); await fill(page, 'Phone', '9000001099')
      for (const c of ['Road traffic accident', 'Alcohol intoxication', 'Laceration', 'Head injury', 'Yet to say']) await page.getByRole('button', { name: c, exact: true }).first().click().catch(() => {})
      await fill(page, 'Place of occurrence', 'Karur bypass road'); await fill(page, 'When it happened', local(minutesFromNow(-60)))
      await fill(page, 'Describe each injury — site, size, shape, and how old it looks', '1. Lacerated wound 6 x 1 cm right parietal, fresh. 2. Abrasion left elbow, fresh.')
      await fill(page, 'State of consciousness', 'Unconscious, GCS 7'); await pick(page, 'Smell of alcohol', 'Present')
      await fill(page, 'First aid and treatment given', 'Intubated, IV fluids, mannitol, phenytoin, TT, sutured')
      await fill(page, 'What is the opinion waiting for?', 'CT brain and neurosurgery opinion').catch(() => {})
      await pick(page, 'Disposal', 'Admitted'); await fill(page, 'Examining doctor', account('doctor').name); await fill(page, 'Their registration number', 'TNMC 99999')
      await page.getByRole('button', { name: 'Save draft' }).click(); await wait(page, 3000)
      r.check({ id: 'ER-41', role: D, screen: '/emergency/mlc', title: 'Fill the accident register entry and save a draft', ok: /Saved/i.test(await text(page)) })
      await page.getByRole('button', { name: 'Sign the entry' }).click(); await wait(page, 1200)
      await page.getByRole('button', { name: 'Sign', exact: true }).click().catch(() => {}); await wait(page, 3000)
      r.check({ id: 'ER-42', role: D, screen: '/emergency/mlc', title: 'The entry cannot be signed before the police are informed', ok: /Sign the entry/.test(await text(page)) })
      await page.getByRole('button', { name: /Record an intimation/ }).click(); await wait(page, 1500)
      await page.getByPlaceholder('e.g. Karur Town Police Station').fill('Thanthonimalai Police Station')
      await page.getByPlaceholder('Name', { exact: true }).fill('Murugesan'); await page.getByPlaceholder('e.g. SI, HC').fill('SI')
      await page.getByRole('button', { name: 'Record intimation' }).click(); await wait(page, 3500)
      r.check({ id: 'ER-43', role: D, screen: '/emergency/mlc', title: 'Record the police intimation', ok: /Thanthonimalai Police Station/.test(await text(page)) && !/Not yet informed/.test(await text(page)) })
      const letter = await page.locator('a').filter({ hasText: /Print the letter/ }).first().getAttribute('href').catch(() => null)
      if (letter) { const p = await savePrint(r, page, letter, 'police_intimation'); r.check({ id: 'ER-44', role: D, screen: '/print/mlc', title: 'Print the police intimation letter', ok: p.status === 200 && /pdf/.test(p.type) }) }
      await page.getByRole('button', { name: 'Sign the entry' }).click(); await wait(page, 1200); await page.getByRole('button', { name: 'Sign', exact: true }).click().catch(() => {}); await wait(page, 4000)
      const signed = !/Sign the entry/.test(await text(page))
      r.check({ id: 'ER-45', role: D, screen: '/emergency/mlc', title: 'Sign the entry (locked)', ok: signed, detail: (await text(page)).match(/cannot be completed[^.]{0,160}/)?.[0] })
      const ar = await page.locator('a').filter({ hasText: /three copies/ }).first().getAttribute('href').catch(() => null)
      if (ar) { const p = await savePrint(r, page, ar, 'accident_register'); r.check({ id: 'ER-46', role: D, screen: '/print/mlc', title: 'Print the accident register entry (3 copies)', ok: p.status === 200 && p.pages >= 3, detail: `${p.pages} pages` }) }

      // Admit to ICU — never into a bed someone is in
      // Occupied tiles carry "<name> · <UHID>" as their title; read those, not the
      // board text (the next heading after the last bed looked like a name).
      await go(page, '/wards')
      const occupied = (await page.locator('[title*=" · "]').evaluateAll((els) => els.map((e) => (e.textContent || '').trim().split(/\s+/)[0])))
        .filter((b) => /^I\d+$/.test(b))
      await go(page, '/emergency')
      await (await caseBtn(page, 'Admit to IPD', u.complaint.slice(0, 40))).click(); await admitDialog(page).waitFor()
      const adm = await fillAdmission(page, { doctor: account('doctor').name, ward: /^ICU/, reason: 'Severe head injury GCS 7, ?right EDH — ventilated', avoidBeds: occupied })
      const offered = await admitDialog(page).locator('label').filter({ hasText: /^Bed\*?$/ }).first().locator('xpath=..').locator('select option').allInnerTexts()
      r.check({ id: 'ER-50', role: D, screen: 'Admit to IPD', title: 'Beds with an admitted patient are not offered', ok: !offered.some((b) => occupied.includes(b.trim())), bug: 'BUG-055', detail: `occupied on board: ${occupied.join(',') || 'none'}; offered: ${offered.filter((b) => !/Select/.test(b)).join(',')}` })
      const res = await submitAdmission(page)
      r.check({ id: 'ER-51', role: D, screen: 'Admit to IPD', title: `Admit to ICU bed ${adm.bed}`, ok: res.ok, detail: res.error || res.url })
      if (res.ok) r.setPatient('unknown', { ipd: res.url, bed: adm.bed })
      await go(page, '/wards')
      r.check({ id: 'ER-52', role: D, screen: '/wards', title: 'The new ICU patient shows on the ward board', ok: new RegExp(`${adm.bed} Unknown`).test(await text(page)), bug: 'BUG-055' })
      await go(page, '/emergency'); await page.getByText(/^Closed — last 7 days/).click(); await wait(page, 1500)
      const sheet = await page.locator('main a').filter({ hasText: /Case sheet/ }).first().getAttribute('href').catch(() => null)
      if (sheet) {
        const p = await savePrint(r, page, sheet, 'er_case_sheet')
        const pdf = printText(r, p.file)
        r.check({ id: 'ER-53', role: D, screen: '/print/emergency', title: 'Print the ER case sheet', ok: p.status === 200 && /pdf/.test(p.type), detail: `${p.pages} pages` })
        r.note({ id: 'ER-54', role: D, screen: '/print/emergency', title: `Case sheet shows the approximate age (~${age}) — BUG-033 (check by eye: ${p.file})`, detail: /\(~?\d+/.test(pdf) ? 'text found' : 'see PDF' })
      }
      await shot(r, page, 'emergency_end')
    })
  },
} satisfies Flow
