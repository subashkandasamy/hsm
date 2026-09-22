import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
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
        A cashless claim is four separate things that a hospital tends to treat as one: a policy, an
        eligibility decision before treatment, a claim after it, and a settlement weeks later. Confusing any
        two of them is how hospitals end up holding a bed for money that was never the blocker, or writing
        off a shortfall nobody noticed.
      </p>

      <h2>The four stages</h2>
      <WorkflowDiagram
        title="Policy to money"
        steps={[
          { label: 'Policy', sublabel: 'Insurer, TPA, limits' },
          { label: 'Eligibility', sublabel: 'Pre-auth before treatment' },
          { label: 'Claim', sublabel: 'Raised, submitted, decided' },
          { label: 'Settlement', sublabel: 'What actually arrives' },
        ]}
      />
      <p>
        The two that get conflated are <strong>eligibility</strong> and <strong>settlement</strong>.
        Eligibility — the pre-authorisation — is the insurer saying it will cover a stated amount. That is
        what should release the patient at discharge. Settlement is the money arriving, often weeks later.
        A hospital that waits for settlement before discharging is holding a bed for no reason.
      </p>

      <h2>The policy, and its sub-limits</h2>
      <p>
        A policy is not just a number. It carries a room-rent cap, a co-pay percentage, and the sub-limits
        that decide what is actually recoverable. A ₹5,00,000 policy with a ₹5,000 room-rent cap will not
        pay for a ₹9,000 suite, and the difference lands on the patient — which is a conversation to have
        at admission, not at discharge.
      </p>

      <h2>What the desk sees</h2>
      <Screenshot
        src="/guides/insurance-approved.png" width={2560} height={1148}
        alt="Insurance screen showing receivables across awaiting decision, approved to receive, settled this month and 60-plus days pending, with a claim card showing the approved amount and the higher amount originally claimed"
        caption="Approved to receive, and on the card the shortfall: ₹39,000 approved against ₹48,000 claimed."
      />
      <p>
        The four figures across the top are the receivables position: what is awaiting a decision, what has
        been approved and is owed, what settled this month, and what has been pending more than sixty days
        — the last being the one that quietly becomes a write-off.
      </p>
      <p>
        On the card itself, the number shown is the one that matters at that stage: an approved claim shows
        what the insurer agreed, with the amount originally claimed underneath. A claim raised for ₹48,000
        and approved for ₹39,000 is a ₹9,000 shortfall somebody has to either recover from the patient or
        absorb — and the only way that decision gets made is if the figure is visible.
      </p>

      <h2>Deductions are the real work</h2>
      <p>
        Insurers disallow lines: an investigation deemed unrelated, room rent above the cap, consumables
        outside the package. The claim record keeps the reason, because a pattern of the same deduction
        across many claims is a billing habit worth changing rather than bad luck.
      </p>

      <h2>TPAs, and getting paid</h2>
      <p>
        Most claims pass through a TPA rather than the insurer directly, and payments arrive as a
        remittance covering many claims at once. Matching that payment back to individual claims is the
        unglamorous half of insurance work — which is why the TPA list, the hospital&apos;s bank accounts
        and the remittances all live beside the claims rather than in someone&apos;s spreadsheet.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>Policies with insurer, TPA, member ID, room-rent cap, co-pay and sub-limit notes.</li>
        <li>Eligibility decided and recorded separately from the claim, so discharge turns on pre-authorisation.</li>
        <li>Claims through raised, submitted, approved, rejected and settled, each with its date.</li>
        <li>The approved amount shown against what was claimed, so a shortfall is visible rather than absorbed.</li>
        <li>Deductions recorded with their reason.</li>
        <li>A TPA master, bank accounts and remittance batches for matching payments back to claims.</li>
        <li>Receivables by age, including what has been pending more than sixty days.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Insurance sits beside the{' '}
        <Link href="/guides/ipd-billing-software-explained">bill it is claiming against</Link> in
        Uyirly&apos;s <Link href="/hospital-management-software">hospital management software</Link>.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
