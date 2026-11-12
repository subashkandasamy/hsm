// Blood bank: donor unit → screening → components; request, cross-match,
// issue, transfusion, reaction; expiry housekeeping; camps.
import { withRole, go, wait, text, bodyText } from '../lib/browser'
import { pick, fill, buttonIn, chooseIn, lab } from '../lib/ui'
import { ymd, local, minutesFromNow } from '../lib/people'
import type { Flow, Run } from '../lib/run'

export default {
  name: 'blood-bank', title: '14 Blood bank',
  async run(r: Run) {
    const u = r.patient('unknown')
    const bag = (n: number) => `E2E-${r.tag}-${n}`
    const today = new Date(), in35 = new Date(Date.now() + 35 * 864e5), past = new Date(Date.now() - 10 * 864e5)
    await withRole('lab_tech', async ({ page }) => {
      const LT = 'lab_tech'
      const addUnit = async (b: string, exp: Date, donor: 'new' | 'existing') => {
        await go(page, '/blood'); await page.getByRole('button', { name: 'Add Unit' }).click(); await wait(page, 1500)
        await pick(page, 'Blood Group *', 'B+'); await pick(page, 'Component *', 'Whole Blood')
        await page.getByPlaceholder('e.g. BB-2026-0142').fill(b); await page.getByPlaceholder('e.g. 350').fill('450')
        const d = page.locator('input[type=date]:visible'); await d.nth(0).fill(ymd(today)); await d.nth(1).fill(ymd(exp))
        if (donor === 'new') { await page.getByRole('button', { name: 'New Donor' }).click(); await page.getByPlaceholder('Donor full name').fill(`E2E Donor ${r.tag}`) }
        else { await page.getByRole('button', { name: 'Existing' }).click(); await wait(page, 600); const s = page.locator('select').filter({ has: page.locator('option', { hasText: `E2E Donor ${r.tag}` }) }); if (await s.count()) await chooseIn(s.first(), `E2E Donor ${r.tag}`) }
        await page.getByRole('button', { name: 'Add Unit' }).last().click(); await wait(page, 3000)
        return await page.getByPlaceholder('Donor full name').isVisible().catch(() => false) || await page.getByPlaceholder('e.g. BB-2026-0142').isVisible().catch(() => false)
      }
      const refused = await addUnit(bag(0), past, 'new')
      r.check({ id: 'BB-01', role: LT, screen: '/blood → Add Unit', title: 'A unit expiring before it was collected is refused', ok: refused, bug: 'BUG-044' })
      await addUnit(bag(1), in35, refused ? 'new' : 'existing')
      await page.getByRole('button', { name: /^Units/ }).click(); await wait(page, 2000)
      const row1 = (await page.locator('tr').filter({ hasText: bag(1) }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
      r.check({ id: 'BB-02', role: LT, screen: '/blood → Units', title: 'New B+ whole blood unit starts Unscreened', ok: /Unscreened/.test(row1), detail: row1 })
      // Screening
      await page.locator('tr').filter({ hasText: bag(1) }).first().getByRole('button', { name: 'Screen' }).click(); await wait(page, 1500)
      const nr = page.getByRole('button', { name: 'Non-reactive', exact: true }); const save = page.getByRole('button', { name: 'Save Screening' })
      for (let i = 0; i < 4; i++) await nr.nth(i).click()
      r.check({ id: 'BB-03', role: LT, screen: '/blood → Screen', title: 'Save Screening stays disabled until all 5 markers are marked', ok: await save.isDisabled() })
      await nr.nth(4).click(); await save.click(); await wait(page, 3000)
      r.check({ id: 'BB-04', role: LT, screen: '/blood → Screen', title: 'All non-reactive → unit released to stock', ok: /Screened/.test(await page.locator('tr').filter({ hasText: bag(1) }).first().innerText()) })
      // Separate
      await page.locator('tr').filter({ hasText: bag(1) }).first().getByRole('button', { name: 'Separate' }).click(); await wait(page, 1500)
      const sd = page.getByText(/^Separate Components/).first().locator('xpath=ancestor::div[.//button[normalize-space()="Cancel"]][1]')
      await sd.getByRole('button', { name: 'Separate', exact: true }).click(); await wait(page, 4000)
      const sepErr = (await sd.innerText().catch(() => '')).match(/[^\n]*(violates|error|null value)[^\n]*/i)?.[0]
      const rows = (await page.locator('tr').filter({ hasText: bag(1) }).allInnerTexts()).join(' | ')
      r.check({ id: 'BB-05', role: LT, screen: '/blood → Separate', title: 'Separate whole blood into PRBC, FFP and platelets', ok: /PRBC/.test(rows) && /Plasma/.test(rows) && /Platelets/.test(rows), bug: 'BUG-045', detail: sepErr ?? rows.slice(0, 160) })
      await page.keyboard.press('Escape').catch(() => {})
      // Charges
      await go(page, '/blood'); await page.getByRole('button', { name: 'Charges' }).click(); await wait(page, 2000)
      const inputs = page.locator('input[type=number][placeholder="0.00"]:visible'); const saves = page.getByRole('button', { name: 'Save', exact: true })
      await inputs.nth(1).fill('-100'); await saves.nth(1).click(); await wait(page, 2000)
      r.check({ id: 'BB-06', role: LT, screen: '/blood → Charges', title: 'A negative processing charge is refused with a message', ok: /(0 or more|negative|greater than|at least)/i.test(await bodyText(page)), bug: 'BUG-047' })
      for (const [i, v] of [[0, '1050'], [1, '1450'], [2, '400'], [3, '400']] as const) { await inputs.nth(i).fill(v); await saves.nth(i).click(); await wait(page, 2000) }
      await page.getByRole('button', { name: 'Done' }).click(); await wait(page, 800)
      await page.getByRole('button', { name: 'Charges' }).click(); await wait(page, 2000)
      const vals = await page.locator('input[type=number][placeholder="0.00"]:visible').evaluateAll((e) => e.map((x) => (x as HTMLInputElement).value))
      r.check({ id: 'BB-07', role: LT, screen: '/blood → Charges', title: 'Processing charges kept (whole 1050, PRBC 1450, FFP 400, platelets 400)', ok: vals.map(Number).join(',') === '1050,1450,400,400', detail: vals.join(', ') })
      await page.getByRole('button', { name: 'Done' }).click().catch(() => {})
    })
    // Requests by the doctor
    await withRole('doctor', async ({ page }) => {
      const D = 'doctor'
      const req = async (units: string, urgency: string, why: string) => {
        await go(page, u.ipd); await page.getByRole('button', { name: 'Request Blood' }).click(); await wait(page, 1500)
        const opts = await lab(page, 'Blood Group *').locator('xpath=..').locator('select option').allInnerTexts()
        await pick(page, 'Blood Group *', 'B+'); await pick(page, 'Component *', 'Packed RBC (PRBC)')
        await fill(page, 'Units Required *', units); await pick(page, 'Urgency *', urgency)
        await page.getByPlaceholder('e.g. Anaemia, surgery, trauma').fill(why)
        await page.getByRole('button', { name: 'Raise Request' }).click(); await wait(page, 3500)
        return opts
      }
      const opts = await req('2', 'Urgent', `Pre-op craniotomy ${r.tag}-A`)
      r.check({ id: 'BB-10', role: D, screen: '/ipd/[id] → Request Blood', title: 'Request offers "not known — group & cross-match" for an unidentified patient', ok: opts.some((o) => /unknown|not known|group/i.test(o)), bug: 'BUG-046', detail: opts.join(' | ') })
      await req('1', 'Emergency', `Intra-op loss ${r.tag}-B`)
      await go(page, '/blood'); await page.getByRole('button', { name: /^Requests/ }).click(); await wait(page, 2000)
      const t = await text(page)
      r.check({ id: 'BB-11', role: D, screen: '/blood → Requests', title: 'Both requests (2 units urgent, 1 unit emergency) listed', ok: t.includes(`${r.tag}-A`) && t.includes(`${r.tag}-B`) })
    })
    // Cross-match, issue
    await withRole('lab_tech', async ({ page }) => {
      const LT = 'lab_tech'
      const openReq = async () => { await go(page, '/blood'); await page.getByRole('button', { name: /^Requests/ }).click(); await wait(page, 2000) }
      await openReq()
      await (await buttonIn(page, 'Cross-match', [`${r.tag}-A`])).click(); await wait(page, 2000)
      const units = (await page.getByRole('button').filter({ hasText: /Expires:/ }).allInnerTexts()).join(' | ')
      r.note({ id: 'BB-20', role: LT, screen: '/blood → Cross-match', title: 'Units offered for cross-match (in-date, compatible only)', detail: units.slice(0, 200) })
      const preMajor = await page.getByRole('button', { name: 'Compatible', exact: true }).first().evaluate((b) => b.getAttribute('aria-pressed') === 'true' || /bg-|selected|active/.test(b.className) && getComputedStyle(b).color !== getComputedStyle(b.parentElement!).color).catch(() => false)
      await page.getByRole('button').filter({ hasText: /Expires:/ }).first().click(); await wait(page, 300)
      await page.getByRole('button', { name: 'Record Cross-match' }).click(); await wait(page, 2500)
      const recorded = !(await page.getByRole('button', { name: 'Record Cross-match' }).isVisible().catch(() => false))
      r.check({ id: 'BB-21', role: LT, screen: '/blood → Cross-match', title: 'A cross-match cannot be recorded without choosing the result and sample number', ok: !recorded && !preMajor, bug: 'BUG-049', detail: recorded ? 'recorded on one click' : 'refused' })
      if (!recorded) {
        await page.getByPlaceholder('e.g. XM-2026-0042').fill(`XM-${r.tag}-1`)
        await page.getByRole('button', { name: 'Compatible', exact: true }).nth(0).click(); await page.getByRole('button', { name: 'Compatible', exact: true }).nth(1).click()
        await page.getByRole('button', { name: 'Record Cross-match' }).click(); await wait(page, 3500)
      }
      await openReq()
      const xmMore = await buttonIn(page, 'Cross-match', [`${r.tag}-A`]).then(() => true).catch(() => false)
      // Issue unit 1
      await (await buttonIn(page, 'Issue Unit', [`${r.tag}-A`])).click(); await wait(page, 2000)
      const idlg = page.getByText(/^Issue Blood — /).first().locator('xpath=ancestor::div[.//button[normalize-space()="Cancel"]][1]')
      await idlg.getByRole('button').filter({ hasText: /Expires:/ }).first().click(); await wait(page, 300)
      await idlg.getByRole('button', { name: 'Issue Unit' }).click(); await wait(page, 4000)
      await openReq()
      const canSecond = xmMore || await buttonIn(page, 'Cross-match', [`${r.tag}-A`]).then(() => true).catch(() => false)
      r.check({ id: 'BB-22', role: LT, screen: '/blood → Requests', title: 'A 2-unit request lets the second unit be cross-matched after the first', ok: canSecond, bug: 'BUG-048' })
      // 1-unit request: full path
      if (await buttonIn(page, 'Cross-match', [`${r.tag}-B`]).then(() => true).catch(() => false)) {
        await (await buttonIn(page, 'Cross-match', [`${r.tag}-B`])).click(); await wait(page, 2000)
        await page.getByRole('button').filter({ hasText: /Expires:/ }).first().click()
        await page.getByPlaceholder('e.g. XM-2026-0042').fill(`XM-${r.tag}-2`)
        await page.getByRole('button', { name: 'Compatible', exact: true }).nth(0).click(); await page.getByRole('button', { name: 'Compatible', exact: true }).nth(1).click()
        await page.getByRole('button', { name: 'Record Cross-match' }).click(); await wait(page, 3500)
        await openReq()
        await (await buttonIn(page, 'Issue Unit', [`${r.tag}-B`])).click(); await wait(page, 2000)
        const d2 = page.getByText(/^Issue Blood — /).first().locator('xpath=ancestor::div[.//button[normalize-space()="Cancel"]][1]')
        r.check({ id: 'BB-23', role: LT, screen: '/blood → Issue', title: 'Issue dialog shows the ₹1,450 processing charge', ok: /₹1450|₹1,450/.test(await d2.innerText()) })
        await d2.getByRole('button').filter({ hasText: /Expires:/ }).first().click(); await d2.getByRole('button', { name: 'Issue Unit' }).click(); await wait(page, 4000)
        await openReq()
        r.check({ id: 'BB-24', role: LT, screen: '/blood → Requests', title: 'The 1-unit request is issued', ok: new RegExp(`1 unit required issued[^#]{0,200}${r.tag}-B`).test(await text(page)) })
      }
    })
    // Transfusion by the nurse
    await withRole('nurse', async ({ page }) => {
      const N = 'nurse'
      await go(page, '/blood'); await page.getByRole('button', { name: /^Requests/ }).click(); await wait(page, 2000)
      const tb = await buttonIn(page, 'Transfusion', [`${r.tag}-A`]).then(() => true).catch(() => false)
      r.check({ id: 'BB-30', role: N, screen: '/blood → Requests', title: 'The unit issued on the 2-unit request can have its transfusion recorded', ok: tb, bug: 'BUG-048' })
      const b = await buttonIn(page, 'Transfusion', [`${r.tag}-B`]).catch(() => null)
      if (!b) { r.check({ id: 'BB-31', role: N, screen: '/blood', title: 'Record the transfusion', ok: false, detail: 'no Transfusion button' }); return }
      await b.click(); await wait(page, 2000)
      const start = minutesFromNow(-30)
      const dts = page.locator('input[type=datetime-local]:visible')
      await dts.nth(0).fill(local(start)); await dts.nth(1).fill(local(minutesFromNow(-90)))
      await page.getByPlaceholder('BP', { exact: true }).nth(0).fill('108/70'); await page.getByPlaceholder('Pulse', { exact: true }).nth(0).fill('104'); await page.getByPlaceholder('Temp', { exact: true }).nth(0).fill('37.2')
      await page.getByRole('button', { name: 'Record Transfusion' }).click(); await wait(page, 2500)
      const after = await bodyText(page)
      const saved = /Transfused/.test(after)
      r.check({ id: 'BB-31', role: N, screen: '/blood → Transfusion', title: 'A transfusion that ends before it starts is refused', ok: !saved, bug: 'BUG-050' })
      if (!saved) { await dts.nth(1).fill(local(minutesFromNow(-2))); await page.getByRole('button', { name: 'Record Transfusion' }).click(); await wait(page, 3000) }
      const shownT = (await bodyText(page)).match(/Transfused \d+ \w+, (\d\d:\d\d [ap]m)/)?.[1]
      const want = start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()
      r.check({ id: 'BB-32', role: N, screen: '/blood → Transfusion', title: 'The transfusion time is shown as entered (no 5½-hour shift)', ok: !!shownT && shownT === want, bug: 'BUG-050', detail: `entered ${want}, shown ${shownT}` })
      await page.getByRole('button', { name: '+ Report Reaction' }).click(); await wait(page, 1200)
      const sels = page.locator('select')
      await chooseIn(sels.filter({ has: page.locator('option', { hasText: /febrile/i }) }).first(), /febrile/i); await chooseIn(sels.filter({ has: page.locator('option', { hasText: /^mild/i }) }).first(), /^mild/i)
      await page.getByPlaceholder('Action taken').fill('Stopped, IV paracetamol, bag returned to blood bank')
      await page.getByRole('button', { name: 'Save Reaction' }).click(); await wait(page, 3000)
      r.check({ id: 'BB-33', role: N, screen: '/blood → Transfusion', title: 'Report a mild febrile reaction', ok: /febrile · mild/i.test(await bodyText(page)) })
    })
    // Housekeeping and camps
    await withRole('lab_tech', async ({ page }) => {
      await go(page, '/blood'); await page.getByRole('button', { name: /^Units/ }).click(); await wait(page, 2000)
      const stale = (await page.locator('tr').allInnerTexts()).filter((t) => /available/.test(t)).filter((t) => { const d = t.match(/(\d\d)-(\d\d)-(\d{4})/); return d ? new Date(`${d[3]}-${d[2]}-${d[1]}`).getTime() < new Date(ymd(new Date())).getTime() : false })
      r.check({ id: 'BB-40', role: 'lab_tech', screen: '/blood → Units', title: 'No expired unit is listed as "available"', ok: stale.length === 0, bug: 'BUG-051', detail: stale.slice(0, 3).join(' | ').replace(/\s+/g, ' ').slice(0, 200) })
      await page.getByRole('button', { name: 'Expire Old Units' }).click(); await wait(page, 3000)
      await page.getByRole('button', { name: /^Donors/ }).click(); await wait(page, 1500)
      await page.getByRole('button', { name: 'New Camp' }).click(); await wait(page, 1200)
      await page.getByPlaceholder('e.g. Republic Day Blood Drive').fill(`E2E Blood Drive ${r.tag}`)
      await page.locator('input[type=date]:visible').last().fill(ymd(new Date(Date.now() + 14 * 864e5)))
      await page.getByPlaceholder('Venue').fill('Govt Arts College, Karur')
      await page.getByRole('button', { name: 'Create Camp' }).click(); await wait(page, 3000)
      const t = await text(page)
      r.check({ id: 'BB-41', role: 'lab_tech', screen: '/blood → Donors', title: 'Create a donation camp', ok: t.includes(`E2E Blood Drive ${r.tag}`) })
      r.check({ id: 'BB-42', role: 'lab_tech', screen: '/blood → Donors', title: 'The new donor is listed as deferred after donating', ok: new RegExp(`E2E Donor ${r.tag}[^#]{0,80}Deferred`).test(t) })
    })
  },
} satisfies Flow
