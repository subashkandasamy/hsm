import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What is a token system in hospital OPD?',
    a: 'A token system assigns each walk-in patient a sequential number when they register, so they can be called in order without physically waiting at the doctor\'s door. Combined with appointment slots, it lets scheduled and walk-in patients share one fair queue.',
  },
  {
    q: 'How does OPD queue software reduce waiting time?',
    a: 'It doesn\'t make consultations faster — it removes the time patients spend physically forming a line or repeatedly asking "how much longer." A visible queue display and estimated wait let patients wait comfortably (or step away) instead of standing at a door.',
  },
  {
    q: 'Does OPD software need to capture vitals before consultation?',
    a: 'It should support it, since many hospitals have a nurse record vitals (BP, pulse, temperature, weight) before the doctor sees the patient, saving consultation time and giving the doctor context immediately.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        OPD accounts for the large majority of hospital footfall, which makes it the single busiest, most
        chaotic part of most hospitals without a queue system — and the workflow most worth fixing first when
        digitizing.
      </p>

      <h2>What is an OPD token system?</h2>
      <p>
        An <strong>OPD token system</strong> gives each patient a sequential number &mdash; a token &mdash; when they
        register, so they&apos;re called in order instead of physically crowding at the doctor&apos;s door. It&apos;s the
        core of any <strong>patient token system</strong> in a hospital: the token fixes a patient&apos;s place in the
        queue, a display or their phone shows how close they are, and the doctor&apos;s screen calls the next token
        when they&apos;re ready. Done well, a token system in a hospital lets scheduled appointments and walk-ins
        share one fair line rather than two competing crowds.
      </p>

      <h2>How an OPD queue actually flows</h2>
      <WorkflowDiagram
        title="A walk-in patient's OPD queue journey"
        steps={[
          { label: 'Registration', sublabel: 'UHID found or created' },
          { label: 'Token issued', sublabel: 'Queue position assigned' },
          { label: 'Vitals', sublabel: 'Nurse records BP, pulse, etc.' },
          { label: 'Consultation', sublabel: 'Doctor sees by queue order' },
        ]}
      />
      <p>
        Appointment patients and walk-ins need to share the same queue fairly — usually by giving appointment
        slots priority at their scheduled time while walk-ins fill the gaps in between, rather than running two
        completely separate lines that confuse both patients and reception staff.
      </p>

      <h2>Doctor-wise and department-wise queues</h2>
      <p>
        In a multi-doctor OPD, each doctor needs their own queue, not one hospital-wide line — a patient
        waiting for Dr. Sharma shouldn&apos;t be blocked behind everyone waiting for Dr. Rao. Queue software
        should let reception route a token to the right doctor at registration, and show each doctor only
        their own queue.
      </p>

      <h2>Why this connects to everything downstream</h2>
      <p>
        A consultation that starts from a properly queued, correctly identified patient record flows cleanly
        into orders (lab, radiology, prescription) and eventually into admission if needed. We map that full
        path in the{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">hospital digitization workflow guide</Link>.
        Why one identity per patient matters from the very first token is covered in our{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">EMR &amp; UHID guide</Link>.
      </p>

      <h2>The two questions worth asking a vendor</h2>
      <p>
        First: does one doctor&apos;s queue ever get blocked by another doctor&apos;s patients? If reception can&apos;t
        route a token straight to the right doctor at registration, the answer is yes, and it will show up
        the first busy morning. Second: do appointment slots and walk-in tokens share one fair queue, or run
        as two separate lines that leave staff manually deciding whose turn it really is? Everything else
        &mdash; vitals capture, a visible display &mdash; is easier to bolt on later; these two aren&apos;t.
      </p>
      <h2>How Uyirly runs the OPD queue</h2>
      <p>
        In <Link href="/clinic-management-software">Uyirly</Link>, every doctor gets a live token queue for
        the day. When a patient is registered, a token is issued for the right doctor, and appointments and
        walk-ins share one fair line &mdash; nobody has to shout &ldquo;who is next&rdquo;. The doctor&apos;s screen shows
        only their own worklist and updates the moment a patient arrives or a consultation ends. A patient can
        even see their token number and how many people are ahead, so they can wait comfortably or step away.
      </p>
      <ul>
        <li>One ordered queue per doctor &mdash; appointments and walk-ins together.</li>
        <li>A nurse can record vitals (BP, pulse, temperature, weight) before the doctor sees the patient.</li>
        <li>Repeat patients are found instantly by phone number or UHID &mdash; no duplicate registration.</li>
        <li>The consultation ends in a prescription and a charge that both land on the same patient bill.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The OPD queue is part of Uyirly&apos;s <Link href="/clinic-management-software">clinic</Link> and{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, on the same patient
        record as billing and the pharmacy. You can <Link href="/signup">start a 30-day free trial</Link> with
        no credit card and run your real OPD the same day.
      </p>
    </>
  )
}
