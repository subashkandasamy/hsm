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
 *
 * playwright-core is deliberately NOT in package.json. It is a 13 MB browser
 * driver used only to take these screenshots, and declaring it would make every
 * production build download it for a script that never runs there. Install it
 * when you need it:
 *
 *   npm i --no-save playwright-core
 *
 * scripts/ is excluded from tsconfig.json for the same reason — the app's build
 * should never type-check local tooling. Check it with `npm run typecheck:scripts`
 * once playwright-core is installed.
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

/**
 * Paths like /opd/<visitId> point at rows whose ids change every time the demo
 * is re-seeded, so the manifest writes {paedVisit} and this fills it in. A shot
 * list full of hard-coded uuids would be stale the first time anyone re-seeded.
 */
async function resolvePlaceholders(): Promise<Record<string, string>> {
  const svc = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: tenant } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  const t = tenant!.id as string

  const patient = async (like: string) => {
    const { data } = await svc.from('patients').select('id').eq('tenant_id', t).ilike('full_name', like).limit(1).maybeSingle()
    return (data?.id as string) ?? ''
  }
  const visitOf = async (like: string) => {
    const pid = await patient(like)
    const { data } = await svc.from('visits').select('id').eq('tenant_id', t).eq('patient_id', pid)
      .order('visit_date', { ascending: false }).limit(1).maybeSingle()
    return (data?.id as string) ?? ''
  }
  const admissionIn = async (wardName: string) => {
    const { data: ward } = await svc.from('wards').select('id').eq('tenant_id', t).eq('name', wardName).maybeSingle()
    const { data } = await svc.from('admissions').select('id').eq('tenant_id', t).eq('ward_id', ward?.id ?? '')
      .eq('status', 'admitted').limit(1).maybeSingle()
    return (data?.id as string) ?? ''
  }

  return {
    paedVisit: await visitOf('Aarav%'),
    ancVisit: await visitOf('Lakshmi%'),
    generalVisit: await visitOf('Murugan%'),
    paedPatient: await patient('Aarav%'),
    ipdPatient: await patient('Saraswathi%'),
    allergyPatient: await patient('Murugan%'),
    bloodPanelOrder: await (async () => {
      const { data } = await svc.from('lab_orders').select('id')
        .eq('tenant_id', t).eq('status', 'reported').not('admission_id', 'is', null).limit(1).maybeSingle()
      return (data?.id as string) ?? ''
    })(),
    urineOrder: await (async () => {
      const { data } = await svc.from('lab_orders').select('id, items:lab_order_items(test:lab_tests_catalog(code))')
        .eq('tenant_id', t).eq('status', 'reported')
      for (const o of (data ?? []) as unknown as Array<{ id: string; items: Array<{ test: { code: string } | null }> }>) {
        if (o.items?.some((i) => i.test?.code === 'URM')) return o.id
      }
      return ''
    })(),
    eyePatient: await patient('Kavya%'),
    eyeVisit: await visitOf('Kavya%'),
    dentalVisit: await visitOf('Karthik%'),
    dentalPatient: await patient('Karthik%'),
    estimate: await (async () => {
      const { data } = await svc.from('cost_estimates').select('id').eq('tenant_id', t).limit(1).maybeSingle()
      return (data?.id as string) ?? ''
    })(),
    labourAdmission: await admissionIn('Labour Room 1'),
    wardAdmission: await admissionIn('Female General Ward'),
  }
}

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
  // Pick an option by the text the user would read, not by its value — the
  // values are uuids the seed regenerates on every run.
  else if ('select' in step) await page.locator(step.select[0]).first().selectOption({ label: step.select[1] })
  else if ('goto' in step) {
    await page.goto(new URL(step.goto, page.url()).toString(), { waitUntil: 'networkidle', timeout: 120_000 })
  }
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
  nextjs-portal, [data-nextjs-toast], #__next-build-watcher,
  [data-nextjs-dev-tools-button], [data-next-badge-root], [data-next-badge] { display: none !important; }
`

async function capture(page: Page, shot: Shot, raw: string, vars: Record<string, string>): Promise<void> {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k]
    if (!v) throw new Error(`nothing in the demo matches {${k}}`)
    return v
  })
  const path = fill(shot.path)
  const host = shot.host ?? HOST
  const res = await page.goto(`http://${host}${path}`, { waitUntil: 'networkidle', timeout: 120_000 })
  if (res && res.status() !== 200) throw new Error(`HTTP ${res.status()}`)
  await page.waitForTimeout(shot.wait ?? 2000)
  if (!shot.chrome) { await page.addStyleTag({ content: HIDE_CHROME }); await page.waitForTimeout(250) }

  for (const step of shot.steps ?? []) {
    await runStep(page, 'goto' in step ? { goto: fill(step.goto) } : step)
  }
  if (shot.steps?.length) {
    await page.waitForTimeout(600)
    // A step that signs in or navigates reloads the document, which drops the
    // style tag added above — so put it back before the shutter.
    if (!shot.chrome) { await page.addStyleTag({ content: HIDE_CHROME }); await page.waitForTimeout(250) }
  }

  if (shot.selector) {
    // filterText picks the card by what it says, which survives a class change.
    const el = shot.filterText
      ? page.locator(shot.selector).filter({ hasText: shot.filterText }).last()
      : page.locator(shot.selector).first()
    if (await el.count()) { await el.screenshot({ path: raw }); return }
    console.log('    (selector missed, whole page instead)')
  }
  await page.screenshot({ path: raw, fullPage: true })
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
  const jar = await signIn()
  const vars = await resolvePlaceholders()

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  let failed = 0

  for (const shot of shots) {
    const ctx = await browser.newContext({
      viewport: { width: shot.width ?? 1280, height: shot.height ?? 900 },
      deviceScaleFactor: 2,
    })
    // The patient portal is a different host with its own session cookie, so the
    // staff cookies would only confuse it — those shots sign in through the form.
    if (!shot.host) {
      await ctx.addCookies(jar.map((c) => ({
        name: c.name, value: c.value, domain: HOST.split(':')[0],
        path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const,
      })))
    }
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    const raw = `${OUT}/${shot.name}.raw.png`
    const final = `${OUT}/${shot.name}.png`
    try {
      await capture(page, shot, raw, vars)
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
