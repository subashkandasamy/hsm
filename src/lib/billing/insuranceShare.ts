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
  // An admission also carries the bills of the ER / OPD visit it came from
  // (carryIntoAdmission). A claim approved on that visit covers those bills, so
  // it counts here too — or discharge would ask the patient for money the
  // insurer has already approved.
  if (scope.admissionId && scope.billIds.length) {
    const { data: vb } = await supabase.from('bills').select('visit_id').in('id', scope.billIds).not('visit_id', 'is', null)
    const visitIds = [...new Set((vb ?? []).map((b) => b.visit_id as string))].filter((v) => v !== scope.visitId)
    if (visitIds.length) ors.push(`visit_id.in.(${visitIds.join(',')})`)
  }
  if (!ors.length) return { credit: 0, received: 0, outstanding: 0 }

  const { data } = await supabase
    .from('insurance_claims')
    .select(`id, ${INSURANCE_CREDIT_COLUMNS}, policy:insurance_policies(copay_percent, room_rent_limit_per_day)`)
    .or(ors.join(','))
  // Unapproved / rejected claims carry no credit (claimInsuranceCredit returns 0).
  type ClaimRow = InsuranceCreditRow & { id: string; policy: { copay_percent: number | null; room_rent_limit_per_day: number | null } | null }
  const claims = (data ?? []) as unknown as ClaimRow[]
  if (!claims.length) return { credit: 0, received: 0, outstanding: 0 }

  // Until the insurer approves an amount, the pre-auth sanction is only an
  // upper limit: the policy's co-pay and the room rent above its daily cap are
  // the patient's to pay. Discharge treated the whole bill as covered and
  // collected neither (BUG-065).
  const terms = claims.find((c) => c.policy && ((c.policy.copay_percent ?? 0) > 0 || (c.policy.room_rent_limit_per_day ?? 0) > 0))?.policy ?? null
  let admissibleCap = Infinity
  if (terms && scope.billIds.length) {
    const [{ data: bills }, { data: rooms }] = await Promise.all([
      supabase.from('bills').select('total').in('id', scope.billIds).neq('status', 'cancelled'),
      (terms.room_rent_limit_per_day ?? 0) > 0
        ? supabase.from('bill_items').select('unit_price, qty').in('bill_id', scope.billIds).eq('source', 'bed')
        : Promise.resolve({ data: [] as Array<{ unit_price: number; qty: number }> }),
    ])
    const billed = (bills ?? []).reduce((t, b) => t + Number(b.total), 0)
    const cap = terms.room_rent_limit_per_day ?? 0
    const roomExcess = cap > 0 ? (rooms ?? []).reduce((t, r) => t + Math.max(0, Number(r.unit_price) - cap) * Number(r.qty ?? 1), 0) : 0
    admissibleCap = Math.max(0, (billed - roomExcess) * (1 - (terms.copay_percent ?? 0) / 100))
  }
  const credit = claims.reduce((t, c) => {
    const one = totalInsuranceCredit([c])
    const approvedKnown = (c.status === 'approved' || c.status === 'settled') && c.approved_amount != null
    return t + (approvedKnown ? one : Math.min(one, admissibleCap))
  }, 0)

  const pays = await pageAll<{ amount: number }>((f, t) => supabase
    .from('payments').select('amount')
    .eq('method', 'insurance')
    .in('reference', claims.map((c) => `Claim ${c.id}`))
    .order('id').range(f, t))
  const received = pays.reduce((s, p) => s + Number(p.amount), 0)
  return { credit, received, outstanding: Math.max(0, credit - received) }
}
