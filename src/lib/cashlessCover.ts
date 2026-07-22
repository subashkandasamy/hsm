import type { createClient } from '@/lib/supabase/server'

type Supa = Awaited<ReturnType<typeof createClient>>

// True if the given bill's encounter has an eligibility-approved (cashless)
// insurance claim — meaning the service may proceed without a cash payment, the
// same way startVisit lets a cashless consultation begin. Keyed off
// eligibility_status — the provisional pre-auth approval — not settlement.
//
// A claim can be scoped to the OPD visit, the IPD admission, or a single bill
// (e.g. a pre-visit consultation). Crucially, an approval raised against ONE
// bill of a visit/admission covers the WHOLE encounter — so we resolve every
// bill sharing this bill's visit/admission and match a claim against any of
// them, not just this bill's own scope columns. Without this, a cashless
// approval on the consultation bill wouldn't lift the gate for the visit's
// later lab/radiology/pharmacy bills.
export async function isBillCashlessCovered(
  supabase: Supa,
  bill: { id: string; visit_id: string | null; admission_id: string | null },
): Promise<boolean> {
  const billIds = new Set<string>([bill.id])

  if (bill.visit_id) {
    const { data } = await supabase.from('bills').select('id').eq('visit_id', bill.visit_id)
    for (const b of data ?? []) billIds.add(b.id as string)
  }
  if (bill.admission_id) {
    const { data } = await supabase.from('bills').select('id').eq('admission_id', bill.admission_id)
    for (const b of data ?? []) billIds.add(b.id as string)
  }

  const scopes = [`bill_id.in.(${[...billIds].join(',')})`]
  if (bill.visit_id) scopes.push(`visit_id.eq.${bill.visit_id}`)
  if (bill.admission_id) scopes.push(`admission_id.eq.${bill.admission_id}`)

  const { count } = await supabase
    .from('insurance_claims')
    .select('id', { count: 'exact', head: true })
    .or(scopes.join(','))
    .eq('eligibility_status', 'approved')
  return (count ?? 0) > 0
}
