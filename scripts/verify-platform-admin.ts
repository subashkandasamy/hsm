/**
 * The platform admin panel — that it opens for an admin, and does not for
 * anyone else.
 *
 *   npm run dev
 *   npm run verify:platform-admin
 *
 * This panel is the one screen in the product that sees every hospital at
 * once: tenants, subscriptions, the platform audit log, partner payouts. The
 * gate is a row in platform_admins checked on the page, with the proxy keeping
 * it off tenant subdomains — two separate things, so both are checked here.
 *
 * Needs playwright-core: npm i --no-save playwright-core
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium, type Page } from 'playwright-core'
import { readFileSync } from 'node:fs'
import http from 'node:http'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function cookiesFor(userId: string): Promise<Array<{ name: string; value: string }>> {
  const { data: user } = await svc.auth.admin.getUserById(userId)
  const { data: link } = await svc.auth.admin.generateLink({ type: 'magiclink', email: user.user!.email! })
  const { data: sess } = await createClient(URL_, ANON).auth.verifyOtp({
    type: 'magiclink', token_hash: link.properties.hashed_token,
  })
  const jar: Array<{ name: string; value: string }> = []
  const ssr = createServerClient(URL_, ANON, { cookies: {
    getAll: () => jar,
    setAll: (cs) => { for (const c of cs) { const i = jar.findIndex((x) => x.name === c.name); if (i >= 0) jar.splice(i, 1, c); else jar.push(c) } },
  } })
  await ssr.auth.setSession({ access_token: sess.session!.access_token, refresh_token: sess.session!.refresh_token })
  return jar
}

// The same probe audit-mobile.ts uses: sent as source text because tsx's
// esbuild wraps functions in a __name helper the page does not have.
const PROBE = `(() => {
  const out = []
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (el.children.length !== 0) continue
    const text = (el.textContent || '').trim()
    if (!text) continue
    const hidden = cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis'
    if (hidden && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      out.push('cut ' + el.clientWidth + 'px  ' + text.slice(0, 44))
    }
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3
    if (lh > 0 && el.clientWidth > 0 && el.clientWidth < 130 && text.length > 12) {
      if (Math.round(el.clientHeight / lh) >= 4) out.push('crushed ' + el.clientWidth + 'px  ' + text.slice(0, 44))
    }
  }
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    out.push('sideways  ' + document.documentElement.scrollWidth + 'px in ' + window.innerWidth)
  }
  return Array.from(new Set(out))
})()`

async function main() {
  const { data: admins } = await svc.from('platform_admins').select('id, full_name')
  check('a platform admin exists to test with', (admins ?? []).length > 0)
  if (!admins?.length) process.exit(1)

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })

  // ── It opens for an admin ─────────────────────────────────────────────────
  console.log('\nFor a platform admin')
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies((await cookiesFor(admins[0].id as string)).map((c) => ({ ...c, domain: 'localhost', path: '/' })))
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('http://localhost:3000/platform-admin', { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(2000)
  check('the panel opens', page.url().includes('/platform-admin'), page.url())
  check('it did not fall over', errors.length === 0, errors[0] ?? '')
  const body = await page.locator('body').innerText()
  check('it is not an error page', !body.includes("couldn’t load") && !body.includes("couldn't load"))

  // The numbers it exists to show, against the database rather than each other.
  const { count: tenantCount } = await svc.from('tenants').select('*', { count: 'exact', head: true })
  check('every hospital is listed', new RegExp(`\\b${tenantCount}\\b`).test(body), `${tenantCount} tenants`)
  for (const word of ['Tenants', 'Subscriptions', 'Audit']) {
    check(`the ${word.toLowerCase()} section is there`, body.toLowerCase().includes(word.toLowerCase()))
  }

  await page.goto('http://localhost:3000/platform-admin/seeds', { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(1500)
  check('the seeds page opens too', page.url().includes('/platform-admin/seeds'), page.url())
  check('and it did not fall over', errors.length === 0, errors[0] ?? '')

  // ── It does not open for anyone else ──────────────────────────────────────
  console.log('\nFor somebody who is not one')
  const { data: tn } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  const { data: doc } = await svc.from('profiles').select('id')
    .eq('tenant_id', tn!.id as string).eq('role', 'doctor').limit(1).single()
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await ctx2.addCookies((await cookiesFor(doc!.id as string)).map((c) => ({ ...c, domain: 'localhost', path: '/' })))
  const page2 = await ctx2.newPage()
  await page2.goto('http://localhost:3000/platform-admin', { waitUntil: 'networkidle', timeout: 120_000 })
  await page2.waitForTimeout(1500)
  check('a hospital doctor is turned away', !page2.url().includes('/platform-admin'), page2.url())
  const body2 = await page2.locator('body').innerText()
  check('and is shown none of it', !body2.includes('Subscriptions'))

  // ── Signed out ────────────────────────────────────────────────────────────
  console.log('\nSigned out')
  const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page3 = await ctx3.newPage()
  await page3.goto('http://localhost:3000/platform-admin', { waitUntil: 'networkidle', timeout: 120_000 })
  await page3.waitForTimeout(1200)
  check('a stranger is sent to log in', !page3.url().includes('/platform-admin'), page3.url())

  // ── It is not reachable through a hospital's own address ─────────────────
  console.log('\nFrom a hospital subdomain')
  // Deployed this is a 307 to the apex. Locally Next collapses that Location
  // to a bare path, which from a .localhost subdomain points back at itself,
  // so development hands back the address instead — either way the panel does
  // not render under a tenant's context, which is the property that matters.
  // Node will not resolve a .localhost subdomain the way a browser does, so
  // the Host header carries the tenant and the connection goes to the loopback.
  // Signed in as the admin, or the auth gate answers first and we learn
  // nothing about the subdomain rule. Sent with node:http rather than fetch,
  // which silently refuses to set a Host header — that refusal made this read
  // as a bare-localhost request, and the panel answered 200 as it should have,
  // looking exactly like the guard had failed.
  const adminJar = (await cookiesFor(admins[0].id as string))
    .map((c) => `${c.name}=${c.value}`).join('; ')
  const r4 = await new Promise<{ status: number; location: string; body: string }>((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: 3000, path: '/platform-admin', method: 'GET',
      headers: { host: 'demo.localhost:3000', cookie: adminJar },
    }, (res) => {
      let body = ''
      res.on('data', (d) => { body += d })
      res.on('end', () => resolve({
        status: res.statusCode ?? 0, location: String(res.headers.location ?? ''), body,
      }))
    })
    req.on('error', reject)
    req.end()
  })
  const sent = r4.location || r4.body
  check('a tenant host does not serve the panel', r4.status === 307 || r4.status === 421, String(r4.status))
  check('and it names the apex instead',
        /\/platform-admin/.test(sent) && !/demo\.localhost:3000\/platform-admin/.test(sent),
        sent.replace(/\s+/g, ' ').slice(0, 70))

  // ── Signing out ──────────────────────────────────────────────────────────
  console.log('\nSigning out')
  const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await ctx5.addCookies((await cookiesFor(admins[0].id as string)).map((c) => ({ ...c, domain: 'localhost', path: '/' })))
  const page5 = await ctx5.newPage()
  await page5.goto('http://localhost:3000/platform-admin', { waitUntil: 'networkidle', timeout: 120_000 })
  await page5.waitForTimeout(1500)
  check('there is a way out', (await page5.getByRole('button', { name: /Sign out/ }).count()) > 0)
  await page5.getByRole('button', { name: /Sign out/ }).first().click()
  await page5.waitForTimeout(2500)
  check('it leaves the panel', !page5.url().includes('/platform-admin'), page5.url())

  // The part that matters: going back must not walk straight in again.
  await page5.goto('http://localhost:3000/platform-admin', { waitUntil: 'networkidle', timeout: 120_000 })
  await page5.waitForTimeout(1500)
  check('and going back does not sign you in again', !page5.url().includes('/platform-admin'), page5.url())
  const left = (await ctx5.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name) && c.value)
  check('no session cookie is left behind', left.length === 0,
        left.map((c) => c.name).join(', '))
  await ctx5.close()

  // ── On a phone ────────────────────────────────────────────────────────────
  console.log('\nOn a phone')
  for (const width of [360, 390]) {
    const m = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2 })
    await m.addCookies((await cookiesFor(admins[0].id as string)).map((c) => ({ ...c, domain: 'localhost', path: '/' })))
    const mp = await m.newPage()
    for (const path of ['/platform-admin', '/platform-admin/seeds']) {
      await mp.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 120_000 })
      await mp.waitForTimeout(1500)
      const found = await mp.evaluate(PROBE) as string[]
      check(`${width}px ${path}`, found.length === 0, found.slice(0, 4).join(' | '))
    }
    await m.close()
  }

  await browser.close()
  console.log(failures ? `\n${failures} FAILED\n` : '\nThe platform admin panel checks out.\n')
  process.exit(failures ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
