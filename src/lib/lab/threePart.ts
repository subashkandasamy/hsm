/**
 * Blood counts a 3-part machine cannot finish.
 *
 * A 3-part haematology analyzer (the Erba H360 at KMCH, for one) sorts white
 * cells into three groups — granulocytes, lymphocytes and mid-sized cells — and
 * never counts eosinophils or basophils. The standard blood count still lists
 * both, so every report it fills waits on two lines nobody will type, prints as
 * INTERIM and cannot be called complete. Found at KMCH on 20 Nov 2026, the day
 * it moved over from SwiftEHR.
 *
 * The answer is a setting the hospital already has: mark those lines optional
 * (lab_optional_analytes, 0277), so an empty one is left off and a value typed
 * from a smear still prints. This finds where that applies; it never sets
 * anything itself — a person does, from the analyzer's card.
 *
 * The rule is kept apart from the queries so it can be tested without a
 * hospital or a login (`npm run verify:three-part`).
 */

import type { createServiceClient } from '@/lib/supabase/service'

type Svc = ReturnType<typeof createServiceClient>

/** The lines a 3-part count leaves empty. */
export const NOT_ON_3_PART = ['EOS_PCT', 'EOS_ABS', 'BASO_PCT', 'BASO_ABS'] as const

/** White-cell differential lines; a machine mapping any of them counts white cells. */
const DIFFERENTIAL = new Set([
  'NEUT_PCT', 'NEUT_ABS', 'LYMPH_PCT', 'LYMPH_ABS', 'MONO_PCT', 'MONO_ABS',
  'GRAN_PCT', 'GRAN_ABS', 'MID_ABS',
])

/**
 * Does a machine that sends these measurements count white cells in three
 * groups? Yes when it gives a differential but no eosinophils or basophils.
 * A 5-part machine sends those too; a chemistry or blood-gas machine sends no
 * differential at all.
 */
export function isThreePartCounter(mappedCodes: Iterable<string>): boolean {
  const codes = new Set(mappedCodes)
  if (NOT_ON_3_PART.some((c) => codes.has(c))) return false
  return [...codes].some((c) => DIFFERENTIAL.has(c))
}

export interface UncountedLine { analyteId: string; code: string; name: string }
export interface UncountedTest { testId: string; testName: string; lines: UncountedLine[] }

type LineInForce = { lab_master_id: string; analyte_id: string; created_at: string | null; retired_at: string | null }

/** Lines of a panel as it stands today (0302: a line has a start and maybe an end). */
export function inForce(line: LineInForce, now: Date): boolean {
  const t = now.getTime()
  if (line.created_at && new Date(line.created_at).getTime() > t) return false
  return !line.retired_at || new Date(line.retired_at).getTime() > t
}

/**
 * The hospital's tests this analyzer fills that still wait on eosinophils or
 * basophils. Empty unless the analyzer is a 3-part counter.
 */
export async function findUncountedLines(
  svc: Svc, tenantId: string, analyzerId: string, now = new Date(),
): Promise<UncountedTest[]> {
  const { data: maps } = await svc.from('analyzer_mappings')
    .select('analyte_id, lab_analytes(code)')
    .eq('tenant_id', tenantId).eq('analyzer_id', analyzerId)
    .eq('enabled', true).not('analyte_id', 'is', null)
  const sent = new Map<string, string>()
  for (const m of (maps ?? []) as unknown as Array<{ analyte_id: string; lab_analytes: { code: string } | null }>) {
    if (m.lab_analytes?.code) sent.set(m.analyte_id, m.lab_analytes.code)
  }
  if (!isThreePartCounter(sent.values())) return []

  const { data: missing } = await svc.from('lab_analytes')
    .select('id, code, name').in('code', NOT_ON_3_PART as unknown as string[])
  const uncountable = new Map((missing ?? []).map((a) => [a.id as string, a as { id: string; code: string; name: string }]))

  // Every panel holding a line this machine fills or one it cannot: a short
  // list of measurements, so no long id list in the request.
  const { data: lines } = await svc.from('lab_test_analytes')
    .select('lab_master_id, analyte_id, created_at, retired_at')
    .in('analyte_id', [...sent.keys(), ...uncountable.keys()])
  const live = ((lines ?? []) as LineInForce[]).filter((l) => inForce(l, now))
  const filled = new Set(live.filter((l) => sent.has(l.analyte_id)).map((l) => l.lab_master_id))
  const waiting = new Map<string, string[]>()
  for (const l of live) {
    if (!filled.has(l.lab_master_id) || !uncountable.has(l.analyte_id) || sent.has(l.analyte_id)) continue
    waiting.set(l.lab_master_id, [...(waiting.get(l.lab_master_id) ?? []), l.analyte_id])
  }
  if (!waiting.size) return []

  const [{ data: tests }, { data: optional }] = await Promise.all([
    svc.from('lab_tests_catalog').select('id, name, lab_master_id')
      .eq('tenant_id', tenantId).eq('is_active', true).in('lab_master_id', [...waiting.keys()]),
    svc.from('lab_optional_analytes').select('test_id, analyte_id')
      .eq('tenant_id', tenantId).in('analyte_id', [...uncountable.keys()]),
  ])
  const already = new Set((optional ?? []).map((o) => `${o.test_id}:${o.analyte_id}`))

  const out: UncountedTest[] = []
  for (const t of (tests ?? []) as Array<{ id: string; name: string; lab_master_id: string }>) {
    const ids = (waiting.get(t.lab_master_id) ?? []).filter((a) => !already.has(`${t.id}:${a}`))
    if (!ids.length) continue
    out.push({
      testId: t.id, testName: t.name,
      lines: [...new Set(ids)].map((a) => ({ analyteId: a, code: uncountable.get(a)!.code, name: uncountable.get(a)!.name }))
        .sort((x, y) => NOT_ON_3_PART.indexOf(x.code as typeof NOT_ON_3_PART[number]) - NOT_ON_3_PART.indexOf(y.code as typeof NOT_ON_3_PART[number])),
    })
  }
  return out.sort((a, b) => a.testName.localeCompare(b.testName))
}
