import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import BillBreakdown from '@/components/guides/diagrams/BillBreakdown'

export const faqs = [
  {
    q: 'What is a hospital cost estimate?',
    a: 'A hospital cost estimate (or treatment quotation) is an itemised, approximate cost of a planned admission or surgery given to a patient before treatment — room rent for the expected days, the surgery/package fee, likely investigations, medicines and consumables. It is not a bill and not a demand for payment; it sets expectations and helps the patient arrange funds or insurance.',
  },
  {
    q: 'Is a cost estimate the same as a bill?',
    a: 'No. An estimate is prepared before treatment and is approximate — actual charges depend on the patient\'s condition, length of stay and what is actually used. A bill is the real, itemised amount raised during and at the end of treatment. A good system keeps them separate but lets you build the estimate from the same tariffs the bill will use.',
  },
  {
    q: 'Why do hospitals give a cost estimate before admission?',
    a: 'Because "how much will this cost?" is the first question every patient and family asks. A clear written estimate builds trust, avoids billing disputes at discharge, is often required for insurance pre-authorization, and helps the family arrange money or a loan before treatment starts.',
  },
  {
    q: 'Does a cost estimate include GST?',
    a: 'Most core hospital treatment is GST-exempt, so estimates are usually shown as an approximate pre-tax total with a clear disclaimer that actual charges may vary. Taxable items like pharmacy are small relative to the estimate and are reconciled on the final bill.',
  },
  {
    q: 'Can an estimate be built from standard package prices?',
    a: 'Yes. The fastest way is to pull room rent from the ward\'s daily rate, the procedure from your surgery/package tariff list, and add expected lab, radiology and pharmacy lines — so a receptionist can produce a professional quotation in a minute instead of guessing.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Before a patient is admitted for a planned surgery or treatment, the very first thing the family wants
        to know is simple: <strong>how much will this cost?</strong> Answering that clearly, in writing, is one
        of the highest-trust moments in the whole hospital relationship. Answer it well and the family feels
        looked after and can arrange funds or insurance calmly; answer it vaguely &mdash; or not at all &mdash;
        and you invite anxiety now and a billing dispute at discharge.
      </p>
      <p>
        A <strong>hospital cost estimate</strong> (or treatment quotation) is how you answer it. This guide
        explains what a good estimate contains, how it differs from a bill, and how a modern hospital system
        lets your front desk produce a professional quotation in under a minute.
      </p>

      <h2>What a cost estimate is &mdash; and isn&rsquo;t</h2>
      <p>
        An estimate is an <strong>itemised, approximate cost of planned treatment, given before it happens</strong>.
        It is explicitly <em>not</em> a bill: no money is due, no charges are captured, and the final amount will
        differ based on the patient&rsquo;s actual condition, length of stay, and what is really used. The skill
        is being specific enough to be useful while making the &ldquo;approximate&rdquo; nature unmistakable.
      </p>
      <CalloutBox tone="warning" title="An estimate must never read like a bill">
        Always label it clearly as an <strong>estimate / quotation</strong>, show a validity date, and carry a
        plain disclaimer: &ldquo;This is an approximate estimate. Actual charges may vary depending on the
        patient&rsquo;s condition, length of stay, medicines and investigations used. This is not a bill.&rdquo;
        This protects both the patient and the hospital.
      </CalloutBox>

      <h2>What goes into a treatment estimate</h2>
      <p>
        A credible estimate mirrors the shape of the eventual bill, head by head:
      </p>
      <WorkflowDiagram
        title="Building up a treatment estimate"
        steps={[
          { label: 'Room / bed', sublabel: 'Daily rate × expected days' },
          { label: 'Surgery / package', sublabel: 'Procedure tariff' },
          { label: 'Consultation', sublabel: 'Surgeon / physician fees' },
          { label: 'Investigations', sublabel: 'Expected lab & scans' },
          { label: 'Pharmacy & consumables', sublabel: 'Estimated' },
          { label: 'Estimated total', sublabel: '+ validity & disclaimer' },
        ]}
      />
      <p>
        A worked example for a planned procedure with a 3-night stay might look like this:
      </p>
      <BillBreakdown
        title="Sample cost estimate — planned surgery, 3 nights"
        items={[
          { label: 'Room rent — Semi-private', amount: 12000, note: '₹4,000 × 3 nights' },
          { label: 'Surgery package (procedure)', amount: 45000 },
          { label: 'Surgeon & anaesthetist fees', amount: 15000 },
          { label: 'Investigations (lab + radiology)', amount: 6000, note: 'expected' },
          { label: 'Pharmacy & consumables', amount: 8000, note: 'estimated' },
        ]}
        total={86000}
      />
      <p>
        The patient now knows to arrange roughly &#8377;86,000 &mdash; and if they have insurance, this is the
        figure the TPA needs for <Link href="/guides/health-insurance-tpa-claims-guide">cashless
        pre-authorization</Link>.
      </p>

      <h2>Estimate vs bill: keep them separate, share the tariffs</h2>
      <p>
        The estimate and the final bill are different documents with different jobs, but they should be built
        from the <strong>same underlying prices</strong>. If your room rates, procedure/package tariffs and
        consultation fees are defined once, the estimate is assembled from those numbers, and the eventual{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD bill</Link> uses the same rates as charges
        actually accrue. That consistency is what makes the final bill land close to the estimate &mdash; the
        single biggest driver of billing trust.
      </p>

      <h2>Package estimates vs itemised estimates</h2>
      <p>
        There are two ways to quote a planned treatment, and good hospitals use both depending on the case. A{' '}
        <strong>package estimate</strong> gives a single all-inclusive figure for a defined procedure &mdash; say
        &ldquo;cataract surgery, &#8377;25,000, includes surgeon fee, OT, lens and two follow-ups.&rdquo; It is
        simple for the patient, competitive to advertise, and easy to compare, but it only works when the scope is
        genuinely predictable. An <strong>itemised estimate</strong> breaks the cost into heads &mdash; room,
        surgery, fees, investigations, pharmacy &mdash; and is the right choice for variable or complex cases
        where a single number would be misleading.
      </p>
      <p>
        The two are not mutually exclusive: a mature estimate often shows a package line for the fixed core of the
        treatment and itemised lines for the parts that genuinely vary (a longer stay, extra investigations, a
        higher-category room). What matters is that the patient can see what is fixed and what could move, so
        there are no surprises later. Trying to force every treatment into a flat package leads to either the
        hospital losing money on the hard cases or padding the price for everyone; trying to itemise a routine,
        predictable procedure just makes the quote harder to read. Match the format to the predictability of the
        case.
      </p>

      <h2>When the actual bill differs from the estimate</h2>
      <p>
        An estimate is a forecast, and forecasts miss &mdash; a patient stays an extra two nights, needs an
        investigation nobody anticipated, or recovers faster and costs less. That is normal and expected. What
        turns a variance into a dispute is <strong>silence</strong>: the family hears one number at admission and
        sees a very different one at discharge with no explanation in between.
      </p>
      <p>
        The professional way to handle this is to keep the family informed as reality diverges from the estimate,
        especially for a long or complicated stay. If the running charges are clearly higher than what was quoted
        &mdash; because the clinical course changed &mdash; that conversation should happen <em>during</em> the
        stay, not as a shock at checkout. A running or interim bill that the family can see at any point during an
        admission is the best antidote: the estimate sets expectations, the running bill keeps them current, and
        the final bill holds no surprises. This is exactly why estimates and{' '}
        <Link href="/guides/ipd-billing-software-explained">live IPD billing</Link> belong together.
      </p>

      <h2>Estimates and insurance pre-authorization</h2>
      <p>
        For an insured patient, the estimate does double duty: it is also the basis for{' '}
        <strong>cashless pre-authorization</strong>. Before a planned admission, the hospital submits the expected
        cost to the patient&rsquo;s TPA or insurer, who approves a sanctioned amount against which treatment can
        proceed without the patient paying up front. A clear, itemised estimate makes that submission faster and
        more credible &mdash; the TPA can see exactly what the money is for. If the actual course exceeds the
        sanctioned amount, an enhancement request is raised mid-stay. The tighter your estimate, the smoother the
        whole cashless journey; a vague estimate leads to under-sanctioning and awkward top-up conversations
        later. The full pre-auth and settlement flow is covered in the{' '}
        <Link href="/guides/health-insurance-tpa-claims-guide">TPA claims guide</Link>.
      </p>

      <h2>How Uyirly offers this</h2>
      <p>
        Uyirly has a dedicated <strong>Cost Estimates</strong> area (under Billing) built for exactly this
        moment. A receptionist creates an estimate for a patient &mdash; or even a walk-in enquiry with just a
        name and phone &mdash; and assembles it from the hospital&rsquo;s real tariffs:
      </p>
      <StatGrid stats={[
        { value: 'Room ×  days', label: 'Auto from ward daily rate' },
        { value: 'Packages', label: 'From your procedure tariffs' },
        { value: 'Any line', label: 'Add lab / scan / pharmacy' },
        { value: '< 1 min', label: 'To a printable quotation' },
      ]} />
      <Screenshot
        src="/guides/estimate-detail.png" width={2560} height={1936}
        alt="A cost estimate on the hospital letterhead, itemised by category with quantities, unit prices, an estimated total, the amount in words and a note that it is not a bill"
        caption="The estimate a family is handed: itemised, valid until a date, and explicit that it is not a demand for payment."
      />
      <p>
        The result prints as a clean, hospital-branded <strong>&ldquo;COST ESTIMATE&rdquo;</strong> document
        with your logo, a validity date, the itemised heads, the estimated total in words, and the disclaimer
        built in. It can be printed for the family or kept on file. Crucially, it is <strong>not a bill</strong>
        &mdash; nothing is charged &mdash; and because it&rsquo;s built from the same tariffs the admission will
        use, the final bill lands close to what the family was told.
      </p>
      <CalloutBox tone="tip" title="Estimate first, admit with confidence">
        Give every planned admission and surgery a written estimate up front. It answers the family&rsquo;s
        biggest question, doubles as the figure for insurance pre-auth, and all but eliminates &ldquo;why is the
        bill more than you said?&rdquo; arguments at discharge.
      </CalloutBox>

      <h2>Where estimates fit</h2>
      <p>
        A cost estimate is the front door to the whole billing journey: estimate &rarr; admission &rarr; charges
        accrue &rarr; <Link href="/guides/ipd-billing-software-explained">combined IPD bill</Link> at discharge,
        with insurance running alongside via <Link href="/guides/health-insurance-tpa-claims-guide">TPA
        pre-authorization and settlement</Link>. Getting the estimate right sets the tone for everything that
        follows &mdash; and it costs you nothing but a minute at the front desk.
      </p>
    </>
  )
}
