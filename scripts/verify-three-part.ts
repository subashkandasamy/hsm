/**
 * 3-part blood counters: eosinophils and basophils (lib/lab/threePart.ts).
 *
 *   npm run verify:three-part                                       # the rule, offline
 *   npx tsx --env-file=.env.local scripts/verify-three-part.ts      # + the database, read-only
 *
 * Offline it checks which machines count as 3-part. With database credentials
 * it also checks, read-only:
 *   - every hospital's real analyzers are classed as expected (the H360 is,
 *     the blood-gas, clotting, urine and immunoassay machines are not);
 *   - KMCH's blood count has nothing left to offer (fixed by hand, 20 Nov);
 *   - the demo hospital's H360 offers exactly the eosinophil/basophil lines
 *     its blood count still waits on, and nothing else;
 *   - the shared library sets the two H360 red-cell flags aside (0310).
 */

import { createClient } from '@supabase/supabase-js'
import { isThreePartCounter, findUncountedLines, inForce, NOT_ON_3_PART } from '../src/lib/lab/threePart'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

console.log('\nWhich machines count white cells in 3 groups')
const H360 = ['WBC', 'RBC', 'HGB', 'NEUT_PCT', 'NEUT_ABS', 'LYMPH_PCT', 'LYMPH_ABS', 'MONO_PCT', 'MONO_ABS', 'PLT']
check(isThreePartCounter(H360), 'Erba H360 (granulocytes, lymphocytes, MID)')
check(isThreePartCounter(['WBC', 'GRAN_PCT', 'LYMPH_PCT', 'MID_ABS']), 'a 3-part machine mapped to granulocyte/MID lines')
check(!isThreePartCounter([...H360, 'EOS_PCT', 'EOS_ABS', 'BASO_PCT', 'BASO_ABS']), '5-part machine (sends eosinophils and basophils)')
check(!isThreePartCounter([...H360, 'EOS_PCT']), 'a machine that sends eosinophils is not offered the change')
check(!isThreePartCounter(['WBC', 'RBC', 'HGB', 'PLT']), 'counts only, no differential (nothing to say)')
check(!isThreePartCounter(['BG_PH', 'PCO2', 'PO2', 'NA', 'K']), 'blood-gas machine')
check(!isThreePartCounter(['PT_SEC', 'INR', 'APTT_SEC']), 'clotting machine')
check(!isThreePartCounter([]), 'a machine with nothing mapped')

console.log('\nA panel line in force')
const now = new Date('2026-11-20T06:00:00Z')
check(inForce({ lab_master_id: 'm', analyte_id: 'a', created_at: '2026-01-01T00:00:00Z', retired_at: null }, now), 'current line')
check(!inForce({ lab_master_id: 'm', analyte_id: 'a', created_at: '2000-01-01T00:00:00Z', retired_at: '2000-01-01T00:00:00Z' }, now), 'old-record line (0305: start = end) is not')
check(!inForce({ lab_master_id: 'm', analyte_id: 'a', created_at: '2026-12-01T00:00:00Z', retired_at: null }, now), 'line not yet started')

async function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.log('\n(database checks skipped — run with --env-file=.env.local)'); return }
  const svc = createClient(url, key, { auth: { persistSession: false } })
  const tenant = async (slug: string) => ((await svc.from('tenants').select('id').eq('slug', slug).single()).data!.id as string)

  console.log('\nReal analyzers are classed as expected')
  for (const slug of ['demo', 'karur']) {
    const tid = await tenant(slug)
    const { data: an } = await svc.from('lab_analyzers').select('id, fingerprint').eq('tenant_id', tid)
    for (const a of an ?? []) {
      const { data: m } = await svc.from('analyzer_mappings').select('lab_analytes(code)')
        .eq('analyzer_id', a.id).eq('enabled', true).not('analyte_id', 'is', null)
      const codes = ((m ?? []) as unknown as Array<{ lab_analytes: { code: string } | null }>).map((x) => x.lab_analytes?.code ?? '')
      if (!codes.length) continue
      const expected = a.fingerprint === 'H360^Erba'
      check(isThreePartCounter(codes) === expected, `${slug} ${a.fingerprint}: ${expected ? '3-part' : 'not 3-part'}`)
    }
  }

  console.log('\nKMCH: nothing left to offer')
  const karur = await tenant('karur')
  const kh = (await svc.from('lab_analyzers').select('id').eq('tenant_id', karur).eq('fingerprint', 'H360^Erba').single()).data!.id as string
  const kOffer = await findUncountedLines(svc, karur, kh)
  check(kOffer.length === 0, 'KMCH H360: blood count already complete without eosinophils/basophils', kOffer)

  console.log('\nDemo: the offer is exactly what its blood counts wait on')
  const demo = await tenant('demo')
  const dh = (await svc.from('lab_analyzers').select('id').eq('tenant_id', demo).eq('fingerprint', 'H360^Erba').single()).data!.id as string
  const offer = await findUncountedLines(svc, demo, dh)
  console.log('   offered:', offer.map((t) => `${t.testName} [${t.lines.map((l) => l.code).join(', ')}]`).join(' · ') || 'nothing')
  check(offer.every((t) => t.lines.every((l) => (NOT_ON_3_PART as readonly string[]).includes(l.code))), 'only eosinophil/basophil lines are ever offered')
  const { data: opt } = await svc.from('lab_optional_analytes').select('test_id, analyte_id').eq('tenant_id', demo)
  const optional = new Set((opt ?? []).map((o) => `${o.test_id}:${o.analyte_id}`))
  check(offer.every((t) => t.lines.every((l) => !optional.has(`${t.testId}:${l.analyteId}`))), 'nothing already optional is offered again')

  console.log('\nShared library (0310)')
  const { data: lib } = await svc.from('device_library').select('id').eq('fingerprint', 'H360^Erba').single()
  const { data: flags } = await svc.from('device_library_codes').select('analyzer_code, analyte_id, enabled')
    .eq('device_library_id', lib!.id).in('analyzer_code', ['Anisocytosis', 'Microcytes'])
  check((flags ?? []).length === 2 && (flags ?? []).every((f) => !f.enabled && !f.analyte_id), 'H360 Anisocytosis and Microcytes are set aside in the library', flags)
}

database().then(() => {
  console.log(failed ? `\n${failed} FAILED\n` : '\nAll passed\n')
  process.exit(failed ? 1 : 0)
})
