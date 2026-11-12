/**
 * Reads that stop at a thousand rows without saying so.
 *
 *   npm run verify:unbounded-reads
 *
 * PostgREST caps an unbounded reply at `db-max-rows` — 1,000 on Supabase — and
 * reports nothing when it does. `error` is null and the array is simply short,
 * so the caller cannot tell "there were 1,000" from "there were more".
 *
 * This was found in production. A hospital's opening stock put 1,027 batches in
 * `drug_batches`; the pharmacy screen reported 40,360 units against a true
 * 40,409, and because the query was ordered by expiry the rows that fell off
 * the end were the hospital's equipment. Nobody would have queried it: the
 * number looked fine.
 *
 * The check is an allowlist, in the manner of verify:rpc-grants. Every
 * unbounded read on a table that grows is listed below with the reason it is
 * safe. A NEW one fails this script, which is the point: the failure mode is
 * invisible at runtime, so it has to be caught at review time.
 *
 * The scanner is deliberately crude — it reads text, not dataflow, so it cannot
 * see `let q = ...; await q.limit(200)` spread over several statements. That is
 * exactly what the allowlist's `why` column records.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Tables one tenant can accumulate more than a thousand rows in. */
const GROWS = new Set([
  'payments', 'bills', 'bill_items', 'patients', 'visits', 'appointments', 'admissions',
  'lab_orders', 'lab_order_items', 'drug_batches', 'dispenses', 'prescriptions',
  'admission_advances', 'insurance_claims', 'credit_notes', 'radiology_orders', 'anc_visits',
  'emergency_cases', 'ot_schedules', 'ot_consumables', 'blood_units', 'blood_donors',
  'blood_crossmatches', 'blood_requests', 'patient_documents', 'follow_ups', 'partograph_obs',
  'pediatric_growth', 'delivery_babies', 'mlc_records', 'nursing_care_plans', 'nursing_handovers',
  'icu_stays', 'inventory_batches', 'po_items', 'patient_members', 'patient_allergies',
  'duty_roster', 'anc_records', 'mtp_records', 'form_f_records', 'drug_master', 'drug_brands',
  'lab_tests_catalog', 'lab_tests_master', 'radiology_master', 'drug_interactions',
  'immunization_schedule',
])

/**
 * Reviewed and safe: `file::table` -> how many such sites, and why.
 * The count matters — a new unbounded read in a file already listed still fails.
 */
const REVIEWED: Record<string, { n: number; why: string }> = {
  'src/app/actions/accounts.ts::appointments':        { n: 4, why: "head:true — count is exact whatever the row cap" },
  'src/app/actions/accounts.ts::lab_order_items':     { n: 3, why: "head:true — count is exact whatever the row cap" },
  'src/app/actions/patientPortal.ts::appointments':   { n: 2, why: ".limit(1); and one day's tokens for one doctor" },
  'src/app/actions/patientPortal.ts::patient_members':{ n: 1, why: ".maybeSingle()" },
  'src/app/actions/appointments.ts::bill_items':      { n: 1, why: "scoped .eq('bill_id') — a bill's own lines" },
  'src/app/actions/admissionBilling.ts::bills':       { n: 1, why: "scoped .eq('admission_id') + bill_source" },
  'src/app/actions/emergency.ts::bills':              { n: 1, why: ".limit(1).maybeSingle()" },
  'src/app/actions/blood.ts::blood_requests':         { n: 1, why: ".limit(200) applied on a later statement" },
  'src/app/actions/pharmacy.ts::drug_batches':        { n: 1, why: "lastBatchFor — .limit(1)" },
  'src/app/actions/pharmacySale.ts::drug_batches':    { n: 1, why: "FEFO pick — .limit(1) on both branches" },
  'src/app/actions/followUps.ts::follow_ups':         { n: 1, why: "the builder is paged by pageAll on a later statement" },
  'src/app/actions/vaccination.ts::immunization_schedule': { n: 1, why: "global reference, ~50 rows, no tenant dimension" },
  'src/app/actions/insurance.ts::insurance_claims':   { n: 4, why: ".maybeSingle(); .limit(300); scoped by admission_id; scoped by policy_id" },
  'src/app/actions/insurance.ts::patient_documents':  { n: 2, why: "scoped .eq('claim_id') / .eq('policy_id')" },
  'src/app/actions/seeds.ts::lab_tests_master':       { n: 1, why: ".limit(200) applied on a later statement" },
  'src/app/actions/seeds.ts::radiology_master':       { n: 1, why: ".limit(200) applied on a later statement" },
  'src/app/actions/mlc.ts::mlc_records':              { n: 1, why: ".maybeSingle()" },
  'src/app/actions/nursingCare.ts::nursing_handovers':{ n: 1, why: ".limit(30)" },
  'src/app/actions/ot.ts::ot_schedules':              { n: 1, why: ".limit(500) applied on a later statement" },
  'src/app/actions/labour.ts::partograph_obs':        { n: 1, why: ".limit(1) — the previous reading" },
  'src/app/actions/ipd.ts::visits':                   { n: 1, why: "scoped .eq('patient_id') + type + a 5-minute window" },
  'src/app/actions/referOut.ts::visits':              { n: 1, why: ".limit(1).maybeSingle()" },
  'src/app/actions/ipdTreatment.ts::drug_batches':    { n: 1, why: ".limit(1) on a later line — is the substituted drug still in stock (BUG-018)" },
  'src/app/actions/wards.ts::admissions':             { n: 1, why: "admitted patients' beds only — never more than the hospital has beds (BUG-055)" },
  'src/lib/billing/applyAdvance.ts::bills':           { n: 1, why: "scoped .eq('admission_id') on a later line — one stay's bills (BUG-053)" },
}

const BOUNDED = [/\.single\(\)/, /\.maybeSingle\(\)/, /\.limit\(/, /\.range\(/, /head:\s*true/, /pageAll/]
const NARROW = /\.(eq|in)\('(?!tenant_id|is_active|status|is_global)[\w]+'/

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.tsx?$/.test(e)) yield p
  }
}

/** The statement around a `.from('x')`, as far as brackets allow. */
function statementAt(lines: string[], i: number): string {
  let s = i
  while (s > 0) {
    const prev = lines[s - 1].trimEnd(), cur = lines[s].trimStart()
    if (/^[.?:]/.test(cur) || /[(,=[?:]$|&&$|\|\|$|=>$/.test(prev)) { s--; continue }
    break
  }
  let depth = 0
  const out: string[] = []
  for (let j = s; j < Math.min(lines.length, s + 60); j++) {
    out.push(lines[j])
    for (const ch of lines[j]) {
      if ('([{'.includes(ch)) depth++
      else if (')]}'.includes(ch)) depth--
    }
    if (j >= i && depth <= 0) break
  }
  return out.join('\n')
}

const found: Record<string, number> = {}
const where: Record<string, string[]> = {}
for (const file of files('src')) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes('.from(')) continue
  const lines = text.split('\n')
  const seen = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes(".from('")) continue
    const stmt = statementAt(lines, i)
    const m = /\.from\('([\w]+)'\)/.exec(stmt)
    if (!m || !GROWS.has(m[1])) continue
    if (!stmt.includes('.select(')) continue
    if (BOUNDED.some((r) => r.test(stmt))) continue
    if (NARROW.test(stmt)) continue
    if (seen.has(i)) continue
    seen.add(i)
    const key = `${relative('.', file)}::${m[1]}`
    found[key] = (found[key] ?? 0) + 1
    ;(where[key] ??= []).push(`${relative('.', file)}:${i + 1}`)
  }
}

let failed = 0
console.log('\nUnbounded reads on tables that grow past 1,000 rows\n')
for (const key of Object.keys(found).sort()) {
  const ok = REVIEWED[key]
  if (ok && found[key] <= ok.n) {
    console.log(`  ok    ${key}  (${found[key]})  — ${ok.why}`)
  } else {
    failed++
    const extra = ok ? `${found[key]} sites, ${ok.n} reviewed — a NEW one appeared` : 'not reviewed'
    console.log(`  FAIL  ${key}  — ${extra}`)
    for (const w of where[key]) console.log(`          ${w}`)
  }
}
for (const key of Object.keys(REVIEWED).sort()) {
  if (!(key in found)) console.log(`  note  ${key} is in the allowlist but no longer matches — remove the entry`)
}

console.log(failed === 0
  ? '\nEvery unbounded read on a growing table has been looked at.\n'
  : `\n${failed} unreviewed unbounded read(s). Use pageAll, or add an entry saying why it is bounded.\n`)
process.exit(failed === 0 ? 0 : 1)
