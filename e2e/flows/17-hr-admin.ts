// HR and admin: staff accounts, attendance, roster, leave, roles & access,
// settings screens, activity log, counter PIN.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, pathOf } from '../lib/browser'
import { chooseIn } from '../lib/ui'
import { ymd } from '../lib/people'
import { account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const staffForm = (page: Page) => page.getByRole('heading', { name: 'Add Staff Member' }).locator('xpath=ancestor::*[.//button[normalize-space()="Create Account"]][1]')
async function newStaff(page: Page, v: { name?: string; role?: string; email?: string; phone?: string }) {
  await go(page, '/staff'); await page.getByRole('button', { name: 'Add Staff', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Add Staff Member' }).waitFor({ timeout: 10000 })
  const f = staffForm(page)
  if (v.name != null) await f.getByPlaceholder('Dr. Aanya Sharma').fill(v.name)
  if (v.role) await f.locator('select').first().selectOption(v.role)
  if (v.email != null) await f.getByPlaceholder('staff@hospital.com').fill(v.email)
  if (v.phone != null) await f.getByPlaceholder('10-digit mobile').fill(v.phone)
  await f.getByRole('button', { name: 'Create Account', exact: true }).click(); await wait(page, 2500)
  return /Temporary Password/.test(await bodyText(page))
}

async function receptionistCan(path: string) {
  return withRole('receptionist', async ({ page }) => { await go(page, path); const menu = await page.locator('nav, aside').first().innerText().catch(() => ''); return { path: pathOf(page), inMenu: /Inventory/.test(menu) , denied: /don.t have access to this page/i.test(await page.locator('main').innerText().catch(() => '')) } })
}
async function setReceptionistInventory(on: boolean) {
  await withRole('admin', async ({ page }) => {
    await go(page, '/settings/access')
    await page.locator('main').getByText(/^Receptionist/).locator('visible=true').first().click(); await wait(page, 1800)
    const sw = page.locator('main [role=switch], main input[type=checkbox]').nth(3)
    const cur = (await sw.getAttribute('aria-checked')) ?? String(await sw.isChecked())
    if ((cur === 'true') !== on) { await sw.click(); await wait(page, 2500) }
  })
}

export default {
  name: 'hr-admin', title: '17 HR and admin',
  async run(r: Run) {
    const temp = { name: `E2E Temp Nurse ${r.tag}`, email: `e2e.temp.${r.tag.toLowerCase()}@example.com` }
    await withRole('admin', async ({ page }) => {
      const A = 'admin'
      await go(page, '/staff'); await page.getByRole('button', { name: 'Add Staff', exact: true }).first().click(); await wait(page, 1000)
      await staffForm(page).getByRole('button', { name: 'Create Account', exact: true }).click(); await wait(page, 1500)
      r.check({ id: 'HR-01', role: A, screen: '/staff → Add Staff', title: 'Create with an empty form is refused', ok: !/Temporary Password/.test(await bodyText(page)) })
      r.check({ id: 'HR-02', role: A, screen: '/staff → Add Staff', title: 'An invalid email is refused', ok: !(await newStaff(page, { name: temp.name, role: 'nurse', email: 'not-an-email' })) })
      const short = await newStaff(page, { name: `${temp.name} SP`, role: 'nurse', email: `sp.${temp.email}`, phone: '12345' })
      r.check({ id: 'HR-03', role: A, screen: '/staff → Add Staff', title: 'A 5-digit phone is refused', ok: !short, bug: 'BUG-002' })
      r.check({ id: 'HR-04', role: A, screen: '/staff → Add Staff', title: 'An email already in use is refused', ok: !(await newStaff(page, { name: temp.name, role: 'nurse', email: account('admin').email })) })
      r.check({ id: 'HR-05', role: A, screen: '/staff → Add Staff', title: `Create a nurse account (${temp.name})`, ok: await newStaff(page, { name: temp.name, role: 'nurse', email: temp.email, phone: `9${r.tag.replace(/\D/g, '').slice(-7)}77` }) })
    })
    await withRole('hr', async ({ page }) => {
      const H = 'hr'
      const editBtn = async (title: string) => { await go(page, '/staff'); await page.getByRole('button', { name: /^Nurse \(/ }).click(); await wait(page, 1500); const row = page.locator('tr:visible, div:visible').filter({ hasText: temp.name }).filter({ has: page.locator(`button[title="${title}"]`) }).last(); await row.locator(`button[title="${title}"]`).locator('visible=true').first().click(); await wait(page, 1500) }
      await editBtn('Edit')
      await page.locator('label', { hasText: /Phone/ }).locator('xpath=..').locator('input').first().fill('12345')
      await page.getByRole('button', { name: /^Save Changes/ }).click(); await wait(page, 2500)
      r.check({ id: 'HR-10', role: H, screen: '/staff → Edit', title: 'Editing a phone to 5 digits is refused', ok: !/\b12345\b/.test(await text(page)), bug: 'BUG-002' })
      await page.keyboard.press('Escape').catch(() => {})
      await editBtn('Deactivate')
      const conf = (await bodyText(page)).match(/Deactivate staff member\?[^.]*\./)?.[0]
      await page.getByRole('button', { name: 'Deactivate', exact: true }).last().click(); await wait(page, 3000)
      await go(page, '/staff'); await page.getByRole('button', { name: /^Nurse \(/ }).click(); await wait(page, 1500)
      const rowT = (await page.locator('tr:visible').filter({ hasText: temp.name }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
      r.check({ id: 'HR-11', role: H, screen: '/staff → Deactivate', title: 'Deactivate the temp nurse after a confirm', ok: !!conf && (!rowT || /Inactive/i.test(rowT)), detail: conf })
      // Attendance
      await go(page, '/staff'); await page.getByRole('button', { name: 'Attendance', exact: true }).click(); await wait(page, 2500)
      const mark = async (who: string, what: string) => { const row = page.locator('main div, main tr').filter({ hasText: new RegExp('^' + who.replace(/[()]/g, '\\$&')) }).filter({ has: page.getByText(what, { exact: true }) }).last(); await row.getByText(what, { exact: true }).first().click(); await wait(page, 1500) }
      await mark(account('nurse').name, 'Present'); await mark(account('doctor').name, 'Present'); await mark(account('receptionist').name, 'Half Day'); await mark(account('lab_tech').name, 'Leave')
      await go(page, '/staff'); await page.getByRole('button', { name: 'Attendance', exact: true }).click(); await wait(page, 2500)
      const sum = (await text(page)).match(/(\d+) Present (\d+) Absent (\d+) Leave (\d+) Half/)
      r.check({ id: 'HR-12', role: H, screen: '/staff → Attendance', title: 'Attendance marked (2 present, 1 leave, 1 half day) and kept after reload', ok: !!sum && Number(sum[1]) >= 2 && Number(sum[3]) >= 1 && Number(sum[4]) >= 1, detail: sum?.[0] })
      // Roster next week
      await go(page, '/scheduling'); await wait(page, 1500)
      await page.locator('main button').filter({ has: page.locator('svg') }).filter({ hasText: /^$/ }).nth(1).click().catch(() => {}); await wait(page, 2000)
      const add = page.locator('select').filter({ has: page.locator('option', { hasText: account('nurse').name }) }).first()
      if (await add.count()) { await chooseIn(add, account('nurse').name); await page.getByRole('button', { name: 'Add', exact: true }).first().click(); await wait(page, 2500) }
      const cells = page.locator('tr').filter({ hasText: account('nurse').name }).first().locator('select')
      await cells.nth(0).selectOption({ label: 'Morning' }).catch(() => {}); await wait(page, 1000); await cells.nth(1).selectOption({ label: 'Night' }).catch(() => {}); await wait(page, 1000)
      await page.getByRole('button', { name: 'Publish' }).click(); await wait(page, 2500)
      const c = page.locator('[role=dialog]').getByRole('button', { name: /Publish|Confirm/ }).last(); if (await c.count()) { await c.click(); await wait(page, 2500) }
      r.check({ id: 'HR-13', role: H, screen: '/scheduling → Roster', title: 'Roster the nurse next week (Mon morning, Tue night) and publish', ok: /Morning|Night/.test(await page.locator('tr').filter({ hasText: account('nurse').name }).first().innerText().catch(() => '')) })
    })
    // Leave
    const from = new Date(Date.now() + 40 * 864e5), to = new Date(Date.now() + 41 * 864e5)
    await withRole('nurse', async ({ page }) => {
      await go(page, '/scheduling'); await page.getByRole('button', { name: 'Leave', exact: true }).click(); await wait(page, 1500)
      await page.getByRole('button', { name: 'Request leave' }).click(); await wait(page, 1500)
      const d = page.locator('input[type=date]:visible')
      await d.nth(0).fill(ymd(to)); await d.nth(1).fill(ymd(from))
      await page.getByRole('button', { name: 'Submit' }).last().click(); await wait(page, 2500)
      r.check({ id: 'HR-20', role: 'nurse', screen: '/scheduling → Leave', title: 'Leave ending before it starts is refused', ok: /End date cannot be before start date/i.test(await bodyText(page)) })
      await d.nth(0).fill(ymd(from)); await d.nth(1).fill(ymd(to))
      await page.locator('label', { hasText: /^Reason/ }).locator('xpath=..').locator('input, textarea').first().fill(`Family function ${r.tag}`).catch(() => {})
      await page.getByRole('button', { name: 'Submit' }).last().click(); await wait(page, 3000)
      r.check({ id: 'HR-21', role: 'nurse', screen: '/scheduling → Leave', title: 'Request 2 days casual leave', ok: /Pending/.test(await text(page)) })
    })
    await withRole('hr', async ({ page }) => {
      await go(page, '/scheduling'); await page.getByRole('button', { name: 'Leave', exact: true }).click(); await wait(page, 2000)
      const t0 = await text(page)
      r.check({ id: 'HR-22', role: 'hr', screen: '/scheduling → Leave', title: 'HR sees the reason the nurse gave', ok: t0.includes(r.tag) })
      const row = page.locator('div, tr').filter({ hasText: account('nurse').name }).filter({ hasText: 'Pending' }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last()
      await row.getByRole('button', { name: 'Approve' }).click().catch(() => {}); await wait(page, 2500)
      r.check({ id: 'HR-23', role: 'hr', screen: '/scheduling → Leave', title: 'HR approves the leave', ok: new RegExp(`${account('nurse').name}[^#]{0,80}Approved`).test(await text(page)) })
    })
    // Roles & access: grant, check, revoke, check
    await setReceptionistInventory(true)
    const g = await receptionistCan('/inventory')
    r.check({ id: 'HR-30', role: 'admin', screen: '/settings/access', title: 'Grant Inventory to the front desk → they can open it', ok: g.path === '/inventory' && g.inMenu, detail: JSON.stringify(g) })
    await setReceptionistInventory(false)
    const v = await receptionistCan('/inventory')
    r.check({ id: 'HR-31', role: 'admin', screen: '/settings/access', title: 'Revoke it → Inventory leaves their menu and the page says no access', ok: (v.path !== '/inventory' || !!v.denied) && !v.inMenu, detail: JSON.stringify(v) })
    // Settings sweep + audit
    await withRole('admin', async (s) => {
      const page = s.page
      for (const route of ['/settings', '/hr']) {
        await go(page, route)
        r.check({ id: `HR-40${route.replace('/', '-')}`, role: 'admin', screen: route, title: `${route} is not a "Coming in a later phase" placeholder`, ok: !/Coming in a later phase/i.test(await text(page)), bug: 'BUG-069' })
      }
      for (const route of ['/settings/profile', '/settings/departments', '/settings/tariffs', '/settings/billing', '/settings/ipd-billing', '/settings/modules', '/settings/counters', '/settings/devices', '/settings/phrases', '/getting-started', '/referrals', '/notifications', '/account/subscription']) {
        const before = s.errors.length; await go(page, route)
        const errs = s.errors.slice(before).filter((e) => !/#418/.test(e))
        r.check({ id: `HR-41${route.replace(/\//g, '-')}`, role: 'admin', screen: route, title: `Open ${route}`, ok: pathOf(page) === route && !errs.length && !/Something went wrong|Application error/i.test(await text(page)), detail: errs[0] })
      }
      await go(page, '/audit')
      r.check({ id: 'HR-42', role: 'admin', screen: '/audit', title: 'Activity log lists today\'s role change and staff deactivation', ok: /access|role/i.test(await text(page)) && /deactivat/i.test(await text(page)) })
    })
    // Counter PIN
    await withRole('receptionist', async ({ page }) => {
      const set = async (pw: string, a: string, b: string) => { await go(page, '/account/pin'); await page.getByPlaceholder('Your password').fill(pw); await page.getByPlaceholder('New 4-digit PIN').fill(a); await page.getByPlaceholder('Again').fill(b); await page.getByRole('button', { name: /Set PIN|Change PIN|Save/ }).last().click(); await wait(page, 2500); return text(page) }
      const pw = account('receptionist').password
      r.check({ id: 'HR-50', role: 'receptionist', screen: '/account/pin', title: 'An easy PIN (1234) is refused', ok: /too easy/i.test(await set(pw, '1234', '1234')) })
      r.check({ id: 'HR-51', role: 'receptionist', screen: '/account/pin', title: 'Two different PINs are refused', ok: /do not match/i.test(await set(pw, '4827', '4872')) })
      r.check({ id: 'HR-52', role: 'receptionist', screen: '/account/pin', title: 'The wrong account password is refused', ok: /not right/i.test(await set(pw + 'x', '4827', '4827')) })
      const pin = String(4000 + (Number(r.tag.replace(/\D/g, '').slice(-3)) % 900) + 13).slice(-4)
      r.check({ id: 'HR-53', role: 'receptionist', screen: '/account/pin', title: 'Set a counter PIN', ok: /Saved/i.test(await set(pw, pin, pin)) })
    })
  },
} satisfies Flow
