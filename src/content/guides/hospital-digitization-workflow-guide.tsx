import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the first step in digitizing a hospital?',
    a: 'Patient registration and a single unique health ID (UHID) per patient. Every other module — OPD, IPD, pharmacy, billing — depends on being able to find the same patient record reliably, so this has to be right before anything else is digitized.',
  },
  {
    q: 'Should a hospital digitize everything at once?',
    a: 'No. The realistic path is to digitize registration, OPD and billing first — these give immediate, visible benefit — and add IPD, lab, radiology, pharmacy and other modules in phases once staff are comfortable with the basics.',
  },
  {
    q: 'How long does it take to digitize a hospital\'s workflow?',
    a: 'A small to mid-size hospital can typically get core modules (registration, OPD, billing) running within days to a couple of weeks. Full rollout across all departments, with staff training, usually takes a few weeks to a couple of months depending on hospital size and how much historical data needs migrating.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        &ldquo;Digitizing a hospital&rdquo; sounds like one big project, but it almost never happens that way in
        practice. It happens one workflow at a time &mdash; registration first, then OPD, then billing, then
        IPD &mdash; each one only paying off once the previous one is solid. This guide walks through that
        sequence and what actually needs to connect at each step.
      </p>

      <h2>The full patient-journey workflow</h2>
      <WorkflowDiagram
        title="OPD → IPD → Billing, step by step"
        steps={[
          { label: 'Registration', sublabel: 'One UHID per patient' },
          { label: 'OPD', sublabel: 'Queue, vitals, consultation' },
          { label: 'Orders', sublabel: 'Lab, radiology, prescription' },
          { label: 'Admission', sublabel: 'If IPD is needed' },
          { label: 'Ward care', sublabel: 'Nursing, treatment, pharmacy' },
          { label: 'Discharge & billing', sublabel: 'One combined bill' },
        ]}
      />

      <h2>Step 1: Registration and a single patient identity</h2>
      <p>
        Everything downstream depends on this step being right. Every patient needs one unique health ID
        (UHID) that every department searches against &mdash; not a fresh entry each visit. Get this wrong and
        every later module inherits duplicate, fragmented patient records. See our{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">EMR &amp; UHID guide</Link> for how this connects to
        India&apos;s ABHA health ID system.
      </p>

      <h2>Step 2: OPD &mdash; the highest-volume workflow</h2>
      <p>
        OPD accounts for the large majority of hospital visits, so it&apos;s usually the first clinical workflow
        worth digitizing. A queue/token system, vitals capture, and a consultation screen that lets a doctor
        record diagnosis and prescription against the patient&apos;s single record removes the most daily
        friction for the least implementation effort. See{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD queue &amp; token management</Link>.
      </p>

      <h2>Step 3: Orders that leave the consultation room</h2>
      <p>
        A prescription, a lab order, a radiology order &mdash; each of these needs to reach the right
        department without a paper slip changing hands. This is where lab and pharmacy digitization pays off:
        an order placed in OPD should appear directly in the lab or pharmacy queue, tagged to the same patient
        record.
      </p>

      <h2>Step 4: Admission and ward care (IPD)</h2>
      <p>
        If a patient needs to be admitted, IPD digitization takes over &mdash; bed allotment, nursing
        assignment, and every subsequent charge (bed rent, nursing, further lab/pharmacy/OT) accumulating
        against the same patient record instead of restarting the paperwork. See{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">IPD admission &amp; bed management</Link>.
      </p>

      <h2>Step 5: Billing &mdash; where every workflow converges</h2>
      <p>
        Billing is the workflow that proves whether the rest actually connected. If OPD, lab, pharmacy and IPD
        charges all land on one combined bill automatically, digitization worked. If someone still has to
        manually gather charges from four departments at discharge, one of the earlier steps isn&apos;t actually
        connected yet. See <Link href="/guides/ipd-billing-software-explained">IPD billing explained</Link>.
      </p>

      <CalloutBox tone="tip" title="Digitize in phases, not all at once">
        Trying to switch every department to digital on the same day is where most rollouts struggle. A
        realistic sequence is: registration + OPD + billing first (immediate, visible benefit for the least
        disruption), then IPD, then lab/radiology/pharmacy, then the rest. See our{' '}
        <Link href="/guides/switching-from-spreadsheets-to-hms">guide to switching from registers and spreadsheets</Link>{' '}
        for a practical rollout plan.
      </CalloutBox>

      <h2>What &ldquo;done&rdquo; looks like</h2>
      <p>
        A hospital&apos;s digitization is working when a patient can walk in, be found by one search, be seen,
        tested, treated and billed &mdash; and every department along the way sees the same record instead of
        its own separate copy. That single thread, more than any individual feature, is what a hospital
        management system is actually for.
      </p>
    </>
  )
}
