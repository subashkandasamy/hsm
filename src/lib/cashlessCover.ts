import type { createClient } from '@/lib/supabase/server'

type Supa = Awaited<ReturnType<typeof createClient>>

// True if the given bill's encounter has an eligibility-approved (cashless)
// insurance claim — meaning the service may proceed without a cash payment, the
// same way startVisit lets a cashless consultation begin. A claim can be scoped
// to the bill itself (pre-visit consultation), the OPD visit, or the IPD
// admission, so all three are checked. Keyed off eligibility_status — the
// provisional pre-auth approval — not the final claim settlement.
export async function isBillCashlessCovered(
  supabase: Supa,
  bill: { id: string; visit_id: string | null; admission_id: string | null },
): Promise<boolean> {
  const scopes = [`bill_id.eq.${bill.id}`]
  if (bill.visit_id) scopes.push(`visit_id.eq.${bill.visit_id}`)
  if (bill.admission_id) scopes.push(`admission_id.eq.${bill.admission_id}`)

  const { count } = await supabase
    .from('insurance_claims')
    .select('id', { count: 'exact', head: true })
    .or(scopes.join(','))
    .eq('eligibility_status', 'approved')
  return (count ?? 0) > 0
}
