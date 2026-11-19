/**
 * X-rays are not ultrasound (migration 0309).
 *
 *   npm run verify:pcpndt-buckets                       # the rule, offline
 *   npx tsx --env-file=.env.local scripts/verify-pcpndt-buckets.ts   # + the database
 *
 * The monthly PC&PNDT scan count leaves out a catalogue test that nobody placed
 * in a column when its modality is plainly not ultrasound. That rule lives in
 * two places, and they must agree, or the Setup page says "all placed" while
 * the return still says "31 scans not placed" (or the other way round):
 *
 *   isNeverUltrasound()   src/lib/radiology/modality.ts  — the Setup page
 *   pcpndt_auto_bucket()  migration 0309                 — the return itself
 *
 * Offline it checks the rule on every spelling we know of. With database
 * credentials it also asks pcpndt_auto_bucket() the same questions, and checks
 * on the demo hospital that the return's "not placed" count is exactly what the
 * Setup page would show. Read-only.
 */

import { createClient } from '@supabase/supabase-js'
import { isNeverUltrasound } from '../src/lib/radiology/modality'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

// Every spelling canonical() knows, plus what hospitals actually type.
const NOT_ULTRASOUND = [
  'xray', 'X-Ray', 'X Ray', 'XRAY', 'dx', 'CR', 'radiograph', 'Radiography',
  'ct', 'CT', 'CT Scan', 'ct-scan', 'Computed Tomography',
  'mri', 'MRI', 'MR', 'MRI Scan', 'Magnetic Resonance',
  'mammography', 'Mammogram', 'MG',
  'nuclear', 'pet', 'PET-CT', 'PET CT',
  'angiography', 'interventional', 'fluoroscopy',
  'dental', 'OPG', 'Panoramic',
  'dexa', 'DEXA Scan', 'Bone Densitometry',
]
// Must still be placed by a person: ultrasound, echo, and anything unknown.
const MUST_BE_PLACED = [
  'usg', 'USG', 'Ultrasound', 'US', 'Sonography', 'scan',
  'echo', 'Echo', 'Echocardiography', '2D Echo',
  'special', 'ophthalmic', 'Digital X-ray', 'ECG', 'TMT', '', null,
]

console.log('\nPlainly not ultrasound — left out on its own')
for (const m of NOT_ULTRASOUND) check(isNeverUltrasound(m), JSON.stringify(m))

console.log('\nStill has to be placed by a person')
for (const m of MUST_BE_PLACED) check(!isNeverUltrasound(m), JSON.stringify(m))

async function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.log('\n(database checks skipped — run with --env-file=.env.local)')
    return
  }
  const svc = createClient(url, key, { auth: { persistSession: false } })

  console.log('\nThe database gives the same answer as the Setup page')
  for (const m of [...NOT_ULTRASOUND, ...MUST_BE_PLACED]) {
    const { data, error } = await svc.rpc('pcpndt_auto_bucket', { p_modality: m })
    if (error) { check(false, `pcpndt_auto_bucket(${JSON.stringify(m)})`, error.message); continue }
    const sql = data === 'not_ultrasound'
    check(sql === isNeverUltrasound(m), `${JSON.stringify(m)} → ${sql ? 'left out' : 'to be placed'}`, { sql, ts: isNeverUltrasound(m) })
  }

  console.log('\nOn the demo hospital, the return and the Setup page agree')
  const { data: t } = await svc.from('tenants').select('id').eq('slug', 'demo').single()
  const demo = t!.id as string
  const { data: cat } = await svc.from('radiology_catalog')
    .select('id, modality, pcpndt_bucket, is_active').eq('tenant_id', demo)
  const waiting = (cat ?? []).filter((c) => c.is_active && !c.pcpndt_bucket && !isNeverUltrasound(c.modality)).length
  const month = new Date().toISOString().slice(0, 7)
  const { data: sum, error } = await svc.rpc('get_monthly_return_summary', { p_month: month, p_tenant_id: demo })
  if (error) { check(false, 'get_monthly_return_summary', error.message); return }
  const s = sum as { readiness: { scans_unmapped_studies: number }; report_i: { scans: Record<string, number> } }
  check(s.readiness.scans_unmapped_studies === waiting,
    `"not placed" on the return (${s.readiness.scans_unmapped_studies}) = on the Setup page (${waiting})`)

  // No X-ray order may be counted as a scan of any kind.
  const xrayIds = new Set((cat ?? []).filter((c) => !c.pcpndt_bucket && isNeverUltrasound(c.modality)).map((c) => c.id))
  const { data: orders } = await svc.from('radiology_orders').select('test_id, ordered_at, status').eq('tenant_id', demo)
  const months = [...new Set((orders ?? []).filter((o) => xrayIds.has(o.test_id)).map((o) => (o.ordered_at as string).slice(0, 7)))]
  for (const m of months.slice(-3)) {
    const { data: r } = await svc.rpc('get_monthly_return_summary', { p_month: m, p_tenant_id: demo })
    const scans = (r as typeof s).report_i.scans
    const counted = Object.values(scans).reduce((a, b) => a + b, 0)
    const expected = (orders ?? []).filter((o) => (o.ordered_at as string).slice(0, 7) === m && o.status !== 'cancelled'
      && !xrayIds.has(o.test_id)
      && (cat ?? []).find((c) => c.id === o.test_id)?.pcpndt_bucket !== 'not_ultrasound').length
    check(counted <= expected, `${m}: unplaced X-ray/CT/MRI orders not in the scan count (${counted} counted, at most ${expected})`, scans)
  }
}

database().then(() => {
  console.log(failed ? `\n${failed} FAILED\n` : '\nAll passed\n')
  process.exit(failed ? 1 : 0)
})
