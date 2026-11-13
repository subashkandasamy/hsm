// General stores, PC&PNDT Form F, the patient portal, and phone-width layouts.
import { withRole, open, go, wait, text, bodyText, pathOf } from '../lib/browser'
import { lab, chooseIn, buttonIn } from '../lib/ui'
import { registerPatient, findPatient, bookAppointment, openBill, recordPayment } from '../lib/actions'
import { cast, minutesFromNow } from '../lib/people'
import { account, type Role } from '../lib/env'
import type { Flow, Run } from '../lib/run'

export default {
  name: 'more', title: '18 Inventory, Form F, portal, phone',
  async run(r: Run) {
    // ── General stores ──
    await withRole('accountant', async ({ page }) => {
      const A = 'accountant'
      await go(page, '/inventory'); const before = Number(((await text(page)).match(/IV cannula 20G \w+ (\d+)/)?.[1]) ?? NaN)
      await page.getByRole('button', { name: /^Orders/ }).click(); await wait(page, 1500)
      await page.getByRole('button', { name: 'New PO' }).click(); await wait(page, 1500)
      const sels = page.locator('select'); await chooseIn(sels.nth(0), /Kumaran|Chennai/)
      await chooseIn(sels.nth(1), 'IV cannula 20G'); await lab(page, 'Qty').locator('xpath=..').locator('input').first().fill('200'); await page.getByPlaceholder('0.00').first().fill('18')
      await page.getByRole('button', { name: 'Create PO' }).click(); await wait(page, 3000)
      const po = (await text(page)).match(/(PO-\d{4}-\d{5})[^₹]{0,40}Draft ₹([\d,]+\.\d\d)/)
      r.check({ id: 'MO-01', role: A, screen: '/inventory → New PO', title: 'Draft PO for 200 IV cannula @ ₹18 = ₹3,600', ok: po?.[2] === '3,600.00', detail: po?.[0] })
      if (po) {
        const row = () => page.locator('tr').filter({ hasText: po[1] }).first()
        await row().getByRole('button', { name: 'Mark Ordered' }).click(); await wait(page, 2500)
        await row().getByRole('button', { name: 'Receive' }).click(); await wait(page, 1500)
        const q = page.getByPlaceholder('0', { exact: true }).first(); const exp = page.locator('input[type=date]:visible').first()
        await q.fill('250'); await exp.fill('2026-01-01')
        await page.getByRole('button', { name: 'Confirm Receipt' }).click(); await wait(page, 2500)
        r.check({ id: 'MO-02', role: A, screen: '/inventory → Receive', title: 'Receiving more than ordered, with a past expiry, is refused', ok: await page.getByRole('button', { name: 'Confirm Receipt' }).isVisible().catch(() => false) })
        await q.fill('200'); await page.getByPlaceholder('optional').first().fill(`IVC-${r.tag}`); await exp.fill('2029-09-30')
        await page.getByRole('button', { name: 'Confirm Receipt' }).click(); await wait(page, 3000)
        await page.getByRole('button', { name: /^Items/ }).click(); await wait(page, 2000)
        const after = Number(((await text(page)).match(/IV cannula 20G \w+ (\d+)/)?.[1]) ?? NaN)
        r.check({ id: 'MO-03', role: A, screen: '/inventory', title: `Receive the PO — IV cannula ${before} → ${before + 200}`, ok: after === before + 200, detail: `now ${after}` })
      }
    })
    // ── Form F: a pregnant woman's ultrasound ──
    const priya = cast(r).priya
    await withRole('receptionist', async ({ page }) => {
      // A refused registration (re-run: already registered) has no UHID of its own —
      // the one on the page then belongs to someone else.
      const res = await registerPatient(page, priya); let uhid = res.ok ? res.uhid : undefined
      // On a re-run she is already registered — find her by phone.
      if (!uhid) uhid = (await findPatient(page, priya.phone)).uhid
      if (uhid) r.setPatient('priya', { ...priya, uhid })
      const at = minutesFromNow(20); at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5, 0, 0)
      await bookAppointment(page, { full_name: priya.full_name, uhid: uhid! }, account('doctor').name, at, 'Antenatal visit, 10 weeks', 'General Medicine')
      await go(page, '/appointments'); await page.locator('tr').filter({ hasText: priya.full_name }).first().getByRole('button', { name: 'Check In' }).click().catch(() => {}); await wait(page, 2500)
      await openBill(page, priya.full_name); const due = (await text(page)).match(/Balance Due ₹([\d,]+\.\d\d)/)?.[1]?.replace(/,/g, '')
      if (due && Number(due) > 0) await recordPayment(page, due, 'Cash')
    })
    await withRole('doctor', async ({ page }) => {
      await go(page, '/opd'); await (await buttonIn(page, 'Start Consultation', [priya.full_name])).click(); await page.waitForURL(/\/opd\/[0-9a-f-]{36}/); await wait(page, 2500)
      await page.getByRole('button', { name: 'Order Imaging' }).click(); await wait(page, 1500)
      const ix = page.getByRole('heading', { name: /Order Imaging/ }).last().locator('xpath=ancestor::*[.//button[starts-with(normalize-space(),"Order")]][1]')
      await ix.getByText(/Obstetric Ultrasound/i).first().click(); await ix.getByRole('button', { name: /^Order/ }).last().click(); await wait(page, 3000)
    })
    await withRole('receptionist', async ({ page }) => {
      await openBill(page, priya.full_name, /Radiology/).catch(() => {}); const due = (await text(page)).match(/Balance Due ₹([\d,]+\.\d\d)/)?.[1]?.replace(/,/g, '')
      if (due && Number(due) > 0) await recordPayment(page, due, 'UPI')
    })
    await withRole('lab_tech', async ({ page }) => {
      await go(page, '/radiology'); const b = await buttonIn(page, 'Mark Performed', [priya.full_name]).catch(() => null)
      if (b) { await b.click(); await wait(page, 3000) }
    })
    await withRole('doctor', async ({ page }) => {
      const D = 'doctor'
      await go(page, '/radiology'); await page.getByRole('button', { name: /^Performed/ }).click(); await wait(page, 2000)
      const f = await buttonIn(page, 'Form F', [priya.full_name]).catch(() => null)
      r.check({ id: 'MO-10', role: D, screen: '/radiology', title: 'A woman\'s performed scan offers "Form F"', ok: !!f })
      if (!f) return
      await f.click(); await page.waitForURL(/\/pcpndt\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {}); await wait(page, 3000)
      // The copied details sit in the form's boxes, not in the page text.
      const boxes = (await page.locator('main input, main textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).join(' | ')
      r.check({ id: 'MO-11', role: D, screen: '/pcpndt/[id]', title: 'Form F opens with the patient copied in', ok: /Form F/.test(await text(page)) && boxes.includes(priya.full_name) })
      await page.getByRole('button', { name: 'Complete and lock' }).click(); await wait(page, 2500)
      r.check({ id: 'MO-12', role: D, screen: '/pcpndt/[id]', title: 'Form F with blank columns cannot be completed and locked', ok: /must hold an answer|blank/i.test(await bodyText(page)) })
      await go(page, '/pcpndt')
      r.check({ id: 'MO-13', role: D, screen: '/pcpndt', title: 'The unfinished Form F shows on the register', ok: (await text(page)).includes(priya.full_name) && /unfinished/i.test(await text(page)) })
    })
    // ── Patient portal ──
    {
      const s = await open({ mobile: true }); const page = s.page
      try {
        const portal = (process.env.E2E_PORTAL_URL ?? 'https://my.uyirly.com')
        await page.goto(portal, { waitUntil: 'domcontentloaded', timeout: 60000 }); await wait(page, 3500)
        await page.getByPlaceholder('Email address').fill('e2e.nobody@example.com'); await page.getByPlaceholder('Password').fill('WrongPass#123')
        await page.getByRole('button', { name: 'Sign in' }).click(); await wait(page, 3500)
        r.check({ id: 'MO-20', role: 'patient', screen: 'portal', title: 'Portal sign-in with a wrong password says so', ok: /Incorrect email or password/i.test(await bodyText(page)) })
        await page.getByRole('button', { name: 'Create an account' }).click().catch(() => {}); await wait(page, 2500)
        await page.getByRole('button', { name: /Create account/ }).last().click().catch(() => {}); await wait(page, 1500)
        r.check({ id: 'MO-21', role: 'patient', screen: 'portal → Create account', title: 'Create-account refuses an empty form', ok: /Enter your full name|required/i.test(await bodyText(page)) })
        r.check({ id: 'MO-22', role: 'patient', screen: 'portal', title: 'Portal fits a phone screen', ok: !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) })
      } finally { await s.close() }
      r.blocked({ id: 'MO-23', role: 'patient', screen: 'portal', title: 'Signed-in portal (records, reports, bills)', detail: 'needs a portal account with an email the suite can read' })
    }
    // ── Phone width ──
    const PLAN: Record<string, string[]> = {
      doctor: ['/dashboard', '/opd', '/ipd', '/emergency', '/radiology'], nurse: ['/wards', '/scheduling'],
      receptionist: ['/appointments', '/patients', '/billing', '/billing/cash-book'], lab_tech: ['/lab', '/blood'], pharmacist: ['/pharmacy'], accountant: ['/accounts', '/insurance'],
    }
    const lak = r.data.patients?.lakshmi?.ipd; if (lak) PLAN.doctor.push(lak)
    for (const [role, routes] of Object.entries(PLAN)) {
      await withRole(role as Role, async ({ page }) => {
        for (const route of routes) {
          await go(page, route)
          const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
          r.check({ id: `MO-30-${role}-${route.replace(/[0-9a-f-]{36}/, 'id').replace(/\//g, '_')}`, role, screen: route.replace(/[0-9a-f-]{36}/, '[id]'), title: `Phone width: ${route.replace(/[0-9a-f-]{36}/, '[id]')} has no sideways scroll`, ok: sw[0] <= sw[1] + 2, detail: `${sw[0]} / ${sw[1]} px` })
        }
      }, { mobile: true })
    }
    void pathOf
  },
} satisfies Flow
