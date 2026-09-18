import type { InsuranceClaim } from '@/lib/types'

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The figure that means something at this stage of a claim.
 *
 * A claim is asked for, then approved for some part of it, then settled for what
 * actually arrived — three different numbers. Showing the amount claimed under an
 * "Approved" badge made the cards disagree with the receivables above them: a
 * claim raised for ₹50,000 and approved for ₹30,000 read as ₹50,000, so three
 * cards totalling ₹65,000 sat under a heading that said ₹45,000 was due.
 *
 * `note` carries what the headline figure leaves out — usually the shortfall.
 */
export function claimHeadline(c: InsuranceClaim): { amount: number; note: string | null } {
  const claimed = c.claim_amount ?? c.estimated_amount ?? 0

  if (c.status === 'settled') {
    const settled = c.settled_amount ?? c.approved_amount ?? claimed
    return { amount: settled, note: settled < claimed ? `claimed ${inr(claimed)}` : null }
  }
  if (c.status === 'approved') {
    const approved = c.approved_amount ?? claimed
    return { amount: approved, note: approved < claimed ? `claimed ${inr(claimed)}` : null }
  }
  if (c.status === 'rejected') {
    return { amount: claimed, note: 'nothing approved' }
  }
  // Still in progress: the amount asked for, flagged when it is only an estimate.
  return {
    amount: claimed,
    note: c.claim_amount == null && c.estimated_amount != null ? 'estimate' : null,
  }
}
