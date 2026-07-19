// Single source of truth for "how much of a bill does insurance credit the
// patient for" — used by the IPD discharge gate, OPD visit financials and the
// combined-bill view so they can never disagree.
//
// The subtlety this fixes: before settlement, the credit is the *eligibility*
// approved amount (a receivable — pre-auth is what lets the patient leave
// without paying). After settlement, the credit must reflect what was actually
// received, UNLESS the hospital chose to write the shortfall off. Otherwise a
// short settlement would keep crediting the full eligibility figure and the
// bill would read as "fully covered" while less money was collected.

export interface InsuranceCreditRow {
  eligibility_status: string | null
  eligibility_approved_amount: number | null
  status: string | null
  settled_amount: number | null
  shortfall_resolution: string | null
}

/** Insurance credit for a single claim against the patient's balance. */
export function claimInsuranceCredit(c: InsuranceCreditRow): number {
  const eligibility = c.eligibility_approved_amount ?? 0

  if (c.status === 'settled') {
    // Recovering the shortfall from the patient → only credit what actually
    // came in, so the gap reverts to the patient's balance.
    if (c.shortfall_resolution === 'recover_from_patient') return c.settled_amount ?? 0
    // Written off (or not flagged) → the hospital absorbs any shortfall, so the
    // patient still owes nothing for the covered portion.
    return Math.max(eligibility, c.settled_amount ?? 0)
  }

  // Not yet settled: an eligibility-approved claim is a receivable that covers
  // the balance at discharge.
  if (c.eligibility_status === 'approved') return eligibility

  return 0
}

/** Total insurance credit across a set of claims. */
export function totalInsuranceCredit(rows: InsuranceCreditRow[]): number {
  return rows.reduce((s, c) => s + claimInsuranceCredit(c), 0)
}

// The exact column set the helper needs — reuse in every Supabase select so
// call sites can't drift.
export const INSURANCE_CREDIT_COLUMNS =
  'eligibility_status, eligibility_approved_amount, status, settled_amount, shortfall_resolution'
