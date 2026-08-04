import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is triage in a hospital emergency department?',
    a: 'Triage is sorting arriving patients by how urgently they need care, not by who arrived first. A patient with chest pain is seen before a patient with a minor cut who came earlier. Emergency software supports this by letting staff assign a priority level at arrival and ordering the queue by urgency.',
  },
  {
    q: 'Why does emergency registration need to be faster than OPD?',
    a: 'Emergency patients arrive without an appointment, often unable to give full details, sometimes unconscious. Registration must let staff start care immediately — with a minimal or provisional identity — and complete the record later, rather than blocking treatment on paperwork.',
  },
  {
    q: 'Should an emergency case be able to become an admission?',
    a: 'Yes. Many casualty patients are stabilised and then admitted as inpatients. The emergency record should carry forward into the admission so the history isn\'t re-entered, and the system should prevent registering a patient who is already an admitted inpatient as a fresh emergency case.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        The emergency department breaks the assumptions the rest of a hospital is built on: patients arrive
        unannounced, in any order, sometimes unable to speak for themselves, and the sickest must be seen
        first. Emergency software earns its place by making <em>fast</em> and <em>safe</em> compatible under
        that pressure.
      </p>

      <h2>Triage means urgency order, not arrival order</h2>
      <p>
        The defining feature of casualty is that the queue is sorted by how sick a patient is, not when they
        walked in. Software supports this by letting a triage nurse assign a priority level at the door and
        having the worklist reorder itself around it, so a critical case rises to the top the moment it is
        flagged rather than waiting behind earlier, less urgent arrivals.
      </p>
      <WorkflowDiagram
        title="An emergency arrival's path"
        steps={[
          { label: 'Arrival', sublabel: 'Rapid / provisional registration' },
          { label: 'Triage', sublabel: 'Priority level assigned' },
          { label: 'Treatment', sublabel: 'Seen in urgency order' },
          { label: 'Disposition', sublabel: 'Discharge or admit' },
        ]}
      />

      <h2>Registration that doesn&apos;t block treatment</h2>
      <p>
        In OPD it is fine to complete registration before care begins. In casualty it is not — a patient may be
        unconscious, unaccompanied, or simply too unwell to wait while details are typed. Emergency software
        has to let staff open a minimal or provisional record and start care immediately, then fill in the full
        identity once the patient is stable. The paperwork follows the patient; it never gates them.
      </p>

      <CalloutBox tone="info" title="Guard against duplicate and wrong-state registrations">
        Under pressure, the same patient can get registered twice, or someone already admitted as an inpatient
        can be entered as a new casualty case. Good software blocks both at the source — a duplicate open
        emergency case and registering a current inpatient as fresh — so the record stays clean when it matters
        most.
      </CalloutBox>

      <h2>From casualty to admission, without re-keying</h2>
      <p>
        A large share of emergency patients are stabilised and then admitted. The emergency record should flow
        straight into the <Link href="/guides/ipd-admission-bed-management-guide">inpatient admission</Link>,
        carrying its history so nothing is re-entered, and often reaching into the{' '}
        <Link href="/guides/blood-bank-management-guide">blood bank</Link> or{' '}
        <Link href="/guides/ot-scheduling-management-guide">operation theatre</Link> for urgent intervention.
        That traceability from arrival to admission is what keeps a fast-moving casualty auditable afterwards.
      </p>

      <CalloutBox tone="tip" title="How Uyirly handles it">
        Uyirly&apos;s emergency module supports rapid registration, priority-based triage, and a clean
        hand-off into IPD — with source-to-admission traceability and guards that block duplicate or
        inpatient re-registrations before they happen.
      </CalloutBox>

      <p>
        If your hospital runs a casualty or emergency department,{' '}
        <Link href="/signup">start a free trial</Link> and register a mock walk-in, triage it, and admit it —
        the speed of that path is the real measure of emergency software.
      </p>
      <h2>How Uyirly handles emergency and triage</h2>
      <p>
        In <Link href="/hospital-management-software">Uyirly</Link>, an emergency patient can be registered in
        seconds &mdash; even before full details are known &mdash; and triaged by severity so the sickest are seen
        first. The system blocks duplicate ER registrations and stops an already-admitted patient being
        registered again in the ER, and when a case needs admission it moves straight to IPD, carrying its
        record so nothing is re-entered.
      </p>
      <ul>
        <li>Rapid registration for walk-in and brought-in emergencies.</li>
        <li>Triage by severity so the most critical patients are prioritised.</li>
        <li>Duplicate and inpatient ER registrations blocked at the source.</li>
        <li>One tap to admit from the ER into IPD, with full traceability.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Emergency is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>, connected to <Link href="/guides/ipd-admission-bed-management-guide">IPD admissions</Link>
        {' '}and billing. You can <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
