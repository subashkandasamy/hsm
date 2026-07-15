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
    </>
  )
}
