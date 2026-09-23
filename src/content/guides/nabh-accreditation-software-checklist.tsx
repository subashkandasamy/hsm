import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'Does hospital software need to be "NABH certified"?',
    a: 'There\'s no official NABH certification for software itself — NABH accredits hospitals, not vendors. What matters is whether the software can produce the records, staffing data and documentation an NABH assessor will actually ask for.',
  },
  {
    q: 'What documentation does NABH assessment typically check?',
    a: 'Common areas include patient records completeness, nursing staffing ratios against norms, infection control logs, medication administration records, incident reporting, and consent documentation — most of which a hospital management system can generate directly if the underlying data is captured consistently.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        NABH accreditation assesses a hospital&apos;s systems and records, not just its clinical outcomes — which
        means the software running those records matters directly to how smoothly an assessment goes. This is
        a practical checklist for what to look for.
      </p>

      <h2>Staffing ratios</h2>
      <p>
        NABH staffing norms specify nurse-to-patient ratios by unit type — see our full{' '}
        <Link href="/guides/nurse-patient-ratio-india-nabh">NABH nurse-to-patient ratio guide</Link>. Software
        that can show actual rostered staffing against these ratios, ward by ward, turns an assessment
        question into a report instead of a manual staffing audit.
      </p>

      <h2>Complete, consistent patient records</h2>
      <p>
        NABH assessors look for consistent documentation — every admission with a complete record, allergies
        noted, consent captured, discharge summaries present. A system where documentation is optional or
        scattered across paper and digital records makes this much harder to demonstrate, which our{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">EMR &amp; UHID guide</Link> covers in more depth.
      </p>

      <h2>Medication and pharmacy records</h2>
      <p>
        Traceable dispensing records — what was given, to whom, by whom, against which prescription — matter
        both for NABH and for drug-schedule compliance &mdash; more in our{' '}
        <Link href="/guides/drug-schedule-h-h1-x-pharmacy-compliance">pharmacy compliance guide</Link>.
      </p>

      <CalloutBox tone="info" title="NABH accredits hospitals, not software">
        There&apos;s no official NABH software certification. What matters practically is whether your system can
        produce the records an assessor asks for, on demand, without a manual scramble.
      </CalloutBox>

      <h2>A quick readiness checklist</h2>
      <ul>
        <li>Can you pull nurse-to-patient staffing by ward and shift, compared against NABH norms?</li>
        <li>Are patient records (consent, allergies, discharge summaries) consistently complete, not optional fields?</li>
        <li>Is medication dispensing traceable back to a prescription and the dispensing staff member?</li>
        <li>Can incident and infection-control logs be pulled as reports, not searched for in paper files?</li>
      </ul>
      <h2>How Uyirly supports NABH readiness</h2>
      <p>
        Much of what NABH looks for &mdash; complete records, controlled access and a clear audit trail &mdash; is a
        by-product of running the hospital on <Link href="/hospital-management-software">Uyirly</Link> rather
        than a separate exercise. Records are structured and complete, access is by staff role, and every view
        and change is audit-logged, so preparing for an audit is about pulling reports, not reconstructing
        registers.
      </p>
      <ul>
        <li>Structured, complete digital records instead of scattered paper.</li>
        <li>Role-based access, so only the right staff see the right data.</li>
        <li>Audit trails on every action, with data stored in India.</li>
        <li>Prescriptions, orders and nursing records captured as you work, rather than written up afterwards.</li>
        <li>Consent forms and other paperwork held against the patient as uploaded documents &mdash; note these are scanned documents, not structured consent workflows, and Uyirly has no built-in NABH checklist tooling.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        These controls come built into Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>. You can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
