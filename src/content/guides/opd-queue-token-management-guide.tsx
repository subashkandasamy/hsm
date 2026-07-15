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
    </>
  )
}
