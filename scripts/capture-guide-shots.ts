/**
 * Takes every screenshot the guides use, from the demo hospital.
 *
 *   npm run seed:demo     # first, so the data is the known one
 *   npm run shots         # then this
 *   npm run shots -- pharmacy   # or just the ones whose name contains "pharmacy"
 *
 * It signs in as the demo admin with a one-off magic link — no password typed,
 * no session left behind — walks each entry in guide-shots.ts and writes a PNG
 * to public/guides/. Captured at twice the size so the images stay sharp on a
 * retina display, then squeezed with sharp, because a guide that takes four
 * seconds to load is a guide nobody reads.
 *
 * Needs the dev server running, and SUPABASE_SERVICE_ROLE_KEY for the sign-in.
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium, type Page } from 'playwright-core'
import { mkdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import sharp from 'sharp'
import { SHOTS, type Shot, type Step } from './guide-shots'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!
const HOST = process.env.SHOT_HOST ?? 'demo.localhost:3000'
const OUT = 'public/guides'
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const shots = only.length ? SHOTS.filter((s) => only.some((o) => s.name.includes(o))) : SHOTS
if (!shots.length) { console.error(`No shots match ${only.join(', ')}`); process.exit(1) }

async function signIn(): Promise<Array<{ name: string; value: string }>> {
  const svc = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: tenant } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  if (!tenant) { console.error('No demo tenant — run `npm run seed:demo` first.'); process.exit(1) }

  const { data: admin } = await svc.from('profiles')
    .select('id').eq('tenant_id', tenant.id).eq('role', 'admin').limit(1).single()
  const { data: user } = await svc.auth.admin.getUserById(admin!.id as string)
  const { data: link, error } = await svc.auth.admin.generateLink({
    type: 'magiclink', email: user.user!.email!,
  })
  if (error) throw error

  const anon = createClient(URL_, ANON)
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({
    type: 'magiclink', token_hash: link.properties.hashed_token,
  })
  if (vErr) throw vErr

  const jar: Array<{ name: string; value: string }> = []
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => jar,
      setAll: (cs) => { for (const c of cs) {
        const i = jar.findIndex((x) => x.name === c.name)
        if (i >= 0) jar.splice(i, 1, c); else jar.push(c)
      } },
    },
  })
  await ssr.auth.setSession({
    access_token: sess.session!.access_token, refresh_token: sess.session!.refresh_token,
  })
  return jar
}

async function runStep(page: Page, step: Step): Promise<void> {
  if ('click' in step) await page.locator(step.click).first().click()
  else if ('clickText' in step) {
    // Tabs and buttons carry a count beside the label ("Stock 10"), so match loosely.
    await page.locator('button').filter({ hasText: step.clickText }).first().click()
  }
  else if ('fill' in step) await page.locator(step.fill[0]).first().fill(step.fill[1])
  else if ('press' in step) await page.keyboard.press(step.press)
  else if ('wait' in step) await page.waitForTimeout(step.wait)
}

/**
 * The sidebar, top bar and bottom tabs are fixed, so they sit over whatever is
 * captured underneath them. They are also the same in every screenshot and say
 * nothing about the screen being explained — and the top bar carries the signed-in
 * name. Hidden unless a shot is specifically about navigation.
 */
const HIDE_CHROME = `
  [class*="print:hidden"] { display: none !important; }
  /* min-h-screen would otherwise leave a screenful of empty background below
     short pages, which reads as a bug in a guide rather than a short list. */
  main { margin-left: 0 !important; min-height: 0 !important; padding-bottom: 8px !important; }
  /* The dev-server overlay badge is not part of the product. */
  nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
`

async function capture(page: Page, shot: Shot, raw: string): Promise<void> {
  const res = await page.goto(`http://${HOST}${shot.path}`, { waitUntil: 'networkidle', timeout: 120_000 })
  if (res && res.status() !== 200) throw new Error(`HTTP ${res.status()}`)
  await page.waitForTimeout(shot.wait ?? 2000)
  if (!shot.chrome) { await page.addStyleTag({ content: HIDE_CHROME }); await page.waitForTimeout(250) }

  for (const step of shot.steps ?? []) await runStep(page, step)
  if (shot.steps?.length) await page.waitForTimeout(600)

  if (shot.selector) {
    const el = page.locator(shot.selector).first()
    if (await el.count()) { await el.screenshot({ path: raw }); return }
    console.log('    (selector missed, whole page instead)')
  }
  await page.screenshot({ path: raw, fullPage: true })
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
  const jar = await signIn()

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  let failed = 0

  for (const shot of shots) {
    const ctx = await browser.newContext({
      viewport: { width: shot.width ?? 1280, height: shot.height ?? 900 },
      deviceScaleFactor: 2,
    })
    await ctx.addCookies(jar.map((c) => ({
      name: c.name, value: c.value, domain: HOST.split(':')[0],
      path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const,
    })))
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    const raw = `${OUT}/${shot.name}.raw.png`
    const final = `${OUT}/${shot.name}.png`
    try {
      await capture(page, shot, raw)
      const meta = await sharp(raw).png({ compressionLevel: 9, palette: true }).toFile(final)
      const kb = Math.round(meta.size / 1024)
      console.log(`  ✓ ${shot.name.padEnd(28)} ${meta.width}×${meta.height}  ${kb} KB${errors.length ? `  (page errors: ${errors.length})` : ''}`)
    } catch (e) {
      failed++
      console.log(`  ✗ ${shot.name.padEnd(28)} ${(e as Error).message.split('\n')[0].slice(0, 90)}`)
    } finally {
      await ctx.close()
    }
  }

  await browser.close()
  // The raw captures are only an input to the squeeze step.
  for (const s of shots) {
    try { if (existsSync(`${OUT}/${s.name}.raw.png`)) unlinkSync(`${OUT}/${s.name}.raw.png`) } catch { /* ignore */ }
  }

  console.log(`\n${shots.length - failed}/${shots.length} written to ${OUT}/`)
  if (failed) process.exit(1)
}

main()
