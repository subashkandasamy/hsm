// Discharge: all five ways out — normal (with the bill settled), against
// advice, death, absconded, referred.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, savePrint, printText, pathOf } from '../lib/browser'
import { openIpdRow, registerPatient, findPatient, admitDialog, fillAdmission, submitAdmission } from '../lib/actions'
import { fill, lab } from '../lib/ui'
import { cast, local, minutesFromNow } from '../lib/people'
import { account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const SUMMARY = 'Acute appendicitis — open appendectomy. Uneventful course; afebrile, wound clean. Advice: Tab Cefuroxime 500 mg BD × 5 days, Paracetamol 650 mg SOS. Review in 1 week for suture removal.'

async function openDischarge(page: Page, ipd: string, how: string) {
  await go(page, ipd); await page.getByRole('button', { name: 'Discharge', exact: true }).click(); await wait(page, 2000)
  await page.getByText(how, { exact: true }).click(); await wait(page, 1000)
}
const dischargeMsg = async (page: Page) => (await bodyText(page)).match(/Cannot discharge[^\n]*?(?=Cancel|$)/)?.[0] ?? ''

export default {
  name: 'discharge', title: '15 Discharge',
  async run(r: Run) {
    const l = r.patient('lakshmi'); const D = 'doctor'
    // ── Normal discharge: blocked while money is owed ──
    await withRole('doctor', async ({ page }) => {
      await openDischarge(page, l.ipd, 'Normal discharge')
      const btn = page.getByRole('button', { name: 'Discharge Patient' })
      r.check({ id: 'DC-01', role: D, screen: '/ipd/[id] → Discharge', title: 'Discharge needs a summary', ok: await btn.isDisabled() })
      await page.getByPlaceholder(/Condition at discharge/).fill(SUMMARY)
      const warn = await bodyText(page)
      await btn.click(); await wait(page, 4500)
      const msg = await dischargeMsg(page)
      r.check({ id: 'DC-02', role: D, screen: '/ipd/[id] → Discharge', title: 'Discharge is blocked while the patient owes money', ok: !!msg, detail: msg.slice(0, 140) })
      const adv = l.advance ? l.advance.toLocaleString('en-IN') : ''
      // BUG-054: the summary survives the refusal — close the window and come back (same browser).
      await page.keyboard.press('Escape').catch(() => {}); await page.getByRole('dialog').getByRole('button', { name: /^Cancel$/ }).first().click().catch(() => {}); await wait(page, 800)
      await openDischarge(page, l.ipd, 'Normal discharge')
      const keptHere = await page.getByPlaceholder(/Condition at discharge/).inputValue().catch(() => '')
      r.check({ id: 'DC-04', role: D, screen: '/ipd/[id] → Discharge', title: 'The summary typed before the bill block is kept when the window is reopened', ok: keptHere.length > 40, bug: 'BUG-054' })
      r.check({ id: 'DC-03', role: D, screen: '/ipd/[id] → Discharge', title: 'The balance shown nets off the advance already held', ok: !adv || /advance/i.test(warn + msg), bug: 'BUG-052', detail: (warn.match(/₹[\d,.]+ balance due[^.]*/)?.[0] ?? msg).slice(0, 140) })
    })
    // ── Billing settles ──
    await withRole('receptionist', async ({ page }) => {
      await openIpdRow(page, l.full_name)
      const t0 = await text(page)
      const oneStep = /Collect ₹[\d,]+/.test(t0.slice(t0.indexOf('IPD'), t0.indexOf('IPD') + 300))
      r.check({ id: 'DC-10', role: 'receptionist', screen: '/billing → IPD', title: 'The inpatient balance can be collected in one step', ok: oneStep, bug: 'BUG-053' })
      const due = Number((t0.match(/IPD[^₹]*₹[\d,.]+[^₹]*₹([\d,]+\.\d\d) due/)?.[1] ?? '0').replace(/,/g, ''))
      for (let k = 0; k < 12; k++) {
        const adj = page.locator('main').getByText('↳ Adjust Advance').first()
        if (!(await adj.count())) break
        await adj.click(); await wait(page, 2500)
      }
      await openIpdRow(page, l.full_name)
      let t = await text(page)
      const left = Number((t.match(/([\d,]+\.\d\d) due/)?.[1] ?? '0').replace(/,/g, ''))
      if (left > 0) {
        await page.getByRole('button', { name: '+ Top Up Advance' }).first().click(); await wait(page, 1200)
        const amt = page.getByPlaceholder('Amount'); await amt.fill(String(left))
        await amt.locator('xpath=following::select[1]').selectOption({ label: 'Card' }).catch(() => {})
        await page.getByRole('button', { name: 'Record', exact: true }).click(); await wait(page, 3500)
        for (let k = 0; k < 12; k++) { const adj = page.locator('main').getByText('↳ Adjust Advance').first(); if (!(await adj.count())) break; await adj.click(); await wait(page, 2500) }
        await openIpdRow(page, l.full_name); t = await text(page)
      }
      r.check({ id: 'DC-11', role: 'receptionist', screen: '/billing → IPD', title: `Settle Lakshmi's stay (₹${due} due at start)`, ok: /Cleared/.test(t.slice(t.indexOf(l.full_name), t.indexOf(l.full_name) + 300)) })
    })
    // ── Discharge again ──
    await withRole('doctor', async ({ page }) => {
      await openDischarge(page, l.ipd, 'Normal discharge')
      // A new browser (another PC) has no draft — the summary is typed again.
      const kept = await page.getByPlaceholder(/Condition at discharge/).inputValue()
      r.note({ id: 'DC-20', role: D, screen: '/ipd/[id] → Discharge', title: 'On another browser the draft summary is not carried over', detail: kept.length > 40 ? 'kept' : 'empty — kept only on the PC where it was typed' })
      if (kept.length < 40) await page.getByPlaceholder(/Condition at discharge/).fill(SUMMARY)
      if (!kept) await page.getByPlaceholder(/Condition at discharge/).fill(SUMMARY)
      await page.getByRole('button', { name: 'Discharge Patient' }).click(); await wait(page, 5000)
      const t = await text(page)
      r.check({ id: 'DC-21', role: D, screen: '/ipd/[id]', title: 'Discharge Lakshmi (normal)', ok: /discharged/.test(t.slice(0, 300)), detail: await dischargeMsg(page) })
      const p = await savePrint(r, page, `${l.ipd.replace('/ipd/', '/print/ipd/')}/discharge/pdf`, 'discharge_lakshmi')
      r.check({ id: 'DC-22', role: D, screen: '/print/ipd/discharge', title: 'Print the discharge summary', ok: p.status === 200 && /pdf/.test(p.type) })
      const pdf = printText(r, p.file)
      r.check({ id: 'DC-23', role: D, screen: '/print/ipd/discharge', title: 'Summary does not say "1 days"', ok: !/\b1 days\b/.test(pdf), bug: 'BUG-057', detail: 'PDF text' })
      await page.getByRole('button', { name: '1 week', exact: true }).click().catch(() => {})
      await page.getByRole('button', { name: 'Recommend Follow-up' }).click().catch(() => {}); await wait(page, 2500)
      r.check({ id: 'DC-24', role: D, screen: '/ipd/[id]', title: 'Recommend a 1-week follow-up after discharge', ok: /Follow-up requested/i.test(await bodyText(page)) })
      await go(page, '/wards')
      r.check({ id: 'DC-25', role: D, screen: '/wards', title: `Lakshmi's bed ${l.bed} is free again`, ok: !new RegExp(`\\b${l.bed} Lakshmi`).test(await text(page)) })
    })

    // ── Three more admissions for the other ways out ──
    const people = cast(r)
    await withRole('receptionist', async ({ page }) => {
      for (const key of ['selvi', 'raju', 'arjun']) {
        const p = people[key]; const res = await registerPatient(page, p)
        let { uhid, url } = res; if (res.ok && !uhid) { const f = await findPatient(page, p.phone); uhid = f.uhid; url = f.url ?? url }
        r.check({ id: `DC-30-${key}`, role: 'receptionist', screen: '/patients', title: `Register ${p.full_name}`, ok: res.ok }); if (res.ok) r.setPatient(key, { ...p, uhid, url })
      }
    })
    await withRole('doctor', async ({ page }) => {
      const plans: Array<[string, RegExp, string]> = [['selvi', /^General Ward/, 'Dengue fever with thrombocytopenia'], ['raju', /^ICU/, 'Acute anterior wall MI, cardiogenic shock'], ['arjun', /^General Ward/, 'Cellulitis right leg']]
      for (const [key, ward, reason] of plans) {
        const p = r.patient(key)
        await go(page, '/ipd'); await page.getByRole('button', { name: 'Admit Patient', exact: true }).first().click(); await wait(page, 1500)
        await admitDialog(page).locator('input[type=text], input[type=search]').first().fill(p.full_name.replace('E2E ', '')); await wait(page, 2000)
        await page.getByText(p.full_name).last().click(); await wait(page, 800)
        const adm = await fillAdmission(page, { doctor: account('doctor').name, ward, reason })
        const roomName = `${adm.room} ${adm.ward}`
        let res = await submitAdmission(page)
        // A man into a Female ward is warned first (BUG-056 fix); the doctor may still go ahead.
        if (p.gender === 'male' && /Female/i.test(roomName)) {
          const warned = /Female ward — the patient is male/.test(await admitDialog(page).innerText().catch(() => ''))
          r.check({ id: `DC-31-${key}`, role: D, screen: 'Admit Patient', title: `${p.full_name} (male) is warned before a Female ward bed`, ok: warned, bug: 'BUG-056', detail: roomName })
          if (warned) res = await submitAdmission(page)
        }
        r.check({ id: `DC-32-${key}`, role: D, screen: 'Admit Patient', title: `Admit ${p.full_name}`, ok: res.ok, detail: res.error || adm.bed })
        if (res.ok) r.setPatient(key, { ipd: res.url, bed: adm.bed })
      }
      // Against medical advice
      const s = r.patient('selvi')
      await openDischarge(page, s.ipd, 'Against medical advice')
      await page.getByPlaceholder(/Condition when taken home/).fill('Dengue day 5, platelets 42,000. Husband takes her home against advice; risks explained.')
      await page.getByRole('button', { name: 'Discharge Patient' }).click(); await wait(page, 5000)
      r.check({ id: 'DC-40', role: D, screen: '/ipd/[id] → Discharge', title: 'Discharge against medical advice (not held for the bill)', ok: /Against advice/.test(await text(page)) })
      const ama = await savePrint(r, page, `${s.ipd.replace('/ipd/', '/print/ipd/')}/discharge/pdf`, 'ama_summary')
      r.check({ id: 'DC-41', role: D, screen: '/print/ipd/discharge', title: 'AMA summary prints with the family\'s declaration page', ok: ama.pages >= 2, detail: `${ama.pages} pages` })
      // Death
      const rj = r.patient('raju')
      await openDischarge(page, rj.ipd, 'Death')
      await page.getByPlaceholder('As the doctor certifies it').fill('Cardiogenic shock due to acute anterior wall myocardial infarction')
      await page.getByPlaceholder(/Course in hospital/).fill('VF arrest; CPR per ACLS for 30 minutes — no return of circulation. Wife informed.')
      const dt = page.locator('input[type=datetime-local]:visible').last(); const go2 = page.getByRole('button', { name: 'Record death and discharge' })
      await dt.fill(local(minutesFromNow(600))); await go2.click(); await wait(page, 2500)
      r.check({ id: 'DC-42', role: D, screen: 'Discharge (death)', title: 'A time of death in the future is refused', ok: /cannot be in the future/.test(await bodyText(page)) })
      await dt.fill(local(minutesFromNow(-60 * 30))); await go2.click(); await wait(page, 2500)
      r.check({ id: 'DC-43', role: D, screen: 'Discharge (death)', title: 'A time of death before the admission is refused', ok: /before the admission/.test(await bodyText(page)) })
      // "Now", not a minute ago: Raju was admitted moments earlier, and a death
      // before the admission is (rightly) refused.
      await dt.fill(local(minutesFromNow(0))); await go2.click(); await wait(page, 5000)
      await go(page, rj.ipd)
      r.check({ id: 'DC-44', role: D, screen: '/ipd/[id]', title: 'Record Raju\'s death (body not held for the bill)', ok: /Died/.test(await text(page)) })
      // Absconded
      const a = r.patient('arjun')
      await openDischarge(page, a.ipd, 'Absconded')
      await page.locator('textarea:visible').last().fill('Not found at the 13:00 round; cannula removed. Security and police outpost informed.')
      await page.getByRole('button', { name: /Discharge Patient|Record/ }).last().click(); await wait(page, 5000)
      r.check({ id: 'DC-45', role: D, screen: '/ipd/[id]', title: 'Record Arjun as absconded', ok: /Absconded/.test(await text(page)) })
    })
    // ── Referral of the ICU patient ──
    const u = r.data.patients?.unknown
    if (!u?.ipd) { r.blocked({ id: 'DC-50', role: D, screen: '-', title: 'Refer the ICU patient out', detail: 'no ICU patient in this run' }); return }
    await withRole('doctor', async ({ page }) => {
      await go(page, u.ipd); await page.getByRole('button', { name: 'Refer Out', exact: true }).click(); await wait(page, 2000)
      await fill(page, 'Referred to — hospital', 'Government Medical College Hospital, Karur'); await fill(page, 'Department', 'Neurosurgery')
      await page.getByPlaceholder(/For CT brain and neurosurgical opinion/).fill('For CT brain and emergency craniotomy — neurosurgery not available here')
      await fill(page, 'Referred by', account('doctor').name); await fill(page, 'Registration number', 'TNMC 99999')
      await page.getByRole('button', { name: 'Write the letter' }).click(); await wait(page, 4000)
      const err = (await bodyText(page)).match(/duplicate key[^\n]*/)?.[0]
      r.check({ id: 'DC-50', role: D, screen: '/ipd/[id] → Refer Out', title: 'The referral letter saves on the first try', ok: !err, bug: 'BUG-058', detail: err })
      for (let i = 0; i < 4 && await page.getByRole('button', { name: 'Write the letter' }).isVisible().catch(() => false); i++) { await page.getByRole('button', { name: 'Write the letter' }).click(); await wait(page, 4000) }
      const href = await page.locator('a').filter({ hasText: /Print the letter/ }).first().getAttribute('href').catch(() => null)
      if (href) { const p = await savePrint(r, page, href, 'referral_letter'); r.check({ id: 'DC-51', role: D, screen: '/print/referral', title: 'Print the referral letter', ok: p.status === 200 && /pdf/.test(p.type) }) }
      await openDischarge(page, u.ipd, 'Referred to another hospital')
      await page.locator('textarea:visible').last().fill('Referred to GMCH Karur neurosurgery for CT brain and craniotomy; shifted ventilated by 108 with a staff nurse.')
      await page.getByRole('button', { name: /Discharge Patient/ }).click(); await wait(page, 5000)
      const msg = await dischargeMsg(page)
      r.check({ id: 'DC-52', role: D, screen: '/ipd/[id] → Discharge (referred)', title: 'An emergency referral is not held back for payment', ok: !msg, bug: 'BUG-059', detail: msg.slice(0, 140) })
      r.set('unknownReferredBlocked', !!msg)
      void lab; void pathOf
    })
  },
} satisfies Flow
