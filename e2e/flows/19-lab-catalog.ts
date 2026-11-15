// The whole lab, as a new hospital meets it, for EVERY test in the Uyirly
// master (which is also every test vrhospital and KMCH order — theirs are
// master tests; KMCH's few own ones are covered by the custom-test path):
//
//   A. set the catalogue up from scratch — setup guide, one test added on its
//      own, every master group added, a price changed, a test switched off and
//      on, a custom test, a measurement's range edited and put back, a line
//      marked optional the way KMCH's 3-part analyzer needs;
//   B. order every orderable test for an admitted patient, one order per
//      group, from the ward;
//   C. collect each order's tubes; the blood count arrives from the Erba H360;
//   D. type every other result by hand, at a normal value for that line;
//   E. verify, release, and read the report on screen and as a PDF — every
//      test, every line and every normal on the paper checked against the
//      database;
//   F. one order of abnormal and critical values — flags and the alert;
//   G. the master, vrhospital and KMCH catalogues checked line by line
//      (read-only — those hospitals are never touched);
//   H. put demo's catalogue back as it was.
//
// Every action is on the screens. The database is only read, to know what to
// expect and to check what was stored — except that the H360's message is
// handed to the same ingest code the analyzer endpoint runs, because a test
// cannot plug in a real analyzer.
import fs from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'
import os from 'os'
import type { Page, Locator } from 'playwright-core'
import { withRole, go, wait, text } from '../lib/browser'
import { buttonIn } from '../lib/ui'
import { reader, all } from '../lib/db'
import { ms } from '../lib/env'
import { checkCatalogs } from '../lib/labCatalogCheck'
import type { Flow, Run } from '../lib/run'

const A = 'admin', T = 'lab_tech'
const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const norm = (s: string) => flat(s).toLowerCase().replace(/[–—]/g, '-')

/** Text of a PDF the signed-in browser can fetch (pypdf). */
async function pdfText(page: Page, url: string): Promise<{ status: number; text: string }> {
  const res: string = await page.evaluate(`(async () => { const r = await fetch(${JSON.stringify(url)}); const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (const x of b) s += String.fromCharCode(x); return r.status + '|' + btoa(s) })()`)
  const [st, b64] = res.split('|')
  const file = path.join(os.tmpdir(), `uyirly-lab-${Date.now()}.pdf`)
  fs.writeFileSync(file, Buffer.from(b64, 'base64'))
  let t = ''
  try {
    t = execFileSync('python3', ['-I', '-c', 'import sys, pypdf; print("\\n".join((p.extract_text() or "") for p in pypdf.PdfReader(sys.argv[1]).pages))', file], { encoding: 'utf8', timeout: 120000 })
  } catch { t = '' }
  fs.rmSync(file, { force: true })
  return { status: Number(st), text: t }
}

/** Polls until `fn` is true or `max` ms pass — the screens save in the background, at their own pace. */
async function until(page: Page, fn: () => Promise<boolean>, max = 30000): Promise<boolean> {
  const t0 = Date.now()
  while (Date.now() - t0 < ms(max)) {
    if (await fn().catch(() => false)) return true
    await page.waitForTimeout(500)
  }
  return false
}

/** The ward's "Order Lab Test" window, once it has loaded the hospital's list (it loads after it opens). */
async function openLabOrder(page: Page, ipdUrl: string) {
  await go(page, ipdUrl); await wait(page, 1500)
  await page.getByRole('button', { name: 'Treatment' }).first().click(); await wait(page, 2000)
  await page.getByRole('button', { name: /Order Lab Test/ }).first().click()
  await until(page, () => page.getByPlaceholder('Search tests…').isVisible(), 15000)
  await until(page, async () => !(await page.getByText('Loading tests…').isVisible()), 60000)
}

/** A button in the card that names `inCard`, waited for — the lists refresh in the background after each action. */
async function cardButton(page: Page, label: string, inCard: string[], max = 20000) {
  let b: Locator | null = null
  await until(page, async () => !!(b = await buttonIn(page, label, inCard).catch(() => null)), max)
  if (!b) throw new Error(`no "${label}" button in a card with ${inCard.join(' + ')}`)
  return b as Locator
}

/** The lab catalogue window: open it, find a group, find a test's row (groups start closed). */
function catalogUi(page: Page) {
  const dlg = () => page.locator('[role="dialog"]').last()
  const openCatalog = async () => {
    await go(page, '/lab'); await wait(page, 1500)
    await page.getByRole('button', { name: /^Catalog \(/ }).click()
    await until(page, () => dlg().getByPlaceholder('Search by name or code…').isVisible(), 15000)
    await until(page, async () => !(await dlg().getByText('Loading catalog…').isVisible()), 30000)
  }
  const catGroup = (cat: string) => dlg().locator('div.rounded-xl').filter({ has: page.locator('button', { hasText: new RegExp(`^${esc(cat)}\\s*\\d+ / \\d+ active$`) }) }).first()
  const catRow = async (cat: string, name: string) => {
    const g = catGroup(cat)
    const row = g.locator('div.flex.items-start.gap-3').filter({ has: page.locator('span.text-sm.font-medium', { hasText: new RegExp(`^${esc(name)}$`) }) }).first()
    if (!(await row.isVisible().catch(() => false))) { await g.locator('button').first().click(); await wait(page, 600) }
    return row
  }
  return { dlg, openCatalog, catGroup, catRow }
}

type FormRow = {
  test_id: string; test_name: string; analyte_id: string; code: string; name: string; short_name: string | null
  unit_ucum: string | null; decimals: number; value_type: string; allowed_values: string[] | null
  normal_values: string[] | null; normal_text: string | null; ref_low: number | null; ref_high: number | null
  value_num: number | null; value_text: string | null
}

/** Sensible values for lines that have no range by design. */
const NO_RANGE_VALUE: Record<string, number> = { PDW_CV: 12, P_LCC: 60, MENTZER: 15, RDWI: 250, PO2: 90, SO2: 97 }

/** A normal result for one line of the form. */
function normalValue(r: FormRow): { kind: 'num' | 'select' | 'text'; v: string } {
  if (r.value_type === 'ordinal') return { kind: 'select', v: r.normal_values?.[0] ?? r.allowed_values?.[0] ?? '' }
  if (r.value_type === 'text') return { kind: 'text', v: r.normal_text ?? 'Nil' }
  const lo = r.ref_low != null ? Number(r.ref_low) : null, hi = r.ref_high != null ? Number(r.ref_high) : null
  let v: number
  if (lo != null && hi != null) v = (lo + hi) / 2
  else if (hi != null) v = hi * 0.6
  else if (lo != null) v = lo * 1.3
  else v = NO_RANGE_VALUE[r.code] ?? 1
  const dp = Math.max(0, Math.min(3, r.decimals ?? 1))
  return { kind: 'num', v: String(Number(v.toFixed(dp))) }
}

/** A normal result for a single-result test (no lines). */
function singleValue(t: { ref_low: number | null; ref_high: number | null; reference_range: string | null }): { num?: string; text?: string } {
  const lo = t.ref_low != null ? Number(t.ref_low) : null, hi = t.ref_high != null ? Number(t.ref_high) : null
  if (lo != null && hi != null) return { num: String(Number(((lo + hi) / 2).toFixed(2))) }
  if (hi != null) return { num: String(Number((hi * 0.6).toFixed(2))) }
  if (lo != null) return { num: String(Number((lo * 1.3).toFixed(2))) }
  const rr = (t.reference_range ?? '').split(/[;(]/)[0].trim()
  return { text: rr && rr.length <= 60 ? rr : 'Normal' }
}

export default {
  name: 'lab-catalog', title: '19 Lab — every test, catalogue to report',
  async run(r: Run) {
    const db = reader()
    const { data: demo } = await db.from('tenants').select('id').eq('slug', 'demo').single()
    const tenant = demo!.id as string
    const pt = r.patient('lakshmi')
    if (!pt.ipd) throw new Error('Lakshmi was not admitted in this run (run the opd flow first)')
    const ipdUrl = String(pt.ipd)
    const catalog = async () => all<any>((f, t) => db.from('lab_tests_catalog')
      .select('id, name, category, price, is_active, package_only, lab_master_id, ref_low, ref_high, reference_range, unit')
      .eq('tenant_id', tenant).order('name').range(f, t))
    const before = await catalog()
    const activeBefore = new Set(before.filter((c) => c.is_active).map((c) => c.id))
    r.set('lab_catalog_active_before', [...activeBefore])

    // Every master test a hospital can order: what "add the whole master" has to reach.
    const masterList = await all<any>((f, t) => db.from('lab_tests_master').select('id, name, category').eq('is_active', true).eq('panel_only', false).order('id').range(f, t))
    const masterIds = new Set(masterList.map((m) => m.id as string))

    // ── A. Catalogue set-up ─────────────────────────────────────────────────
    await withRole('admin', async ({ page }) => {
      const { dlg, openCatalog, catGroup, catRow } = catalogUi(page)
      const one = async (name: string) => (await db.from('lab_tests_catalog').select('id, price, is_active, category, reference_range').eq('tenant_id', tenant).eq('name', name).maybeSingle()).data

      await r.step('LC-01', A, '/lab → Catalog', 'Setup guide', async () => {
        await openCatalog()
        const g = page.getByRole('button', { name: /How to set up your lab — 5 steps/ })
        await g.click(); await wait(page, 500)
        const t = flat(await dlg().innerText())
        r.check({ id: 'LC-01', role: A, screen: '/lab → Catalog', title: 'The 5-step setup guide is in the catalogue', ok: ['Add the tests you offer', 'Add anything Uyirly does not have', 'Check every normal range', 'Group tests into packages', 'Connect your analyzers'].every((x) => t.includes(x)) })
        await g.click()
      })

      await r.step('LC-02', A, '/lab → Catalog → Add from Master', 'Add the whole master', async () => {
        await openCatalog()
        await dlg().getByRole('button', { name: 'Add from Master', exact: true }).click(); await wait(page, 3000)
        await until(page, async () => (await dlg().getByPlaceholder('Search master tests…').isVisible()) && !(await dlg().getByText(/^Loading/).first().isVisible()), 30000)
        const groupNames = async () => (await dlg().locator('button span.text-sm.font-semibold').allInnerTexts()).map(flat).filter(Boolean)
        const mGroup = (cat: string) => dlg().locator('div.rounded-xl').filter({ has: page.locator('button', { hasText: new RegExp(`^${esc(cat)}\\s*\\d+ tests?$`) }) }).first()
        const offered = await groupNames()
        // One test on its own, at its own price.
        if (offered.length) {
          const g = mGroup(offered[0])
          const row = g.locator('div.flex.items-center.gap-3.px-4.py-2').first()
          if (!(await row.isVisible().catch(() => false))) { await g.locator('button').first().click(); await wait(page, 600) }
          const name = flat(await row.locator('p').first().innerText())
          await row.getByPlaceholder('₹').fill('175')
          await row.getByRole('button', { name: 'Activate', exact: true }).click()
          let c: any = null
          await until(page, async () => !!(c = await one(name)), 20000)
          r.check({ id: 'LC-02', role: A, screen: '/lab → Catalog → Add from Master', title: `One test added on its own at its own price (${name} ₹175)`, ok: Number(c?.price) === 175 && c?.is_active === true, detail: `₹${c?.price ?? '—'}` })
        } else r.note({ id: 'LC-02', role: A, screen: '/lab → Catalog → Add from Master', title: 'One test added on its own', detail: 'every master test is already in demo\'s catalogue (from an earlier run) — nothing left to add one by one' })
        // Every group, at a group price; a group is done when it leaves the list,
        // or stays with only the tests that could not be added, each with its reason.
        const refused: Array<{ name: string; why: string }> = []
        let groups = 0
        for (const cat of await groupNames()) {
          const g = mGroup(cat)
          if (!(await g.isVisible().catch(() => false))) continue
          await g.getByPlaceholder('Group ₹').fill('120')
          await g.getByRole('button', { name: 'Activate All', exact: true }).click()
          await until(page, async () => !(await g.isVisible()) || /not added/.test(await g.innerText()), 60000)
          groups++
          if (await g.isVisible().catch(() => false)) {
            const rows = g.locator('div.flex.items-center.gap-3.px-4.py-2')
            for (let i = 0; i < await rows.count(); i++) {
              const ps = (await rows.nth(i).locator('p').allInnerTexts()).map(flat)
              refused.push({ name: ps[0] ?? '', why: ps.slice(1).join(' ') })
            }
          }
        }
        const after = await catalog()
        const have = new Set(after.filter((c) => c.lab_master_id).map((c) => c.lab_master_id))
        const missing = masterList.filter((m) => !have.has(m.id))
        r.check({ id: 'LC-03', role: A, screen: '/lab → Catalog → Add from Master', title: `Every one of the ${masterList.length} master tests is in the catalogue ("Activate All" on ${groups} group${groups === 1 ? '' : 's'})`, ok: missing.length === 0, detail: missing.length ? `missing: ${missing.slice(0, 8).map((m) => m.name).join(', ')}` : `${have.size} master tests in the catalogue` })
        if (refused.length) r.check({ id: 'LC-03r', role: A, screen: '/lab → Catalog → Add from Master', title: 'A test "Activate All" could not add stays on the list, with the reason', ok: refused.every((x) => x.name && x.why), detail: refused.slice(0, 4).map((x) => `${x.name}: ${x.why}`).join(' · ') })
        r.set('lab_catalog_added', after.filter((c) => !before.some((b) => b.id === c.id)).map((c) => c.id))
      })

      await r.step('LC-04', A, '/lab → Catalog', 'Switch on every master test', async () => {
        // Master tests already in the catalogue but switched off — "Enable All" on their groups.
        const now = await catalog()
        const off = now.filter((c) => !c.is_active && c.lab_master_id && masterIds.has(c.lab_master_id))
        const cats = [...new Set(off.map((c) => c.category ?? 'General'))]
        await openCatalog()
        for (const cat of cats) {
          const head = catGroup(cat)
          const b = head.getByRole('button', { name: 'Enable All', exact: true })
          if (!(await b.isVisible().catch(() => false))) continue
          await b.click()
          await until(page, () => head.getByRole('button', { name: 'Disable All', exact: true }).isVisible(), 30000)
        }
        const after = await catalog()
        const still = after.filter((c) => !c.is_active && c.lab_master_id && masterIds.has(c.lab_master_id))
        r.set('lab_catalog_reenabled', off.map((c) => c.id))
        r.check({ id: 'LC-04', role: A, screen: '/lab → Catalog', title: `"Enable All" switches on every master test that was off (${off.length} in ${cats.length} group${cats.length === 1 ? '' : 's'})`, ok: still.length === 0, detail: still.length ? `still off: ${still.slice(0, 5).map((c) => c.name).join(', ')}` : `${after.filter((c) => c.is_active).length} tests on` })
      })

      await r.step('LC-05', A, '/lab → Catalog', 'Edit a price; switch a test off and on', async () => {
        const t0 = (await catalog()).find((c) => c.name === 'Serum Ferritin') ?? (await catalog()).find((c) => c.is_active && c.lab_master_id && !c.package_only)
        const price = Number(t0.price) === 650 ? 640 : 650          // always a real change
        await openCatalog()
        await dlg().getByPlaceholder('Search by name or code…').fill(t0.name); await wait(page, 800)
        const row = await catRow(t0.category ?? 'General', t0.name)
        await row.locator('button').filter({ has: page.locator('svg.lucide-pencil') }).click(); await wait(page, 800)
        await dlg().getByPlaceholder('150').first().fill(String(price))
        await dlg().getByRole('button', { name: 'Save Changes' }).click()
        let c: any = null
        await until(page, async () => Number((c = await one(t0.name))?.price) === price, 20000)
        r.check({ id: 'LC-05', role: A, screen: '/lab → Catalog', title: `A price is changed from the edit window (${t0.name} ₹${t0.price} → ₹${price})`, ok: Number(c?.price) === price, detail: `₹${c?.price}` })
        const act = row.getByRole('button', { name: /^(Active|Inactive)$/ })
        await act.click()
        const off = await until(page, async () => (await one(t0.name))?.is_active === false, 15000)
        await act.click()
        const on = await until(page, async () => (await one(t0.name))?.is_active === true, 15000)
        r.check({ id: 'LC-06', role: A, screen: '/lab → Catalog', title: 'A test is switched off and back on', ok: off && on })
      })

      await r.step('LC-07', A, '/lab → Catalog → Custom Test', 'Custom test', async () => {
        await openCatalog()
        const name = `E2E Ketone (urine) ${r.tag}`
        await dlg().getByRole('button', { name: 'Custom Test', exact: true }).click(); await wait(page, 800)
        await dlg().getByPlaceholder('e.g. Complete Blood Count').fill(name)
        await dlg().getByPlaceholder('e.g. Hematology').fill('Urine Analysis')
        await dlg().getByPlaceholder('e.g. Negative, or 70–110 mg/dL').fill('Negative')
        await dlg().getByPlaceholder('150').fill('250')
        await dlg().getByRole('button', { name: 'Add to Catalog' }).click()
        let c: any = null
        await until(page, async () => !!(c = await one(name)), 20000)
        const err = c ? '' : flat(await dlg().innerText().catch(() => '')).match(/[^.]*(required|Enter|already|error|failed)[^.]*/i)?.[0] ?? 'not saved'
        r.check({ id: 'LC-07', role: A, screen: '/lab → Catalog → Custom Test', title: 'A hospital\'s own test (like KMCH\'s Ketone ₹250) is added with its printed normal', ok: Number(c?.price) === 250 && c?.reference_range === 'Negative', detail: c ? `₹${c.price} · normal "${c.reference_range}"` : err })
        r.set('lab_custom_test', c?.id ?? null)
      })

      await r.step('LC-08', A, '/lab → Catalog → measurements', 'Optional line and a range edit', async () => {
        const cbc = (await catalog()).find((c) => c.name === 'Complete Blood Count (CBC)')
        await openCatalog()
        await dlg().getByPlaceholder('Search by name or code…').fill('Complete Blood Count'); await wait(page, 800)
        const row = await catRow(cbc?.category ?? 'Haematology', 'Complete Blood Count (CBC)')
        await row.getByRole('button', { name: /\d+ measurements/ }).click()
        const line = (label: string) => dlg().locator('div.flex.flex-wrap.items-center').filter({ has: page.locator('span', { hasText: new RegExp(`^${esc(label)}`) }) }).first()
        const { data: basoA } = await db.from('lab_analytes').select('id, name').eq('code', 'BASO_PCT').single()
        await until(page, () => line(basoA!.name).isVisible(), 20000)
        // Basophils — a line KMCH's 3-part analyzer cannot produce.
        await line(basoA!.name).getByRole('button', { name: /^(Required|Optional)$/ }).click()
        let opt = false
        await until(page, async () => (opt = ((await db.from('lab_optional_analytes').select('analyte_id').eq('tenant_id', tenant).eq('test_id', cbc?.id ?? '').eq('analyte_id', basoA!.id)).data ?? []).length === 1), 15000)
        r.check({ id: 'LC-08', role: A, screen: '/lab → Catalog → measurements', title: 'A CBC line the analyzer cannot produce (basophils) is marked optional', ok: opt })
        r.set('lab_cbc_test', cbc?.id ?? null)

        // A hospital range for one line, then back to Uyirly's.
        const { data: mcv } = await db.from('lab_analytes').select('id, name').eq('code', 'MCV').single()
        const mine = async () => ((await db.from('lab_reference_ranges').select('ref_low, ref_high, sex, source').eq('tenant_id', tenant).eq('analyte_id', mcv!.id)).data ?? [])
        if ((await mine()).length) { r.note({ id: 'LC-08b', role: A, screen: '/lab → Catalog → measurements', title: 'Edit a range and put it back', detail: 'demo already has its own MCV range — left alone' }); return }
        await line(mcv!.name).getByRole('button', { name: 'Edit range' }).click(); await wait(page, 600)
        await dlg().getByText('Same for everyone').click().catch(() => {})
        await dlg().getByLabel('Everyone lower limit').fill('79')
        await dlg().getByLabel('Everyone upper limit').fill('99')
        await dlg().getByRole('button', { name: 'Save range' }).click()
        let saved: any[] = []
        await until(page, async () => (saved = await mine()).some((x) => Number(x.ref_low) === 79 && Number(x.ref_high) === 99), 15000)
        const shown = await until(page, async () => /79\s*[–-]\s*99/.test(await line(mcv!.name).innerText()) && /Your hospital/.test(await line(mcv!.name).innerText()), 10000)
        r.check({ id: 'LC-08b', role: A, screen: '/lab → Catalog → measurements', title: 'A line\'s normal range is set for the hospital (MCV 79–99) and shown as the hospital\'s', ok: saved.some((x) => Number(x.ref_low) === 79 && Number(x.ref_high) === 99) && shown, detail: saved.map((x) => `${x.sex} ${x.ref_low}–${x.ref_high} (${x.source})`).join(', ') })
        await line(mcv!.name).getByRole('button', { name: 'Use Uyirly standard' }).click()
        const back = await until(page, async () => (await mine()).length === 0, 15000)
        r.check({ id: 'LC-08c', role: A, screen: '/lab → Catalog → measurements', title: '"Use Uyirly standard" puts the line back to Uyirly\'s range', ok: back })
      })
    })

    // ── B. Order every orderable test, one order per group ─────────────────
    // Every master test, plus this run's own custom test (not earlier runs' leftovers).
    const now = await catalog()
    const orderable = now.filter((c) => c.is_active && !c.package_only && (c.lab_master_id ? masterIds.has(c.lab_master_id) : c.id === r.data.lab_custom_test))
    const groups = new Map<string, any[]>()
    for (const c of orderable) groups.set(c.category ?? 'Other', [...(groups.get(c.category ?? 'Other') ?? []), c])
    const orders: Array<{ group: string; id: string; accession: string; tests: any[] }> = []

    await withRole('admin', async ({ page }) => {
      for (const [group, tests] of groups) {
        await r.step(`LC-B-${group}`, A, '/ipd/[id] → Treatment', `Order the ${group} tests`, async () => {
          const started = new Date().toISOString()
          await openLabOrder(page, ipdUrl)
          let ticked = 0
          const notFound: string[] = []
          for (const t of tests) {
            await page.getByPlaceholder('Search tests…').fill(t.name.slice(0, 40))
            const lab = page.locator('label').filter({ has: page.locator('p', { hasText: new RegExp(`^${esc(t.name)}$`) }) }).first()
            if (await until(page, () => lab.isVisible(), 4000)) {
              if (!(await lab.locator('input[type=checkbox]').isChecked().catch(() => false))) await lab.click()
              ticked++
            } else notFound.push(t.name)
          }
          if (!ticked) { r.check({ id: `LC-B-${group}`, role: A, screen: '/ipd/[id] → Order Lab Tests', title: `All ${tests.length} "${group}" tests ordered in one order`, ok: false, detail: `none found in the order window: ${notFound.slice(0, 5).join(', ')}` }); return }
          await page.getByRole('button', { name: /^Order \d+$/ }).click()
          let o: any = null
          // The order row is written before its tests — wait for the tests too.
          await until(page, async () => ((o = (await db.from('lab_orders').select('id, accession_no, items:lab_order_items(test_id)').eq('tenant_id', tenant)
            .gte('ordered_at', started).order('ordered_at', { ascending: false }).limit(1).maybeSingle()).data)?.items?.length ?? 0) >= ticked, 30000)
          const onOrder = new Set(((o?.items ?? []) as Array<{ test_id: string }>).map((i) => i.test_id))
          r.check({ id: `LC-B-${group}`, role: A, screen: '/ipd/[id] → Order Lab Tests', title: `All ${tests.length} "${group}" tests ordered in one order`, ok: !!o && onOrder.size === tests.length && !notFound.length, detail: `${onOrder.size} on order ${o?.accession_no ?? '—'}${notFound.length ? ` · not in the list: ${notFound.slice(0, 5).join(', ')}` : ''}` })
          // Later steps check what is on the order; a test missing from it is this step's failure.
          if (o) orders.push({ group, id: o.id, accession: o.accession_no, tests: tests.filter((t) => onOrder.has(t.id)) })
        })
      }
    })
    r.set('lab_catalog_orders', orders.map((o) => ({ group: o.group, id: o.id, accession: o.accession })))

    // ── C–E. Collect, analyzer, manual entry, verify, release, report ───────
    await withRole('lab_tech', async ({ page }) => {
      const dlg = () => page.locator('[role="dialog"]').last()
      const entryOpen = () => page.getByRole('heading', { name: /^Enter Results/ }).isVisible()

      for (const o of orders) {
        const where = `${o.group} (#${o.accession})`
        await r.step(`LC-C-${o.group}`, T, '/lab', `${where}: collect`, async () => {
          await go(page, '/lab'); await wait(page, 1500)
          await (await cardButton(page, 'Collect Sample', [o.accession])).click()
          type Tube = { barcode: string; collected_at: string | null }
          const read = async () => ((await db.from('lab_samples').select('barcode, collected_at').eq('lab_order_id', o.id)).data ?? []) as Tube[]
          await until(page, async () => { const t = await read(); return t.length > 0 && t.every((x) => x.collected_at) }, 20000)
          const tubes = await read()
          r.check({ id: `LC-C-${o.group}`, role: T, screen: '/lab', title: `${where}: tubes collected (time and collector stored)`, ok: !!tubes?.length && tubes.every((t) => t.collected_at), detail: `${tubes?.length} tube(s)` })
        })

        // The blood count comes from the analyzer.
        if (o.tests.some((t) => t.name === 'Complete Blood Count (CBC)')) {
          await r.step(`LC-D-${o.group}`, T, 'analyzer', `${where}: Erba H360 sends the blood count`, async () => {
            const { data: an } = await db.from('lab_analyzers').select('id, connector_id, status').eq('tenant_id', tenant).eq('fingerprint', 'H360^Erba').single()
            const { data: maps } = await db.from('analyzer_mappings').select('analyzer_code, unit_ucum, analyte:lab_analytes(code)').eq('analyzer_id', an!.id).eq('enabled', true)
            const cbc = o.tests.find((t) => t.name === 'Complete Blood Count (CBC)')
            const { data: form } = await db.rpc('get_order_analyte_form', { p_order_id: o.id })
            const rows = ((form ?? []) as FormRow[]).filter((x) => x.test_id === cbc.id)
            const { data: tube } = await db.from('lab_samples').select('barcode').eq('lab_order_id', o.id).order('tube_no').limit(1).single()
            const obx = ((maps ?? []) as any[]).filter((m) => m.analyte).map((m, i) => {
              const row = rows.find((x) => x.code === m.analyte.code)
              const v = row ? normalValue(row).v : '1'
              return `OBX|${i + 1}|NM|${m.analyzer_code}^${m.analyzer_code}||${v}|${m.unit_ucum ?? ''}|||||F`
            })
            const raw = ['MSH|^~\\&|H360|Erba|||20261114100000||ORU^R01|1|P|2.3.1', 'PID|1||E2E||TEST^E2E', `OBR|1||${tube!.barcode}|CBC^CBC`, ...obx].join('\r')
            const messageId = crypto.randomUUID()
            await db.from('analyzer_messages').insert({ id: messageId, tenant_id: tenant, connector_id: an!.connector_id, raw_message: raw, idempotency_key: `e2e-${messageId}`, status: 'received', source: 'e2e H360' })
            // Loaded at run time: it is the app's own code, type-checked with the app.
            const spec: string = '../../src/lib/lab/ingest'
            const { processMessage } = (await import(spec)) as { processMessage: (svc: unknown, a: { tenantId: string; connectorId: string | null; messageId: string; raw: string; source: string }) => Promise<{ status: string; unmapped?: string[] }> }
            const res = await processMessage(db as never, { tenantId: tenant, connectorId: an!.connector_id, messageId, raw, source: 'e2e H360' })
            const { count } = await db.from('lab_result_analytes').select('id', { count: 'exact', head: true }).eq('lab_order_id', o.id).eq('test_id', cbc.id).eq('source', 'analyzer')
            r.check({ id: `LC-D-${o.group}`, role: T, screen: 'analyzer → /lab', title: `${where}: the H360's blood count lands on the order (${obx.length} values sent)`, ok: res.status === 'matched' && (count ?? 0) >= obx.length - 2, detail: `${res.status} · ${count} analyzer results${res.unmapped?.length ? ` · unmapped ${res.unmapped.join(',')}` : ''}` })
          })
        }

        await r.step(`LC-E-${o.group}`, T, '/lab → Result Entry', `${where}: enter results`, async () => {
          const { data: form } = await db.rpc('get_order_analyte_form', { p_order_id: o.id })
          const rows = (form ?? []) as FormRow[]
          const { data: items } = await db.from('lab_order_items').select('id, test_id, test:lab_tests_catalog(name, ref_low, ref_high, reference_range, unit)').eq('lab_order_id', o.id)
          const lineTests = new Set(rows.map((x) => x.test_id))
          const singles = ((items ?? []) as any[]).filter((i) => !lineTests.has(i.test_id))
          await go(page, '/lab'); await wait(page, 1500)
          await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 1500)
          await (await cardButton(page, 'Enter Results', [o.accession])).click()
          await until(page, entryOpen, 20000)
          await wait(page, 1500)
          const gridRows = dlg().locator('div.grid.items-center')
          const shown = await gridRows.count()
          let filled = 0
          for (let i = 0; i < rows.length && i < shown; i++) {
            const row = rows[i]
            if (row.value_num != null || row.value_text) { filled++; continue }   // from the analyzer
            const v = normalValue(row)
            const el = gridRows.nth(i)
            if (v.kind === 'select') await el.locator('select').selectOption(v.v).catch(() => {})
            else await el.locator('input').fill(v.v).catch(() => {})
            filled++
          }
          for (const s of singles) {
            const card = dlg().locator('div.rounded-xl.p-4').filter({ has: page.locator('p', { hasText: new RegExp(`^${esc(s.test.name)}$`) }) }).first()
            const v = singleValue(s.test)
            if (v.num != null) await card.getByPlaceholder('e.g. 95.5').fill(v.num).catch(() => {})
            else await card.getByPlaceholder('e.g. Negative, Reactive').fill(v.text!).catch(() => {})
          }
          r.check({ id: `LC-E1-${o.group}`, role: T, screen: '/lab → Result Entry', title: `${where}: the entry window shows every line of every test (${rows.length} lines, ${singles.length} single results)`, ok: shown === rows.length, detail: `${shown} lines on screen` })
          await dlg().getByRole('button', { name: 'Save Results' }).click()
          for (let w = 0; w < 40 && (await entryOpen()) && !/Save again/i.test(await dlg().innerText().catch(() => '')) && !/impossible|cannot be|not possible/i.test(await dlg().innerText().catch(() => '')); w++) await wait(page, 500)
          if (await entryOpen()) {
            const msg = flat(await dlg().innerText().catch(() => '')).match(/[^.]*(Save again|impossible|cannot be|not possible)[^.]*\./i)?.[0]
            if (/Save again/i.test(msg ?? '')) { await dlg().getByRole('button', { name: 'Save Results' }).click(); for (let w = 0; w < 40 && (await entryOpen()); w++) await wait(page, 500) }
            if (await entryOpen()) { r.check({ id: `LC-E2-${o.group}`, role: T, screen: '/lab → Result Entry', title: `${where}: results saved`, ok: false, detail: msg ?? 'window did not close' }); await dlg().getByRole('button', { name: 'Cancel' }).click().catch(() => {}); return }
          }
          const { data: saved } = await db.from('lab_result_analytes').select('analyte_id, test_id, flag, value_num, value_text').eq('lab_order_id', o.id)
          const { data: si } = await db.from('lab_order_items').select('test_id, result_value, result_text, flag, ref_low, ref_high, ref_text').eq('lab_order_id', o.id)
          const missingLines = rows.filter((x) => !(saved ?? []).some((s) => s.analyte_id === x.analyte_id && s.test_id === x.test_id && (s.value_num != null || s.value_text)))
          const missingSingles = singles.filter((s) => !(si ?? []).some((x) => x.test_id === s.test_id && (x.result_value != null || x.result_text)))
          const notNormal = [...(saved ?? []).filter((s) => !['normal', 'unranged'].includes(s.flag)), ...(si ?? []).filter((x) => !lineTests.has(x.test_id) && !['normal', 'unranged'].includes(x.flag))]
          r.check({ id: `LC-E2-${o.group}`, role: T, screen: '/lab → Result Entry', title: `${where}: every result stored (${rows.length} lines + ${singles.length} single results)`, ok: !missingLines.length && !missingSingles.length, detail: [missingLines.length ? `lines missing: ${missingLines.slice(0, 5).map((x) => x.code).join(',')}` : '', missingSingles.length ? `singles missing: ${missingSingles.slice(0, 5).map((x) => x.test.name).join(', ')}` : ''].filter(Boolean).join(' · ') || 'all stored' })
          r.check({ id: `LC-E3-${o.group}`, role: T, screen: '/lab → Result Entry', title: `${where}: normal values are flagged normal (nothing high, low or critical)`, ok: !notNormal.length, detail: notNormal.length ? notNormal.slice(0, 6).map((x: any) => `${x.analyte_id ? rows.find((rr) => rr.analyte_id === x.analyte_id)?.code : (si ?? []).find((y) => y.test_id === x.test_id) ? singles.find((y) => y.test_id === x.test_id)?.test.name : '?'}=${x.value_num ?? x.result_value ?? x.value_text ?? x.result_text} ${x.flag}`).join(' · ') : '' })
          const snap = (si ?? []).filter((x) => !lineTests.has(x.test_id) && x.ref_low == null && x.ref_high == null && !x.ref_text)
          r.check({ id: `LC-E4-${o.group}`, role: T, screen: '/lab → Result Entry', title: `${where}: single results keep the normal they were judged by`, ok: singles.length === 0 || snap.length === 0, detail: snap.length ? `${snap.length} without a stored normal` : '' })
        })

        await r.step(`LC-F-${o.group}`, T, '/lab', `${where}: verify and release`, async () => {
          await go(page, '/lab'); await wait(page, 1500)
          await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 1500)
          await (await cardButton(page, 'Verify', [o.accession])).click()
          const status = async () => (await db.from('lab_orders').select('status').eq('id', o.id).single()).data?.status as string | undefined
          const interim = page.getByRole('button', { name: 'Release as interim', exact: true })
          let askedInterim = false
          await until(page, async () => (askedInterim = await interim.isVisible()) || ['verified', 'reported'].includes((await status()) ?? ''), 20000)
          if (askedInterim) { await interim.click(); await until(page, async () => ['verified', 'reported'].includes((await status()) ?? ''), 20000) }
          await go(page, '/lab'); await wait(page, 1500)
          await page.getByRole('button', { name: /^To Release/ }).click(); await wait(page, 1500)
          await (await cardButton(page, 'Release Report', [o.accession])).click(); await wait(page, 1500)
          const ok = page.getByRole('dialog').getByRole('button', { name: /^(Release|Yes|Confirm)/ }).last()
          if (await ok.isVisible().catch(() => false)) await ok.click()
          await until(page, async () => (await status()) === 'reported', 20000)
          const st = { status: await status() }
          r.check({ id: `LC-F-${o.group}`, role: T, screen: '/lab', title: `${where}: verified as complete (no interim) and released`, ok: !askedInterim && st?.status === 'reported', detail: `${st?.status}${askedInterim ? ' · asked "release as interim" — a line was blank' : ''}` })
        })

        await r.step(`LC-G-${o.group}`, T, '/print/lab/[id]/pdf', `${where}: the report`, async () => {
          const { data: rep } = await db.rpc('get_lab_report_analytes', { p_order_id: o.id })
          const lines = (rep ?? []) as any[]
          const { status, text: pdf } = await pdfText(page, `/print/lab/${o.id}/pdf`)
          const P = norm(pdf)
          // A long name wraps inside its table cell, and the PDF's text can come
          // back with the other columns between the two halves — so match on the
          // first three words.
          // The PDF's text can also split "P. falciparum" as "P . falciparum", so compare without spaces.
          const head = (s: string) => norm(s).split(' ').slice(0, 3).join('')
          const P0 = P.replace(/\s+/g, '')
          const testsMissing = o.tests.filter((t) => !P0.includes(head(t.name)))
          const linesMissing = lines.filter((l) => !P0.includes(head(l.short_name ?? l.name)))
          const rangeOf = (l: any) => l.ref_low != null && l.ref_high != null ? `${l.ref_low} – ${l.ref_high}` : l.ref_high != null ? `< ${l.ref_high}` : l.ref_low != null ? `> ${l.ref_low}` : (l.normal_text ?? '')
          const normalsMissing = lines.filter((l) => { const n = rangeOf(l); return n && !P.includes(norm(String(n))) })
          r.check({ id: `LC-G1-${o.group}`, role: T, screen: '/print/lab/[id]/pdf', title: `${where}: the PDF prints, final (not interim), nothing pending`, ok: status === 200 && !/INTERIM/i.test(pdf) && !/\bPending\b/.test(pdf), detail: `${status}` })
          r.check({ id: `LC-G2-${o.group}`, role: T, screen: '/print/lab/[id]/pdf', title: `${where}: every test (${o.tests.length}) and every line (${lines.length}) is on the paper`, ok: !testsMissing.length && !linesMissing.length, detail: [testsMissing.length ? `tests: ${testsMissing.slice(0, 4).map((t) => t.name).join(', ')}` : '', linesMissing.length ? `lines: ${linesMissing.slice(0, 6).map((l) => l.short_name ?? l.name).join(', ')}` : ''].filter(Boolean).join(' · ') })
          r.check({ id: `LC-G3-${o.group}`, role: T, screen: '/print/lab/[id]/pdf', title: `${where}: every line's normal on the paper matches the stored one`, ok: !normalsMissing.length, detail: normalsMissing.slice(0, 5).map((l) => `${l.short_name ?? l.name}: "${rangeOf(l)}"`).join(' · ') })
          r.check({ id: `LC-G4-${o.group}`, role: T, screen: '/print/lab/[id]/pdf', title: `${where}: a report of normal values says nothing is outside the range`, ok: !/outside the reference range/.test(pdf) && !/CRIT (HIGH|LOW)|ABNORMAL/.test(pdf), detail: (pdf.match(/[^\n]*(outside the reference range|CRIT (HIGH|LOW)|ABNORMAL)[^\n]*/) ?? [''])[0].slice(0, 120) })
        })
      }

      // On screen, for one order of each kind.
      for (const o of orders.filter((x) => ['Haematology', 'Urine Analysis', 'Microbiology – Culture & Sensitivity'].includes(x.group))) {
        await r.step(`LC-H-${o.group}`, T, '/lab → Reported', `${o.group}: on-screen report`, async () => {
          await go(page, '/lab'); await wait(page, 1500)
          await page.getByRole('button', { name: /^Reported/ }).click(); await wait(page, 1500)
          await (await cardButton(page, 'View Report', [o.accession])).click(); await wait(page, 3000)
          const t = flat(await dlg().innerText())
          r.check({ id: `LC-H-${o.group}`, role: T, screen: '/lab → Reported → View Report', title: `${o.group}: the on-screen report lists every test with its collection time`, ok: o.tests.every((x) => t.includes(x.name.slice(0, 25))) && /collected\s+\d/i.test(t), detail: t.match(/collected.{0,24}/i)?.[0] })
          await page.keyboard.press('Escape')
        })
      }
    })

    // ── F. Abnormal and critical values ─────────────────────────────────────
    await withRole('admin', async ({ page }) => {
      await r.step('LC-I', A, '/ipd/[id] → Treatment', 'Abnormal order', async () => {
        const want = ['Random Blood Sugar', 'Serum Potassium', 'Haemoglobin', 'Lipid Profile (Full)', 'Urine Routine & Microscopy (R&M)']
        const started = new Date().toISOString()
        await openLabOrder(page, ipdUrl)
        const missing: string[] = []
        for (const n of want) {
          await page.getByPlaceholder('Search tests…').fill(n.slice(0, 30))
          const lab = page.locator('label').filter({ has: page.locator('p', { hasText: new RegExp(`^${esc(n)}$`) }) }).first()
          if (await until(page, () => lab.isVisible(), 4000)) await lab.click(); else missing.push(n)
        }
        await page.getByRole('button', { name: /^Order \d+$/ }).click()
        let o: any = null
        await until(page, async () => !!(o = (await db.from('lab_orders').select('id, accession_no').eq('tenant_id', tenant).gte('ordered_at', started).order('ordered_at', { ascending: false }).limit(1).maybeSingle()).data), 30000)
        r.check({ id: 'LC-I', role: A, screen: '/ipd/[id] → Order Lab Tests', title: 'An order for the abnormal-value check (sugar, potassium, Hb, lipids, urine)', ok: !!o && !missing.length, detail: `${o?.accession_no ?? 'no order'}${missing.length ? ` · not found: ${missing.join(', ')}` : ''}` })
        r.set('lab_abnormal_order', o)
      })
    })
    await withRole('lab_tech', async ({ page }) => {
      const o = r.data.lab_abnormal_order as { id: string; accession_no: string } | undefined
      if (!o) return
      const dlg = () => page.locator('[role="dialog"]').last()
      await r.step('LC-J', T, '/lab', 'Abnormal and critical results', async () => {
        await go(page, '/lab'); await wait(page, 1500)
        await (await cardButton(page, 'Collect Sample', [o.accession_no])).click()
        await until(page, async () => ((await db.from('lab_samples').select('collected_at').eq('lab_order_id', o.id)).data ?? []).some((t) => t.collected_at), 20000)
        await go(page, '/lab'); await wait(page, 1500)
        await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 1500)
        await (await cardButton(page, 'Enter Results', [o.accession_no])).click()
        await until(page, () => page.getByRole('heading', { name: /^Enter Results/ }).isVisible(), 20000); await wait(page, 1500)
        const { data: form } = await db.rpc('get_order_analyte_form', { p_order_id: o.id })
        const rows = (form ?? []) as FormRow[]
        const special: Record<string, string> = { RBSG: '480', K: '7.0', HGB: '7.5', TC: '260', UR_PROT: '2+' }
        const grid = dlg().locator('div.grid.items-center')
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          const v = special[row.code] != null ? { kind: row.value_type === 'ordinal' ? 'select' : 'num', v: special[row.code] } : normalValue(row)
          if (v.kind === 'select') await grid.nth(i).locator('select').selectOption(v.v).catch(() => {})
          else await grid.nth(i).locator('input').fill(v.v).catch(() => {})
        }
        await dlg().getByRole('button', { name: 'Save Results' }).click()
        // A critical value asks to be saved again, deliberately.
        const open = () => page.getByRole('heading', { name: /^Enter Results/ }).isVisible()
        await until(page, async () => !(await open()) || /Save again/i.test(await dlg().innerText()), 20000)
        if (await open().catch(() => false)) { await dlg().getByRole('button', { name: 'Save Results' }).click(); await until(page, async () => !(await open()), 20000) }
        const { data: saved } = await db.from('lab_result_analytes').select('flag, analyte:lab_analytes(code)').eq('lab_order_id', o.id)
        const flagOf = (c: string) => (saved ?? []).find((s: any) => s.analyte?.code === c)?.flag
        r.check({ id: 'LC-J1', role: T, screen: '/lab → Result Entry', title: 'Sugar 480 and potassium 7.0 are critical high; Hb 7.5 low; cholesterol 260 high; urine protein 2+ abnormal', ok: flagOf('RBSG') === 'critical_high' && ['critical_high', 'high'].includes(flagOf('K') ?? '') && flagOf('HGB') === 'low' && flagOf('TC') === 'high' && flagOf('UR_PROT') === 'abnormal', detail: ['RBSG', 'K', 'HGB', 'TC', 'UR_PROT'].map((c) => `${c} ${flagOf(c)}`).join(' · ') })
        await go(page, '/lab'); await wait(page, 2000)
        const banner = (await text(page)).slice(0, 1500)
        r.check({ id: 'LC-J2', role: T, screen: '/lab', title: 'The critical results raise an alert naming the patient and the values', ok: banner.includes(pt.full_name) && /480/.test(banner), detail: banner.match(new RegExp(`${esc(pt.full_name)}.{0,140}`))?.[0] })
        const status = async () => (await db.from('lab_orders').select('status').eq('id', o.id).single()).data?.status as string | undefined
        await page.getByRole('button', { name: /^Result Entry/ }).click(); await wait(page, 1500)
        await (await cardButton(page, 'Verify', [o.accession_no])).click()
        const interim = page.getByRole('button', { name: 'Release as interim', exact: true })
        await until(page, async () => (await interim.isVisible()) || ['verified', 'reported'].includes((await status()) ?? ''), 20000)
        if (await interim.isVisible().catch(() => false)) await interim.click()
        await until(page, async () => ['verified', 'reported'].includes((await status()) ?? ''), 20000)
        await go(page, '/lab'); await page.getByRole('button', { name: /^To Release/ }).click(); await wait(page, 1500)
        await (await cardButton(page, 'Release Report', [o.accession_no])).click(); await wait(page, 1500)
        const ok = page.getByRole('dialog').getByRole('button', { name: /^(Release|Yes|Confirm)/ }).last()
        if (await ok.isVisible().catch(() => false)) await ok.click()
        await until(page, async () => (await status()) === 'reported', 20000)
        const { text: pdf } = await pdfText(page, `/print/lab/${o.id}/pdf`)
        r.check({ id: 'LC-J3', role: T, screen: '/print/lab/[id]/pdf', title: 'The PDF prints CRIT HIGH, LOW, HIGH and ABNORMAL, and counts them in the title', ok: /CRIT HIGH/.test(pdf) && /\bLOW\b/.test(pdf) && /\bHIGH\b/.test(pdf) && /ABNORMAL/.test(pdf) && /\d+ results? outside the reference range/.test(pdf), detail: pdf.match(/\d+ results? outside the reference range/)?.[0] })
      })
    })

    // ── G. The catalogues, line by line ─────────────────────────────────────
    await r.step('LC-K', 'admin', 'catalogue data', 'Master, vrhospital and KMCH checked line by line', async () => {
      const rep = await checkCatalogs(db)
      const errs = (iss: { level: string }[]) => iss.filter((i) => i.level === 'error').length
      const warns = (iss: { level: string }[]) => iss.filter((i) => i.level === 'warn').length
      r.check({ id: 'LC-K1', role: 'admin', screen: 'master', title: `Master: ${rep.master.length} tests, ${rep.master.reduce((n, t) => n + t.lines.length, 0)} lines — no duplicate, every line has its unit and normal`, ok: !errs(rep.masterIssues) && !warns(rep.masterIssues), detail: `${errs(rep.masterIssues)} to fix · ${warns(rep.masterIssues)} to check` })
      for (const [slug, h] of Object.entries(rep.hospitals)) {
        const e = h.issues.filter((i) => i.level === 'error')
        // CBNAAT at ₹0 at KMCH is the hospital's decision (13 Nov), not a defect.
        const real = e.filter((i) => !(slug === 'karur' && /CBNAAT/.test(i.where)))
        r.check({ id: `LC-K-${slug}`, role: 'admin', screen: slug, title: `${h.name}: ${h.active} tests — every test and line checked (prices, links, normals, duplicates)`, ok: !real.length, detail: `${real.length} to fix · ${warns(h.issues)} to check${e.length !== real.length ? ' · CBNAAT ₹0 left for KMCH to decide' : ''}` })
      }
    })

    // ── H. Put demo's catalogue back ────────────────────────────────────────
    await withRole('admin', async ({ page }) => {
      await r.step('LC-L', A, '/lab → Catalog', 'Put demo\'s catalogue back', async () => {
        const keep = new Set(r.data.lab_catalog_active_before as string[])
        const { dlg: dlgFn, openCatalog, catGroup, catRow } = catalogUi(page)
        const dlgL = dlgFn()
        await openCatalog()
        // Each group with a test on that was off before: "Disable All" ...
        const cur = await catalog()
        const byGroup = new Map<string, any[]>()
        for (const c of cur) byGroup.set(c.category ?? 'General', [...(byGroup.get(c.category ?? 'General') ?? []), c])
        for (const [g, list] of byGroup) {
          if (!list.some((c) => c.is_active && !keep.has(c.id))) continue
          const head = catGroup(g)
          const enable = head.getByRole('button', { name: 'Enable All', exact: true }), disable = head.getByRole('button', { name: 'Disable All', exact: true })
          // A part-on group offers "Enable All" first; that, then "Disable All".
          if (await enable.isVisible().catch(() => false)) { await enable.click(); await until(page, () => disable.isVisible(), 30000) }
          await disable.click().catch(() => {})
          await until(page, () => enable.isVisible(), 30000)
        }
        // ... then the ones that were on before, back on one by one.
        const back = (await catalog()).filter((c) => keep.has(c.id) && !c.is_active)
        for (const c of back) {
          await dlgL.getByPlaceholder('Search by name or code…').fill(c.name); await wait(page, 700)
          const row = await catRow(c.category ?? 'General', c.name)
          await row.getByRole('button', { name: 'Inactive', exact: true }).click().catch(() => {})
          await until(page, async () => (await db.from('lab_tests_catalog').select('is_active').eq('id', c.id).single()).data?.is_active === true, 15000)
        }
        // Basophils back to required on demo's CBC.
        const cbc = cur.find((c) => c.name === 'Complete Blood Count (CBC)')
        await dlgL.getByPlaceholder('Search by name or code…').fill('Complete Blood Count'); await wait(page, 800)
        const row = await catRow(cbc?.category ?? 'Haematology', 'Complete Blood Count (CBC)')
        await row.getByRole('button', { name: /\d+ measurements/ }).click().catch(() => {})
        const { data: basoA } = await db.from('lab_analytes').select('id, name').eq('code', 'BASO_PCT').single()
        const baso = dlgL.locator('div.flex.flex-wrap.items-center').filter({ has: page.locator('span', { hasText: new RegExp(`^${esc(basoA!.name)}`) }) }).first()
        await until(page, () => baso.isVisible(), 20000)
        if (/Optional/.test(await baso.innerText().catch(() => ''))) {
          await baso.getByRole('button', { name: 'Optional', exact: true }).click().catch(() => {})
          await until(page, async () => ((await db.from('lab_optional_analytes').select('analyte_id').eq('tenant_id', tenant).eq('test_id', cbc?.id ?? '').eq('analyte_id', basoA!.id)).data ?? []).length === 0, 15000)
        }
        const final = await catalog()
        const diff = final.filter((c) => c.is_active !== keep.has(c.id))
        r.check({ id: 'LC-L', role: A, screen: '/lab → Catalog', title: 'Demo\'s catalogue is back to the tests it had on before the run', ok: diff.length === 0, detail: diff.length ? `${diff.length} differ: ${diff.slice(0, 5).map((c) => `${c.name} ${c.is_active ? 'on' : 'off'}`).join(', ')}` : `${final.filter((c) => c.is_active).length} on` })
      })
    })
  },
} satisfies Flow
