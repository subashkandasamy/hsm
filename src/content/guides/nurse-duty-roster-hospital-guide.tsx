import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'Who is responsible for making the nurse duty roster in a hospital?',
    a: 'In most hospitals, rostering is decentralized to each ward or unit’s nurse in-charge (also called the ward manager or charge nurse), not a single central scheduler. A hospital with 1,000 nurses across 30 wards typically has around 30 in-charges, each rostering their own 20–40 nurses — which keeps the problem small and local instead of one impossible global puzzle.',
  },
  {
    q: 'How many nurses should be on duty per shift?',
    a: 'It depends on the ward type and how many beds are occupied. NABH-recommended ratios range from 1 nurse per 6 patients in a general ward to 1:1 in ICU. Required headcount = occupied beds ÷ ratio, rounded up. Our nurse-to-patient ratio guide has the full ward-by-ward table.',
  },
  {
    q: 'Can nurse rostering be automated?',
    a: 'Partially, and that’s usually enough. Copy-forward (repeat last week) and cyclic patterns (a fixed rotation like 7 days morning, 2 off, 7 evening) handle most of the routine scheduling. Coverage auto-fill then checks each shift against the required ratio and fills any gaps from available staff. Full constraint-solver optimization exists but is overkill for hospitals under a few hundred beds.',
  },
  {
    q: 'What happens to the roster when a nurse takes leave?',
    a: 'Planned leave should be requested and approved in advance so the roster generator excludes that nurse automatically and flags the resulting gap for the in-charge to fill. Same-day sick leave is different — it shows up as an attendance gap on the day itself, and the in-charge needs a quick way to see who else is available to step in.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Ask any nurse in-charge at a busy hospital how the duty roster gets made, and you will rarely hear
        &ldquo;software does it.&rdquo; More often it is a WhatsApp group, a printed sheet on the ward notice board, and a
        lot of memory. That works when a ward has 15 nurses. It stops working somewhere between 40 and 100 &mdash;
        and by the time a hospital has 100+ nurses across multiple wards, rostering by memory becomes a genuine
        patient-safety risk, not just an inconvenience.
      </p>
      <p>
        This guide walks through how nurse duty rosters actually get built at scale: who is responsible for
        them, how many nurses a shift really needs, what can be automated, and what happens the moment someone
        calls in sick.
      </p>

      <h2>Who builds the roster &mdash; and why it isn&apos;t one person</h2>
      <p>
        The biggest misconception about rostering 1,000 nurses is that someone has to schedule 1,000 nurses.
        In practice, no one does. Rostering is <strong>decentralized to each ward or unit</strong>. Every ward has a
        nurse in-charge (sometimes called a charge nurse or ward manager) who is responsible only for their own
        unit &mdash; typically 20 to 40 nurses.
      </p>
      <StatGrid stats={[
        { value: '1,000', label: 'nurses in a large hospital' },
        { value: '~30', label: 'wards, each with its own in-charge' },
        { value: '20–40', label: 'nurses per in-charge to roster' },
      ]} />
      <p>
        That reframes the problem entirely. Instead of one impossible 1,000-person puzzle, you have thirty
        small, manageable ones &mdash; each owned by someone who actually knows their team&apos;s skills, preferences
        and constraints. Software should mirror this structure: a ward-scoped roster that an in-charge can
        build and publish for their own unit, not a single global grid that only an administrator can touch.
      </p>

      <h2>How often is a roster actually made?</h2>
      <p>
        Rosters are typically built and published <strong>one to four weeks in advance</strong>, not day by day.
        The daily work is different &mdash; it is attendance and gap-filling, not scheduling from scratch. A
        well-run ward publishes next week&apos;s roster by Thursday or Friday, so nurses know their shifts ahead of
        time and can plan their lives around them.
      </p>

      <h2>How rostering can be automated (without a PhD in optimization)</h2>
      <p>
        Hospitals don&apos;t need a constraint-solving algorithm to get real time savings. Three simple techniques
        cover almost every situation:
      </p>
      <WorkflowDiagram
        title="How a week's roster gets built"
        steps={[
          { label: 'Copy last week', sublabel: 'Clone the previous roster as a draft' },
          { label: 'Apply a pattern', sublabel: 'Stamp a rotation template for cyclic teams' },
          { label: 'Auto-fill gaps', sublabel: 'Fill shortfalls to meet coverage ratios' },
          { label: 'Publish', sublabel: 'In-charge reviews and locks it in' },
        ]}
      />
      <ul>
        <li><strong>Copy-forward</strong> &mdash; clone last week&apos;s roster as this week&apos;s starting draft. This alone covers the majority of edits, since most nurses work a fairly stable pattern week to week.</li>
        <li><strong>Cyclic patterns</strong> &mdash; define a rotation once (for example, 7 days morning, 2 off, 7 days evening, 2 off, 7 days night, 3 off) and let the system stamp it across the weeks for any nurse assigned to that pattern.</li>
        <li><strong>Coverage auto-fill</strong> &mdash; calculate how many nurses each shift needs (see the next section), compare that to who is already scheduled, and automatically assign available nurses to close any gap &mdash; ranked fairly by who has worked the fewest shifts that week.</li>
      </ul>
      <CalloutBox tone="tip" title="You don't need full optimization">
        Full constraint-solver scheduling (the kind airlines use for crew rostering) is real, but it is
        overkill for hospitals under a few hundred beds. Copy-forward plus patterns plus coverage auto-fill
        gets you most of the benefit with none of the complexity.
      </CalloutBox>

      <h2>How many nurses does a shift actually need?</h2>
      <p>
        This is where most rosters go wrong &mdash; not from lack of effort, but from lack of a clear number to
        aim for. The required headcount for a shift is a simple calculation:
      </p>
      <blockquote>required nurses = occupied beds in the ward &divide; nurse-to-patient ratio (rounded up)</blockquote>
      <p>
        The ratio itself depends on the ward type. A general ward in India typically runs at 1 nurse per 6
        patients under NABH norms, while an ICU runs at 1:1. We cover the full ward-by-ward table, including
        HDU, OT, labour room and paediatrics, in our{' '}
        <Link href="/guides/nurse-patient-ratio-india-nabh">nurse-to-patient ratio guide</Link>.
      </p>
      <p>
        A 30-bed general ward with 24 patients admitted at a 1:6 ratio needs 4 nurses that shift. A 10-bed ICU
        at 1:1 needs 10. Once a hospital&apos;s software knows the ratio per ward and the live bed count, it can
        show a simple &ldquo;3 of 4 nurses rostered&rdquo; badge on every shift &mdash; instead of an in-charge discovering
        the shortfall only when the ward is already short-staffed.
      </p>

      <h2>What happens when a nurse takes leave</h2>
      <p>There are two very different situations here, and a roster system needs to handle both:</p>
      <h3>Planned leave</h3>
      <p>
        A nurse requests leave in advance, an in-charge (or admin) approves it, and the roster generator
        automatically excludes that nurse from any shift falling inside the approved dates. If that exclusion
        drops a shift below its required headcount, the gap should be flagged clearly &mdash; not discovered on
        the day itself.
      </p>
      <h3>Same-day sick leave</h3>
      <p>
        This is the harder, higher-stakes case. A nurse who was scheduled doesn&apos;t show up. The system needs
        to surface, immediately, who else is available &mdash; off-duty-but-present staff, on-call nurses, or a
        float pool &mdash; ranked by current workload, so the in-charge can fill the hole in one or two taps
        rather than making phone calls down a list.
      </p>

      <h2>From roster to patient assignment</h2>
      <p>
        The roster answers &ldquo;who is on duty.&rdquo; A separate, related question is &ldquo;which patients does each
        nurse actually care for.&rdquo; That assignment should always be <strong>roster-aware</strong>: when a nurse
        is picked for a patient, the list should default to nurses already rostered to that ward and shift,
        show how many patients they already hold against their capacity, and warn &mdash; without blocking &mdash;
        when a nurse is stretched past the ward&apos;s ratio. A patient can never be refused care for being
        short-staffed; the software&apos;s job is to make the overload visible so help gets pulled in.
      </p>
      <p>
        For the admission and bed-allocation side of this workflow, see our{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">IPD admission &amp; bed management guide</Link>,
        and for how nursing charges connect to attendance and HR records, see{' '}
        <Link href="/guides/hospital-staff-attendance-hr-guide">staff attendance &amp; HR basics for hospitals</Link>.
      </p>

      <h2>Bringing it together</h2>
      <p>
        None of this requires solving rostering as a single hard problem. It requires solving six small ones
        &mdash; who owns the roster, how far ahead it&apos;s published, what each shift actually needs, how leave
        gets excluded automatically, how a same-day gap gets found fast, and how assignment reflects all of
        it &mdash; and none of the six is difficult on its own. The hospitals that struggle with rostering are
        almost always missing one of these pieces entirely, not doing all six badly.
      </p>
      <h2>How Uyirly builds the nurse roster</h2>
      <p>
        <Link href="/hospital-management-software">Uyirly</Link> builds ward rosters on a simple week grid:
        assign nurses to shifts per ward, apply a repeating shift pattern, and see each day&apos;s coverage against
        the ward&apos;s required staffing &mdash; so an understaffed shift is flagged before it happens, not discovered
        on the day. When the roster is ready you publish it, and the staff see their duty.
      </p>
      <ul>
        <li>A week grid of nurses and shifts per ward.</li>
        <li>Repeating shift patterns applied in one click.</li>
        <li>Per-day coverage and shortfall flagged against the required ratio.</li>
        <li>Publish the roster so staff know their shifts.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Rostering is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>. See our <Link href="/guides/nurse-patient-ratio-india-nabh">nurse-to-patient ratio
        guide</Link> for the NABH context, or <Link href="/signup">start a 30-day free trial</Link> with no
        credit card.
      </p>
    </>
  )
}
