import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'Is GST charged on hospital treatment in India?',
    a: 'Core healthcare services — doctor consultations, surgeries, diagnostic tests, and treatment provided as part of inpatient care — are exempt from GST when provided by a clinical establishment or registered medical practitioner.',
  },
  {
    q: 'Is hospital room rent taxed under GST?',
    a: 'ICU, CCU, ICCU and NICU room rent is fully GST-exempt regardless of tariff. Non-ICU room rent is exempt up to ₹5,000 per day; above that threshold, GST applies at 5% on the room rent portion.',
  },
  {
    q: 'Are medicines given during an inpatient stay taxed?',
    a: 'Medicines and diagnostics provided as part of inpatient treatment are generally exempt as part of the composite healthcare service, provided they aren\'t billed as a separate retail sale. A pharmacy sale to a walk-in OPD or outside customer is a separate retail transaction and is taxed normally.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        GST on hospital billing isn&apos;t a flat yes-or-no — most core healthcare services are exempt, but a
        few specific charges, most notably room rent above a threshold, are taxable. Getting this split right
        in your billing software matters both for compliance and for accurate patient bills.
      </p>

      <CalloutBox tone="warning" title="This is a general guide, not tax advice">
        GST rules and rates can change, and specific cases vary. Confirm current rules with a tax professional
        or chartered accountant before configuring billing software for compliance — this guide explains the
        general shape of the rules, not a substitute for professional advice.
      </CalloutBox>

      <h2>What&apos;s exempt</h2>
      <ul>
        <li>Doctor consultations and professional medical services by a registered practitioner.</li>
        <li>Surgeries, treatment and diagnostic tests provided as part of clinical care.</li>
        <li>Ambulance transportation of a patient.</li>
        <li>ICU, CCU, ICCU and NICU room rent — fully exempt regardless of the daily tariff.</li>
        <li>Non-ICU room rent up to ₹5,000 per day.</li>
        <li>Medicines and diagnostics provided as part of inpatient treatment, when not billed as a separate retail sale.</li>
      </ul>

      <h2>What&apos;s taxable</h2>
      <ul>
        <li>Non-ICU room rent above ₹5,000 per day — GST applies to the portion of room rent above this threshold.</li>
        <li>Retail pharmacy sales to walk-in or non-inpatient customers, taxed like any retail medicine sale.</li>
        <li>Non-healthcare services a hospital might offer (cosmetic procedures not medically necessary, for example) — these generally don&apos;t qualify for the healthcare exemption.</li>
      </ul>

      <h2>Why this matters for billing software</h2>
      <p>
        A combined IPD bill mixes exempt and potentially taxable line items in the same stay — bed rent,
        nursing, consultations, pharmacy, lab. Billing software should be able to flag the room-rent line
        separately so tax treatment can be applied correctly to just that portion, rather than the whole bill
        being treated uniformly &mdash; see the{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> and{' '}
        <Link href="/guides/hospital-bill-format-ipd-opd-sample">sample hospital bill format</Link> for how a
        combined bill is typically broken into line items.
      </p>

      <h2>Why hardcoded tax logic is risky</h2>
      <p>
        The ₹5,000 room-rent threshold and the ICU exemption are both the kind of rule that changes with
        government notification, not hospital policy. Billing software that hardcodes today&apos;s threshold
        directly into its pricing logic will quietly bill incorrectly the day that number changes, unless
        someone remembers to update code rather than a configuration setting. The safer pattern is a
        configurable tax rule per room type, reviewed periodically against current guidance rather than
        trusted to stay accurate indefinitely.
      </p>
      <p>
        Practically, this comes down to two things billing software needs to get right: room rent has to be
        its own distinct line item (not folded into a general &ldquo;bed charges&rdquo; bucket), and ICU/CCU/NICU
        beds need to be distinguishable from general ward beds in the system &mdash; because the exemption applies
        to one and not, automatically, the other.
      </p>
    </>
  )
}
