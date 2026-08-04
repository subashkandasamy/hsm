import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What do you need ready before starting a hospital software free trial?',
    a: 'A basic department list, a handful of staff members with their roles (doctor, nurse, receptionist, etc.), and — if you want a realistic test — a short list of sample patients. None of this needs to be your real production data.',
  },
  {
    q: 'How long does it take to get a hospital live on new software?',
    a: 'Core setup — hospital profile, departments, staff accounts, basic pricing — can typically be done within a day. Going fully live across every department usually happens gradually over the following days to weeks as staff get comfortable with each module.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A free trial is only useful if you actually set it up the way your hospital will really run — not
        just click through a demo. Here&apos;s what a realistic first day on a new hospital management system
        looks like.
      </p>

      <h2>Day-one setup sequence</h2>
      <WorkflowDiagram
        title="Getting a hospital live"
        steps={[
          { label: 'Hospital profile', sublabel: 'Name, departments, wards' },
          { label: 'Staff accounts', sublabel: 'Roles & permissions' },
          { label: 'Pricing setup', sublabel: 'Consultation, bed, tariffs' },
          { label: 'Test patients', sublabel: 'Run a real workflow' },
        ]}
      />

      <h2>What to have ready</h2>
      <ul>
        <li>A list of departments and wards, if you run inpatient care.</li>
        <li>Staff names and their roles — doctor, nurse, receptionist, pharmacist, and so on.</li>
        <li>Basic pricing — consultation fees, bed daily rates, common procedure charges.</li>
        <li>A few sample patients to actually run through OPD registration, a consultation and a bill — this is worth far more than clicking through an empty demo.</li>
      </ul>

      <h2>Test with real staff, not just yourself</h2>
      <p>
        The most useful trial isn&apos;t an admin exploring the software alone — it&apos;s a receptionist registering
        a walk-in, a nurse assigning herself to a patient, a doctor writing a prescription. Our{' '}
        <Link href="/guides/hospital-management-software-india">buyer&apos;s checklist</Link> covers what else to
        evaluate during a trial beyond whether setup was easy.
      </p>

      <h2>Ready to try it?</h2>
      <p>
        If you&apos;re moving off paper registers or spreadsheets rather than another software product, our{' '}
        <Link href="/guides/switching-from-spreadsheets-to-hms">guide to switching from spreadsheets</Link>{' '}
        covers a phased rollout that avoids disrupting patient care during the transition.
      </p>
      <h2>Starting your Uyirly free trial</h2>
      <p>
        <Link href="/hospital-management-software">Uyirly</Link> gives a 30-day free trial with no credit card,
        and most hospitals are seeing patients the same day. When you{' '}
        <Link href="/signup">sign up</Link>, your hospital gets its own private, secure workspace, and a
        built-in setup guide walks you through the rest.
      </p>
      <ol>
        <li><strong>Sign up</strong> with your hospital name and mobile number &mdash; no card needed.</li>
        <li><strong>Add your team</strong> so doctors, nurses and front desk can log in.</li>
        <li><strong>Switch on your departments</strong> and add your services, medicines and billing rates.</li>
        <li><strong>Register your first patient</strong> and watch the visit, prescription and bill flow together.</li>
        <li><strong>Go live</strong> &mdash; add more modules whenever you are ready.</li>
      </ol>

      <h2>Getting started</h2>
      <p>
        You can <Link href="/signup">start your free trial</Link> now, or see how to move off registers in our{' '}
        <Link href="/guides/switching-from-spreadsheets-to-hms">switching guide</Link>. After the trial it is
        simple flat monthly pricing &mdash; see <Link href="/pricing">pricing</Link>.
      </p>
    </>
  )
}
