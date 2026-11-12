// Things several flows do the same way: register a patient, book, take a
// payment, admit, write an IPD order.
import type { Locator, Page } from 'playwright-core'
import { go, wait, bodyText, text, pathOf } from './browser'
import { chooseIn, lab, pick } from './ui'
import { ymd, hm, type Person } from './people'
import { ms } from './env'

// ── Front desk ─────────────────────────────────────────────────────────────

export const regForm = (page: Page) => page.getByRole('heading', { name: 'Register New Patient' }).locator('xpath=ancestor::*[.//button[normalize-space()="Cancel"]][1]')

export async function openRegister(page: Page) {
  await go(page, '/patients')
  await page.getByRole('button', { name: 'Register Patient', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Register New Patient' }).waitFor({ timeout: ms(15000) })
}
export const regSubmit = (page: Page) => regForm(page).getByRole('button').filter({ hasText: /^(Register|Save|Create)/ }).last()
export const regSelect = (page: Page, label: string) => regForm(page).locator('label').filter({ hasText: new RegExp(`^${label}\\*?$`) }).first().locator('xpath=..').locator('select').first()
export const registered = async (page: Page) => /\/patients\/[0-9a-f-]{36}/.test(pathOf(page)) || (!(await page.getByRole('heading', { name: 'Register New Patient' }).isVisible().catch(() => false)) && /registered|UHID/i.test(await bodyText(page)))

/** Fill and submit the registration form. Returns where the app went and the UHID shown. */
export async function registerPatient(page: Page, p: Person): Promise<{ ok: boolean; url: string; uhid: string | null; text: string }> {
  await openRegister(page)
  const f = regForm(page)
  await f.locator('#full_name').fill(p.full_name); await f.locator('#phone').fill(p.phone)
  if (p.dob) await f.locator('#dob').fill(p.dob); else await f.locator('#age').fill(p.age!)
  await regSelect(page, 'Gender').selectOption(p.gender)
  if (p.blood) await regSelect(page, 'Blood Group').selectOption(p.blood).catch(() => {})
  await f.getByText(/Register without Aadhaar/).click()
  await f.locator('#address').fill(p.address); await f.locator('#district').fill(p.district)
  await f.locator('#state').fill('Tamil Nadu'); await f.locator('#pincode').fill(p.pincode)
  await regSelect(page, 'Relation').selectOption(p.relation.toLowerCase()).catch(() => {})
  await f.locator('#relation_name').fill(p.rel_name)
  if (p.allergies) await f.locator('#allergies').fill(p.allergies)
  await f.locator('#ec_name').fill(p.ec_name); await f.locator('#ec_phone').fill(p.ec_phone)
  // A duplicate-name/phone warning may need a second click to register anyway.
  await regSubmit(page).click(); await wait(page, 3500)
  if (await page.getByRole('heading', { name: 'Register New Patient' }).isVisible().catch(() => false)) {
    const again = page.getByRole('button', { name: /Register anyway|Continue|Yes, register/i }).last()
    if (await again.isVisible().catch(() => false)) { await again.click(); await wait(page, 3500) }
  }
  const t = await bodyText(page)
  return { ok: await registered(page), url: pathOf(page), uhid: t.match(/\b([A-Z]{2,}-UH-\d{4}-\d{5})\b/)?.[1] ?? null, text: t }
}

/** Find a patient's UHID and profile URL from the Patients list (search by phone). */
export async function findPatient(page: Page, phone: string): Promise<{ uhid: string | null; url: string | null }> {
  await go(page, '/patients')
  await page.locator('input[placeholder="Search by name, phone, or UHID…"]:visible').first().fill(phone); await wait(page, 2500)
  const t = await text(page)
  const uhid = t.match(/\b([A-Z]{2,}-UH-\d{4}-\d{5})\b/)?.[1] ?? null
  // Rows open the profile on click (they are not links).
  if (uhid) await page.getByText(uhid).locator('visible=true').first().click().catch(() => {})
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}/, { timeout: ms(15000) }).catch(() => {})
  const url = /\/patients\/[0-9a-f-]{36}/.test(pathOf(page)) ? pathOf(page) : null
  return { uhid, url }
}

export const apptForm = (page: Page) => page.getByRole('heading', { name: 'Book Appointment' }).last().locator('xpath=ancestor::*[.//button[normalize-space()="Cancel"]][1]')

export async function bookAppointment(page: Page, p: { full_name: string; uhid: string }, doctor: string, at: Date, reason: string, dept?: string): Promise<string> {
  await go(page, '/appointments')
  await page.getByRole('button', { name: 'Book Appointment', exact: true }).first().click()
  await apptForm(page).waitFor({ timeout: ms(15000) })
  const opt = page.locator('[role=dialog], form, .fixed').getByText(p.uhid).locator('visible=true').first()
  for (const q of [p.uhid, p.full_name]) {
    await page.locator('#patient-search').fill(''); await page.locator('#patient-search').fill(q); await wait(page, 2200)
    if (await opt.isVisible().catch(() => false)) break
  }
  await opt.click(); await wait(page, 500)
  await chooseIn(apptForm(page).locator('select').nth(0), doctor, 'doctor')
  if (dept) await chooseIn(apptForm(page).locator('select').nth(1), dept, 'department').catch(() => {})
  await apptForm(page).locator('input[type=date]').fill(ymd(at)); await apptForm(page).locator('input[type=time]').fill(hm(at))
  await page.locator('#reason').fill(reason)
  await apptForm(page).getByRole('button').filter({ hasText: /^Book/ }).last().click(); await wait(page, 3000)
  const open = await apptForm(page).isVisible().catch(() => false)
  return open ? (await apptForm(page).innerText().catch(() => '')).replace(/\s+/g, ' ') : ''
}

// ── Billing ────────────────────────────────────────────────────────────────

/** Open the newest bill for a patient name from Billing → All Bills. */
export async function openBill(page: Page, name: string, kind?: RegExp) {
  await go(page, '/billing')
  await page.getByRole('button', { name: 'All Bills', exact: true }).click(); await wait(page, 2500)
  let rowL = page.locator('tr').filter({ hasText: name })
  if (kind) rowL = rowL.filter({ hasText: kind })
  await rowL.first().getByText('View', { exact: true }).locator('visible=true').first().click()
  await page.waitForURL(/\/billing\/[0-9a-f-]{36}/, { timeout: ms(20000) }); await wait(page, 1500)
}

export const payDialog = (page: Page) => page.getByRole('heading', { name: 'Record Payment' }).last().locator('xpath=ancestor::*[.//button[normalize-space()="Record"]][1]')

/** On an open bill: Record Payment. Returns the bill's text afterwards. */
export async function recordPayment(page: Page, amount: string, method: 'Cash' | 'Card' | 'UPI' | 'Bank Transfer', ref?: string) {
  await page.getByRole('button', { name: 'Record Payment', exact: true }).first().click(); await payDialog(page).waitFor({ timeout: ms(10000) })
  await payDialog(page).locator('input[type=number]').fill(amount)
  if (method !== 'Cash') await payDialog(page).locator('select').first().selectOption({ label: method })
  if (ref) await payDialog(page).locator('input[type=text]').last().fill(ref).catch(() => {})
  await payDialog(page).getByRole('button', { name: 'Record', exact: true }).click(); await wait(page, 3000)
  return text(page)
}

/** Billing → By Patient → patient → month → IPD row (where advances and per-bill actions live). */
export async function openIpdRow(page: Page, name: string) {
  await go(page, '/billing')
  // The patient's row (a button) — not the "Pending advances" strip above it, which names them too.
  await page.locator('main button').filter({ hasText: name }).filter({ hasNotText: /^Collect/ }).first().click(); await wait(page, 1500)
  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
  await page.locator('main').getByText(month, { exact: false }).first().click().catch(() => {}); await wait(page, 1500)
  await page.locator('main button').filter({ hasText: /^IPD/ }).first().click(); await wait(page, 2500)
}

// ── IPD ────────────────────────────────────────────────────────────────────

export const admitDialog = (page: Page) => page.locator('div').filter({ has: page.getByRole('button', { name: 'Admit Patient', exact: true }) }).filter({ has: page.getByText('Admitting Doctor') }).last()

/** Fill the admission dialog (already open). Picks a free bed whose ward is not the other sex's. */
export async function fillAdmission(page: Page, o: { doctor: string; ward: RegExp; reason: string; procedure?: RegExp; avoidBeds?: string[] }) {
  const d = admitDialog(page)
  const sel = (label: string) => d.locator('label').filter({ hasText: new RegExp(`^${label}\\*?$`) }).first().locator('xpath=..').locator('select').first()
  await chooseIn(sel('Admitting Doctor'), o.doctor, 'doctor')
  const ward = await chooseIn(sel('Ward'), o.ward, 'ward'); await wait(page, 1800)
  let roomTxt = ''
  const room = d.locator('label').filter({ hasText: /^Room\*?$/ }).first().locator('xpath=..').locator('select').first()
  if (await room.count()) { roomTxt = await chooseIn(room, /^(?!Select).*(\d+ beds? avail)/, 'room'); await wait(page, 1500) }
  const bed = d.locator('label').filter({ hasText: /^Bed\*?$/ }).first().locator('xpath=..').locator('select').first()
  const beds = (await bed.locator('option').allInnerTexts()).filter((b) => !/Select/.test(b) && !(o.avoidBeds ?? []).includes(b.trim()))
  if (!beds.length) throw new Error(`no free bed in ${ward}`)
  await bed.selectOption({ label: beds[0] })
  if (o.procedure) await chooseIn(sel('Treatment / Procedure'), o.procedure, 'procedure').catch(() => {})
  await d.locator('textarea').fill(o.reason)
  return { ward, room: roomTxt, bed: beds[0].trim() }
}

export async function submitAdmission(page: Page): Promise<{ ok: boolean; url: string; error: string }> {
  await admitDialog(page).getByRole('button', { name: 'Admit Patient', exact: true }).click(); await wait(page, 6000)
  const ok = /\/ipd\/[0-9a-f-]{36}/.test(pathOf(page))
  const error = ok ? '' : ((await admitDialog(page).innerText().catch(() => '')).replace(/\s+/g, ' ').match(/[^.]*(error|already|cannot|fail|available)[^.]*/i)?.[0] ?? '')
  return { ok, url: pathOf(page), error }
}

export async function openTreatment(page: Page, ipd: string) {
  await go(page, ipd)
  await page.getByRole('button', { name: 'Treatment', exact: true }).click(); await wait(page, 1500)
  // The section starts collapsed when there are no orders yet (BUG-038).
  if (!(await page.getByRole('button', { name: 'Add Order', exact: true }).count()) && !(await page.locator('div.rounded-xl.overflow-hidden').count())) {
    await page.getByRole('button', { name: /^Medications \/ IV/ }).first().click().catch(() => {}); await wait(page, 800)
  }
}

export const orderForm = (page: Page) => page.locator('div').filter({ has: page.getByRole('button', { name: 'Add Order', exact: true }) }).filter({ has: page.getByPlaceholder('e.g. dilute in 100ml NS, infuse over 30 min') }).last()

async function openOrderForm(page: Page) {
  if (await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false)) return
  await page.getByRole('button', { name: 'New Order' }).first().click(); await wait(page, 900)
  if (!(await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^Medications \/ IV/ }).first().click(); await wait(page, 900)
    if (!(await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false))) { await page.getByRole('button', { name: 'New Order' }).first().click(); await wait(page, 900) }
  }
}

export interface MedOrder { search: string; pick?: RegExp; dose: string; unit: string; route: string; freq: string; days?: string; notes?: string }
export interface IvOrder { fluid: string; vol: string; rate: string; freq: string; added?: string; days?: string }

/** Write a medication order. `pick` chooses that line from the search list (stock-linked). */
export async function orderMed(page: Page, o: MedOrder): Promise<{ added: boolean; picked: string; message: string }> {
  await openOrderForm(page); const form = orderForm(page)
  const box = form.getByPlaceholder('Search pharmacy or type new drug name…')
  await box.fill(o.search); await wait(page, 2000)
  let picked = 'typed'
  const list = page.locator('button, li, [role=option]').filter({ hasText: o.pick ?? new RegExp(o.search, 'i') })
  if (o.pick && await list.first().isVisible().catch(() => false)) { picked = (await list.first().innerText()).replace(/\s+/g, ' '); await list.first().click(); await wait(page, 800) }
  else await box.press('Tab').catch(() => {})
  const sel = form.locator('select')
  await form.getByPlaceholder('1.2').fill(o.dose)
  await sel.nth(0).selectOption(o.unit); await sel.nth(1).selectOption(o.route); await sel.nth(2).selectOption(o.freq)
  if (o.days) { const b = form.getByRole('button', { name: o.days, exact: true }); if (await b.count()) await b.click() }
  if (o.notes) await form.getByPlaceholder('e.g. dilute in 100ml NS, infuse over 30 min').fill(o.notes)
  await form.getByRole('button', { name: 'Add Order', exact: true }).click(); await wait(page, 3500)
  const still = await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false)
  const message = still ? ((await form.innerText().catch(() => '')).replace(/\s+/g, ' ').match(/[^.]*(allerg|interact|warning|required|must|error|not|dose|tablet|route)[^.]*/i)?.[0] ?? '') : ''
  if (still) await form.getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {})
  return { added: !still, picked, message }
}

export async function orderIv(page: Page, o: IvOrder): Promise<boolean> {
  await openOrderForm(page); const form = orderForm(page)
  await form.getByRole('button', { name: 'IV Infusion', exact: true }).click(); await wait(page, 600)
  const sel = form.locator('select')
  await chooseIn(sel.nth(0), o.fluid, 'fluid')
  await form.getByPlaceholder('500', { exact: true }).fill(o.vol); await form.getByPlaceholder('60', { exact: true }).fill(o.rate)
  if (o.added) await form.getByPlaceholder('e.g. KCl 20 mEq').fill(o.added)
  await chooseIn(sel.nth(1), o.freq, 'frequency'); await wait(page, 400)
  if (o.days) { const b = form.getByRole('button', { name: o.days, exact: true }); if (await b.count()) await b.click() }
  await form.getByRole('button', { name: 'Add Order', exact: true }).click(); await wait(page, 3500)
  return !(await page.getByRole('button', { name: 'Add Order', exact: true }).isVisible().catch(() => false))
}

/** The drug-chart card whose text starts with `start`. */
export async function orderCard(page: Page, start: string | RegExp): Promise<Locator> {
  const re = typeof start === 'string' ? `^${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : start.source
  const idx: number = await page.evaluate(`[...document.querySelectorAll('div.rounded-xl.overflow-hidden')].findIndex(c => new RegExp(${JSON.stringify(re)}).test(c.innerText.replace(/\\s+/g, ' ').trim()))`)
  if (idx < 0) throw new Error(`no order card starting ${String(start)}`)
  return page.locator('div.rounded-xl.overflow-hidden').nth(idx)
}

/** Give the next due dose on an order card ("Given" → optional checker → "Confirm given"). */
export async function giveDose(page: Page, start: string | RegExp, checker?: string): Promise<string> {
  const c = await orderCard(page, start)
  if (!(await c.getByRole('button', { name: 'Given', exact: true }).count())) { await c.locator('button').last().click(); await wait(page, 900) }
  const g = c.getByRole('button', { name: 'Given', exact: true })
  if (!(await g.count())) return 'no dose to give'
  await g.first().click(); await wait(page, 600)
  if (checker) { const ch = c.getByLabel('Checked by'); if (await ch.count()) { const o = await ch.locator('option').allTextContents(); const pickO = o.find((x) => x.includes(checker)); if (pickO) await ch.selectOption({ label: pickO }) } }
  await c.getByRole('button', { name: 'Confirm given', exact: true }).click(); await wait(page, 3000)
  return ((await (await orderCard(page, start)).innerText()).replace(/\s+/g, ' '))
}

/** Sign the treatment declaration from the IPD list (drawn signature) or mark it manual. */
export async function startTreatment(page: Page, name: string, how: { draw?: { signer: string; relation: string } ; manual?: { signer: string; relation: string } }) {
  await go(page, '/ipd')
  const rowL = page.locator('tr, div').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: /Start Treatment/ }) }).last()
  await rowL.getByRole('button', { name: /Start Treatment/ }).first().click(); await wait(page, 1500)
  if (how.manual) {
    await page.getByRole('button', { name: /^Mark manual/ }).click(); await wait(page, 1200)
    await page.locator('label', { hasText: /^Signer Name/ }).locator('xpath=..').locator('input').fill(how.manual.signer)
    await page.locator('label', { hasText: /^Relationship to Patient/ }).locator('xpath=..').locator('select').selectOption({ label: how.manual.relation })
    await page.getByRole('button', { name: 'Mark Pending & Start Treatment' }).click(); await wait(page, 3500)
    return
  }
  await page.getByRole('button', { name: /sign digitally|sign (on|here)|on screen/i }).first().click().catch(() => {}); await wait(page, 800)
}

export { pick, lab }

/** Stopping an order asks first (BUG-040 fix); confirm if the dialog is there. */
export async function confirmStop(page: Page) {
  await wait(page, 1000)
  const yes = page.getByRole('dialog').getByRole('button', { name: 'Stop order', exact: true })
  if (await yes.count()) await yes.click().catch(() => {})
  await wait(page, 2000)
}
