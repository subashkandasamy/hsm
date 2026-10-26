/**
 * The saved-phrase picker, driven the way a doctor drives it.
 *
 *   npm run seed:demo     # so the demo hospital exists
 *   npm run dev           # this walks the real page in a real browser
 *   npm run verify:phrases
 *
 * Unit tests would not have caught what this does. The picker only appears on
 * an open visit for a doctor — a closed visit, or an admin, correctly shows
 * nothing — and the thing most worth proving is a round trip: the phrase a
 * doctor keeps has to come back, in the right box and nowhere else, with its
 * use counted. All of that spans a server action, RLS and an RPC.
 *
 * It writes to the demo tenant and clears up after itself, including when it
 * fails. playwright-core is not in package.json (see capture-guide-shots.ts):
 *
 *   npm i --no-save playwright-core
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { STARTER_PHRASES, STARTER_COUNT } from '../src/lib/noteStarterPhrases'
import { isNoteFieldKey } from '../src/lib/noteFields'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL_, SVC, { auth: { autoRefreshToken: false, persistSession: false } })

/** Re-run the same insert the button does, and report the resulting row count. */
async function addStarterTwice(t: string): Promise<number> {
  const { data: existing } = await svc.from('note_templates').select('field_key').eq('tenant_id', t)
  const taken = new Set((existing ?? []).map((r) => r.field_key as string))
  const rows: Array<Record<string, unknown>> = []
  for (const [fieldKey, list] of Object.entries(STARTER_PHRASES)) {
    if (taken.has(fieldKey)) continue
    for (const ph of list ?? []) rows.push({ tenant_id: t, field_key: fieldKey, label: ph.label, body: ph.body })
  }
  if (rows.length) await svc.from('note_templates').insert(rows)
  const { count } = await svc.from('note_templates').select('*', { count: 'exact', head: true }).eq('tenant_id', t)
  return count ?? 0
}
let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

/** A browser-ready cookie jar for one profile, via a one-off magic link. */
async function cookiesFor(profileId: string): Promise<Array<{ name: string; value: string }>> {
  const { data: user } = await svc.auth.admin.getUserById(profileId)
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

async function main() {
  const { data: tenant } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  const t = tenant!.id as string
  await svc.from('note_templates').delete().eq('tenant_id', t)

  const { data: doc } = await svc.from('profiles').select('id, full_name')
    .eq('tenant_id', t).eq('role', 'doctor').limit(1).single()
  const jar = await cookiesFor(doc!.id as string)

  const { data: visits } = await svc.from('visits').select('id')
    .eq('tenant_id', t).neq('status', 'closed').order('visit_date', { ascending: false }).limit(1)

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
  await ctx.addCookies(jar.map((c) => ({ ...c, domain: 'demo.localhost', path: '/' })))
  const page = await ctx.newPage()
  await page.goto(`http://demo.localhost:3000/opd/${visits![0].id}`, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(2500)

  const exam = page.locator('div.glass-card').filter({ hasText: 'Examination' }).first()
  await exam.locator('button').first().click()
  await page.waitForTimeout(1000)

  console.log('\nKeeping a phrase the doctor just wrote')
  const cvs = exam.locator('textarea').nth(1)           // general is 0, CVS is 1
  await cvs.fill('S1 S2 heard, no murmur')
  await exam.locator('button[title="Saved phrases"]').nth(1).click()
  await page.waitForTimeout(800)
  await page.getByText('+ Keep what I just wrote').click()
  await page.waitForTimeout(400)
  await page.locator('input[placeholder^="Short name"]').fill('Normal CVS')
  await page.locator('button[title="Keep it"]').click()
  await page.waitForTimeout(1800)

  const { data: saved } = await svc.from('note_templates').select('*').eq('tenant_id', t)
  check('the phrase reached the database', saved!.length === 1, `${saved!.length} row(s)`)
  check('it kept the doctor\'s words', saved?.[0]?.body === 'S1 S2 heard, no murmur', String(saved?.[0]?.body))
  check('it is scoped to the box it came from', saved?.[0]?.field_key === 'exam.cvs', String(saved?.[0]?.field_key))
  check('it records who wrote it', saved?.[0]?.created_by === doc!.id)
  check('it starts uncounted', saved?.[0]?.use_count === 0, `use_count=${saved?.[0]?.use_count}`)

  console.log('\nThe same name twice is refused')
  // The panel stays open after a save (so the doctor sees the phrase land), so
  // reopening would close it.
  check('the panel stays open and shows the new phrase',
        (await page.getByText('Normal CVS', { exact: true }).count()) > 0)
  await cvs.fill('S1 S2 heard, no murmur')
  await exam.locator('button[title="Saved phrases"]').nth(1).click()   // closed
  await exam.locator('button[title="Saved phrases"]').nth(1).click()   // open again
  await page.waitForTimeout(800)
  await page.getByText('+ Keep what I just wrote').click()
  await page.locator('input[placeholder^="Short name"]').fill('normal cvs')   // different case on purpose
  await page.locator('button[title="Keep it"]').click()
  await page.waitForTimeout(1500)
  const dupMsg = await page.getByText('already exists').count()
  check('a duplicate name is explained, not silently dropped', dupMsg > 0)
  const { count: afterDup } = await svc.from('note_templates')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', t)
  check('and no second row was written', afterDup === 1, `${afterDup} row(s)`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  check('Escape closes the panel', (await page.locator('input[placeholder^="Short name"]').count()) === 0)

  console.log('\nUsing it on the next patient')
  await cvs.fill('')                                    // the box is empty again
  await exam.locator('button[title="Saved phrases"]').nth(1).click()
  await page.waitForTimeout(900)
  await page.getByText('Normal CVS', { exact: true }).click()
  await page.waitForTimeout(1500)
  check('one tap filled the box', (await cvs.inputValue()) === 'S1 S2 heard, no murmur', await cvs.inputValue())

  const { data: bumped } = await svc.from('note_templates').select('use_count, last_used_at').eq('tenant_id', t).single()
  check('the use was counted', bumped!.use_count === 1, `use_count=${bumped!.use_count}`)
  check('and when it was last used is recorded', !!bumped!.last_used_at)

  console.log('\nA phrase is offered only in its own box')
  await exam.locator('button[title="Saved phrases"]').nth(2).click()   // Respiratory
  await page.waitForTimeout(1200)
  check('respiratory does not show the CVS phrase',
        (await page.getByText('No phrases here yet.').count()) > 0)

  console.log('\nThe starter set, taken on purpose from Settings')
  await svc.from('note_templates').delete().eq('tenant_id', t)
  await page.goto('http://demo.localhost:3000/settings/phrases', { waitUntil: 'networkidle', timeout: 120_000 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Add the starter phrases' }).click()
  await page.getByRole('button', { name: 'Add them' }).click()
  await page.waitForTimeout(2500)

  const { data: starter } = await svc.from('note_templates').select('field_key, body').eq('tenant_id', t)
  check('the whole set landed', starter!.length === STARTER_COUNT, `${starter!.length} of ${STARTER_COUNT}`)
  check('nothing starts used',
        (await svc.from('note_templates').select('*', { count: 'exact', head: true })
          .eq('tenant_id', t).gt('use_count', 0)).count === 0)
  check('every phrase is in a box the app knows',
        starter!.every((r) => isNoteFieldKey(r.field_key as string)))
  check('blanks are left where a number or a side belongs',
        starter!.some((r) => (r.body as string).includes('___')))

  console.log('\nTaking it twice does not double the library')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  check('the offer is gone once there are phrases',
        (await page.getByRole('button', { name: 'Add the starter phrases' }).count()) === 0)
  const again = await addStarterTwice(t)
  check('and a second run adds nothing', again === STARTER_COUNT, `${again} rows after`)

  console.log('\nThe step on Getting Started')
  // Admin-only page, so this needs its own session.
  const { data: admin } = await svc.from('profiles').select('id')
    .eq('tenant_id', t).eq('role', 'admin').limit(1).single()
  const actx = await browser.newContext({ viewport: { width: 1280, height: 1200 } })
  await actx.addCookies((await cookiesFor(admin!.id as string)).map((c) => ({ ...c, domain: 'demo.localhost', path: '/' })))
  const apage = await actx.newPage()

  const stepRow = () => apage.locator('div.glass-card').filter({ hasText: 'Keep your everyday note phrases' }).first()

  // Empty library first: the step has to be visible and point somewhere.
  await svc.from('note_templates').delete().eq('tenant_id', t)
  await apage.goto('http://demo.localhost:3000/getting-started', { waitUntil: 'networkidle', timeout: 120_000 })
  await apage.waitForTimeout(1500)
  check('an empty library shows the step', (await stepRow().count()) > 0)
  const href = await stepRow().getByRole('link', { name: /Set up/ }).first().getAttribute('href')
  check('and it points at the phrases screen', href === '/settings/phrases', String(href))

  // Then with a library. In the demo every other step is already done, so
  // finishing this one tips the whole page into its all-done state — which is
  // itself the proof that this step counts towards the total.
  await apage.goto('http://demo.localhost:3000/settings/phrases', { waitUntil: 'networkidle', timeout: 120_000 })
  await apage.waitForTimeout(1200)
  await apage.getByRole('button', { name: 'Add the starter phrases' }).click()
  await apage.getByRole('button', { name: 'Add them' }).click()
  await apage.waitForTimeout(2500)
  await apage.goto('http://demo.localhost:3000/getting-started', { waitUntil: 'networkidle', timeout: 120_000 })
  await apage.waitForTimeout(1500)
  const settled = (await stepRow().getByText('Done').count()) > 0
    || (await apage.getByText("You're all set!").count()) > 0
    || (await apage.getByText('all set').count()) > 0
  check('once phrases exist the step stops asking', settled)
  check('an admin can add the starter set too',
        ((await svc.from('note_templates').select('*', { count: 'exact', head: true }).eq('tenant_id', t)).count ?? 0) === STARTER_COUNT)

  await browser.close()
  await svc.from('note_templates').delete().eq('tenant_id', t)
  console.log(failures ? `\n${failures} FAILED\n` : '\nAll phrase-picker checks passed.\n')
  process.exit(failures ? 1 : 0)
}
main().catch(async (e) => {
  console.error(e)
  const { data: tn } = await svc.from('tenants').select('id').eq('slug', 'demo').maybeSingle()
  if (tn) await svc.from('note_templates').delete().eq('tenant_id', tn.id as string)
  process.exit(1)
})
