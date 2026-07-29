import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'Is there GST on a hospital bill in India?',
    a: 'Mostly no. Core healthcare services — doctor consultations, surgeries, diagnostic tests, and treatment provided as part of inpatient care — are exempt from GST when provided by a clinical establishment or a registered medical practitioner. GST only appears on a few specific items, most notably non-ICU room rent above ₹5,000 per day, and on retail pharmacy sales to non-inpatients.',
  },
  {
    q: 'What is the GST rate on hospital room rent?',
    a: 'ICU, CCU, ICCU and NICU room rent is fully GST-exempt regardless of tariff. For non-ICU rooms, room rent up to ₹5,000 per day is exempt; above ₹5,000 per day, GST applies at 5% (without input tax credit) on the room rent portion. The 5% applies to the room rent line, not to the whole hospital bill.',
  },
  {
    q: 'Do hospitals have a GST number?',
    a: 'Many do. Even though core healthcare is exempt, a hospital that also makes taxable supplies — a retail pharmacy counter, a canteen, taxable room rent above ₹5,000/day, or non-medical cosmetic services — may cross the registration threshold and need a GSTIN to account for that taxable portion. A purely exempt establishment with no taxable supplies may not require registration, so whether a given hospital has a GST number depends on what else it sells.',
  },
  {
    q: 'Are medicines given during an inpatient stay taxed?',
    a: 'Medicines and diagnostics provided as part of inpatient treatment are generally exempt as part of the composite healthcare service, provided they are not billed as a separate retail sale. A pharmacy sale to a walk-in OPD or outside customer is a separate retail transaction and is taxed normally.',
  },
  {
    q: 'Is GST charged on hospital bed charges?',
    a: 'Bed / room rent for ICU, CCU, ICCU and NICU is exempt regardless of amount. For general (non-ICU) beds, charges up to ₹5,000 per day are exempt, and only the portion above ₹5,000 per day attracts GST at 5%. Nursing and procedure charges billed as part of treatment remain part of the exempt healthcare service.',
  },
]

const TREATMENT = [
  { item: 'Doctor consultations & professional medical services', gst: 'Exempt' },
  { item: 'Surgeries, treatment & diagnostic tests (clinical care)', gst: 'Exempt' },
  { item: 'Ambulance transportation of a patient', gst: 'Exempt' },
  { item: 'ICU / CCU / ICCU / NICU room rent', gst: 'Exempt (any tariff)' },
  { item: 'Non-ICU room rent up to ₹5,000 / day', gst: 'Exempt' },
  { item: 'Non-ICU room rent above ₹5,000 / day', gst: '5% on the excess portion' },
  { item: 'Medicines & diagnostics during inpatient care', gst: 'Exempt (if not a separate retail sale)' },
  { item: 'Retail pharmacy sale to walk-in / OPD customer', gst: 'Taxed as normal retail' },
  { item: 'Cosmetic / non-medically-necessary procedures', gst: 'Generally taxable' },
]

export default function Guide() {
  return (
    <>
      <p>
        GST on a hospital bill in India isn&apos;t a flat yes-or-no. Most core healthcare services are exempt, but a
        few specific charges &mdash; most notably room rent above a threshold, and retail pharmacy sales &mdash; are
        taxable. This guide explains which hospital services carry GST and which don&apos;t, what the GST rate on
        room rent actually is, whether a hospital needs a GST number at all, and how billing software should be
        set up so the split lands correctly on the patient&apos;s bill.
      </p>

      <CalloutBox tone="warning" title="This is a general guide, not tax advice">
        GST rules, rates and thresholds can change by notification, and specific cases vary. Confirm current rules
        with a tax professional or chartered accountant before configuring billing software for compliance &mdash;
        this guide explains the general shape of the rules, not a substitute for professional advice.
      </CalloutBox>

      <h2>Is there GST on hospital services?</h2>
      <p>
        The starting point is that healthcare is treated generously under GST: services by a clinical
        establishment or a registered medical practitioner &mdash; the actual diagnosis, treatment and care of a
        patient &mdash; are exempt. So the everyday hospital bill for a consultation, a surgery or a course of
        inpatient treatment carries no GST on the medical services themselves. What people are usually really
        asking when they search &ldquo;GST on hospital bill&rdquo; is about the handful of line items that fall outside
        that exemption.
      </p>

      <h2>What&apos;s exempt and what&apos;s taxable</h2>
      <table>
        <thead>
          <tr>
            <th>Charge on the bill</th>
            <th>GST treatment</th>
          </tr>
        </thead>
        <tbody>
          {TREATMENT.map((r) => (
            <tr key={r.item}>
              <td>{r.item}</td>
              <td>{r.gst}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>GST on hospital room rent and bed charges</h2>
      <p>
        Room rent is the one line most people are looking for. The rule has two parts. First, intensive-care
        rooms &mdash; ICU, CCU, ICCU and NICU &mdash; are <strong>fully exempt regardless of the daily tariff</strong>.
        Second, for ordinary non-ICU rooms, room rent is <strong>exempt up to ₹5,000 per day</strong>; above that,
        GST applies at <strong>5% (without input tax credit)</strong> on the room-rent portion. It is worth being
        precise here: the 5% is on the room-rent line, not on the whole hospital bill, and it does not pull the
        rest of the treatment into tax.
      </p>

      <h2>Do hospitals have a GST number?</h2>
      <p>
        A common question &mdash; and the answer is &ldquo;often, but not always.&rdquo; Core healthcare being exempt
        doesn&apos;t automatically exempt the whole institution from registration. A hospital that also runs a{' '}
        <em>retail pharmacy counter</em>, a canteen, taxable room rent above ₹5,000/day, or non-medical cosmetic
        services is making taxable supplies, and once those cross the registration threshold the hospital needs a
        GSTIN to account for that portion. A purely exempt establishment with no taxable supplies may not need
        registration at all. So whether a particular hospital has a GST number depends on what else it sells
        besides exempt treatment.
      </p>

      <h2>Why this matters for billing software</h2>
      <p>
        A combined IPD bill mixes exempt and potentially taxable line items in the same stay &mdash; bed rent,
        nursing, consultations, pharmacy, lab. Billing software should be able to flag the room-rent line
        separately so tax treatment can be applied correctly to just that portion, rather than the whole bill
        being treated uniformly. See the{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> and{' '}
        <Link href="/guides/hospital-bill-format-ipd-opd-sample">sample hospital bill format</Link> for how a
        combined bill is typically broken into line items.
      </p>

      <h2>Why hardcoded tax logic is risky</h2>
      <p>
        The ₹5,000 room-rent threshold and the ICU exemption are both the kind of rule that changes with
        government notification, not hospital policy. Billing software that hardcodes today&apos;s threshold directly
        into its pricing logic will quietly bill incorrectly the day that number changes, unless someone
        remembers to update code rather than a configuration setting. The safer pattern is a configurable tax
        rule per room type, reviewed periodically against current guidance rather than trusted to stay accurate
        indefinitely.
      </p>
      <p>
        Practically, this comes down to two things billing software needs to get right: room rent has to be its
        own distinct line item (not folded into a general &ldquo;bed charges&rdquo; bucket), and ICU/CCU/NICU beds need to
        be distinguishable from general ward beds in the system &mdash; because the exemption applies to one and
        not, automatically, the other. A{' '}
        <Link href="/hospital-management-software">hospital management system</Link> that models room types and
        tax rules as configuration handles this cleanly; one that doesn&apos;t will need code changes every time the
        rules move.
      </p>
    </>
  )
}
