/**
 * The cash a hospital may take from one person in one day.
 *
 * Section 269ST of the Income-tax Act: no person shall receive **two lakh
 * rupees or more** in cash from one person in a day, for a single transaction,
 * or for transactions relating to one event. The penalty under 271DA is the
 * **whole amount received**, and it falls on the receiver — the hospital, not
 * the patient.
 *
 * Three things about it make a warning worth building rather than a note in a
 * manual:
 *
 * 1. **Hospitals are not exempt.** The COVID-era relaxation, which allowed
 *    larger cash payments against PAN or Aadhaar, lapsed on 31 May 2021.
 * 2. **Splitting does not help.** The limit aggregates per person per day, so
 *    ₹1.5 lakh for the surgery and ₹1 lakh for the room on the same day is a
 *    ₹2.5 lakh contravention across two innocent-looking bills.
 * 3. **Nobody at the counter is counting.** A family paying for a surgery in
 *    cash crosses it without anyone noticing, and the hospital finds out, if
 *    at all, when it is assessed.
 *
 * ── Why this warns and does not block ─────────────────────────────────────
 *
 * Refusing money at a counter is a decision for the hospital, not for us.
 * Section 273B provides for no penalty where there was reasonable cause, and
 * a receipt desk that cannot complete a payment at 9pm is its own kind of
 * harm. What the product owes is that nobody crosses this line *without
 * knowing* — which means saying so before the money is taken, not after.
 *
 * None of this is tax advice and it is not a substitute for the hospital's own
 * CA. It is an arithmetic warning about a threshold in the Act.
 */

/** Two lakh. The Act says "two lakh rupees or more", so this value itself breaches. */
export const CASH_LIMIT = 200_000

export interface CashPosition {
  /** Cash already taken from this patient today, across every bill and deposit. */
  alreadyToday: number
  /** What the payment being entered would add. */
  adding: number
  /** The two together. */
  wouldBe: number
  /** True when `wouldBe` reaches the limit — "or more" includes the limit itself. */
  breaches: boolean
  /** Cash that can still be taken today without reaching it. Zero once breached. */
  headroom: number
}

export function cashPosition(alreadyToday: number, adding: number): CashPosition {
  const already = round2(Math.max(0, alreadyToday))
  const add     = round2(Math.max(0, adding))
  const wouldBe = round2(already + add)
  return {
    alreadyToday: already,
    adding: add,
    wouldBe,
    breaches: wouldBe >= CASH_LIMIT,
    headroom: round2(Math.max(0, CASH_LIMIT - wouldBe)),
  }
}

/**
 * What to tell whoever is at the counter.
 *
 * Written for a receptionist rather than an accountant: it says what will
 * happen, what the exposure is, and what to do instead. "Section 269ST" is
 * named so a manager can look it up, but the sentence works without it.
 */
export function cashWarning(p: CashPosition): string | null {
  if (p.breaches) {
    return `This takes today's cash from this patient to ₹${inr(p.wouldBe)}. `
      + `Cash of ₹2,00,000 or more from one person in a day is not allowed under `
      + `section 269ST, and the penalty is the whole amount received — ₹${inr(p.wouldBe)} — `
      + `payable by the hospital. Take the balance by UPI, card or bank transfer instead.`
  }
  // Warn on the approach too. Somebody who knows ₹40,000 of room is left to
  // settle can plan for it; the same person told nothing settles it in cash.
  if (p.headroom <= 25_000 && p.wouldBe > 0) {
    return `Today's cash from this patient would be ₹${inr(p.wouldBe)}. `
      + `Only ₹${inr(p.headroom)} more can be taken in cash before section 269ST `
      + `is breached — anything beyond that should be UPI, card or bank transfer.`
  }
  return null
}

function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100 }
function inr(n: number): string { return n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }
