/*
 * SwiftEHR history → Uyirly, one step at a time.
 *
 *   npx tsx migration/swiftehr/import/index.ts <step> --tenant demo            dry run: shows what would be written
 *   npx tsx migration/swiftehr/import/index.ts <step> --tenant demo --write    writes (demo = scrambled names/phones)
 *   npx tsx migration/swiftehr/import/index.ts <step> --tenant demo --undo     removes everything that step wrote
 *
 * KMCH (--tenant karur) also needs --kmch-approved to write or undo.
 * Steps, in order: patients, opd, admissions, lab, labopt, scans
 */
import { parseArgs, resolveTenant } from './lib'
import * as patients from './steps/patients'
import * as opd from './steps/opd'
import * as admissions from './steps/admissions'
import * as lab from './steps/lab'
import * as labopt from './steps/labopt'
import * as scans from './steps/scans'

const STEPS: Record<string, { run: typeof patients.run; undo: typeof patients.undo }> = { patients, opd, admissions, lab, labopt, scans }

async function main() {
  const a = parseArgs(process.argv.slice(2))
  const step = STEPS[a.step]
  if (!step) throw new Error(`unknown step "${a.step}". Steps: ${Object.keys(STEPS).join(', ')}`)
  const t = await resolveTenant(a)
  console.log(`== ${a.step} → ${t.slug}${t.scramble ? ' (scrambled)' : ''} ${a.undo ? 'UNDO' : a.write ? 'WRITE' : 'dry run'}`)
  if (a.undo) await step.undo(t)
  else await step.run(t, a.write)
}
main().catch((e) => { console.error('STOPPED:', e instanceof Error ? e.message : e); process.exit(1) })
