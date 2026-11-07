import type { SupabaseClient } from '@supabase/supabase-js'
import { INSURANCE_CREDIT_COLUMNS, totalInsuranceCredit, type InsuranceCreditRow } from '@/lib/insuranceCredit'
import { pageAll } from '@/lib/supabase/pageAll'

export interface EncounterInsurance {
  /** Insurance credit per claimInsuranceCredit (eligibility receivable / settled amount). */
  credit: number
  /** Money already received from the insurer against these claims (settlement payments). */
  received: number
  /** Credit not yet received — what still offsets the patient's balance. */
  outstanding: number
}

/**
 * Insurance position for one encounter (an admission, an OPD/ER visit, or a set
 * of bills). Claims can be scoped to the admission, the visit, or a single bill
 * of it (e.g. the consultation bill before the visit started), so all three are
 * matched.
 *
 * Settlement posts the insurer's money as 'insurance' payments, which already
 * reduce the bill balance. Subtracting the full claim credit from that reduced
 * balance counted the insurer's share twice and zeroed the patient's own share,
 * so only the part not yet received (outstanding) may offset the balance:
 *   patient share = balance due − outstanding.
 */
export async function encounterInsurance(
  supabase: SupabaseClient,
  scope: { admissionId?: string | null; visitId?: string | null; billIds: string[] },
): Promise<EncounterInsurance> {
  const ors: string[] = []
  if (scope.admissionId) ors.push(`admission_id.eq.${scope.admissionId}`)
  if (scope.visitId) ors.push(`visit_id.eq.${scope.visitId}`)
  if (scope.billIds.length) ors.push(`bill_id.in.(${scope.billIds.join(',')})`)
  if (!ors.length) return { credit: 0, received: 0, outstanding: 0 }

  const { data } = await supabase
    .from('insurance_claims')
    .select(`id, ${INSURANCE_CREDIT_COLUMNS}`)
    .or(ors.join(','))
  // Unapproved / rejected claims carry no credit (claimInsuranceCredit returns 0).
  const claims = (data ?? []) as unknown as Array<InsuranceCreditRow & { id: string }>
  const credit = totalInsuranceCredit(claims)
  if (!claims.length) return { credit: 0, received: 0, outstanding: 0 }

  const pays = await pageAll<{ amount: number }>((f, t) => supabase
    .from('payments').select('amount')
    .eq('method', 'insurance')
    .in('reference', claims.map((c) => `Claim ${c.id}`))
    .order('id').range(f, t))
  const received = pays.reduce((s, p) => s + Number(p.amount), 0)
  return { credit, received, outstanding: Math.max(0, credit - received) }
}
