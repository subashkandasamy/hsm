// Billing, discounts, estimates, cashless insurance, accounts, refunds.
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, pathOf } from '../lib/browser'
import { fill, lab, pick, chooseIn } from '../lib/ui'
import { openBill, recordPayment, admitDialog, fillAdmission, submitAdmission } from '../lib/actions'
import { ymd } from '../lib/people'
import { account } from '../lib/env'
import type { Flow, Run } from '../lib/run'

/** Bill URLs of a patient's unpaid bills (All Bills list). */
async function unpaidBills(page: Page, name: string): Promise<string[]> {
  await go(page, '/billing'); await page.getByRole('button', { name: 'All Bills', exact: true }).click(); await wait(page, 2500)
  const urls: string[] = []
  const n = await page.locator('tr').filter({ hasText: name }).filter({ hasText: /unpaid|partial/ }).count()
  for (let i = 0; i < n; i++) {
    await go(page, '/billing'); await page.getByRole('button', { name: 'All Bills', exact: true }).click(); await wait(page, 2000)
    await page.locator('tr').filter({ hasText: name }).filter({ hasText: /unpaid|partial/ }).nth(i).getByText('View', { exact: true }).locator('visible=true').first().click()
    await page.waitForURL(/\/billing\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(() => {}); urls.push(pathOf(page))
  }
  return urls
}

export default {
  name: 'billing', title: '16 Billing, insurance, accounts',
  async run(r: Run) {
    const u = r.data.patients?.unknown
    // ── Charity discount for the referred unknown patient ──
    if (u?.full_name && r.data.unknownReferredBlocked !== false) {
      let bills: string[] = []
      await withRole('receptionist', async ({ page }) => {
        bills = await unpaidBills(page, u.full_name)
        if (bills[0]) {
          await go(page, bills[0]); const bt = await text(page)
          r.check({ id: 'BL-01', role: 'receptionist', screen: '/billing/[id]', title: 'An unknown patient\'s bill does not print an internal "PROV-" id as the phone', ok: !/PHONE\s*PROV-/.test(bt), bug: 'BUG-060' })
          r.check({ id: 'BL-02', role: 'receptionist', screen: '/billing/[id]', title: 'An all-exempt bill of supply does not print "Taxable Value"', ok: !(/BILL OF SUPPLY/.test(bt) && /Taxable Value ₹[1-9]/.test(bt)), bug: 'BUG-061' })
        }
        for (const [i, b] of bills.entries()) {
          await go(page, b); await page.getByRole('button', { name: 'Discount', exact: true }).click(); await wait(page, 1000)
          await page.getByRole('button', { name: 'Percent (%)' }).click()
          const amt = page.locator('label', { hasText: /^Discount/ }).locator('xpath=..').locator('input')
          if (i === 0) {
            await amt.fill('150'); await page.getByRole('button', { name: 'Apply' }).click(); await wait(page, 2000)
            const m = (await bodyText(page)).match(/[^.]*(100 ?%|cannot exceed|more than the bill|at most)[^.]*/i)?.[0]
            r.check({ id: 'BL-03', role: 'receptionist', screen: '/billing/[id] → Discount', title: 'A 150 % discount is refused with a message', ok: !!m && await page.getByRole('button', { name: 'Apply' }).isVisible(), detail: m?.slice(0, 120) })
          }
          await amt.fill('100'); await page.locator('label', { hasText: /^Reason/ }).locator('xpath=..').locator('select').selectOption({ label: 'Charity' })
          await page.getByRole('button', { name: 'Apply' }).click(); await wait(page, 3000)
          if (i === 0) r.check({ id: 'BL-04', role: 'receptionist', screen: '/billing/[id] → Discount', title: 'A discount above the front-desk limit goes for approval', ok: /approval/i.test(await bodyText(page)) })
        }
      })
      await withRole('accountant', async ({ page }) => {
        await go(page, '/billing/discount-approvals')
        await page.getByRole('button', { name: 'Approve', exact: true }).first().click().catch(() => {}); await wait(page, 2500)
        r.check({ id: 'BL-05', role: 'accountant', screen: '/billing/discount-approvals', title: 'The accountant cannot approve a 100 % discount above their own limit', ok: /above your own limit/i.test(await text(page)) })
      })
      await withRole('admin', async ({ page }) => {
        for (let k = 0; k < bills.length; k++) {
          await go(page, '/billing/discount-approvals')
          const b = page.locator('main div, main tr').filter({ hasText: u.full_name }).getByRole('button', { name: 'Approve', exact: true }).first()
          if (!(await b.count())) break; await b.click(); await wait(page, 2500)
        }
        for (const b of bills) {
          await go(page, b); const t = await text(page)
          if (/Pharmacy/.test(t.slice(0, 200))) r.check({ id: 'BL-06', role: 'admin', screen: '/billing/[id]', title: 'A 100 % discounted pharmacy bill owes no GST', ok: /Grand Total ₹0\.00/.test(t), bug: 'BUG-063', detail: t.match(/CGST ₹[\d.]+ SGST ₹[\d.]+ Grand Total ₹[\d,.]+/)?.[0] })
          if (/Balance Due ₹0\.00/.test(t)) r.check({ id: 'BL-07', role: 'admin', screen: '/billing/[id]', title: 'A bill discounted to ₹0 is not labelled "unpaid"', ok: !/^\S+ unpaid/.test(t), bug: 'BUG-062', detail: t.slice(0, 40) })
          const due = t.match(/Balance Due ₹([\d,]+\.\d\d)/)?.[1]?.replace(/,/g, '')
          if (due && Number(due) > 0) await recordPayment(page, due, 'Cash', 'Hospital welfare fund')
        }
      })
      await withRole('doctor', async ({ page }) => {
        await go(page, u.ipd); await page.getByRole('button', { name: 'Discharge', exact: true }).click().catch(() => {}); await wait(page, 2000)
        if (await page.getByText('Referred to another hospital', { exact: true }).count()) {
          await page.getByText('Referred to another hospital', { exact: true }).click()
          await page.locator('textarea:visible').last().fill('Referred to GMCH Karur neurosurgery (bills waived on charity).')
          await page.getByRole('button', { name: /Discharge Patient/ }).click(); await wait(page, 5000)
        }
        r.check({ id: 'BL-08', role: 'doctor', screen: '/ipd/[id]', title: 'Unknown patient discharged as referred once the bills are waived', ok: /Referred/.test(await text(page)) })
      })
    }

    // ── Estimate ──
    const rm = r.patient('ramasamy')
    await withRole('receptionist', async ({ page }) => {
      await go(page, '/billing/estimates'); await page.getByRole('button', { name: 'New Estimate' }).click(); await wait(page, 1500)
      await page.getByPlaceholder(/Search existing patient/).fill(rm.full_name); await page.getByRole('button', { name: 'Search' }).click(); await wait(page, 2000)
      // In the dialog — an earlier estimate lists the same name behind it.
      await page.getByRole('dialog').getByText(rm.full_name).locator('visible=true').first().click(); await wait(page, 800)
      await chooseIn(lab(page, 'Room type').locator('xpath=..').locator('select'), /Semi/); await lab(page, 'Days').locator('xpath=..').locator('input').fill('1')
      await page.getByRole('button', { name: 'Add', exact: true }).first().click(); await wait(page, 500)
      await chooseIn(lab(page, 'Surgery / package').locator('xpath=..').locator('select'), /Cataract/)
      await page.getByRole('button', { name: 'Add', exact: true }).nth(1).click().catch(() => {}); await wait(page, 500)
      const total = (await text(page)).match(/Total: ₹([\d,]+\.\d\d)/)?.[1]
      await page.locator('input[type=date]:visible').last().fill(ymd(new Date(Date.now() + 30 * 864e5)))
      await page.getByRole('button', { name: 'Create Estimate' }).click(); await wait(page, 3500)
      r.check({ id: 'BL-10', role: 'receptionist', screen: '/billing/estimates', title: `Estimate for Ramasamy's cataract surgery (₹${total})`, ok: (await text(page)).includes(rm.full_name) && total === '26,500.00', detail: `total ₹${total} (semi-private 2,500 + cataract 24,000)` })
    })
    // ── Cashless insurance ──
    await withRole('doctor', async ({ page }) => {
      await go(page, '/ipd'); await page.getByRole('button', { name: 'Admit Patient', exact: true }).first().click(); await wait(page, 1500)
      await admitDialog(page).locator('input[type=text], input[type=search]').first().fill(rm.full_name.replace('E2E ', '')); await wait(page, 2000)
      await page.getByText(rm.full_name).last().click(); await wait(page, 800)
      await fillAdmission(page, { doctor: account('doctor').name, ward: /^Semi-Private/, reason: 'Senile cataract right eye — phaco with IOL (cashless)', procedure: /Cataract/ })
      const res = await submitAdmission(page)
      r.check({ id: 'BL-20', role: 'doctor', screen: 'Admit Patient', title: 'Admit Ramasamy (Semi-Private) for cataract surgery', ok: res.ok, detail: res.error })
      if (res.ok) r.setPatient('ramasamy', { ipd: res.url })
    })
    const ram = r.patient('ramasamy'); if (!ram.ipd) return
    const insPatient = `/insurance/${ram.url?.split('/').pop()}`
    await withRole('accountant', async ({ page }) => {
      const A = 'accountant'
      await go(page, insPatient); await page.locator('main button').filter({ hasText: /IPD/ }).first().click(); await wait(page, 3000)
      const policy = async (valid: string) => {
        const ins = page.getByPlaceholder('Search or type an insurer…'); await ins.fill('Star'); await wait(page, 1500)
        await page.locator('button, li, [role=option]').filter({ hasText: /Star Health/i }).first().click()
        await fill(page, 'Policy Number *', `E2E/STAR/${r.tag}`); await lab(page, 'Valid Till').locator('xpath=..').locator('input').fill(valid)
        await fill(page, 'Sum Assured (₹)', '300000'); await fill(page, 'Room Rent Limit (₹/day)', '2000'); await fill(page, 'Co-pay (%)', '10')
        await page.getByPlaceholder('e.g. Cataract capped at ₹40,000').fill('Cataract capped at ₹25,000 per eye')
        await page.getByRole('button', { name: 'Save & Start Claim' }).click(); await wait(page, 4000)
      }
      await policy(ymd(new Date(Date.now() - 12 * 864e5)))
      // Refused before saving now: "Valid Till (…) is already past" (BUG-064 fix).
      const expMsg = (await bodyText(page)).match(/expired on [\d-]+|is already past[^.]*/)?.[0]
      r.check({ id: 'BL-21', role: A, screen: '/insurance → Add Policy', title: 'A policy that expired before the admission is refused', ok: !!expMsg })
      const savedDup = await page.getByRole('button', { name: new RegExp(`E2E/STAR/${r.tag}`) }).count()
      r.check({ id: 'BL-22', role: A, screen: '/insurance → Add Policy', title: 'The refused (expired) policy is not left saved on the patient', ok: savedDup === 0, bug: 'BUG-064' })
      if (savedDup) await page.getByRole('button', { name: 'Add a new policy' }).click().catch(() => {}); await wait(page, 1000)
      await policy(ymd(new Date(Date.now() + 150 * 864e5)))
      const claimUrl = pathOf(page)
      r.check({ id: 'BL-23', role: A, screen: '/insurance → Add Policy', title: 'Save the Star Health policy and start the claim', ok: /Eligibility Check/.test(await text(page)) && !/Complete the previous stage first[^3]*3 ·/.test(await text(page)) })
      r.set('claimUrl', claimUrl)
      await fill(page, 'Estimated Amount (₹)', '26500'); await fill(page, 'Diagnosis / Treatment', 'Senile cataract right eye — phaco with IOL')
      await fill(page, 'Room', '2500'); await fill(page, 'OT', '24000'); await page.getByRole('button', { name: 'Save Fields' }).click(); await wait(page, 2500)
      const capWarn = /(above|exceeds|more than)[^.]{0,60}(cap|limit)|proportion/i.test(await text(page))
      r.note({ id: 'BL-24', role: A, screen: '/insurance → Eligibility', title: 'Room above the policy cap (₹2,500 vs ₹2,000) is flagged', detail: capWarn ? 'flagged' : 'only the cap text is shown' })
      await fill(page, 'Sanctioned Amount (₹) — if approving', '400000'); await page.getByRole('button', { name: 'Approve', exact: true }).click(); await wait(page, 3000)
      r.check({ id: 'BL-25', role: A, screen: '/insurance → Eligibility', title: 'A sanction above the sum assured is refused', ok: /exceeds the policy/i.test(await bodyText(page)) })
      await fill(page, 'Sanctioned Amount (₹) — if approving', '22000'); await page.getByRole('button', { name: 'Approve', exact: true }).click(); await wait(page, 3500)
      await go(page, claimUrl)
      r.check({ id: 'BL-26', role: A, screen: '/insurance → Eligibility', title: 'Pre-auth approved for ₹22,000', ok: /Raise Claim|Claim Amount/.test(await text(page)), detail: (await text(page)).match(/(Eligibility|Pre-auth)[^.]{0,80}/)?.[0] })
    })
    await withRole('doctor', async ({ page }) => {
      await go(page, ram.ipd); await page.getByRole('button', { name: 'Discharge', exact: true }).click(); await wait(page, 2000)
      await page.getByText('Normal discharge', { exact: true }).click()
      await page.getByPlaceholder(/Condition at discharge/).fill('Surgery postponed — conjunctivitis right eye. Re-admit in 2 weeks.')
      await page.getByRole('button', { name: 'Discharge Patient' }).click(); await wait(page, 5000)
      const msg = (await bodyText(page)).match(/Cannot discharge[^\n]*/)?.[0] ?? ''
      r.check({ id: 'BL-30', role: 'doctor', screen: '/ipd/[id] → Discharge', title: 'With cashless approved, discharge still asks for the patient\'s co-pay share', ok: /co-?pay|patient('|’)s share/i.test(msg), bug: 'BUG-065', detail: msg || 'discharged with nothing collected' })
      if (msg) { // collect it so the claim can go on
        r.set('ramasamyBlocked', msg)
      }
    })
    await withRole('accountant', async ({ page }) => {
      const A = 'accountant'
      await go(page, r.data.claimUrl)
      const billed = await (async () => { const t = await text(page); return t.match(/Grand Total ₹([\d,]+)/)?.[1] })()
      await fill(page, 'Claim Amount (₹) *', '2900'); await page.getByRole('button', { name: 'Raise Claim' }).click(); await wait(page, 3000)
      await page.getByRole('button', { name: 'Submit Claim' }).click(); await wait(page, 3000)
      await fill(page, 'Approved Amount (₹) *', '3500'); await page.getByRole('button', { name: 'Mark Approved' }).click(); await wait(page, 3000)
      const over = /Approved Amount ₹3,500/.test(await text(page))
      r.check({ id: 'BL-31', role: A, screen: '/insurance → Claim', title: 'An approval larger than the claim is refused', ok: !over, bug: 'BUG-066' })
      if (over) { await page.getByRole('button', { name: 'Edit', exact: true }).last().click(); await wait(page, 1000); await fill(page, 'Approved Amount (₹)', '2160'); await fill(page, 'Patient Co-pay (₹)', '240'); await page.getByRole('button', { name: 'Save changes' }).click(); await wait(page, 3000) }
      else { await fill(page, 'Approved Amount (₹) *', '2160'); await fill(page, 'Patient Co-pay (₹)', '240').catch(() => {}); await page.getByRole('button', { name: 'Mark Approved' }).click(); await wait(page, 3000) }
      const t = await text(page)
      const s4 = t.slice(t.indexOf('4 · Settlement'))
      const short = s4.match(/Settlement is ₹([\d,]+\.\d\d) short of the ₹([\d,]+\.\d\d)/)
      r.note({ id: 'BL-32', role: A, screen: '/insurance → Settlement', title: 'Settlement stage opened', detail: s4.slice(0, 160) })
      void billed
      // bank account needed — admin adds one
      r.set('settlementShort', short?.[0] ?? '')
    })
    await withRole('admin', async ({ page }) => {
      await go(page, '/insurance'); await page.getByRole('button', { name: 'Bank Accounts' }).click(); await wait(page, 1500)
      await page.getByPlaceholder('Account label (e.g. HDFC Current A/c) *').fill(`E2E A/c ${r.tag}`); await page.getByPlaceholder('Bank name').fill('Test Bank')
      await page.getByPlaceholder('IFSC code').fill('ABCD0123'); await page.getByPlaceholder('Account number').fill('000111222333')
      await page.getByRole('button', { name: 'Add Account' }).click(); await wait(page, 3000)
      const saved = (await text(page)).includes(`E2E A/c ${r.tag}`)
      r.check({ id: 'BL-40', role: 'admin', screen: '/insurance → Bank Accounts', title: 'A bank account with an 8-character IFSC is refused', ok: !saved, bug: 'BUG-068' })
      if (!saved) { await page.getByPlaceholder('IFSC code').fill('ABCD0001234'); await page.getByRole('button', { name: 'Add Account' }).click(); await wait(page, 3000) }
    })
    await withRole('accountant', async ({ page }) => {
      const A = 'accountant'
      await go(page, r.data.claimUrl)
      const dsel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Room-rent cap' }) }).first()
      const amtIn = page.getByText('Disallowances / Deductions').first().locator('xpath=following::input[@type="number"][1]')
      const addBtn = page.getByText('Disallowances / Deductions').first().locator('xpath=following::button[normalize-space()="Add"][1]')
      const why = page.getByPlaceholder('Reason (e.g. non-medical consumables)')
      await why.fill('Room rent above the ₹2,000/day cap'); await dsel.selectOption({ label: 'Room-rent cap' }); await amtIn.fill('500'); await addBtn.click(); await wait(page, 2000)
      await why.fill('10% co-pay'); await dsel.selectOption({ label: 'Co-pay' }); await amtIn.fill('240'); await addBtn.click(); await wait(page, 2000)
      await fill(page, 'Settled Amount — gross (₹) *', '2160'); await fill(page, 'TDS withheld (₹)', '0')
      await chooseIn(lab(page, 'Bank Account *').locator('xpath=..').locator('select'), `E2E A/c ${r.tag}`).catch(() => {})
      await fill(page, 'UTR / Payment Reference', `UTR-${r.tag}`)
      const s4 = (await text(page)).slice((await text(page)).indexOf('4 · Settlement'))
      const short = s4.match(/Settlement is ₹([\d,]+\.\d\d) short/)?.[1]
      r.check({ id: 'BL-41', role: A, screen: '/insurance → Settlement', title: 'Receiving exactly the approved ₹2,160 shows no shortfall', ok: !short || short === '0.00', bug: 'BUG-067', detail: s4.match(/Settlement is[^?]*\?/)?.[0] })
      if (!short) { await page.getByRole('button', { name: 'Record Settlement' }).click(); await wait(page, 4000); r.check({ id: 'BL-42', role: A, screen: '/insurance → Settlement', title: 'Record the settlement', ok: /Settled/.test((await text(page)).slice(0, 400)) }) }
      else r.blocked({ id: 'BL-42', role: A, screen: '/insurance → Settlement', title: 'Record the settlement', detail: 'needs a write-off of a shortfall that does not exist (BUG-067) — not recorded' })
    })

    // ── Accounts, cash book, shift, refund ──
    await withRole('accountant', async ({ page }) => {
      const A = 'accountant'
      await go(page, '/billing/cash-book'); const cb = await text(page)
      // A tile can be negative ("-₹50.00": more refunded than taken that way today).
      const n = (re: RegExp) => { const m = cb.match(new RegExp(re.source.replace('₹', '(-?)₹'))); return m ? Number(m[2].replace(/,/g, '')) * (m[1] ? -1 : 1) : 0 }
      const cash = n(/Cash ₹([\d,]+\.\d\d)/), card = n(/Card ₹([\d,]+\.\d\d)/), upi = n(/UPI ₹([\d,]+\.\d\d)/), bank = n(/Bank ₹([\d,]+\.\d\d)/), ins = n(/Insurance ₹([\d,]+\.\d\d)/), out = n(/Refunds Out ₹([\d,]+\.\d\d)/), net = n(/Net Collected ₹([\d,]+\.\d\d)/)
      r.check({ id: 'BL-50', role: A, screen: '/billing/cash-book', title: 'Cash book: cash + card + UPI + bank + insurance = net collected (each already net of its refunds)', ok: Math.abs(cash + card + upi + bank + ins - net) < 1, detail: `${cash}+${card}+${upi}+${bank}+${ins} vs ${net} (refunds out ${out})` })
      await go(page, '/accounts'); const ac = await text(page)
      const col = Number((ac.match(/COLLECTED ₹([\d,]+\.\d\d)/)?.[1] ?? '0').replace(/,/g, ''))
      r.check({ id: 'BL-51', role: A, screen: '/accounts', title: 'Day-end "collected" matches the cash book', ok: Math.abs(col - (cash + card + upi + bank)) < 1 || Math.abs(col - net) < 1, detail: `accounts ${col} · cash book ${net}` })
      await openBill(page, r.patient('murugan').full_name, /Radiology/)
      await page.getByRole('button', { name: 'Refund' }).click(); await wait(page, 1500)
      const amt = page.locator('label', { hasText: /^Refund amount/ }).locator('xpath=..').locator('input').first()
      await amt.fill('99999'); await page.locator('label', { hasText: /^Reason/ }).locator('xpath=..').locator('input, textarea').first().fill('Billed in error').catch(() => {})
      await page.getByRole('button', { name: 'Issue Refund' }).click(); await wait(page, 2500)
      r.check({ id: 'BL-52', role: A, screen: '/billing/[id] → Refund', title: 'A refund larger than what was paid is refused', ok: await amt.isVisible().catch(() => false) })
      const paid = ((await text(page)).match(/Paid ₹([\d,]+\.\d\d)/)?.[1] ?? '0').replace(/,/g, '')
      await amt.fill(paid); await page.getByRole('button', { name: 'Issue Refund' }).click(); await wait(page, 3500)
      r.check({ id: 'BL-53', role: A, screen: '/billing/[id] → Refund', title: `Refund ₹${paid} on Murugan's X-ray bill (credit note)`, ok: /Refunded \(credit notes\)/.test(await text(page)) })
    })
    await withRole('receptionist', async ({ page }) => {
      await go(page, '/billing/cash-book'); await page.getByRole('button', { name: 'My Shift' }).click(); await wait(page, 2000)
      const exp = Number(((await text(page)).match(/Expected Cash ₹([\d,]+\.\d\d)/)?.[1] ?? '0').replace(/,/g, ''))
      await page.locator('label', { hasText: /^Cash counted/ }).locator('xpath=..').locator('input').fill(String(Math.max(0, exp - 50)))
      await page.getByPlaceholder('Handover remarks…').fill(`₹50 short ${r.tag}`)
      await page.getByRole('button', { name: 'Close Shift' }).click(); await wait(page, 3500)
      await page.getByRole('button', { name: 'Shift History' }).click(); await wait(page, 2000)
      r.check({ id: 'BL-54', role: 'receptionist', screen: '/billing/cash-book → My Shift', title: 'Close the shift ₹50 short — the variance shows in history', ok: /-₹50\.00/.test(await text(page)) })
    })
    void pick
  },
} satisfies Flow
