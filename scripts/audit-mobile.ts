/**
 * Every page at phone width, judged by the browser rather than by eye.
 *
 *   npm run dev
 *   npm run audit:mobile              # all pages
 *   npm run audit:mobile -- billing   # just the ones whose path matches
 *
 * It reports three things a screenshot makes you squint at:
 *   · text cut off with an ellipsis — a patient name or a bill number the
 *     user cannot read is worse than a wrapped one
 *   · the page scrolling sideways
 *   · text crushed into a column so narrow it wraps four or more times
 *
 * Needs playwright-core: npm i --no-save playwright-core
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium, type Page } from 'playwright-core'
import { readFileSync } from 'node:fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const WIDTH = Number(process.env.MOBILE_WIDTH ?? 390)     // iPhone 12-16 logical width
const svc = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

const ROUTES = [
  '/dashboard', '/patients', '/appointments', '/opd', '/wards', '/ipd', '/emergency',
  '/emergency/mlc', '/lab', '/radiology', '/pcpndt', '/pcpndt/mtp', '/pcpndt/returns',
  '/pharmacy', '/pharmacy/receive', '/ot', '/blood', '/billing', '/billing/estimates',
  '/billing/cash-book', '/billing/discount-approvals', '/accounts', '/insurance',
  '/inventory', '/scheduling', '/notifications', '/staff', '/hr', '/referrals',
  '/getting-started', '/settings/departments', '/settings/devices', '/settings/tariffs',
  '/settings/modules', '/settings/profile', '/settings/ipd-billing', '/settings/phrases',
  '/audit', '/account/subscription',
]

/**
 * The tabs worth opening, named rather than guessed.
 *
 * A default-state sweep misses most of the product: Staff opens on Directory
 * and the squeezed names are under Attendance. Clicking anything that looks
 * like a tab is not an option on screens carrying Approve, Reject and Delete,
 * so each one is listed by the label a user would read.
 */
const TABS: Record<string, string[]> = {
  '/staff':        ['Attendance', 'Directory'],
  '/radiology':    ['Performed', 'Reported', 'Pending'],
  '/lab':          ['Collected', 'Results', 'Reported', 'Pending'],
  '/wards':        ['OT Rooms', 'Ward Board'],
  '/emergency':    ['Closed', 'Active'],
  '/accounts':     ['Register', 'Ledger names', 'Day end'],
  '/blood':        ['Requests', 'Donors', 'Inventory'],
  '/pharmacy':     ['Stock', 'Dispense'],
  '/billing':      ['Unpaid', 'Paid', 'All'],
  '/inventory':    ['Low stock', 'Items'],
  '/insurance':    ['Claims', 'Policies'],
  '/ipd':          ['Discharged', 'Admitted'],
  '/opd':          ['Closed', 'Open'],
  '/pcpndt':       ['Unfinished', 'All'],
  '/scheduling':   ['Leave', 'Hours'],
}

/**
 * The pages behind a row, which is where a user spends the day. Their ids are
 * looked up from the demo tenant because a re-seed changes every one of them.
 */
async function detailRoutes(): Promise<string[]> {
  const { data: tn } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  const t = tn!.id as string
  const one = async (table: string, where: (q: any) => any = (q) => q): Promise<string | null> => {
    const { data } = await where(svc.from(table).select('id').eq('tenant_id', t)).limit(1).maybeSingle()
    return (data?.id as string) ?? null
  }
  const pairs: Array<[string, string | null]> = [
    ['/patients/%s',        await one('patients')],
    ['/opd/%s',             await one('visits', (q: any) => q.neq('status', 'closed'))],
    ['/ipd/%s',             await one('admissions', (q: any) => q.eq('status', 'admitted'))],
    ['/billing/%s',         await one('bills')],
    ['/billing/estimates/%s', await one('cost_estimates')],
    ['/pcpndt/%s',          await one('form_f')],
    ['/emergency/mlc/%s',   await one('mlc_records')],
    ['/ot/%s',              await one('ot_schedules')],
  ]
  return pairs.filter(([, id]) => id).map(([tpl, id]) => tpl.replace('%s', id!))
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
let routes = only.length ? ROUTES.filter((r) => only.some((o) => r.includes(o))) : ROUTES


const PROBE = `(() => {
  const out = []
  const seen = new Set()
  const push = (kind, text, width, tag) => {
    const key = kind + '|' + text + '|' + tag
    if (text && !seen.has(key)) { seen.add(key); out.push({ kind, text, width, tag }) }
  }

  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    push('sideways', 'page is ' + document.documentElement.scrollWidth + 'px wide in a ' + window.innerWidth + 'px window', 0, 'html')
  }

  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (el.children.length !== 0) continue
    const text = (el.textContent || '').trim()
    if (!text) continue

    // Cut off: the box is narrower than its own text and hides the rest.
    const hidden = cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis'
    if (hidden && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      push('cut', text.slice(0, 48), el.clientWidth, el.tagName.toLowerCase())
    }

    // Crushed: a readable string folded over four or more lines in a sliver of
    // a column — "Chest X-Ray (PA view)" running down the side of a card.
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3
    if (lh > 0 && el.clientWidth > 0 && el.clientWidth < 130 && text.length > 12) {
      const lines = Math.round(el.clientHeight / lh)
      if (lines >= 4) push('crushed', text.slice(0, 48) + ' (' + lines + ' lines)', el.clientWidth, el.tagName.toLowerCase())
    }
  }
  return out
})()`

interface Finding { kind: 'cut' | 'sideways' | 'crushed'; text: string; width: number; tag: string }

async function audit(page: Page, route: string): Promise<Finding[]> {
  await page.goto(`http://demo.localhost:3000${route}`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(1800)
  // tsx compiles this file with esbuild, which wraps functions in a __name
  // helper that does not exist inside the page. So the probe is sent as source
  // text rather than as a function reference.
  return probe(page)
}

async function probe(page: Page): Promise<Finding[]> {
  return page.evaluate(PROBE) as Promise<Finding[]>
}

async function main() {
  const { data: tn } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  const { data: a } = await svc.from('profiles').select('id').eq('tenant_id', tn!.id as string).eq('role', 'admin').limit(1).single()
  const { data: u } = await svc.auth.admin.getUserById(a!.id as string)
  const { data: lk } = await svc.auth.admin.generateLink({ type: 'magiclink', email: u.user!.email! })
  const { data: se } = await createClient(URL_, ANON).auth.verifyOtp({ type: 'magiclink', token_hash: lk.properties.hashed_token })
  const jar: Array<{ name: string; value: string }> = []
  const ssr = createServerClient(URL_, ANON, { cookies: {
    getAll: () => jar,
    setAll: (cs) => { for (const c of cs) { const i = jar.findIndex((x) => x.name === c.name); if (i >= 0) jar.splice(i, 1, c); else jar.push(c) } },
  } })
  await ssr.auth.setSession({ access_token: se.session!.access_token, refresh_token: se.session!.refresh_token })

  if (!only.length || only.includes('detail')) {
    const extra = await detailRoutes()
    routes = only.includes('detail') ? extra : [...routes, ...extra]
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, deviceScaleFactor: 2 })
  await ctx.addCookies(jar.map((c) => ({ ...c, domain: 'demo.localhost', path: '/' })))
  const page = await ctx.newPage()

  let total = 0
  console.log(`\nPhone width ${WIDTH}px\n`)
  for (const route of routes) {
    let found: Finding[] = []
    try {
      found = await audit(page, route)
      for (const tab of TABS[route] ?? []) {
        const btn = page.locator('button').filter({ hasText: tab }).first()
        if (await btn.count() === 0) continue
        await btn.click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(1200)
        for (const f of await probe(page)) found.push({ ...f, text: `[${tab}] ${f.text}` })
      }
    }
    catch (e) { console.log(`  ?? ${route}  — ${(e as Error).message.slice(0, 70)}`); continue }
    const seen = new Set<string>()
    found = found.filter((f) => {
      const k = `${f.kind}|${f.text.replace(/^\[[^\]]+\] /, '')}`
      if (seen.has(k)) return false
      seen.add(k); return true
    })
    if (!found.length) { console.log(`  ok  ${route}`); continue }
    total += found.length
    console.log(`  ${String(found.length).padStart(2)}  ${route}`)
    for (const f of found.slice(0, 8)) {
      console.log(`        ${f.kind.padEnd(8)} ${f.width ? `${String(f.width).padStart(4)}px ` : '      '}${f.text}`)
    }
    if (found.length > 8) console.log(`        … and ${found.length - 8} more`)
  }
  console.log(`\n${total} problems across ${routes.length} pages\n`)
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(1) })
