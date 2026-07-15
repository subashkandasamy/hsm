import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What is a TPA in hospital billing?',
    a: 'A TPA (Third Party Administrator) is the intermediary that processes health insurance claims on behalf of an insurance company — approving pre-authorization, reviewing the final bill, and settling payment with the hospital for cashless treatment.',
  },
  {
    q: 'What is pre-authorization in cashless insurance?',
    a: 'Pre-authorization is an estimated treatment cost submitted to the TPA before or shortly after admission, so the insurer can approve coverage upfront. The final bill at discharge is then reconciled against what was pre-authorized.',
  },
  {
    q: 'What\'s the difference between cashless and reimbursement claims?',
    a: 'In a cashless claim, the TPA pays the hospital directly and the patient doesn\'t pay out of pocket (beyond any non-covered items). In a reimbursement claim, the patient pays the hospital bill in full and later submits it to their insurer for reimbursement.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Insurance billing adds a second audience to every hospital bill — not just the patient, but a TPA
        reviewing whether each charge is covered. Getting this workflow right avoids delayed discharges and
        rejected claims.
      </p>

      <h2>How a cashless claim moves</h2>
      <WorkflowDiagram
        title="Cashless insurance claim workflow"
        steps={[
          { label: 'Admission', sublabel: 'Insurance details captured' },
          { label: 'Pre-authorization', sublabel: 'Estimated cost sent to TPA' },
          { label: 'TPA approval', sublabel: 'Coverage confirmed' },
          { label: 'Treatment & billing', sublabel: 'Bill accumulates as usual' },
          { label: 'Final claim & settlement', sublabel: 'Reconciled against pre-auth' },
        ]}
      />
      <p>
        The bill itself is built exactly the same way as any other admission — see our{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> — the insurance workflow
        runs alongside it, tracking pre-authorization status and what portion of the final bill the TPA will
        actually cover.
      </p>

      <h2>Why tracking approval status matters</h2>
      <p>
        A hospital needs to know, at any point during a stay, whether pre-authorization is still pending,
        approved, or needs a revised estimate because treatment costs changed. Discharges get delayed when
        this status isn&apos;t visible and someone has to call the TPA to check.
      </p>

      <h2>What to check in insurance/TPA software</h2>
      <ul>
        <li>Pre-authorization status visible on the admission record, not tracked separately in email or calls.</li>
        <li>Support for revised estimates if treatment costs change mid-stay.</li>
        <li>A clear split at discharge between what&apos;s covered and what the patient owes directly.</li>
        <li>Reimbursement-claim document generation for patients without cashless coverage.</li>
      </ul>
    </>
  )
}
