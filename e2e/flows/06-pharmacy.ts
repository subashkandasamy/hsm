// Pharmacy, every screen: receive stock (typed, copied, imported, labels),
// the stock list (search, filters, edit, labels), alerts, the counter sale
// cart (incl. a Schedule X supply and a cancelled cart), OPD dispensing
// (pack, skip/restore, extra drug, bill, payment, dispatch, history), ward
// requests, vaccine stock set-up, every report with its CSV, and who may open
// what. Every action is done on the screens; the database is only READ, to
// check that the numbers the screens show are the numbers that were stored.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright-core'
import { withRole, go, wait, text, bodyText, pathOf } from '../lib/browser'
import { buttonIn } from '../lib/ui'
import { openBill, recordPayment } from '../lib/actions'
import { ROOT } from '../lib/env'
import type { Flow, Run } from '../lib/run'

const P = 'pharmacist'
const line = (page: Page, i: number, ph: string) => page.getByPlaceholder(ph, { exact: true }).nth(i)
const flat = (s: string) => s.replace(/\s+/g, ' ')
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Read-only view of the demo data, to check stored values. Never written to. */
function reader() {
  const envFile = path.join(ROOT, '..', '.env.local')
  const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

async function tab(page: Page, name: RegExp) {
  await go(page, '/pharmacy'); await wait(page, 1500)
  await page.getByRole('button', { name }).first().click(); await wait(page, 2000)
}

/** Click something that downloads a file; returns its name and text (CSV). */
async function download(page: Page, click: () => Promise<unknown>): Promise<{ name: string; body: string } | null> {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), click()])
  if (!d) return null
  const p = await d.path().catch(() => null)
  return { name: d.suggestedFilename(), body: p ? fs.readFileSync(p, 'utf8') : '' }
}

/** Open a URL in the signed-in browser and return status + content type. */
async function fetchStatus(page: Page, url: string): Promise<{ status: number; type: string; bytes: number }> {
  return page.evaluate(`(async () => { const r = await fetch(${JSON.stringify(url)}); const b = await r.arrayBuffer(); return { status: r.status, type: r.headers.get('content-type') || '', bytes: b.byteLength } })()`)
}

const mmyy = (monthsAhead: number) => {
  const d = new Date(); d.setMonth(d.getMonth() + monthsAhead)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`
}

export default {
  name: 'pharmacy', title: '06 Pharmacy',
  async run(r: Run) {
    const db = reader()
    const { data: demo } = await db.from('tenants').select('id').eq('slug', 'demo').single()
    const tenant = demo!.id as string
    const l = r.patient('lakshmi')
    const m = r.patient('murugan')
    const s = r.patient('ramasamy')
    const INV = `E2E-INV-${r.tag}`
    const qtyOf = async (batchNo: string) =>
      (await db.from('drug_batches').select('qty_available').eq('tenant_id', tenant).eq('batch_no', batchNo).maybeSingle()).data?.qty_available as number | undefined
    // A medicine only this hospital stocks (not in the national catalogue).
    const OWN = `E2E Kofsil Syrup ${r.tag}`
    // Every in-stock batch of the Dolo 650 this run received, old runs' included — FEFO is judged across all of them.
    const doloBatches = async () => {
      const { data: d } = await db.from('drug_batches').select('drug_id, drug_master_id').eq('tenant_id', tenant).eq('batch_no', `DOLO-${r.tag}`).maybeSingle()
      if (!d) return []
      let q = db.from('drug_batches').select('id, batch_no, expiry, qty_available').eq('tenant_id', tenant).gt('qty_available', 0)
      q = d.drug_master_id ? q.eq('drug_master_id', d.drug_master_id) : q.eq('drug_id', d.drug_id)
      return ((await q).data ?? []) as Array<{ id: string; batch_no: string; expiry: string; qty_available: number }>
    }

    await withRole('pharmacist', async ({ page }) => {
      // ── 1. Receive stock ───────────────────────────────────────────────────
      const startGrn = async (invoice = INV) => {
        await go(page, '/pharmacy/receive'); await wait(page, 1500)
        await page.getByPlaceholder('e.g. Apex Pharma Distributors').fill('E2E Karur Pharma Distributors')
        await page.getByPlaceholder('INV-2291').fill(invoice)
      }
      const pickDrug = async (i: number, q: string, re: RegExp) => {
        // A picked line's search box is replaced by the medicine, so the box to type in is the last one.
        void i
        await page.getByPlaceholder('Type brand or salt, or scan…').last().fill(q); await wait(page, 2500)
        await page.locator('button, li, [role=option]').filter({ hasText: re }).first().click(); await wait(page, 800)
      }
      const fillLine = async (i: number, v: { batch: string; exp: string; packs: string; rate: string; mrp: string; free?: string }) => {
        await line(page, i, 'B2291').fill(v.batch); await line(page, i, 'MM/YY').fill(v.exp); await line(page, i, '10').fill(v.packs)
        if (v.free) await line(page, i, '0').fill(v.free)
        await line(page, i, '80').fill(v.rate); await line(page, i, '10.50').fill(v.mrp)
      }
      const receive = async () => { await page.getByRole('button', { name: 'Receive stock', exact: true }).last().click(); await wait(page, 4000); return bodyText(page) }

      await r.step('PH-01', P, '/pharmacy/receive', 'Expired batch refused', async () => {
        await startGrn(`${INV}-X`); await pickDrug(0, 'A Cef', /A Cef 1gm/i)
        await fillLine(0, { batch: `OLD-${r.tag}`, exp: '01/25', packs: '5', rate: '45', mrp: '60' })
        const t = await receive()
        r.check({ id: 'PH-01', role: P, screen: '/pharmacy/receive', title: 'A batch that expired in 01/25 is refused', ok: /expiry has passed/.test(t) && !/Received \d+ units/.test(t), detail: t.match(/[^.·]*expiry has passed/)?.[0]?.slice(0, 120) })
      })

      await r.step('PH-02', P, '/pharmacy/receive', 'Receive a three-line invoice', async () => {
        await startGrn()
        await page.getByPlaceholder('to check the lines').fill('1')                        // invoice total, deliberately wrong
        await pickDrug(0, 'A Cef', /A Cef 1gm/i)
        await fillLine(0, { batch: `ACF-${r.tag}`, exp: '12/28', packs: '10', rate: '45', mrp: '60', free: '1' })
        await page.getByRole('button', { name: /Add medicine/ }).click(); await wait(page, 600)
        await pickDrug(1, 'Dolo', /Dolo 650/i)
        await fillLine(1, { batch: `DOLO-${r.tag}`, exp: '10/28', packs: '20', rate: '25', mrp: '32' })
        await page.getByRole('button', { name: /Add medicine/ }).click(); await wait(page, 600)
        await pickDrug(2, 'Dolo', /Dolo 650/i)
        // Near-expiry batch — feeds the expiry alert and the expiry report.
        await fillLine(2, { batch: `DOLOX-${r.tag}`, exp: mmyy(1), packs: '2', rate: '25', mrp: '32' })
        const before = await bodyText(page)
        r.check({ id: 'PH-02a', role: P, screen: '/pharmacy/receive', title: 'Totals and the invoice-total mismatch warning show before saving', ok: /3 medicines/.test(before) && /Invoice says/.test(before), detail: before.match(/\d+ medicines?[^·]*·[^·]*·[^p]*purchase value/)?.[0] })
        const t = await receive()
        r.check({ id: 'PH-02', role: P, screen: '/pharmacy/receive', title: 'Receive 3 lines (A Cef + free pack, Dolo 650, a near-expiry Dolo batch)', ok: /Received \d+ units · 3 new batch/.test(t), detail: t.match(/Received [^·]+·[^·\n]+/)?.[0] })
        const acf = await qtyOf(`ACF-${r.tag}`)
        r.check({ id: 'PH-02b', role: P, screen: '/pharmacy/receive', title: 'Stored quantity counts the free pack (A Cef 10 + 1 packs)', ok: acf != null && acf > 0, detail: `A Cef batch on hand: ${acf}` })
        const lab = await page.getByRole('button', { name: 'Print shelf labels' }).isVisible().catch(() => false)
        if (lab) {
          const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null), page.getByRole('button', { name: 'Print shelf labels' }).click()])
          const url = pop ? pop.url() : ''
          if (pop) await pop.close().catch(() => {})
          const st = url ? await fetchStatus(page, new URL(url).pathname + new URL(url).search) : { status: 0, type: '', bytes: 0 }
          r.check({ id: 'PH-02c', role: P, screen: '/print/batch-labels', title: 'Shelf labels for the invoice print (PDF)', ok: st.status === 200 && /pdf/.test(st.type), detail: `${st.status} ${st.type} ${st.bytes} B` })
        } else r.check({ id: 'PH-02c', role: P, screen: '/pharmacy/receive', title: 'Shelf labels for the invoice print (PDF)', ok: false, detail: 'no "Print shelf labels" after receiving' })
        await page.getByRole('button', { name: 'Receive another invoice' }).click(); await wait(page, 800)
        const fresh = await bodyText(page)
        r.check({ id: 'PH-02d', role: P, screen: '/pharmacy/receive', title: '"Receive another invoice" starts a clean invoice; the last one is under Recent', ok: !/Received \d+ units/.test(fresh) && fresh.includes(INV), detail: fresh.match(/Recent:[^\n]{0,160}/)?.[0] })
      })

      await r.step('PH-03', P, '/pharmacy/receive', 'Copy last line, remove a line', async () => {
        await startGrn(`${INV}-C`)
        await pickDrug(0, 'Dolo', /Dolo 650/i)
        await fillLine(0, { batch: `DOLOC-${r.tag}`, exp: '11/28', packs: '1', rate: '25', mrp: '32' })
        await page.getByRole('button', { name: /Add medicine/ }).click(); await wait(page, 600)
        const copy = page.getByRole('button', { name: /same as last time/i }).last()
        const hasCopy = await copy.isVisible().catch(() => false)
        if (hasCopy) { await copy.click(); await wait(page, 600) }
        const rows = await page.getByPlaceholder('B2291', { exact: true }).count()
        await page.getByTitle('Remove line').last().click(); await wait(page, 500)
        const after = await page.getByPlaceholder('B2291', { exact: true }).count()
        r.check({ id: 'PH-03', role: P, screen: '/pharmacy/receive', title: 'Add a line, copy the last, and remove a line', ok: rows >= 2 && after === rows - 1, detail: `${rows} lines → ${after}${hasCopy ? '' : ' (no copy button)'}` })
      })

      await r.step('PH-04i', P, '/pharmacy/receive', 'Import an invoice by pasting rows', async () => {
        await go(page, '/pharmacy/receive'); await wait(page, 1500)
        await page.getByRole('button', { name: /Import/i }).first().click(); await wait(page, 800)
        await page.locator('textarea').first().fill(`Item\tBatch\tExp\tQty\tRate\tMRP\nDOLO 650 TAB\tIMP-${r.tag}\t09/28\t3\t25\t32`)
        await page.getByRole('button', { name: /^Read/ }).first().click().catch(async () => { await page.locator('button', { hasText: /Read|Use/ }).first().click() })
        await wait(page, 2500)
        const panel = await bodyText(page)
        const load = page.getByRole('button', { name: /^Load|^Add .* lines|^Use/ }).last()
        const canLoad = await load.isVisible().catch(() => false)
        if (canLoad) { await load.click(); await wait(page, 2500) }
        const filled = await page.getByPlaceholder('B2291', { exact: true }).first().inputValue().catch(() => '')
        r.check({ id: 'PH-04i', role: P, screen: '/pharmacy/receive', title: 'Pasted invoice rows fill the invoice lines', ok: filled === `IMP-${r.tag}`, detail: filled || panel.match(/(column|row|match)[^.]{0,120}/i)?.[0] })
      })

      // A medicine the national catalogue does not have goes on the hospital's own
      // list from the receive screen. Only such a medicine has a schedule the
      // hospital sets itself — it feeds the H1 register checks below.
      await r.step('PH-05o', P, '/pharmacy/receive', 'A medicine not in the catalogue', async () => {
        await startGrn(`${INV}-O`)
        await page.getByPlaceholder('Type brand or salt, or scan…').last().fill(OWN); await wait(page, 2500)
        const add = page.getByRole('button', { name: /none of these — add/ }).first()
        const offered = await add.isVisible().catch(() => false)
        if (offered) { await add.click(); await wait(page, 3000) }
        await fillLine(0, { batch: `OWN-${r.tag}`, exp: '06/28', packs: '5', rate: '40', mrp: '55' })
        const t = await receive()
        const { data: d } = await db.from('drugs').select('id, name, schedule').eq('tenant_id', tenant).eq('name', OWN).maybeSingle()
        const q = await qtyOf(`OWN-${r.tag}`)
        r.check({ id: 'PH-05o', role: P, screen: '/pharmacy/receive', title: 'A medicine not in the catalogue is added to the hospital\'s own list ("none of these — add …") and received', ok: offered && !!d && (q ?? 0) > 0 && /Received \d+ units/.test(t), detail: `${offered ? '' : 'no "add to our list" button · '}${d ? 'on the hospital list' : 'not on the list'} · ${q ?? 0} on hand` })
        r.set('pharmacy_own', d?.id ?? null)
      })

      await r.step('PH-05p', P, '/pharmacy/receive?low=1', 'Reorder prefill', async () => {
        await go(page, '/pharmacy/receive?low=1'); await wait(page, 2000)
        const t = await bodyText(page)
        r.note({ id: 'PH-05p', role: P, screen: '/pharmacy/receive?low=1', title: '"Reorder" opens the invoice pre-filled with what is running low', detail: t.match(/\d+ medicines? (is|are) at or below the reorder level/)?.[0] ?? 'nothing at or below its reorder level on demo right now' })
      })

      // ── 2. Stock list ─────────────────────────────────────────────────────
      await r.step('PH-10', P, '/pharmacy → Stock', 'Search, filters, a drug\'s batches', async () => {
        await tab(page, /^Stock/)
        const search = page.getByPlaceholder('Search brand, salt, batch number or rack…')
        await search.fill(`ACF-${r.tag}`); await wait(page, 1200)
        const byBatch = await text(page)
        r.check({ id: 'PH-10', role: P, screen: '/pharmacy → Stock', title: 'Search by batch number finds the received batch', ok: /A Cef/i.test(byBatch), detail: byBatch.match(/A Cef[^\n]{0,80}/i)?.[0] })
        await search.fill('Dolo'); await wait(page, 1200)
        const byBrand = await text(page)
        const dolo = byBrand.match(/Dolo 650[^₹]{0,60}/)?.[0] ?? ''
        r.check({ id: 'PH-11', role: P, screen: '/pharmacy → Stock', title: 'Search by brand; Dolo 650 shows as 650 mg', ok: /Dolo 650/.test(byBrand) && !/500\s?mg/i.test(dolo), bug: 'BUG-017', detail: dolo })
        await search.fill(''); await wait(page, 800)
        const counts: string[] = []
        for (const f of ['Running low', 'Expiring soon', 'Out of stock', 'Vaccines', 'All']) {
          const b = page.locator('button:visible').filter({ hasText: new RegExp(`^${f}\\s*\\d+$`) }).first()
          if (await b.isVisible().catch(() => false)) { await b.click(); await wait(page, 700); counts.push(`${f}: ${(await b.innerText()).replace(/\s+/g, ' ')}`) }
        }
        r.check({ id: 'PH-12', role: P, screen: '/pharmacy → Stock', title: 'Filter chips (Running low, Expiring soon, Out of stock, Vaccines, All) all work', ok: counts.length === 5, detail: counts.join(' | ') })
        await page.locator('button:visible').filter({ hasText: /^Expiring soon\s*\d+$/ }).first().click(); await wait(page, 800)
        const exp = await text(page)
        r.check({ id: 'PH-13', role: P, screen: '/pharmacy → Stock', title: 'The batch expiring next month is under "Expiring soon"', ok: /Dolo 650/i.test(exp), detail: exp.match(/Dolo 650[^\n]{0,80}/)?.[0] })
        await page.locator('button:visible').filter({ hasText: /^All\s*\d+$/ }).first().click(); await wait(page, 600)
      })

      await r.step('PH-14', P, '/pharmacy → Stock', 'Edit a medicine', async () => {
        await tab(page, /^Stock/)
        const search = page.getByPlaceholder('Search brand, salt, batch number or rack…')
        // Dolo 650 comes from the national catalogue: alert level and rack are the hospital's, the schedule is not.
        await search.fill(`DOLO-${r.tag}`); await wait(page, 1200)
        await page.getByTitle('Edit stock').first().click(); await wait(page, 1000)
        await page.getByPlaceholder('off').first().fill('100000')                                  // "Alert below" — forces a low-stock alert
        // The edit panel lists every batch of the medicine — the rack goes on this run's batch card.
        const cards = page.locator('div.rounded-xl.p-3.space-y-2')
        let card = -1
        for (let i = 0; i < await cards.count(); i++) if ((await cards.nth(i).locator('input').first().inputValue().catch(() => '')) === `DOLO-${r.tag}`) { card = i; break }
        await cards.nth(Math.max(card, 0)).getByPlaceholder('e.g. Rack A / Shelf 2 / Bin 3').fill(`E2E Rack ${r.tag}`)
        const picker = page.locator('label', { hasText: /^Schedule$/ })
        const catNote = flat(await text(page)).match(/[^.]{0,40}set by the national catalogue[^.]*/)?.[0] ?? ''
        r.check({ id: 'PH-14a', role: P, screen: '/pharmacy → Stock → Edit', title: 'A catalogue medicine\'s schedule cannot be changed by the hospital (no picker; the catalogue\'s is shown)', ok: !(await picker.first().isVisible().catch(() => false)), detail: catNote || 'no schedule note' })
        await page.getByRole('button', { name: 'Save Changes' }).click(); await wait(page, 3000)
        const { data: b } = await db.from('drug_batches').select('storage_location, drug_id, drug_master_id, reorder_level').eq('tenant_id', tenant).eq('batch_no', `DOLO-${r.tag}`).maybeSingle()
        r.check({ id: 'PH-14', role: P, screen: '/pharmacy → Stock', title: 'Edit stock: alert level and rack location saved', ok: b?.storage_location === `E2E Rack ${r.tag}` && Number(b?.reorder_level) === 100000, detail: `rack: ${b?.storage_location} · alert below ${b?.reorder_level}` })
        await search.fill(`E2E Rack ${r.tag}`); await wait(page, 1200)
        r.check({ id: 'PH-15', role: P, screen: '/pharmacy → Stock', title: 'Search by rack finds it', ok: /Dolo 650/.test(await text(page)) })
        r.set('pharmacy_dolo', { drug_id: b?.drug_id ?? null, drug_master_id: b?.drug_master_id ?? null })

        // The hospital's own medicine: its schedule is the hospital's to set.
        await search.fill(`OWN-${r.tag}`); await wait(page, 1200)
        await page.getByTitle('Edit stock').first().click(); await wait(page, 1000)
        const sch = picker.first().locator('xpath=following::select[1]')
        await sch.selectOption('H1')
        await page.getByRole('button', { name: 'Save Changes' }).click(); await wait(page, 3000)
        const { data: d } = await db.from('drugs').select('schedule').eq('tenant_id', tenant).eq('name', OWN).maybeSingle()
        await search.fill(`OWN-${r.tag}`); await wait(page, 1200)
        const t = await text(page)
        r.check({ id: 'PH-16', role: P, screen: '/pharmacy → Stock', title: 'The hospital\'s own medicine is set to Schedule H1, and the list shows it', ok: d?.schedule === 'H1' && new RegExp(`${esc(OWN)}[\\s\\S]{0,200}H1`).test(t), detail: `stored ${d?.schedule ?? 'none'} · ${t.match(new RegExp(`${esc(OWN)}[^\\n]{0,80}`))?.[0] ?? ''}` })
      })

      await r.step('PH-17', P, '/pharmacy → Stock', 'Shelf labels from the stock list', async () => {
        await tab(page, /^Stock/)
        await page.getByPlaceholder('Search brand, salt, batch number or rack…').fill(`DOLO-${r.tag}`); await wait(page, 1200)
        await page.locator('button').filter({ hasText: /Dolo 650/ }).first().click().catch(() => {}); await wait(page, 800)
        const btn = page.getByRole('button', { name: /Print shelf labels/ }).first()
        if (!(await btn.isVisible().catch(() => false))) { r.check({ id: 'PH-17', role: P, screen: '/pharmacy → Stock', title: 'Shelf labels print from the stock list (PDF)', ok: false, detail: 'no "Print shelf labels" on the open medicine' }); return }
        const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: 15000 }).catch(() => null), btn.click()])
        const url = pop ? pop.url() : ''; if (pop) await pop.close().catch(() => {})
        const st = url ? await fetchStatus(page, new URL(url).pathname + new URL(url).search) : { status: 0, type: '', bytes: 0 }
        r.check({ id: 'PH-17', role: P, screen: '/print/batch-labels', title: 'Shelf labels print from the stock list (PDF)', ok: st.status === 200 && /pdf/.test(st.type), detail: `${st.status} ${st.bytes} B` })
      })

      // ── 3. Alerts ─────────────────────────────────────────────────────────
      await r.step('PH-20', P, '/pharmacy → Alerts', 'Alerts', async () => {
        await tab(page, /^Alerts/)
        const t = await text(page)
        r.check({ id: 'PH-20', role: P, screen: '/pharmacy → Alerts', title: 'Dolo 650 (alert level raised) is listed as running low', ok: /Dolo 650/.test(t) && /low|reorder/i.test(t), detail: t.match(/Dolo 650[^\n]{0,100}/)?.[0] })
        r.check({ id: 'PH-21', role: P, screen: '/pharmacy → Alerts', title: 'The near-expiry batch is listed under expiring', ok: t.includes(`DOLOX-${r.tag}`) || /expir/i.test(t), detail: t.match(/[^\n]*expir[^\n]{0,100}/i)?.[0] })
        const reorder = page.getByRole('link', { name: /Order what.s low/ }).first()
        r.check({ id: 'PH-22', role: P, screen: '/pharmacy → Alerts', title: 'Alerts offer a reorder that opens Receive stock pre-filled', ok: (await reorder.getAttribute('href').catch(() => '')) === '/pharmacy/receive?low=1' })
      })

      // ── 4. Counter sale ───────────────────────────────────────────────────
      const startCart = async (name: string) => {
        await tab(page, /^Sale Cart/)
        // A cart an earlier, interrupted session left open opens straight away — close it first.
        for (let k = 0; k < 3 && await page.getByRole('button', { name: 'Cancel Cart' }).isVisible().catch(() => false); k++) {
          await page.getByRole('button', { name: 'Cancel Cart' }).click(); await wait(page, 2500)
        }
        await page.getByPlaceholder('Type name, UHID or phone…').fill(name.split(' ')[0] + ' ' + name.split(' ')[1]); await wait(page, 1500)
        await page.locator('button').filter({ hasText: name }).first().click(); await wait(page, 600)
        await page.getByRole('button', { name: 'Start Cart' }).click(); await wait(page, 2500)
      }
      const addToCart = async (q: string, re: RegExp, qty = 1) => {
        await page.getByPlaceholder('Search drug by name…').fill(q); await wait(page, 1800)
        await page.locator('button').filter({ hasText: re }).first().click(); await wait(page, 600)
        const qtyBox = page.locator('input[type=number]').first()
        await qtyBox.fill(String(qty))
        await page.getByRole('button', { name: 'Add', exact: true }).click(); await wait(page, 2500)
      }

      await r.step('PH-30', P, '/pharmacy → Sale Cart', 'Cancel a cart', async () => {
        await startCart(s.full_name)
        await addToCart('Dolo', /Dolo 650/i, 1)
        await page.getByRole('button', { name: 'Cancel Cart' }).click(); await wait(page, 2500)
        const t = await text(page)
        r.check({ id: 'PH-30', role: P, screen: '/pharmacy → Sale Cart', title: 'Cancel Cart discards it (back to patient search)', ok: !(await page.getByRole('button', { name: 'Cancel Cart' }).isVisible().catch(() => false)) && /SEARCH PATIENT/i.test(t) })
      })

      let saleBill = ''
      await r.step('PH-31', P, '/pharmacy → Sale Cart', 'Counter sale', async () => {
        const before = await doloBatches()
        await startCart(s.full_name)
        await addToCart('Dolo', /Dolo 650/i, 2)
        await addToCart(OWN, new RegExp(esc(OWN)), 1)
        await addToCart('A Cef', /A Cef/i, 1)
        let t = await text(page)
        r.check({ id: 'PH-31', role: P, screen: '/pharmacy → Sale Cart', title: 'Three medicines in the cart (one Schedule H1) with a total', ok: /Dolo 650/.test(t) && t.includes(OWN) && /A Cef/i.test(t) && /Total/.test(t), detail: t.match(/Total[^\n]{0,30}/)?.[0] })
        const totalOf = (x: string) => Number((x.match(/Total\s*₹([\d,.]+)/)?.[1] ?? '0').replace(/,/g, ''))
        const t0 = totalOf(t)
        const plus = page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).last()
        await plus.click().catch(() => {}); await wait(page, 1800)
        t = await text(page)
        r.check({ id: 'PH-32', role: P, screen: '/pharmacy → Sale Cart', title: 'Raising a quantity in the cart raises the total', ok: totalOf(t) > t0, detail: `₹${t0} → ₹${totalOf(t)}` })
        const removeBtns = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2, svg.lucide-x') })
        const nItems = (t.match(/A Cef/gi) ?? []).length
        await removeBtns.last().click().catch(() => {}); await wait(page, 2000)
        const afterRemove = await text(page)
        r.check({ id: 'PH-33', role: P, screen: '/pharmacy → Sale Cart', title: 'An item can be removed from the cart', ok: (afterRemove.match(/A Cef/gi) ?? []).length < nItems || !/A Cef/i.test(afterRemove), detail: `${nItems} → ${(afterRemove.match(/A Cef/gi) ?? []).length}` })
        await page.getByRole('button', { name: 'Finalize & Send to Counter' }).click(); await wait(page, 4000)
        t = await text(page)
        const queued = t.includes(s.full_name) && /(Awaiting Payment|Hand Over)/.test(t)
        r.check({ id: 'PH-34', role: P, screen: '/pharmacy → Sale Cart', title: 'Finalize sends the sale to the Fulfillment Queue with a bill', ok: queued, detail: t.match(/Fulfillment Queue[^\n]{0,200}/)?.[0] })
        const { data: sale } = await db.from('pharmacy_sales').select('id, status, bill:bills(bill_no, total, status)').eq('tenant_id', tenant).order('created_at', { ascending: false }).limit(1).maybeSingle()
        const bill = sale?.bill as unknown as { bill_no: string; total: number } | null
        saleBill = bill?.bill_no ?? ''
        r.check({ id: 'PH-35', role: P, screen: '/pharmacy → Sale Cart', title: 'The sale has a bill with a total above zero', ok: !!bill && Number(bill.total) > 0, detail: `${bill?.bill_no} ₹${bill?.total} · sale ${sale?.status}` })
        r.set('pharmacy_sale', { id: sale?.id, bill: saleBill, before })
      })

      // ── 5. OPD prescriptions ──────────────────────────────────────────────
      await r.step('PH-40', P, '/pharmacy → Dispense', 'Pack Murugan\'s prescription', async () => {
        await tab(page, /^Dispense/)
        let t = await text(page)
        r.check({ id: 'PH-40', role: P, screen: '/pharmacy → Dispense', title: `${m.full_name}'s prescription is waiting to be dispensed`, ok: t.includes(m.full_name), detail: t.match(new RegExp(`${m.full_name}[^\\n]{0,80}`))?.[0] })
        if (!t.includes(m.full_name)) return
        const groupHead = page.locator('button').filter({ hasText: m.full_name }).first()
        await groupHead.click().catch(() => {}); await wait(page, 1000)
        // Skip one drug and bring it back.
        const skip = page.getByTitle('Skip this drug').first()
        if (await skip.isVisible().catch(() => false)) {
          await skip.click(); await wait(page, 800)
          const skipped = /Skipped this session/.test(await text(page))
          await page.getByRole('button', { name: 'Restore' }).first().click().catch(() => {}); await wait(page, 800)
          r.check({ id: 'PH-41', role: P, screen: '/pharmacy → Dispense', title: 'A drug can be skipped and restored', ok: skipped && !/Skipped this session/.test(await text(page)) })
        }
        // Extra drug
        await page.getByRole('button', { name: 'Add Drug' }).first().click().catch(() => {}); await wait(page, 800)
        const extraSearch = page.getByPlaceholder('Search drug by brand or generic…').first()
        if (await extraSearch.isVisible().catch(() => false)) {
          await extraSearch.fill('Dolo'); await wait(page, 1800)
          await page.locator('button, li').filter({ hasText: /Dolo 650/i }).first().click(); await wait(page, 600)
          await page.getByPlaceholder('Qty').first().fill('2')
          await page.getByRole('button', { name: 'Add & Pack' }).click(); await wait(page, 3000)
          t = await text(page)
          r.check({ id: 'PH-42', role: P, screen: '/pharmacy → Dispense', title: 'An extra drug can be added and packed', ok: /extra/i.test(t) || /Dolo 650/.test(t), detail: t.match(new RegExp(`${m.full_name}[^\\n]{0,120}`))?.[0] })
        }
        // Pack every remaining prescription line.
        let packed = 0
        for (let k = 0; k < 8; k++) {
          const pack = page.getByRole('button', { name: 'Pack', exact: true }).first()
          if (!(await pack.isVisible().catch(() => false))) break
          await pack.click()
          const dlg = page.getByRole('dialog').last()
          let dt = ''
          for (let w = 0; w < 16; w++) { await wait(page, 500); dt = flat(await dlg.innerText().catch(() => '')); if (/FEFO Batch Selected|Insufficient Stock/.test(dt) && !/Checking stock/.test(dt)) break }
          if (k === 0) r.check({ id: 'PH-43', role: P, screen: '/pharmacy → Dispense', title: 'Pack shows the batch picked first-expiry-first, its stock, expiry and price', ok: /Batch:/.test(dt) && /Available:/.test(dt) && /Expires:/.test(dt) && /Total:/.test(dt), detail: dt.match(/Batch:[^]*?Total:[^A-Z]{0,20}/)?.[0]?.slice(0, 140) })
          if (k === 0) r.check({ id: 'PH-43a', role: P, screen: '/pharmacy → Dispense', title: 'Pack picks the medicine actually on the shelf in the prescribed strength (not an out-of-stock twin)', ok: /FEFO Batch Selected/.test(dt), detail: dt.match(/PRESCRIPTION [^]*?(FEFO Batch Selected|Insufficient Stock)/)?.[0]?.slice(0, 160) })
          await dlg.getByRole('button', { name: 'Dispense & Pack' }).click().catch(() => {}); await wait(page, 3000)
          if (await dlg.isVisible().catch(() => false)) { await dlg.getByRole('button', { name: 'Cancel' }).click().catch(() => {}); break }
          packed++
        }
        await wait(page, 3000); await tab(page, /^Dispense/)
        t = await text(page)
        const billNo = t.match(/(Awaiting Payment|Unpaid — collect at billing) · ([A-Z0-9][A-Z0-9/-]+)/)?.[2] ?? ''
        r.check({ id: 'PH-44', role: P, screen: '/pharmacy → Dispense', title: `Everything packed (${packed}) → a pharmacy bill is raised`, ok: packed > 0 && /(Awaiting Payment|Dispatch)/.test(t), detail: t.match(new RegExp(`${m.full_name}[^\\n]{0,160}`))?.[0] })
        r.set('pharmacy_opd_bill', billNo)
      })

      // ── 6. Ward requests ──────────────────────────────────────────────────
      await r.step('PH-50', P, '/pharmacy → IPD Ward', 'Ward requests', async () => {
        await tab(page, /^IPD Ward/)
        const q = await text(page)
        const pan = q.match(/Pantoprazole[^₹]{0,160}?(Not in stock|\d+ in stock)/)?.[0] ?? ''
        r.check({ id: 'PH-50', role: P, screen: '/pharmacy → IPD Ward', title: 'A ward request typed as a generic (Pantoprazole) is matched to the brand in stock', ok: /\d+ in stock/.test(pan), bug: 'BUG-018', detail: pan.slice(0, 160) })
        let n = 0
        for (let k = 0; k < 12; k++) {
          const b = await buttonIn(page, 'Dispense', [l.full_name]).catch(() => null)
          if (!b) break
          await b.click(); await wait(page, 1500)
          const sub = page.getByLabel('Dispense from stock')
          if (await sub.isVisible().catch(() => false)) { await sub.selectOption({ index: 1 }).catch(() => {}); await wait(page, 600) }
          await page.getByRole('button', { name: 'Confirm Dispense', exact: true }).click(); await wait(page, 3500); n++
          await tab(page, /^IPD Ward/)
        }
        r.check({ id: 'PH-51', role: P, screen: '/pharmacy → IPD Ward', title: `Dispense ${l.full_name}'s ward requests (${n})`, ok: n >= 3 && !(await buttonIn(page, 'Dispense', [l.full_name]).catch(() => null)), detail: `${n} dispensed` })
        const after = await text(page)
        r.check({ id: 'PH-52', role: P, screen: '/pharmacy → IPD Ward', title: 'Dispensed requests move to the ward history', ok: after.includes(l.full_name), detail: after.match(new RegExp(`${l.full_name}[^\\n]{0,100}`))?.[0] })
        const lid = String(l.url ?? '').match(/[0-9a-f-]{36}/)?.[0] ?? ''
        const { data: adm } = await db.from('admissions').select('id').eq('tenant_id', tenant).eq('patient_id', lid).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (adm) {
          const { count } = await db.from('ipd_pharmacy_requests').select('id', { count: 'exact', head: true }).eq('admission_id', adm.id).eq('status', 'dispensed')
          r.check({ id: 'PH-53', role: P, screen: '/pharmacy → IPD Ward', title: 'The dispensed ward requests are stored as dispensed', ok: (count ?? 0) >= n, detail: `${count} dispensed on the admission` })
        }
      })

      // ── 7. Vaccine stock set-up ───────────────────────────────────────────
      await r.step('PH-60', P, '/pharmacy → Vaccines', 'Vaccine stock', async () => {
        await tab(page, /^Vaccines/)
        const t = await text(page)
        r.check({ id: 'PH-60', role: P, screen: '/pharmacy → Vaccines', title: 'The Vaccines tab opens (orders and vaccine stock)', ok: /Vaccine stock/.test(t), detail: t.match(/Vaccine stock[^\n]{0,120}/)?.[0] })
        const unset = page.getByRole('button', { name: /^Not set up yet/ })
        if (await unset.isVisible().catch(() => false)) { await unset.click(); await wait(page, 800) }
        const link = page.getByRole('button', { name: /Link brand|Add brand/ }).first()
        if (await link.isVisible().catch(() => false)) {
          await link.click(); await wait(page, 800)
          const box = page.getByPlaceholder(/Search the pharmacy for/).first()
          const opened = await box.isVisible().catch(() => false)
          if (opened) { await box.fill('Dolo'); await wait(page, 1500) }
          r.check({ id: 'PH-61', role: P, screen: '/pharmacy → Vaccines', title: '"Link brand" opens a search of the pharmacy\'s stock', ok: opened, detail: 'search opened; nothing linked (demo holds no vaccine stock)' })
          await link.click().catch(() => {}); await wait(page, 500)
          // Follow one vaccine by name: once marked free it moves out of "Not set up yet".
          const free = page.getByRole('button', { name: 'Government (free)', exact: true }).first()
          const vaccine = flat(await free.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]//p[contains(@class,"font-semibold")]').first().innerText().catch(() => ''))
          const row = () => page.locator('div.rounded-xl').filter({ has: page.locator('p.font-semibold', { hasText: new RegExp(`^${esc(vaccine)}$`) }) }).last()
          const stored = async () => (await db.from('vaccine_settings').select('free_supply').eq('tenant_id', tenant).eq('vaccine', vaccine).maybeSingle()).data?.free_supply ?? false
          const was = await stored()
          await free.click().catch(() => {}); await wait(page, 2500)
          const isFree = await stored()
          const shown = /Government supply — free/.test(await row().innerText().catch(() => ''))
          await row().getByRole('button', { name: 'Charge for this', exact: true }).click().catch(() => {}); await wait(page, 2500)
          const back = await stored()
          r.check({ id: 'PH-62', role: P, screen: '/pharmacy → Vaccines', title: 'A vaccine can be switched to government-free and back to charged', ok: !!vaccine && was === false && isFree === true && shown && back === false, detail: `${vaccine}: ${was ? 'free' : 'charged'} → ${isFree ? 'free' : 'charged'}${shown ? ' (shown "Government supply — free")' : ''} → ${back ? 'free' : 'charged'}` })
        } else r.note({ id: 'PH-61', role: P, screen: '/pharmacy → Vaccines', title: 'Linking a pharmacy product to a vaccine', detail: 'no "Link brand" button visible' })
        r.note({ id: 'PH-63', role: P, screen: '/pharmacy → Vaccines', title: 'Dispensing a paid vaccine order', detail: 'not run: demo holds no vaccine stock, so a vaccine cannot be given and billed from the Paediatrics tab' })
      })

      // ── 8. Reports ────────────────────────────────────────────────────────
      await r.step('PH-70', P, '/pharmacy → Reports', 'Every report and its CSV', async () => {
        await tab(page, /^Reports/)
        const want: Array<[string, RegExp]> = [
          ['H1 register', /Schedule H1 register|No Schedule H1 medicine/],
          ['X register', /Schedule X register|No Schedule X medicine/],
          ['Without prescription', /Dispensed by|Patient|without/i],
          ['Expiry', /Days left|Expiry/],
          ['Stock & value', /At MRP|At cost|Value at MRP/],
          ['Purchases', /Supplier|Nothing was received/],
          ['Report V', /Report V|Form|PCPNDT|returns/i],
        ]
        for (const [name, re] of want) {
          await page.getByRole('tab', { name }).click(); await wait(page, 2500)
          const t = await text(page)
          const id = `PH-7${want.findIndex((w) => w[0] === name)}`
          let detail = ''
          if (name === 'Purchases') detail = t.includes(INV) ? `lists ${INV}` : 'invoice not listed'
          if (name === 'Expiry') detail = t.includes(`DOLOX-${r.tag}`) ? 'lists the near-expiry batch' : 'near-expiry batch not listed'
          r.check({ id, role: P, screen: '/pharmacy → Reports', title: `Report "${name}" opens${name === 'Purchases' ? ' and lists today\'s invoice' : name === 'Expiry' ? ' and lists the near-expiry batch' : ''}`, ok: re.test(t) && (name !== 'Purchases' || t.includes(INV)) && (name !== 'Expiry' || t.includes(`DOLOX-${r.tag}`)), detail })
          const exp = page.getByRole('button', { name: /Export|CSV|Download/ }).first()
          if (await exp.isVisible().catch(() => false) && await exp.isEnabled().catch(() => false)) {
            const d = await download(page, () => exp.click())
            r.check({ id: `${id}c`, role: P, screen: '/pharmacy → Reports', title: `"${name}" exports a CSV`, ok: !!d && /\.csv$/.test(d.name) && d.body.split('\n').length >= 2, detail: d ? `${d.name} · ${d.body.split('\n').length - 1} rows` : 'no download' })
          }
        }
      })
    })

    // ── 9. Payments at billing, then hand over / dispatch ──────────────────
    await withRole('receptionist', async ({ page }) => {
      const R = 'receptionist'
      await r.step('PH-80', R, '/billing', 'Pay the counter-sale bill', async () => {
        await openBill(page, s.full_name, /pharmacy|PH/i).catch(async () => { await openBill(page, s.full_name) })
        const due = (await text(page)).match(/Balance Due ₹([\d,.]+)/)?.[1]?.replace(/,/g, '') ?? '0'
        const after = await recordPayment(page, due, 'Cash')
        r.check({ id: 'PH-80', role: R, screen: '/billing/[id]', title: `${s.full_name}'s counter-sale bill paid (₹${due})`, ok: /Balance Due ₹0\.00/.test(after) || /\bpaid\b/i.test(after.slice(0, 300)), detail: after.match(/Balance Due ₹[\d,.]+/)?.[0] })
      })
      await r.step('PH-81', R, '/billing', 'Pay the dispensing bill', async () => {
        const opdBill = String(r.data.pharmacy_opd_bill ?? '')
        await openBill(page, m.full_name, opdBill ? new RegExp(esc(opdBill)) : /pharmacy|PH/i).catch(async () => { await openBill(page, m.full_name, /pharmacy|PH/i) })
        const due2 = (await text(page)).match(/Balance Due ₹([\d,.]+)/)?.[1]?.replace(/,/g, '') ?? '0'
        if (Number(due2) > 0) {
          const a2 = await recordPayment(page, due2, 'UPI', `E2E-${r.tag}`)
          r.check({ id: 'PH-81', role: R, screen: '/billing/[id]', title: `${m.full_name}'s pharmacy bill paid by UPI (₹${due2})`, ok: /Balance Due ₹0\.00/.test(a2) || /\bpaid\b/i.test(a2.slice(0, 300)), detail: a2.match(/Balance Due ₹[\d,.]+/)?.[0] })
        } else r.note({ id: 'PH-81', role: R, screen: '/billing/[id]', title: `${m.full_name}'s pharmacy bill`, detail: 'nothing due' })
      })
    })

    await withRole('pharmacist', async ({ page }) => {
      await r.step('PH-82', P, '/pharmacy → Sale Cart', 'Hand over the paid sale', async () => {
        await tab(page, /^Sale Cart/)
        const check = await buttonIn(page, 'Check Payment', [s.full_name]).catch(() => null)
        if (check) { await check.click(); await wait(page, 2500) }
        const hand = await buttonIn(page, 'Hand Over', [s.full_name]).catch(() => null)
        if (hand) { await hand.click(); await wait(page, 3500) }
        const t = await text(page)
        r.check({ id: 'PH-82', role: P, screen: '/pharmacy → Sale Cart', title: 'After payment the sale is handed over', ok: /handed over/i.test(t) || !(await buttonIn(page, 'Hand Over', [s.full_name]).catch(() => null)), detail: t.match(/Medicines handed over[^\n]*/)?.[0] })
        const sale = (r.data.pharmacy_sale ?? {}) as { id?: string; before?: number }
        const { data: row } = await db.from('pharmacy_sales').select('status').eq('id', sale.id ?? '').maybeSingle()
        r.check({ id: 'PH-83', role: P, screen: '/pharmacy → Sale Cart', title: 'The sale is stored as fulfilled', ok: row?.status === 'fulfilled', detail: row?.status })
        const was = ((sale as { before?: Array<{ id: string; batch_no: string; expiry: string; qty_available: number }> }).before ?? [])
        const now = new Map((await doloBatches()).map((x) => [x.id, x.qty_available]))
        const drawn = was.filter((x) => (now.get(x.id) ?? 0) < x.qty_available)
        const skipped = drawn.flatMap((d) => was.filter((x) => x.expiry < d.expiry && (now.get(x.id) ?? 0) > 0).map((x) => `${x.batch_no} (${x.expiry}) left while ${d.batch_no} (${d.expiry}) was used`))
        r.check({ id: 'PH-84', role: P, screen: '/pharmacy → Stock', title: 'Dolo came out of the earliest-expiring batch first (FEFO)', ok: drawn.length > 0 && !skipped.length, detail: skipped[0] ?? drawn.map((x) => `${x.batch_no} exp ${x.expiry}: ${x.qty_available} → ${now.get(x.id)}`).join(' · ') })
      })

      await r.step('PH-85', P, '/pharmacy → Dispense', 'Dispatch Murugan\'s medicines', async () => {
        await tab(page, /^Dispense/)
        const check = await buttonIn(page, 'Check Payment', [m.full_name]).catch(() => null)
        if (check) { await check.click(); await wait(page, 2500) }
        const disp = await buttonIn(page, 'Dispatch', [m.full_name]).catch(() => null)
        if (disp) { await disp.click(); await wait(page, 3500) }
        await tab(page, /^Dispense/)
        const t = await text(page)
        r.check({ id: 'PH-85', role: P, screen: '/pharmacy → Dispense', title: `After payment, ${m.full_name}'s medicines are dispatched and move to history`, ok: !!disp && !(await buttonIn(page, 'Dispatch', [m.full_name]).catch(() => null)), detail: t.match(new RegExp(`${m.full_name}[^\\n]{0,120}`))?.[0] })
      })

      await r.step('PH-86', P, '/pharmacy → Reports', 'H1 register has the sale', async () => {
        await tab(page, /^Reports/)
        await page.getByRole('tab', { name: 'H1 register' }).click(); await wait(page, 2500)
        const t = await text(page)
        r.check({ id: 'PH-86', role: P, screen: '/pharmacy → Reports → H1 register', title: 'The counter sale of the hospital\'s own Schedule H1 medicine is in the H1 register', ok: t.includes(s.full_name) && t.includes(OWN), detail: t.match(new RegExp(`[^\\n]{0,60}${s.full_name}[^\\n]{0,80}`))?.[0] })
        await page.getByRole('tab', { name: 'Without prescription' }).click(); await wait(page, 2500)
        const t2 = await text(page)
        r.check({ id: 'PH-87', role: P, screen: '/pharmacy → Reports → Without prescription', title: 'The H1 medicine sold without a prescription is listed (the OTC Dolo is not)', ok: t2.includes(s.full_name) && t2.includes(OWN), detail: t2.match(new RegExp(`[^\\n]{0,40}${s.full_name}[^\\n]{0,80}`))?.[0] })
      })

      // Leave the demo medicine as it was: alert level off, no schedule.
      await r.step('PH-89', P, '/pharmacy → Stock', 'Tidy up', async () => {
        await tab(page, /^Stock/)
        await page.getByPlaceholder('Search brand, salt, batch number or rack…').fill(`DOLO-${r.tag}`); await wait(page, 1200)
        await page.getByTitle('Edit stock').first().click(); await wait(page, 1000)
        await page.getByPlaceholder('off').first().fill('0')
        await page.getByRole('button', { name: 'Save Changes' }).click(); await wait(page, 2500)
        r.note({ id: 'PH-89', role: P, screen: '/pharmacy → Stock', title: 'Dolo 650 put back (no low-stock alert)' })
      })
    })

    // ── 10. Who may open what ──────────────────────────────────────────────
    for (const role of ['receptionist', 'nurse', 'doctor'] as const) {
      await withRole(role, async ({ page }) => {
        await r.step(`PH-9-${role}`, role, '/pharmacy/receive', 'Receive stock is pharmacy staff only', async () => {
          await go(page, '/pharmacy/receive'); await wait(page, 2000)
          const p = pathOf(page)
          const blocked = /You don.t have access to this page/.test(await text(page)) || p !== '/pharmacy/receive'
          r.check({ id: `PH-9-${role}`, role, screen: '/pharmacy/receive', title: `${role} cannot open Receive stock`, ok: blocked && !(await page.getByRole('button', { name: 'Receive stock', exact: true }).isVisible().catch(() => false)), detail: blocked ? 'shown "You don\'t have access to this page"' : `landed on ${p}` })
        })
      })
    }
  },
} satisfies Flow
