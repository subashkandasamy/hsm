import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import ScreenMock, { MockStat, MockTable } from '@/components/guides/diagrams/ScreenMock'

export const faqs = [
  {
    q: 'What is a credit note in hospital billing?',
    a: 'A credit note is a document that records money refunded against a bill that was already paid — for example when a test was cancelled after payment, or a patient overpaid. The original bill stays unchanged; the credit note is a separate entry that reduces the net amount the hospital actually kept.',
  },
  {
    q: 'Why not just edit or cancel the original bill?',
    a: 'Because an issued, paid bill is a financial and often legal record. Editing or deleting it destroys the audit trail and breaks reconciliation. The correct practice is to leave the original bill intact and record a credit note against it, so both the original charge and the refund are visible and auditable.',
  },
  {
    q: 'What is "net collected" after a refund?',
    a: 'Net collected is the money the hospital actually retained: amount paid minus credit notes issued. If a patient paid ₹5,000 and was refunded ₹1,000 via a credit note, the bill still shows ₹5,000 paid, but net collected is ₹4,000. This is the figure that should flow into daily collection and cash reconciliation.',
  },
  {
    q: 'Do cash refunds affect the cashier day-book?',
    a: 'Yes. A cash refund is money leaving the drawer, so it must reduce the cashier\'s expected cash for the day. A well-built system feeds credit-note cash refunds into the day-book as cash-out so shift reconciliation stays correct.',
  },
  {
    q: 'Who should be allowed to issue a refund?',
    a: 'Refunds move money out, so they should be restricted to billing managers/administrators, capped at the amount actually collected on the bill (you cannot refund more than was paid), and always recorded with a reason for audit.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Refunds are unavoidable in a hospital. A test gets cancelled after the patient has already paid; a
        package is billed and then trimmed; a patient simply overpays. The question is not <em>whether</em> to
        refund but <strong>how to record it</strong> &mdash; and this is where many hospitals quietly corrupt
        their own books by editing or deleting a paid bill to &ldquo;fix&rdquo; it.
      </p>
      <p>
        The correct instrument is a <strong>credit note</strong>: the original bill stays exactly as it was, and
        the refund is recorded as a separate, auditable entry against it. This guide explains why that matters,
        how &ldquo;net collected&rdquo; works, and how refunds should flow into your cash reconciliation.
      </p>

      <h2>The golden rule: never mutate a paid bill</h2>
      <p>
        An issued, paid bill is a financial record &mdash; often a legal one, especially once it carries a GST
        tax-invoice number. Editing its line items or deleting it after payment destroys the audit trail, breaks
        day-wise reconciliation, and makes it impossible to prove what was charged versus what was returned.
      </p>
      <CalloutBox tone="warning" title="Refund with a credit note, don't rewrite history">
        Leave the original bill untouched. Record the refund as a <strong>credit note</strong> linked to that
        bill. Now both facts are preserved: the patient <em>was</em> charged and paid ₹X, and ₹Y <em>was</em>
        returned to them &mdash; each with a date, an amount, a method and a reason.
      </CalloutBox>

      <h2>How a credit note works</h2>
      <p>
        A credit note captures a refund against a specific bill: the amount, how it was returned (cash, card,
        UPI, bank), and why. It is capped at what was actually collected &mdash; you cannot refund more than the
        patient paid, minus anything already refunded.
      </p>
      <WorkflowDiagram
        title="Issuing a refund the right way"
        steps={[
          { label: 'Paid bill', sublabel: 'Stays immutable' },
          { label: 'Credit note', sublabel: 'Amount + method + reason' },
          { label: 'Refundable check', sublabel: '≤ paid − already refunded' },
          { label: 'Net collected', sublabel: 'Paid − credit notes' },
          { label: 'Cash Book', sublabel: 'Cash refund = cash-out' },
        ]}
      />

      <h2>&ldquo;Net collected&rdquo; &mdash; the number that matters</h2>
      <p>
        After a refund, the bill still shows what was billed and paid, but the hospital&rsquo;s real takings are
        lower. <strong>Net collected = paid − credit notes.</strong> Keeping this distinct from the immutable
        &ldquo;paid&rdquo; figure is what lets your books stay both accurate <em>and</em> honest about history.
      </p>
      <MockTable
        head={['Figure', 'Value']}
        rows={[
          ['Bill total', '₹5,000'],
          ['Paid', '₹5,000'],
          ['Credit note (refund)', { v: '− ₹1,000', color: '#B45309' }],
          ['Net collected', { v: '₹4,000', color: '#0F172A' }],
        ]}
      />

      <h2>Refunds and cash reconciliation</h2>
      <p>
        A cash refund is money physically leaving the drawer, so it has to reduce the cashier&rsquo;s expected
        cash for the day &mdash; otherwise the shift will never reconcile. This is why refunds and the{' '}
        <Link href="/guides/hospital-cashier-day-book-shift-close-guide">cashier day-book</Link> are two sides of
        one coin: a credit-note cash refund should appear as <strong>cash-out</strong> in the day-book so the
        end-of-shift count still matches.
      </p>

      <h2>Common refund scenarios</h2>
      <p>
        Refunds arise in a handful of recurring situations, and it helps to recognise them because each has a
        clean credit-note answer:
      </p>
      <ul>
        <li><strong>Cancelled service after payment</strong> &mdash; a test or procedure was paid for, then not
          done. Refund the exact amount of the cancelled item via a credit note with that reason.</li>
        <li><strong>Overpayment</strong> &mdash; the patient paid more than the final bill (common when a round
          figure is collected up front). Refund the excess.</li>
        <li><strong>Unused IPD advance</strong> &mdash; a deposit exceeded the final bill. The balance is returned
          to the patient at discharge; in advance-based systems this is often handled as an advance refund, which
          is conceptually the same money-out event.</li>
        <li><strong>Billing correction</strong> &mdash; something was charged in error and already paid. Rather
          than editing the paid bill, issue a credit note for the erroneous amount.</li>
      </ul>
      <p>
        In every case the pattern is identical: the original record stays, a credit note captures what went back,
        and the reason is preserved.
      </p>

      <h2>Refund vs bill cancellation</h2>
      <p>
        These two get confused. <strong>Cancelling a bill</strong> makes sense when it was raised but{' '}
        <em>not paid</em> &mdash; the charge was wrong and no money changed hands, so voiding it (with the source
        charges reverted to un-billed) is clean. <strong>Refunding via a credit note</strong> is for when money{' '}
        <em>was</em> collected &mdash; you cannot un-charge what has been paid without leaving a trace, so you
        record the return instead. A simple rule: <em>unpaid mistake &rarr; cancel; paid mistake &rarr; credit
        note.</em> Systems that let you cancel or edit a <em>paid</em> bill are inviting exactly the audit-trail
        damage credit notes exist to prevent.
      </p>

      <h2>GST and refunds</h2>
      <p>
        Most core hospital treatment is GST-exempt, so a typical refund carries no tax complication. Where a
        refund touches a taxable item &mdash; pharmacy or certain consumables that were billed with GST and then
        returned &mdash; the credit note should reflect that the taxable value and its tax are both being
        reversed, so your GST figures stay correct. Because the credit note is a distinct document referencing the
        original invoice, it gives you a clean basis for that adjustment rather than a silently edited invoice.
        For the wider picture of what is and isn&rsquo;t taxable, see the{' '}
        <Link href="/guides/hospital-gst-billing-rules-india">GST on hospital bills guide</Link>.
      </p>

      <h2>A refund policy worth writing down</h2>
      <p>
        Refunds move money out, so they deserve an explicit, written policy: who can authorise a refund (billing
        managers/administrators, not every counter staff), the requirement that no refund exceeds what was
        actually collected, the requirement of a reason on every one, and the method by which money is returned
        (cash for small amounts, back to the original card/bank for larger). Putting this in writing &mdash; and
        enforcing it in software rather than trusting memory &mdash; is what keeps refunds from becoming the exit
        door that discount controls were built to close.
      </p>

      <h2>How Uyirly offers this</h2>
      <p>
        Uyirly implements refunds exactly as credit notes, with the original bill kept immutable.
      </p>
      <StatGrid stats={[
        { value: 'Immutable bill', label: 'Original never edited' },
        { value: 'Credit note', label: 'CN-YYYY-NNNNN, with reason' },
        { value: 'Capped', label: 'Never more than collected' },
        { value: 'Cash Book', label: 'Cash refund → cash-out' },
      ]} />
      <p>
        On a paid bill, a manager clicks <strong>Refund</strong>, enters the amount (capped at the refundable
        balance), picks the method and a reason, and Uyirly issues a numbered <strong>credit note</strong>. The
        bill itself is untouched; it now shows a <strong>Refunded</strong> line and a <strong>Net
        Collected</strong> figure, plus a list of the credit notes issued against it. Cash refunds flow straight
        into the <Link href="/guides/hospital-cashier-day-book-shift-close-guide">Cash Book</Link> as cash-out,
        so shift reconciliation stays correct, and every refund is audit-logged.
      </p>
      <ScreenMock title="Billing · Refund / Credit Note" caption="Refund against a paid bill — original stays immutable, a credit note records the money returned.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MockStat label="Refundable" value="₹5,000" />
          <MockStat label="Refund amount" value="₹1,000" />
          <MockStat label="Method" value="Cash" />
        </div>
        <MockTable
          head={['Credit note', 'Reason', 'Amount']}
          rows={[
            ['CN-2026-00007', 'Cancelled test', { v: '− ₹1,000', color: '#B45309' }],
          ]}
        />
      </ScreenMock>
      <CalloutBox tone="tip" title="Restrict, cap, and record">
        Keep refunds to billing managers, cap them at the amount actually paid, and require a reason on every
        one. You get clean books, a full audit trail, and cash that still reconciles &mdash; without ever
        rewriting a paid bill.
      </CalloutBox>

      <h2>Refund timelines and keeping the patient informed</h2>
      <p>
        How quickly a refund reaches the patient depends on the method money came in. A cash refund can be handed
        back immediately from the drawer; a refund to a card or bank account takes the usual banking days to
        settle. Patients rarely mind a reasonable delay &mdash; what they mind is uncertainty. Telling them
        clearly at the moment of the refund &mdash; &ldquo;&#8377;1,000 will be credited back to your card in
        3&ndash;5 working days, here is your credit note&rdquo; &mdash; converts a potential complaint into a
        moment of trust. The credit note is the artefact that makes this concrete: it is proof, for both sides,
        of exactly what was returned, by what method, and when.
      </p>
      <p>
        Handing the patient a printed or shared credit note also protects the hospital. If a question comes up
        later &mdash; &ldquo;I never got my refund&rdquo; &mdash; there is a numbered, dated record tying the
        refund to the original bill, the amount, the method and the reason. A refund with no document is a
        he-said-she-said waiting to happen; a refund with a credit note is closed and auditable.
      </p>

      <h2>Refunds and your finance controls together</h2>
      <p>
        Refunds are the last piece of a connected finance story, and they only work if the other pieces are in
        place. Discounts reduce a bill at billing time under{' '}
        <Link href="/guides/hospital-discount-policy-approval-guide">controlled limits</Link>; payments are
        collected and reconciled through the{' '}
        <Link href="/guides/hospital-cashier-day-book-shift-close-guide">cashier day-book</Link>; and refunds
        return money through credit notes that feed back into that same day-book as cash-out. Treated together,
        these give an owner a finance trail with no blind spots: what was charged, what was conceded and why, what
        was collected, and what was returned &mdash; every rupee accounted for, none of it hidden by an edited or
        deleted bill.
      </p>

      <h2>Where it fits</h2>
      <p>
        Credit notes complete the money story alongside{' '}
        <Link href="/guides/ipd-billing-software-explained">bill generation</Link>,{' '}
        <Link href="/guides/hospital-discount-policy-approval-guide">discount controls</Link>, and{' '}
        <Link href="/guides/hospital-cashier-day-book-shift-close-guide">cashier reconciliation</Link>. Together
        they give a hospital a finance trail that is accurate, auditable, and trusted &mdash; charges in,
        discounts governed, refunds recorded, cash reconciled.
      </p>
    </>
  )
}
