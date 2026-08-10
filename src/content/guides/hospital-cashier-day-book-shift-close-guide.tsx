import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import ScreenMock, { MockStat, MockTable } from '@/components/guides/diagrams/ScreenMock'

export const faqs = [
  {
    q: 'What is a cashier day-book in a hospital?',
    a: 'A cashier day-book is the daily record of all money collected at the hospital — bill payments, advance deposits and refunds — grouped by payment method (cash, card, UPI, bank) and by cashier. It is the single view a finance person uses to see exactly how much came in on a given day and who collected it.',
  },
  {
    q: 'What is a shift close or cash reconciliation?',
    a: 'At the end of a shift, a cashier counts the physical cash in the drawer and compares it to what the system says they collected in cash. The difference is the variance. Recording this "shift close" (with the counted amount, the expected amount and the variance) creates an accountable handover and is the main control against cash leakage.',
  },
  {
    q: 'Why should advance deposits count as cash collected but not advance adjustments?',
    a: 'When a patient pays a ₹50,000 deposit, that is real cash entering the drawer today. When that deposit is later applied to a bill, no new money changes hands — it is an internal credit. Counting both would double-count. Correct cash accounting counts the deposit once (as cash-in) and treats the later adjustment as a non-cash entry.',
  },
  {
    q: 'How does a shift-close handover slip help?',
    a: 'It is a printed record showing the cashier, the time window, expected vs counted cash, the variance, and card/UPI totals, with signature lines for the person handing over and the person receiving. It makes every drawer handover accountable and gives finance an audit trail.',
  },
  {
    q: 'What causes a cash variance?',
    a: 'Common causes are giving wrong change, a payment recorded under the wrong method, an un-recorded cash refund, or simple miscounting. A small variance is normal; a repeated or large variance is a signal to investigate a process or a person.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Every rupee a hospital collects passes through a front desk or cashier &mdash; consultation fees, bill
        payments, IPD deposits, the occasional refund. If that money is only tracked as individual receipts,
        nobody can answer two questions that the owner and the auditor care about most:{' '}
        <strong>how much did we actually collect today, and does the cash in the drawer match?</strong> The
        answer is a <strong>cashier day-book</strong> and a disciplined <strong>shift-close reconciliation</strong>.
      </p>
      <p>
        This guide explains how hospital cash control works &mdash; the day-book, the shift close, and the one
        accounting subtlety (advances) that trips up most systems &mdash; and how to run it without a
        spreadsheet.
      </p>

      <h2>The cashier day-book</h2>
      <p>
        A day-book is simply <strong>every money movement for a day, in one place</strong>. Not a pile of
        receipts &mdash; a single view that groups collections by <strong>payment method</strong> (cash, card,
        UPI, bank transfer) and by <strong>cashier</strong>, so finance can see the shape of the day at a
        glance and drill into any line.
      </p>
      <WorkflowDiagram
        title="What flows into the day-book"
        steps={[
          { label: 'Bill payments', sublabel: 'Cash / card / UPI / bank' },
          { label: 'Advance deposits', sublabel: 'IPD collections' },
          { label: 'Refunds', sublabel: 'Money paid out (−)' },
          { label: 'Day-book', sublabel: 'Grouped by method & cashier' },
        ]}
      />
      <p>
        Notice refunds are <em>negative</em> &mdash; money leaving the drawer &mdash; and the day-book nets them
        out. The result is a truthful &ldquo;net collected&rdquo; figure per method and per cashier.
      </p>

      <h2>The one subtlety that breaks most systems: advances</h2>
      <p>
        Hospitals take <strong>advance deposits</strong>, especially for IPD. Here is where naive cash reports go
        wrong. When a patient pays a &#8377;50,000 deposit, that is <strong>real cash in the drawer today</strong>.
        Later, that deposit is <strong>applied</strong> to their bills &mdash; but no new money changes hands;
        it is an internal credit moving from &ldquo;deposit&rdquo; to &ldquo;bill paid.&rdquo;
      </p>
      <CalloutBox tone="warning" title="Count the deposit once, not twice">
        A correct cash-in figure counts the <strong>deposit</strong> when it is collected, and <strong>ignores
        the later adjustment</strong> of that deposit against bills. Systems that count both double-count
        collections; systems that count only bill payments miss the deposit entirely. The right definition is:
        <em> real bill payments + advance deposits − refunds</em>.
      </CalloutBox>
      <p>
        This is exactly why a bill&rsquo;s &ldquo;paid&rdquo; amount alone is a poor measure of daily collection
        &mdash; an IPD bill paid from an advance represents money that arrived on a different day. Cash control
        has to be built on money movements, not on bill status. (For how advances flow through billing, see the{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link>.)
      </p>

      <h2>The shift close &amp; cash reconciliation</h2>
      <p>
        At the end of a shift, the cashier physically counts the cash drawer and compares it to what they
        <em>should</em> have collected in cash. That comparison &mdash; and recording it &mdash; is the single
        most important cash control a hospital has.
      </p>
      <WorkflowDiagram
        title="Closing a shift"
        steps={[
          { label: 'Expected cash', sublabel: 'System: cash collected − paid out' },
          { label: 'Count drawer', sublabel: 'Physical cash' },
          { label: 'Variance', sublabel: 'Counted − expected' },
          { label: 'Handover slip', sublabel: 'Signed record' },
        ]}
      />
      <p>
        The <strong>variance</strong> (counted minus expected) is the number that matters. Zero is ideal; a small
        difference is human; a repeated or large gap is a signal to investigate &mdash; wrong change, a payment
        logged under the wrong method, an unrecorded cash refund, or something that needs a harder look. Either
        way, it is now <strong>on the record</strong>, tied to a named cashier and a time window.
      </p>

      <h2>Multiple cashiers and clean handovers</h2>
      <p>
        Most hospitals run more than one collection point &mdash; an OPD counter, an IPD/billing desk, sometimes a
        pharmacy till &mdash; and each changes hands across shifts. Cash control only works if it is
        <strong> per cashier</strong>, not just per hospital. Each person is accountable for the money they
        collected during their own window, and the day-book must be able to show &ldquo;how much did Priya collect
        on the morning shift, and did her drawer match?&rdquo; independently of everyone else.
      </p>
      <p>
        The handover is the risky moment: if one cashier hands a drawer to the next without a recorded count,
        neither can be held responsible for a later shortfall. A disciplined process closes each shift with a
        count before the next begins, so responsibility passes cleanly. A printed, signed handover slip &mdash;
        showing who handed over, who received, the expected and counted cash, and the variance &mdash; makes that
        transfer accountable and gives finance a paper trail for every drawer, every shift.
      </p>

      <h2>What to do about a variance</h2>
      <p>
        A variance is information, not automatically a crime. The response should scale with the size and
        pattern:
      </p>
      <ul>
        <li><strong>A few rupees, occasionally</strong> &mdash; almost always rounding or change-making; note it
          and move on.</li>
        <li><strong>A payment logged under the wrong method</strong> &mdash; e.g. a card payment recorded as cash
          &mdash; shows up as a cash shortfall with a matching card excess; correctable and worth a quick process
          reminder.</li>
        <li><strong>An unrecorded cash refund</strong> &mdash; money went out of the drawer without a credit note;
          this is why refunds must always be recorded (see the{' '}
          <Link href="/guides/hospital-refund-credit-note-guide">refunds &amp; credit notes guide</Link>).</li>
        <li><strong>A repeated or growing shortfall for one cashier</strong> &mdash; the real signal; now you have
          dated, named records to investigate a person or a process, instead of a vague suspicion.</li>
      </ul>
      <p>
        The point of recording variances is not to punish honest mistakes &mdash; it is to make patterns visible.
        A hospital that has never measured its variances has no idea whether it is losing money at the counter;
        one that measures every shift knows within a day.
      </p>

      <h2>The collection reports finance actually needs</h2>
      <p>
        Beyond the drawer count, finance and the owner want a small set of numbers the day-book should answer
        instantly: total collected today and this month; the split by method (how much cash vs card vs UPI vs
        bank, which matters for banking and for spotting a sudden shift in patient behaviour); collection by
        cashier; and refunds paid out. Kept in one live view, these turn &ldquo;how are we doing on
        collections?&rdquo; from a week-end spreadsheet exercise into a glance &mdash; and they must reconcile
        with what the <Link href="/guides/ipd-billing-software-explained">billing</Link> side says was charged and
        paid, or one of the two is wrong.
      </p>

      <h2>How Uyirly offers this</h2>
      <p>
        Uyirly includes a <strong>Cash Book</strong> (under Billing) that computes all of this live &mdash; no
        spreadsheet, no manual tally.
      </p>
      <StatGrid stats={[
        { value: 'Day Book', label: 'Every movement, by method & cashier' },
        { value: 'My Shift', label: 'Close with live expected cash' },
        { value: 'Variance', label: 'Counted vs expected, recorded' },
        { value: 'Handover slip', label: 'Printable, signed' },
      ]} />
      <p>
        The <strong>Day Book</strong> tab shows, for any date, summary cards (Cash / Card / UPI / Bank / Refunds
        / Net), a per-cashier breakdown, and the full list of movements &mdash; every bill payment, advance
        deposit and refund. It counts money the right way: advance <em>deposits</em> are in, advance
        <em> adjustments</em> are excluded, refunds are netted out.
      </p>
      <ScreenMock title="Billing · Cash Book · Day Book" caption="A day's collections, grouped by method and cashier — advances counted once, refunds netted.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MockStat label="Cash" value="₹5,00,000" />
          <MockStat label="Card" value="₹0" color="#6366F1" />
          <MockStat label="UPI" value="₹0" color="#8B5CF6" />
          <MockStat label="Net collected" value="₹5,00,000" color="#0F172A" />
        </div>
        <MockTable
          head={['Time', 'Type', 'Method', 'Amount']}
          rows={[
            ['1:33 PM', 'Advance deposit', 'Cash', { v: '₹5,00,000', color: '#0F172A' }],
            ['2:10 PM', 'Bill payment (advance)', '—', { v: 'not counted', color: '#94A3B8' }],
          ]}
        />
      </ScreenMock>
      <p>
        The <strong>My Shift</strong> tab shows a cashier their live <strong>expected cash</strong> since their
        last close, plus card/UPI/bank totals. They enter the counted cash, see the <strong>variance</strong>
        instantly, add a note, and close &mdash; producing a printable <strong>handover slip</strong> with
        signature lines. The <strong>History</strong> tab keeps every close for audit.
      </p>
      <ScreenMock title="Billing · Cash Book · My Shift" caption="Close the shift: expected vs counted cash, variance, and a signed handover slip.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <MockStat label="Expected cash" value="₹5,00,000" color="#0D9488" />
          <MockStat label="Counted" value="₹4,99,800" />
          <MockStat label="Variance" value="−₹200 (short)" color="#B91C1C" />
        </div>
      </ScreenMock>
      <CalloutBox tone="tip" title="Make shift-close a habit">
        A 60-second count-and-close at every handover turns cash from a black box into an accountable, auditable
        trail &mdash; the simplest, highest-leverage fraud control a hospital can adopt.
      </CalloutBox>

      <h2>Why it matters</h2>
      <p>
        Cash leakage is quiet and cumulative. A day-book plus shift-close reconciliation makes every rupee
        traceable to a method, a cashier and a time &mdash; deterring leakage, catching honest mistakes early,
        and giving the owner a daily collection figure they can actually trust. It pairs naturally with{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing</Link> and{' '}
        <Link href="/guides/hospital-bill-format-ipd-opd-sample">clean bill formats</Link> to close the loop
        from charge to collected cash.
      </p>
    </>
  )
}
