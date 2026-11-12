// A real Chrome, signed in as one of the test staff accounts, the way a person
// would — the suite never writes to the database itself.
import fs from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { E, account, ms, type Role } from './env'
import type { Run } from './run'

export type { Page }

export interface Session { browser: Browser; ctx: BrowserContext; page: Page; errors: string[]; role: Role | 'anon'; close: () => Promise<void> }

export async function open(opts: { mobile?: boolean } = {}): Promise<Session> {
  const browser = await chromium.launch({ executablePath: E.chrome, headless: E.headless })
  const ctx = await browser.newContext(opts.mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    : { viewport: { width: 1400, height: 950 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(ms(30000))
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  // Vercel's analytics script exists only on Vercel — a local build 404s it.
  page.on('console', (m) => { if (m.type() === 'error' && !/\/_vercel\//.test(m.location()?.url ?? '')) errors.push(`console: ${m.text().slice(0, 200)}`) })
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url().replace(E.base, '')}`) })
  return { browser, ctx, page, errors, role: 'anon', close: async () => { await browser.close().catch(() => {}) } }
}

/** Fill the sign-in form and press "Sign in". Returns the path the app landed on. */
export async function login(page: Page, email: string, password: string): Promise<string> {
  await page.goto(`${E.base}/login`, { waitUntil: 'networkidle', timeout: ms(60000) })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: ms(30000) }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  return new URL(page.url()).pathname
}

/** A browser signed in as a test account. */
export async function as(role: Role, opts: { mobile?: boolean } = {}): Promise<Session> {
  const a = account(role)
  const s = await open(opts)
  s.role = role
  let where = await login(s.page, a.email, a.password)
  // Many sign-ins in a row can hit the auth rate limit — wait and try once more.
  if (where.startsWith('/login')) { await s.page.waitForTimeout(ms(30000)); where = await login(s.page, a.email, a.password) }
  if (where.startsWith('/login') || where === '/change-password') {
    await s.close()
    throw new Error(`${role} could not sign in (landed on ${where}) — check E2E_${role.toUpperCase()}_PASSWORD or run "npm run e2e:accounts"`)
  }
  return s
}

/** Run `fn` with a signed-in browser and always close it. */
export async function withRole<T>(role: Role, fn: (s: Session) => Promise<T>, opts: { mobile?: boolean } = {}): Promise<T> {
  const s = await as(role, opts)
  try { return await fn(s) } finally { await s.close() }
}

/** Open a screen and let it settle. */
export async function go(page: Page, p: string) {
  const r = await page.goto(`${E.base}${p}`, { waitUntil: 'networkidle', timeout: ms(90000) }).catch(() => null)
  await page.waitForTimeout(ms(1500))
  return { status: r?.status() ?? 0, path: new URL(page.url()).pathname }
}

export const wait = (page: Page, n: number) => page.waitForTimeout(ms(n))
export const text = async (page: Page, sel = 'main') => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ')
export const bodyText = (page: Page) => text(page, 'body')
export const pathOf = (page: Page) => new URL(page.url()).pathname

export async function shot(r: Run, page: Page, name: string): Promise<string> {
  const f = path.join(r.shots, `${name.replace(/[^a-z0-9_-]+/gi, '_')}.png`)
  await page.screenshot({ path: f, fullPage: true }).catch(() => {})
  return path.relative(r.dir, f)
}

/** Fetch a printout (PDF) as the signed-in browser and save it to the run folder. */
export async function savePrint(r: Run, page: Page, url: string, name: string): Promise<{ status: number; type: string; bytes: number; pages: number; file: string }> {
  const res: string = await page.evaluate(`(async () => { const r = await fetch(${JSON.stringify(url)}); const b = new Uint8Array(await r.arrayBuffer()); let s=''; for (const x of b) s += String.fromCharCode(x); return r.status + '|' + (r.headers.get('content-type')||'') + '|' + btoa(s) })()`)
  const [st, ct, data] = res.split('|')
  const buf = Buffer.from(data, 'base64')
  const file = path.join(r.dir, 'prints', `${name}.pdf`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  const pages = (buf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length
  return { status: Number(st), type: ct, bytes: buf.length, pages, file: path.relative(r.dir, file) }
}

/** The raw text of a saved print (PDF), for simple "does it mention X" checks. */
/**
 * The words on a saved PDF. PDF text sits in compressed streams, so reading the
 * raw file matches almost nothing; pypdf (python3) extracts it. Without it the
 * raw bytes are returned and text checks will say so by failing.
 */
export function printText(r: Run, rel: string): string {
  const file = path.join(r.dir, rel)
  try {
    return execFileSync('python3', ['-I', '-c',
      'import sys, pypdf; print("\\n".join((p.extract_text() or "") for p in pypdf.PdfReader(sys.argv[1]).pages))', file],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 })
  } catch {
    return fs.readFileSync(file).toString('latin1')
  }
}

/** Click something that opens a new tab; returns the new tab's path (and closes it). */
export async function popupPath(page: Page, click: () => Promise<unknown>): Promise<string | null> {
  const [pop] = await Promise.all([page.context().waitForEvent('page', { timeout: ms(15000) }).catch(() => null), click()])
  if (!pop) return null
  // Some screens open about:blank first and set the address once the PDF is ready.
  await pop.waitForURL((u) => u.protocol.startsWith('http'), { timeout: ms(20000) }).catch(() => {})
  await pop.waitForLoadState('domcontentloaded').catch(() => {})
  const u = new URL(pop.url()); await pop.close().catch(() => {})
  if (!u.protocol.startsWith('http')) return null
  return u.pathname + u.search
}

/** What a person can click or type into right now — for debugging a broken flow. */
export async function inventory(page: Page) {
  return page.evaluate(`(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const btn = [...document.querySelectorAll('button, a[href]')].filter(vis).map((e) => (e.textContent || '').trim().replace(/\\s+/g, ' ')).filter(Boolean)
    const labels = [...document.querySelectorAll('label')].filter(vis).map((e) => (e.textContent || '').trim()).filter(Boolean)
    return { url: location.pathname, buttons: [...new Set(btn)].slice(0, 80), labels: labels.slice(0, 60) }
  })()`)
}
