import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import BillBreakdown from '@/components/guides/diagrams/BillBreakdown'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a combined bill in IPD billing?',
    a: 'A combined bill groups every charge for one hospital stay — bed rent, nursing, pharmacy, lab, radiology, OT and consultation fees — into one itemized statement, instead of separate bills per department. It is what a patient sees and pays at discharge.',
  },
  {
    q: 'Is IPD billing generated all at once at discharge?',
    a: 'No, not in a well-built system. Bed rent and nursing charges are typically auto-billed daily during the stay, and lab, pharmacy and OT charges are added as they happen. This means the bill is always current, and discharge just finalizes and prints what has already accumulated — instead of a slow manual reconciliation.',
  },
  {
    q: 'What happens to an advance payment in IPD billing?',
    a: 'An advance paid at admission is held against the admission and automatically applied to reduce the amount due as daily and departmental charges accumulate, rather than being refunded and re-collected.',
  },
  {
    q: 'How is nursing charged in an IPD bill?',
    a: 'Nursing is usually billed per shift per day — each nurse assigned to a patient for a shift carries a charge, and that charge is added to the day\'s bill. If multiple shifts run in a day (morning, evening, night), each is a separate line for that day.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A patient&apos;s inpatient (IPD) bill is rarely one simple number &mdash; it is bed rent, nursing charges,
        every lab test, every pharmacy item dispensed to the ward, radiology, OT charges if there was a
        procedure, and consultation fees, all added across a stay that might run several days. Handled badly,
        this becomes a chaotic reconciliation exercise at discharge. Handled well, it is invisible to the
        patient until a clean, itemized bill appears at checkout.
      </p>
      <p>This guide explains how IPD billing actually works, department by department, with a worked example.</p>

      <h2>Where IPD charges come from</h2>
      <p>
        Every department a patient touches during their stay contributes a line item to the final bill. The
        job of a hospital management system is to collect these automatically as they happen, not reconstruct
        them from memory at discharge.
      </p>
      <WorkflowDiagram
        title="Where IPD charges accumulate during a stay"
        steps={[
          { label: 'Admission', sublabel: 'Bed & ward assigned' },
          { label: 'Daily bed rent', sublabel: 'Auto-billed each night' },
          { label: 'Nursing', sublabel: 'Per shift, per day' },
          { label: 'Lab / Pharmacy / OT', sublabel: 'As ordered or dispensed' },
          { label: 'Discharge', sublabel: 'Combined bill finalized' },
        ]}
      />

      <h2>Daily auto-billing: the key idea</h2>
      <p>
        The single biggest difference between a good IPD billing system and a bad one is <strong>when</strong>{' '}
        charges get added. In a manual or poorly built system, someone tries to reconstruct the whole stay&apos;s
        charges at discharge &mdash; checking every lab slip, every pharmacy issue, every day the patient occupied
        the bed. That is slow, and it is where billing disputes come from.
      </p>
      <p>
        In a well-built system, bed rent and nursing are <strong>auto-billed every day</strong> the patient is
        admitted, and lab, pharmacy and OT charges post the moment they happen. Discharge doesn&apos;t generate a
        bill from scratch &mdash; it finalizes a bill that has already been accumulating in real time.
      </p>
      <CalloutBox tone="tip" title="Idempotent daily billing avoids double charges">
        A well-designed daily billing run should be safe to trigger more than once a day without creating
        duplicate line items — it should add only genuinely new charges (a new day of bed rent, a new shift of
        nursing) and update rates in place if something changed, rather than appending duplicates.
      </CalloutBox>

      <h2>A worked example</h2>
      <p>Here is a simplified 3-day general ward stay with a lab test and a minor pharmacy order:</p>
      <BillBreakdown
        title="Sample IPD combined bill — 3-day general ward stay"
        items={[
          { label: 'Bed rent — General Ward', note: '3 days × ₹1,500', amount: 4500 },
          { label: 'Nursing — Morning & Night shifts', note: '3 days × 2 shifts × ₹150', amount: 900 },
          { label: 'Admission fee', amount: 500 },
          { label: 'Consultation — Doctor rounds', note: '3 days × ₹300', amount: 900 },
          { label: 'Laboratory — CBC, LFT', amount: 850 },
          { label: 'Pharmacy — Ward medication', amount: 1240 },
        ]}
        total={8890}
      />
      <p>
        If the patient paid a ₹5,000 advance at admission, that amount is applied automatically against this
        total, leaving ₹3,890 due at discharge &mdash; without the front desk needing to track the advance
        separately or refund and recollect it.
      </p>

      <h2>How nursing charges work inside an IPD bill</h2>
      <p>
        Nursing is typically charged <strong>per shift, per day</strong> &mdash; whichever nurse is assigned to a
        patient for a shift carries that shift&apos;s nursing charge. A hospital running three shifts a day
        (morning, evening, night) can bill up to three nursing line items per day per patient; a hospital
        running two 12-hour shifts bills two. This only works cleanly if nurse assignment and billing share the
        same shift definitions &mdash; see our{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">nurse duty roster guide</Link> for how shift-based
        assignment feeds this.
      </p>

      <h2>Where insurance and GST fit in</h2>
      <p>
        For patients with cashless insurance, the same accumulating bill becomes the basis for the pre-
        authorization and final claim submitted to the TPA &mdash; see our{' '}
        <Link href="/guides/health-insurance-tpa-claims-guide">insurance &amp; TPA claims guide</Link>. Certain
        hospital services are GST-exempt and others aren&apos;t; our{' '}
        <Link href="/guides/hospital-gst-billing-rules-india">GST rules for hospital billing</Link> guide covers
        which is which.
      </p>

      <h2>Checklist for evaluating IPD billing software</h2>
      <ul>
        <li>Does bed rent and nursing auto-bill daily, or only get calculated at discharge?</li>
        <li>Can it safely re-run the daily billing job without creating duplicate charges?</li>
        <li>Does an admission advance apply automatically against the running bill?</li>
        <li>Is every department&apos;s charge (lab, pharmacy, OT, radiology) linked back to the same combined bill?</li>
        <li>Does the final bill break out each department clearly, not just a lump total?</li>
      </ul>
    </>
  )
}
