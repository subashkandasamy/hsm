/**
 * Which read actions check a role, and which rely on RLS alone.
 *
 *   npm run verify:read-permissions
 *
 * RLS gives tenant isolation. It gives **no** role isolation. A server action is
 * an HTTP endpoint, so any authenticated user of a hospital can call any
 * un-gated read directly and receive the data whatever their role (F-65).
 *
 * This is the detector, not the fix. Its job is to stop the number growing
 * quietly: F-08 recorded two instances of this and the real figure was 196, and
 * two other findings in this audit (F-31, F-26) were invariants nothing
 * enforced. BASELINE is checked in, so a new un-gated read fails the script
 * rather than joining a crowd nobody is counting.
 *
 * Lower the baseline as reads are gated. Raising it needs a reason in the
 * commit message.
 */

import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

/** Un-gated PHI-bearing reads at the time of writing. Lower this, don't raise it. */
const BASELINE = 91

const ACTIONS_DIR = join(process.cwd(), 'src/app/actions')

// Reads, by the naming the codebase already uses consistently.
const READ_NAME = /^(get|list|search|count|load|fetch|resolve|preview|export)[A-Z]/

interface Action {
  file: string
  name: string
  line: number
  gated: boolean
  guard: string | null
}

/**
 * Splits a file into exported async functions with their bodies.
 *
 * Brace-counting rather than a parser: these files are formatted consistently
 * and a dependency-free check is one that still runs in two years. It errs
 * toward reporting a function as un-gated, which is the safe direction for a
 * detector.
 */
function parseActions(file: string, src: string): Action[] {
  const out: Action[] = []
  const re = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g
  let m: RegExpExecArray | null

  while ((m = re.exec(src))) {
    const name = m[1]
    if (!READ_NAME.test(name)) continue

    // Body: from the declaration to the next line that is exactly `}` at
    // column 0.
    //
    // The obvious approach — first `{` after the signature, then count braces —
    // is wrong here, and wrong silently. These actions declare return types
    // like `Promise<{ url: string | null; denied?: boolean }>`, so the first
    // `{` belongs to the TYPE, and brace counting then ends at the type's close
    // and calls that the body. Every such function came back un-gated no matter
    // what it contained. Prettier puts a top-level function's closing brace at
    // column 0, which is a far stronger signal than brace depth.
    const bodyEnd = src.indexOf('\n}', m.index)
    const body = src.slice(m.index, bodyEnd < 0 ? src.length : bodyEnd)
    const line = src.slice(0, m.index).split('\n').length

    // Two guard shapes, and missing the second one made this script wrong on
    // its first run: `requirePermission` throws, while `hasPermission` is used
    // where the action must return a denial instead of raising (so a report
    // screen can say "you may not see this" rather than collapsing into "there
    // is no image"). Both are real checks. Counting only the first reported
    // getRadiologyImageUrl and getDocumentUrl as un-gated when they had been
    // gated deliberately.
    const guardMatch =
      body.match(/requirePermission\(\s*[^,]+,\s*'([^']+)'/) ??
      body.match(/hasPermission\(\s*[^,]+,\s*'([^']+)'/) ??
      body.match(/(requirePlatformAdmin|requireLabVerifier|requireWriteAccess)\s*\(/)
    const guard = guardMatch ? guardMatch[1] : null

    out.push({ file, name, line, gated: !!guard, guard })
  }
  return out
}

const all: Action[] = []
for (const f of readdirSync(ACTIONS_DIR).filter((f) => f.endsWith('.ts'))) {
  all.push(...parseActions(f, readFileSync(join(ACTIONS_DIR, f), 'utf8')))
}

const gated = all.filter((a) => a.gated)
const ungated = all.filter((a) => !a.gated)

// Files whose reads carry patient-identifiable or clinical data. Everything
// here is PHI-bearing by module, which is what makes an un-gated read matter;
// a reference-data read (drug catalogue, tariffs) is a different question.
const PHI_FILES = new Set([
  'patients.ts', 'ipd.ts', 'opd.ts', 'emr.ts', 'emrHistory.ts', 'allergies.ts',
  'lab.ts', 'radiology.ts', 'documents.ts', 'mlc.ts', 'insurance.ts',
  'emergency.ts', 'ipdTreatment.ts', 'nursingCare.ts', 'icu.ts', 'labour.ts',
  'dental.ts', 'blood.ts', 'careTeam.ts', 'ipdDeclaration.ts', 'followUps.ts',
  'prescriptions.ts', 'vaccination.ts', 'surgery.ts', 'referrals.ts',
])

const ungatedPhi = ungated.filter((a) => PHI_FILES.has(a.file))

console.log(`\nREAD ACTIONS\n  total        : ${all.length}\n  role-checked : ${gated.length}\n  RLS only     : ${ungated.length}`)
console.log(`\n  of those, in PHI-bearing modules: ${ungatedPhi.length}  (baseline ${BASELINE})`)

const byFile = new Map<string, Action[]>()
for (const a of ungatedPhi) {
  if (!byFile.has(a.file)) byFile.set(a.file, [])
  byFile.get(a.file)!.push(a)
}

console.log('\nUn-gated reads in PHI-bearing modules, by file:')
for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${file}  (${list.length})`)
  for (const a of list) console.log(`    ${String(a.line).padStart(4)}  ${a.name}`)
}

if (ungatedPhi.length > BASELINE) {
  console.log(`\nFAIL — ${ungatedPhi.length} un-gated PHI reads, above the baseline of ${BASELINE}.`)
  console.log('A new read action in a PHI-bearing module needs a requirePermission call.\n')
  process.exit(1)
}
console.log(
  ungatedPhi.length < BASELINE
    ? `\nOK — ${ungatedPhi.length}, below the baseline of ${BASELINE}. Lower BASELINE to ${ungatedPhi.length}.\n`
    : `\nOK — at the baseline of ${BASELINE}.\n`
)
