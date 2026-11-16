/*
 * Runs extract.js from this computer in a Chrome window of its own.
 *
 *   npx tsx migration/swiftehr/run.ts [all|patients|trial]
 *   npx tsx migration/swiftehr/run.ts since 2026-11-13     top-up: only what changed from that day
 *
 * A Chrome window opens on SwiftEHR. The person signs in THERE, by hand — this
 * script never sees, types or stores a password. Once signed in, it starts the
 * read-only copy and saves every part-file straight into migration/swiftehr/raw/
 * (git-ignored). It prints the progress panel once a minute.
 *
 * The window keeps its own profile (raw/.chrome-profile), so a restart of this
 * script is still signed in and the copy carries on from the last saved file.
 * Close the window to stop.
 */
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright-core'

// all | patients | trial — or the name of one part to copy on its own (e.g. pharmacy)
const MODE = process.argv[2] || 'all'
// since <YYYY-MM-DD>: a top-up of what changed from that day (files named …-since-YYYYMMDD-NNN.json).
const SINCE = MODE === 'since' ? process.argv[3] : null
if (MODE === 'since' && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE ?? '')) { console.error('usage: run.ts since YYYY-MM-DD'); process.exit(1) }
const ONLY = ['all', 'patients', 'trial', 'since'].includes(MODE) ? null : MODE
// redo-patients: put the patients part back in front of a saved full copy
// (patients already in raw/ files are skipped, so only the missing ones run).
const REDO_PATIENTS = process.argv.includes('redo-patients')
const BUTTON = ({ all: 'Copy everything', patients: 'Patients only', trial: 'Trial first' } as Record<string, string>)[MODE] ?? ''
const DIR = path.join(__dirname, 'raw')
const PROFILE = path.join(DIR, '.chrome-profile')
const APP = 'https://app.swiftehr.com/swiftehr_v2/'
const CHROME = process.env.E2E_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SCRIPT = fs.readFileSync(path.join(__dirname, 'extract.js'), 'utf8')

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }), ...a)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  fs.mkdirSync(PROFILE, { recursive: true })
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME, headless: false, acceptDownloads: true, viewport: null, chromiumSandbox: true,
    args: ['--window-size=1280,860'],
  })
  const page = ctx.pages()[0] || await ctx.newPage()
  page.on('download', async (d) => {
    // Never overwrite a saved file: a clash gets a time suffix instead.
    let to = path.join(DIR, d.suggestedFilename())
    if (fs.existsSync(to)) to = to.replace(/\.json$/, `-${Date.now()}.json`)
    await d.saveAs(to)
    await d.delete().catch(() => {})
    log('saved', path.basename(to), `${(fs.statSync(to).size / 1e6).toFixed(1)} MB`)
  })
  ctx.on('close', () => { log('window closed — stopped. Run again to carry on.'); process.exit(0) })

  if (!page.url().startsWith(APP)) await page.goto(APP)

  const signedIn = async () => {
    try {
      return await page.evaluate(`!!localStorage.getItem('token') && location.hash.startsWith('#/app/')`) as boolean
    } catch { return false }
  }
  // Ids of patients already saved in raw/ — the copy skips them.
  const savedIds = () => {
    const ids = new Set<number>()
    for (const f of fs.readdirSync(DIR).filter((n) => /^swiftehr-patients-\d+\.json$/.test(n))) {
      try { for (const it of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).items) if (it?.patient?.patientId) ids.add(it.patient.patientId) } catch { log('could not read', f) }
    }
    return [...ids]
  }
  // Patients still admitted in the newest saved copy of each patient (full or
  // top-up files): a top-up fetches them again to bring their stay up to date.
  const stillAdmitted = () => {
    const latest = new Map<number, unknown[]>()
    for (const f of fs.readdirSync(DIR).filter((n) => /^swiftehr-patients-.*\.json$/.test(n)).sort()) {
      try { for (const it of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).items) if (it?.patient?.patientId) latest.set(it.patient.patientId, it.visits ?? []) } catch { log('could not read', f) }
    }
    return [...latest].filter(([, visits]) => (visits as { visit?: { visitType?: string }; bill?: { lines?: { patientDischarged?: boolean } } }[])
      .some((v) => String(v?.visit?.visitType).toUpperCase() === 'IP' && v?.bill?.lines?.patientDischarged !== true)).map(([id]) => id)
  }
  // [patientId, admissionId] of every admission in the saved patient files.
  const savedAdmissions = () => {
    const out: number[][] = []
    for (const f of fs.readdirSync(DIR).filter((n) => /^swiftehr-patients-\d+\.json$/.test(n))) {
      try {
        for (const it of JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).items) {
          for (const v of it?.visits ?? []) if (String(v?.visit?.visitType).toUpperCase() === 'IP' && v.visit.visitId) out.push([it.patient.patientId, v.visit.visitId])
        }
      } catch { log('could not read', f) }
    }
    return out
  }
  let redoDone = !REDO_PATIENTS
  let lastPanel = ''
  let lastLog = 0
  for (;;) {
    try {
      if (await step()) return
    } catch (e) {
      // SwiftEHR reloads its own page now and then (and right after sign-in);
      // anything asked of the page at that moment fails. Wait and go again —
      // the copy carries on from its saved position.
      if (/Execution context was destroyed|navigation|Target page|frame was detached/i.test(String((e as Error)?.message))) {
        log('SwiftEHR reloaded the page — carrying on in a moment'); await wait(5000); continue
      }
      throw e
    }
  }
  // One pass of the loop; true when the copy has finished or stopped.
  async function step(): Promise<boolean> {
    if (!(await signedIn())) {
      if (Date.now() - lastLog > 60000) { log('waiting — sign in to SwiftEHR in the Chrome window'); lastLog = Date.now() }
      await wait(3000)
      return false
    }
    const running = await page.evaluate(`!!document.getElementById('uyirly-extract')`).catch(() => false)
    if (!running) {
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})   // let SwiftEHR finish loading first
      log('signed in — starting the copy (' + MODE + ')')
      if (!redoDone) {
        await page.evaluate(`(() => { const k = 'uyirly-extract-v1'; const s = JSON.parse(localStorage.getItem(k) || 'null'); if (!s) return;
          s.done = (s.done || []).filter((n) => n !== 'patients'); s.current = 'patients'; s.unit = 0; localStorage.setItem(k, JSON.stringify(s)) })()`)
        redoDone = true
        log('patients part put back in front')
      }
      const ids = savedIds()
      await page.evaluate((x) => { (window as unknown as { UYIRLY_SKIP: number[] }).UYIRLY_SKIP = x }, ids)
      log(`skipping ${ids.length} patients already saved`)
      if (ONLY) await page.evaluate((x) => { (window as unknown as { UYIRLY_ONLY: string }).UYIRLY_ONLY = x }, ONLY)
      if (SINCE) {
        const also = stillAdmitted()
        await page.evaluate(([d, a]) => { const w = window as unknown as { UYIRLY_SINCE: string; UYIRLY_ALSO: number[] }; w.UYIRLY_SINCE = d as string; w.UYIRLY_ALSO = a as number[] }, [SINCE, also] as const)
        log(`top-up since ${SINCE}; ${also.length} patients were still admitted at the last copy`)
      } else {
        const adm = savedAdmissions()
        await page.evaluate((x) => { (window as unknown as { UYIRLY_ADMISSIONS: number[][] }).UYIRLY_ADMISSIONS = x }, adm)
        log(`${adm.length} admissions known from saved patient files`)
      }
      await page.addScriptTag({ content: SCRIPT })
      await wait(1500)
      const choose = page.getByRole('button', { name: BUTTON || 'no-button' })
      if (BUTTON && await choose.count()) { await choose.click(); log('chose:', BUTTON) } else log('carrying on from the saved position')
    }
    const panel = (await page.locator('#uyirly-extract').innerText().catch(() => '')).replace(/\s*\n\s*/g, ' | ')
    if (panel && (panel !== lastPanel || Date.now() - lastLog > 60000)) {
      if (Date.now() - lastLog > 60000 || /Done ✓|Stopped:|done ✓/.test(panel)) { log(panel); lastLog = Date.now() }
      lastPanel = panel
    }
    if (/Done ✓|done ✓/.test(panel)) { log('finished'); await wait(15000); await ctx.close(); return true }
    if (/Stopped:/.test(panel)) { log('stopped — see the message above'); await wait(5000); return true }
    await wait(5000)
    return false
  }
}
main().catch((e) => { log('runner error:', e?.message || e); process.exit(1) })
