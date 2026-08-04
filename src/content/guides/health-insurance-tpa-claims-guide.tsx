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

      <h2>The discharge-delay problem, and how to avoid it</h2>
      <p>
        Almost every delayed insurance discharge traces back to the same root cause: someone had to call the
        TPA to find out approval status, because it wasn&apos;t visible in the system. If pre-authorization status
        sits on the admission record itself &mdash; pending, approved, or needs a revised estimate &mdash; the front
        desk can tell a patient&apos;s family exactly where things stand without picking up the phone. That single
        change is usually worth more than any other feature on an insurance module.
      </p>
      <p>
        The other half of a smooth discharge is a bill that already splits cleanly into &ldquo;covered by
        insurance&rdquo; and &ldquo;patient pays directly&rdquo; &mdash; because that split was tracked throughout the stay,
        not calculated for the first time at the discharge counter.
      </p>
      <h2>How Uyirly handles insurance and TPA claims</h2>
      <p>
        <Link href="/hospital-management-software">Uyirly</Link> runs a cashless claim through four clear
        stages on the patient&apos;s own bill: add the policy, get the eligibility (pre-authorisation) approved,
        raise and submit the claim, and record the settlement. The pre-authorisation is what unlocks a
        cashless discharge, so the paperwork does not hold up the patient, and the claim is built from the
        same itemised bill the hospital already produced.
      </p>
      <ul>
        <li>Four stages &mdash; policy, eligibility check, claim, settlement &mdash; each logged.</li>
        <li>Pre-authorisation approval covers the cashless discharge balance automatically.</li>
        <li>A TPA master and bank-account list so claims and settlements are consistent.</li>
        <li>Every action on a claim is recorded in one history.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Insurance is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>, built on the same <Link href="/guides/ipd-billing-software-explained">IPD bill</Link>.
        You can <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
