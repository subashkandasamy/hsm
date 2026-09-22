import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import ScreenMock, { MockTable } from '@/components/guides/diagrams/ScreenMock'

export const faqs = [
  {
    q: 'Why do hospitals need a discount policy?',
    a: 'Because uncontrolled discounts are one of the biggest sources of silent revenue leakage. Without limits and a reason on every discount, staff can reduce bills at will, and the hospital has no way to see how much revenue it gave away or why. A discount policy sets who can discount, how much, and requires a recorded reason.',
  },
  {
    q: 'What are discount approval limits?',
    a: 'Approval limits cap how much discount each role can give on their own. For example, a receptionist may be allowed up to 5% and an accountant up to 15%, while anything higher must be approved by an administrator. This keeps small, routine concessions fast while controlling large ones.',
  },
  {
    q: 'How does a discount approval workflow work?',
    a: 'When a staff member applies a discount within their limit, it is applied immediately. If it exceeds their limit, the system holds it as a pending request instead of applying it, and an authorised approver reviews and approves or rejects it. Only on approval is the discount applied to the bill.',
  },
  {
    q: 'Should every discount have a reason?',
    a: 'Yes. A recorded reason (camp, staff, senior citizen, charity, management, etc.) turns discounts from an untraceable leak into an auditable line. It lets management see not just how much was discounted but why, and spot patterns that need attention.',
  },
  {
    q: 'Can discounts be given as a percentage or a fixed amount?',
    a: 'Both. Staff should be able to enter either a percentage of the bill or a fixed rupee amount; the system converts to an effective percentage to check it against the role\'s limit and records both on the bill.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Discounts are a normal part of hospital billing &mdash; a camp patient, a staff relative, a senior
        citizen, a charity case, a goodwill concession approved by management. Handled loosely, they are also one
        of the largest and quietest sources of <strong>revenue leakage</strong> a hospital has. If any staff
        member can reduce any bill by any amount with no reason recorded, nobody can answer how much revenue was
        given away last month, or why.
      </p>
      <p>
        A <strong>discount policy with approval controls</strong> fixes this without slowing down the front desk.
        This guide explains the three pillars of discount control &mdash; limits, reasons, and an approval
        workflow &mdash; and how a modern system enforces them.
      </p>

      <h2>Why uncontrolled discounts hurt</h2>
      <p>
        The problem is not that discounts exist &mdash; it is that they are invisible. A 40% concession given
        quietly at the counter looks identical to a legitimate 5% camp discount if neither is capped, reasoned or
        reviewed. Over a year, ungoverned discounts can erode margin more than any single cost line, and because
        there is no record, the leak is impossible to trace or stop.
      </p>
      <CalloutBox tone="warning" title="What good discount control looks like">
        Three things, together: (1) a <strong>cap per role</strong> so people can only give what they&rsquo;re
        trusted to, (2) a <strong>mandatory reason</strong> on every discount, and (3) an <strong>approval
        step</strong> for anything above a role&rsquo;s cap. Miss any one and the control has a hole.
      </CalloutBox>

      <h2>Pillar 1 — Limits per role</h2>
      <p>
        Different roles warrant different trust. A receptionist handling routine concessions might be allowed up
        to a few percent; an accountant more; an administrator without limit. Setting a <strong>maximum discount
        percentage per role</strong> lets small, everyday discounts flow instantly while keeping large ones under
        control.
      </p>
      <MockTable
        head={['Role', 'Max discount', 'Behaviour']}
        rows={[
          ['Receptionist', '5%', 'Applies instantly up to 5%'],
          ['Accountant', '15%', 'Applies instantly up to 15%'],
          ['Administrator', 'Unlimited', 'No cap; also approves others'],
        ]}
      />

      <h2>Pillar 2 — A reason on every discount</h2>
      <p>
        A discount without a reason is a leak; a discount with a reason is a business decision you can audit.
        Requiring staff to pick a category &mdash; camp, staff, senior citizen, charity, management, other
        &mdash; means management can later see not just the total discounted but the <em>why</em>, and question
        anything that looks off. It costs the cashier one dropdown and changes discounts from a blind spot into a
        reportable line.
      </p>

      <h2>Pillar 3 — The approval workflow</h2>
      <p>
        Caps only help if exceeding them does something. The clean model: a discount <strong>within</strong> the
        staff member&rsquo;s cap applies immediately; a discount <strong>above</strong> it is <em>not</em>
        applied &mdash; it becomes a <strong>pending request</strong> that an authorised approver must accept
        before it touches the bill.
      </p>
      <WorkflowDiagram
        title="Discount within cap vs over cap"
        steps={[
          { label: 'Staff enters discount', sublabel: '% or ₹ + reason' },
          { label: 'Within cap?', sublabel: 'Compare to role limit' },
          { label: 'Yes → applied', sublabel: 'Instantly on the bill' },
          { label: 'No → pending', sublabel: 'Awaits approver' },
          { label: 'Approved', sublabel: 'Then applied' },
        ]}
      />
      <p>
        The guardrails matter: an approver should not be able to approve their own request, and should not
        approve above their own authority. That keeps the control honest rather than a rubber stamp.
      </p>

      <h2>The kinds of discounts a hospital actually gives</h2>
      <p>
        &ldquo;Discount&rdquo; is not one thing, and lumping them together is why they become impossible to
        govern. The common categories each deserve their own reason code:
      </p>
      <ul>
        <li><strong>Camp discounts</strong> &mdash; concessional rates for patients from a health camp or
          screening drive, usually pre-agreed.</li>
        <li><strong>Staff and family</strong> &mdash; a benefit for the hospital&rsquo;s own people; predictable
          and policy-driven.</li>
        <li><strong>Senior citizen</strong> &mdash; a standing concession many hospitals offer.</li>
        <li><strong>Charity / financial hardship</strong> &mdash; genuine inability to pay; often needs
          management sign-off and documentation.</li>
        <li><strong>Management / goodwill</strong> &mdash; a discretionary concession, exactly the kind that must
          go through approval.</li>
      </ul>
      <p>
        When each discount carries its category, the monthly picture becomes readable: you can see that camp and
        senior-citizen concessions are steady and expected, while management goodwill is the line that needs
        watching. Without categories, it is all just &ldquo;discount,&rdquo; and you cannot tell a policy from a
        leak.
      </p>

      <h2>Discount vs write-off &mdash; not the same thing</h2>
      <p>
        A <strong>discount</strong> is a reduction applied before or at billing &mdash; the patient was never
        expected to pay the full amount. A <strong>write-off</strong> is giving up on money already billed and
        unpaid &mdash; the patient owed it and the hospital has decided not to pursue it. They are different
        events with different accounting and different controls: a discount reduces the bill; a write-off clears a
        genuine receivable. Blurring them hides bad debt inside &ldquo;discounts&rdquo; and flatters your
        collection numbers. Keep the discount workflow for reductions at billing, and treat unrecoverable dues as
        an explicit write-off decision.
      </p>

      <h2>Reading the discount register: the red flags</h2>
      <p>
        Once every discount has a percentage, a reason and (where needed) an approver, the monthly discount
        register becomes a management tool. The patterns worth acting on:
      </p>
      <ul>
        <li><strong>One staff member consistently discounting at their maximum</strong> &mdash; worth understanding
          why.</li>
        <li><strong>A spike in &ldquo;management&rdquo; or &ldquo;other&rdquo; reasons</strong> &mdash; the vaguest
          categories are where leakage hides.</li>
        <li><strong>Discounts clustering on particular services or doctors</strong> &mdash; could be legitimate
          competition, could be something else.</li>
        <li><strong>Total discount as a percentage of gross billing creeping up month over month</strong> &mdash;
          the single number the owner should track.</li>
      </ul>

      <h2>Setting the right caps</h2>
      <p>
        Caps that are too tight send every routine concession to an administrator and become a bottleneck; caps
        that are too loose defeat the purpose. The practical approach is to set each role&rsquo;s limit at the
        level of the discounts they genuinely handle day to day &mdash; a receptionist covering standard senior
        or camp concessions, an accountant a little higher for negotiated cases &mdash; so the vast majority of
        discounts apply instantly and only the genuinely large ones escalate. Review the caps every few months
        against the register: if almost nothing is escalating, they may be too loose; if routine concessions keep
        queuing for approval, too tight.
      </p>

      <h2>How Uyirly offers this</h2>
      <p>
        Uyirly builds all three pillars into billing, so control is automatic rather than a matter of trust.
      </p>
      <StatGrid stats={[
        { value: 'Per role', label: 'Max discount % in Settings' },
        { value: '% or ₹', label: 'With a mandatory reason' },
        { value: 'Auto-route', label: 'Over-cap → approval queue' },
        { value: 'Audited', label: 'Every discount logged' },
      ]} />
      <p>
        Admins set each role&rsquo;s cap under <strong>Settings &rarr; Tariffs &amp; Fees &rarr; Discount
        Limits</strong>. On any bill, staff click <strong>Discount</strong>, choose percent or amount, and pick
        a reason. Within their cap it applies at once; above it, Uyirly holds it as a <strong>pending
        approval</strong> &mdash; the bill shows a &ldquo;discount pending&rdquo; banner, and it appears in a
        dedicated <strong>Discount Approvals</strong> queue for managers to approve or reject (with the
        self-approval and over-authority guards enforced).
      </p>
      <Screenshot
        src="/guides/discount-approvals.png" width={2560} height={556}
        alt="Discount approvals screen showing a pending request with the patient, bill number, reason, who requested it, the percentage and amount, and Approve or Reject buttons"
        caption="A discount above the requester’s limit, waiting on someone who can approve it — with the reason attached."
      />
      <ScreenMock title="Billing · Discount Approvals" caption="Managers approve or reject over-limit discounts from one queue.">
        <MockTable
          head={['Patient · Bill', 'Discount', 'Reason', 'Action']}
          rows={[
            ['Ramesh K. · BILL-2026-00051', '20% (₹4,000)', 'Management', { v: 'Approve / Reject', color: '#0D9488' }],
          ]}
        />
      </ScreenMock>
      <CalloutBox tone="tip" title="Set caps once, control forever">
        Decide each role&rsquo;s discount authority once. After that, routine concessions stay fast, large ones
        get a second pair of eyes, and every discount carries a reason you can report on &mdash; turning a
        classic leak into a governed, auditable process.
      </CalloutBox>

      <h2>Where it fits</h2>
      <p>
        Discount control sits inside the billing flow alongside{' '}
        <Link href="/guides/ipd-billing-software-explained">bill generation</Link> and{' '}
        <Link href="/guides/hospital-gst-billing-rules-india">GST-compliant invoicing</Link>. Because the
        discount is recorded with its reason and (where needed) its approver, it also strengthens your finance
        trail &mdash; the same accountability principle behind cashier shift-close and daily collection
        reconciliation.
      </p>
    </>
  )
}
