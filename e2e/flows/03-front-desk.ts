// Front desk: register patients (with the checks a careful clerk relies on),
// book, check in, take payment, cancel. Registers the cast later flows use.
import { withRole, go, wait, text, bodyText, popupPath, shot } from '../lib/browser'
import { openRegister, regForm, regSelect, regSubmit, registered, registerPatient, bookAppointment, openBill, recordPayment, payDialog, findPatient } from '../lib/actions'
import { cast, minutesFromNow } from '../lib/people'
import { E } from '../lib/env'
import { account } from '../lib/env'
import type { Flow } from '../lib/run'

export default {
  name: 'front-desk', title: '03 Front desk',
  async run(r) {
    const people = cast(r)
    const doctor = account('doctor').name
    await withRole('receptionist', async ({ page }) => {
      const R = 'receptionist'
      // ── Registration checks ──
      await openRegister(page)
      await regSubmit(page).click(); await wait(page, 1200)
      const invalid = await page.evaluate(`[...document.querySelectorAll('input:invalid, select:invalid')].length`) as number
      r.check({ id: 'F-01', role: R, screen: '/patients', title: 'Register with an empty form is refused', ok: invalid > 0 || /required/i.test(await bodyText(page)) })
      const tryBad = async (id: string, title: string, set: () => Promise<void>, bug?: string) => {
        await openRegister(page)
        const f = regForm(page)
        await f.locator('#full_name').fill(`E2E Check ${r.tag}`); await f.locator('#phone').fill(people.murugan.phone.replace(/^9/, '6')); await f.locator('#age').fill('30')
        await regSelect(page, 'Gender').selectOption('male'); await f.getByText(/Register without Aadhaar/).click()
        await set()
        await regSubmit(page).click(); await wait(page, 2500)
        const refused = !(await registered(page))
        r.check({ id, role: R, screen: '/patients', title, ok: refused, bug, detail: refused ? '' : 'registered' })
      }
      await tryBad('F-02', 'A 9-digit phone is refused', async () => { await regForm(page).locator('#phone').fill('900000100') })
      await tryBad('F-03', 'Age 150 is refused', async () => { await regForm(page).locator('#age').fill('150') })
      await tryBad('F-04', 'A birth date in the future is refused', async () => { await regForm(page).locator('#age').fill(''); await regForm(page).locator('#dob').fill(new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10)) })
      await tryBad('F-05', 'An 11-digit Aadhaar is refused', async () => { await regForm(page).getByText(/Register without Aadhaar/).click(); await regForm(page).locator('#aadhaar_no').fill('12345678901') })

      // ── Register the cast ──
      for (const key of ['murugan', 'lakshmi', 'kavin', 'ramasamy']) {
        const p = people[key]
        const res = await registerPatient(page, p)
        let { uhid, url } = res
        if (res.ok && (!uhid || !/\/patients\/[0-9a-f-]{36}/.test(url))) { const f = await findPatient(page, p.phone); uhid = uhid ?? f.uhid; url = f.url ?? url }
        r.check({ id: `F-10-${key}`, role: R, screen: '/patients', title: `Register ${p.full_name}`, ok: res.ok && !!uhid, detail: `${uhid ?? ''} ${url}` })
        if (res.ok) r.setPatient(key, { ...p, uhid, url })
      }
      const m = r.patient('murugan')

      // Duplicate warning
      await openRegister(page)
      const f = regForm(page)
      await f.locator('#full_name').fill(m.full_name); await f.locator('#phone').fill(m.phone); await f.locator('#age').fill(m.age)
      await regSelect(page, 'Gender').selectOption('male'); await f.getByText(/Register without Aadhaar/).click()
      await regSubmit(page).click(); await wait(page, 2500)
      const dupT = await bodyText(page)
      r.check({ id: 'F-11', role: R, screen: '/patients', title: 'Registering the same name + phone warns of a likely duplicate', ok: /already|duplicate|existing|same phone|possible match/i.test(dupT) && !(await registered(page)), detail: dupT.match(/[^.]*(already|duplicate|existing|possible match)[^.]*/i)?.[0]?.slice(0, 140) })

      // Search, edit, ID card
      const found = await findPatient(page, m.phone)
      r.check({ id: 'F-12', role: R, screen: '/patients', title: 'Search by phone finds the patient', ok: found.uhid === m.uhid, detail: `${found.uhid}` })
      if (m.url && /\/patients\//.test(m.url)) {
        await go(page, m.url)
        await page.getByRole('button', { name: 'Edit', exact: true }).first().click(); await wait(page, 1500)
        await page.locator('textarea#address:visible, textarea[id*=address]:visible').first().fill('12, Bazaar Street, near Bus Stand')
        await page.getByRole('button', { name: /^(Save|Update)/ }).last().click(); await wait(page, 2500)
        await go(page, m.url); await page.getByRole('button', { name: /^Info/ }).first().click().catch(() => {}); await wait(page, 1200)
        r.check({ id: 'F-13', role: R, screen: '/patients/[id]', title: 'Edit the address — kept after reload', ok: /near Bus Stand/.test(await text(page)) })
        await page.getByRole('button', { name: /^Allergies/ }).first().click().catch(() => {}); await wait(page, 1500)
        const at = await text(page)
        r.check({ id: 'F-14', role: R, screen: '/patients/[id]', title: 'Allergies tab shows the Penicillin typed at registration', ok: /Penicillin/i.test(at) && !/Allergies\s*\(?0\)?/.test(at), bug: 'BUG-006', detail: at.match(/Allergies[^.]{0,80}/)?.[0] })
      }
      await go(page, '/patients')
      await page.locator('input[placeholder="Search by name, phone, or UHID…"]:visible').first().fill(m.uhid); await wait(page, 2000)
      await page.getByRole('button', { name: 'ID Card' }).locator('visible=true').first().click(); await wait(page, 1500)
      const idp = await popupPath(page, () => page.getByRole('button', { name: 'ID card (A4)' }).or(page.getByRole('link', { name: 'ID card (A4)' })).first().click())
      r.check({ id: 'F-15', role: R, screen: '/patients → ID Card', title: 'Print the patient ID card', ok: !!idp && /id-card/.test(idp), detail: idp ?? 'no tab opened' })

      // ── Appointments ──
      const soon = minutesFromNow(15); soon.setMinutes(Math.ceil(soon.getMinutes() / 5) * 5, 0, 0)
      const past = minutesFromNow(-120)
      const pastMsg = await bookAppointment(page, m, doctor, past, `E2E past ${r.tag}`, 'General Medicine')
      r.check({ id: 'F-20', role: R, screen: '/appointments', title: 'Booking a time already past is refused', ok: !!pastMsg, detail: pastMsg.match(/[^.]*(past|earlier|future)[^.]*/i)?.[0]?.slice(0, 120) })
      const plan: Array<[string, string, Date, string, string?]> = [
        ['murugan', doctor, soon, 'Fever 3 days', 'General Medicine'],
        ['lakshmi', doctor, new Date(soon.getTime() + 10 * 60000), 'Abdominal pain', 'General Medicine'],
        ['kavin', E.paediatrician, new Date(soon.getTime() + 20 * 60000), 'Cough and cold'],
        ['ramasamy', doctor, new Date(soon.getTime() + 86400000), 'Knee pain review', 'General Medicine'],
      ]
      for (const [key, doc, at, reason, dept] of plan) {
        const p = r.patient(key)
        const msg = await bookAppointment(page, p, doc, at, reason, dept)
        r.check({ id: `F-21-${key}`, role: R, screen: '/appointments', title: `Book ${p.full_name} with ${doc}`, ok: !msg, detail: msg.slice(0, 160) })
        r.setPatient(key, { apptAt: at.toISOString() })
      }
      await r.step('F-22', R, '/appointments', 'A second booking in a doctor\'s taken slot is refused', async () => {
        const dbl = await bookAppointment(page, r.patient('kavin'), doctor, soon, 'E2E double booking')
        r.check({ id: 'F-22', role: R, screen: '/appointments', title: 'A second booking in a doctor\'s taken slot is refused', ok: !!dbl, detail: dbl.match(/[^.]*(already|slot|booked|taken)[^.]*/i)?.[0]?.slice(0, 120) })
        await page.keyboard.press('Escape').catch(() => {})
      })

      // Check-in
      await go(page, '/appointments')
      for (const key of ['murugan', 'lakshmi', 'kavin']) {
        const p = r.patient(key)
        await page.locator('tr').filter({ hasText: p.full_name }).first().getByRole('button', { name: 'Check In' }).click().catch(() => {}); await wait(page, 3000)
        const rowT = (await page.locator('tr').filter({ hasText: p.full_name }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
        r.check({ id: `F-23-${key}`, role: R, screen: '/appointments', title: `Check in ${p.full_name}`, ok: /checked.in|in queue|waiting/i.test(rowT), detail: rowT.slice(0, 120) })
      }

      // Payment: Murugan cash (one-shot collect on the visit row), Kavin UPI with QR, Lakshmi card
      for (const [key, method] of [['murugan', 'Cash'], ['kavin', 'UPI'], ['lakshmi', 'Card']] as const) {
        const p = r.patient(key)
        await openBill(page, p.full_name)
        const due = (await text(page)).match(/Balance Due ₹([\d,]+\.\d\d)/)?.[1]?.replace(/,/g, '') ?? '0'
        if (method === 'UPI') {
          await page.getByRole('button', { name: 'Record Payment', exact: true }).first().click(); await payDialog(page).waitFor()
          await payDialog(page).locator('input[type=number]').fill(due); await payDialog(page).locator('select').first().selectOption({ label: 'UPI' }); await wait(page, 1200)
          const showQr = payDialog(page).getByRole('button', { name: 'Show QR on screen' })
          if (await showQr.count()) {
            const before = await payDialog(page).locator('svg').count()
            await showQr.click().catch(() => {}); await wait(page, 2500)
            const shown = (await payDialog(page).getByRole('button', { name: 'Hide QR' }).count()) > 0 && (await payDialog(page).locator('svg').count()) > before
            r.check({ id: 'F-30', role: R, screen: '/billing/[id]', title: 'UPI payment can show a QR on screen', ok: shown })
          } else r.note({ id: 'F-30', role: R, screen: '/billing/[id]', title: 'UPI payment can show a QR on screen', detail: 'no "Show QR on screen" — the hospital has no UPI ID set up' })
          await page.keyboard.press('Escape').catch(() => {}); await go(page, page.url().replace(/^https?:\/\/[^/]+/, ''))
        }
        const after = await recordPayment(page, due, method, method === 'Card' ? `E2E-CARD-${r.tag}` : undefined)
        r.check({ id: `F-31-${key}`, role: R, screen: '/billing/[id]', title: `${p.full_name}: consultation paid by ${method} (₹${due})`, ok: /Balance Due ₹0\.00/.test(after) || /\bpaid\b/i.test(after.slice(0, 200)), detail: after.match(/Balance Due ₹[\d,.]+/)?.[0] })
      }

      // Cancel Ramasamy's appointment → its bill is cancelled too
      await go(page, '/appointments')
      await page.locator('main input[type=date]').first().fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10)).catch(() => {}); await wait(page, 2500)
      const rr = r.patient('ramasamy')
      await page.locator('tr').filter({ hasText: rr.full_name }).first().locator('button[title="Cancel"]').click()
      await page.getByRole('button', { name: 'Cancel Appointment', exact: true }).click(); await wait(page, 3500)
      await go(page, '/billing'); await page.getByRole('button', { name: 'All Bills', exact: true }).click(); await wait(page, 2500)
      const billRow = (await page.locator('tr').filter({ hasText: rr.full_name }).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
      r.check({ id: 'F-32', role: R, screen: '/appointments → /billing', title: 'Cancelling an appointment cancels its consultation bill', ok: !billRow || /cancel/i.test(billRow), detail: billRow.slice(0, 120) })
      await shot(r, page, 'front_desk_end')
    })
  },
} satisfies Flow
