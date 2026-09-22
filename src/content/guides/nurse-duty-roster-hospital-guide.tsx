import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'Who is responsible for making the nurse duty roster in a hospital?',
    a: 'In most hospitals rostering is decentralised to each unit’s nurse in-charge, not a single central scheduler. A hospital with 1,000 nurses across 30 wards has around 30 in-charges, each rostering their own 20–40 nurses — which keeps the problem small and local instead of one impossible global puzzle.',
  },
  {
    q: 'How many nurses should be on duty per shift?',
    a: 'It depends on the unit and on how many beds are actually occupied. Required headcount = occupied beds ÷ the nurse-to-patient ratio, rounded up, with a floor so a near-empty ward is never left unstaffed. NABH-informed ratios run from about 1:6 in a general ward to 1:1 in intensive care.',
  },
  {
    q: 'Can nurse rostering be automated?',
    a: 'Partly, and that is usually enough. Copying last week forward, stamping a cyclic pattern, and filling the remaining gaps against the coverage ratio handle most routine scheduling. Full constraint-solver optimisation exists but is overkill for hospitals under a few hundred beds.',
  },
  {
    q: 'What happens to the roster when a nurse takes leave?',
    a: 'Approved leave should be excluded automatically — the generator must not schedule someone who is already off, and the resulting gap should be flagged. Same-day sick leave is a different problem: nothing can plan for it, so what matters is how quickly the in-charge can see who else is free.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Ask a nurse in-charge how the duty roster gets made and you will rarely hear &ldquo;software does
        it&rdquo;. More often it is a WhatsApp group, a sheet on the notice board, and a lot of memory. That
        works for fifteen nurses. Somewhere past forty it stops, and past a hundred it becomes a
        patient-safety problem rather than an inconvenience.
      </p>

      <h2>The roster is not one big problem</h2>
      <p>
        The common mistake is to imagine that rostering a thousand nurses means scheduling a thousand nurses.
        Nobody does that. Rostering is owned per unit, by someone who knows that team.
      </p>
      <StatGrid stats={[
        { value: '1,000', label: 'nurses in a large hospital' },
        { value: '~30', label: 'units, each with its own in-charge' },
        { value: '20–40', label: 'nurses per in-charge to roster' },
      ]} />
      <p>
        Software should mirror that, and Uyirly does: the roster is scoped to a{' '}
        <strong>nursing unit</strong> — a block, floor and wing — and a nurse named as that unit&apos;s
        in-charge can build, publish and approve leave for it without being an administrator of the whole
        hospital.
      </p>

      <h2>Step 1 — The week grid</h2>
      <Screenshot
        src="/guides/nurse-roster.png" width={2560} height={990}
        alt="Nurse roster week grid for unit A · 1 · East, 21 to 27 September, with two nurses down the side and each day a dropdown showing Night or Morning, a tick on covered days and 2 short on the uncovered Sunday"
        caption="One unit, one week. Each cell is a shift; each column says whether that day is covered."
      />
      <p>
        Nurses down the side, days across the top, a shift in each cell. Two things in this picture are worth
        pointing at:
      </p>
      <ul>
        <li>
          <strong>The unit selector.</strong> The grid is always one unit at a time, because that is the
          scope a person can actually hold in their head.
        </li>
        <li>
          <strong>The header under each day.</strong> A tick means the day meets its required staffing;{' '}
          <em>2 short</em> means it does not. That number is computed, not typed — more on it below.
        </li>
      </ul>
      <p>
        A nurse can hold only <strong>one shift per day</strong> across the whole hospital, which the
        database enforces rather than trusting the grid. You cannot accidentally roster the same person into
        two units on the same morning.
      </p>

      <h2>Step 2 — Not building it from scratch</h2>
      <WorkflowDiagram
        title="How a week actually gets built"
        steps={[
          { label: 'Copy last week', sublabel: 'Most nurses repeat' },
          { label: 'Apply a pattern', sublabel: 'For cyclic teams' },
          { label: 'Auto-fill', sublabel: 'Close the ratio gaps' },
          { label: 'Publish', sublabel: 'Drafts become the rota' },
        ]}
      />
      <ul>
        <li>
          <strong>Copy last week</strong> clones the previous week into the empty slots. It leaves anything
          already filled alone, so it is safe to press on a half-built week.
        </li>
        <li>
          <strong>Patterns</strong> stamp a repeating rotation — say seven mornings, two off, seven nights,
          three off — across the weeks for the nurses assigned to it, anchored to a start date so the cycle
          stays in phase from one month to the next.
        </li>
        <li>
          <strong>Auto-fill</strong> works out what each shift needs, counts who is already on, and assigns
          the shortfall from available nurses — picking the nurse with the fewest shifts so far, so the
          machine does not quietly overwork whoever happens to sort first.
        </li>
      </ul>
      <CalloutBox tone="tip" title="All three skip anyone on approved leave">
        Whichever route builds the week, a nurse with approved leave covering that date is never staged into
        it. That is the difference between leave being recorded and leave being <em>respected</em> — and the
        thing to test in a demo rather than take on faith.
      </CalloutBox>
      <p>
        Everything built this way lands as a <strong>draft</strong>, shown dashed on the grid. Publishing is a
        separate, deliberate act, because a roster staff can see is a promise and a half-finished one causes
        more trouble than no roster at all.
      </p>

      <h2>Step 3 — How &ldquo;2 short&rdquo; is calculated</h2>
      <Screenshot
        src="/guides/roster-coverage.png" width={2560} height={1980}
        alt="Shifts and coverage settings showing morning, evening and night shift types with their hours, a coverage ratios card, and a unit in-charges card"
        caption="Shift types, the ratio each unit runs at, and who is allowed to roster it."
      />
      <p>
        Required staff for a shift is <strong>occupied beds ÷ ratio, rounded up</strong>, with a minimum so a
        quiet ward is never left empty. Both the ratio and the minimum are set per unit and per shift,
        because an intensive care unit at 1:2 and a general ward at 1:6 are not the same question. Units with
        nothing set fall back to 1:6.
      </p>
      <p>
        The bed count is live — it is the patients actually admitted into that unit&apos;s rooms right now, not
        the ward&apos;s capacity. A ward that is half empty does not demand a full complement, and one that
        has filled up says so on the roster before the shift starts rather than after.
      </p>
      <p>
        Note the shift types in the screenshot: this hospital runs two twelve-hour shifts, so <em>evening</em>
        is switched off and does not count towards coverage. Turning a shift off is how a ward says which
        pattern it runs, rather than showing a permanent shortfall for a shift nobody works.
      </p>
      <p>
        For the ward-by-ward ratio table and the NABH context behind it, see our{' '}
        <Link href="/guides/nurse-patient-ratio-india-nabh">nurse-to-patient ratio guide</Link>.
      </p>

      <h2>Step 4 — Leave</h2>
      <Screenshot
        src="/guides/roster-leave.png" width={2560} height={856}
        alt="Leave requests list showing an approved annual leave for one nurse and a pending casual leave for another with approve and reject buttons"
        caption="Requested ahead, approved or rejected by the in-charge, and then honoured by the roster."
      />
      <p>
        Planned leave is requested with a type and a date range and approved by the in-charge or an admin.
        From that moment it is a fact the roster respects: the generator will not place that nurse on those
        days, and the shortfall shows up in the week header where someone can still do something about it.
      </p>
      <p>
        Same-day sickness is the harder case, and no scheduler can plan for it. What helps is speed — seeing
        immediately who else is free. That is exactly what the nurse picker does when a patient is assigned
        (below).
      </p>

      <h2>From roster to patient assignment</h2>
      <p>
        The roster answers &ldquo;who is on duty&rdquo;. A separate question is &ldquo;who is looking after
        this patient&rdquo;, and the assignment is roster-aware: the picker lists nurses{' '}
        <strong>rostered to that unit and shift first</strong>, then everyone else, with anyone on approved
        leave sorted to the bottom and marked. Each nurse shows how many patients they already hold against
        the unit&apos;s ratio, so an overloaded nurse is visible before another patient is added.
      </p>
      <p>
        It warns rather than blocks. A patient can never be refused care because the ward is short — the job
        of the software is to make the overload visible so help gets pulled in.
      </p>
      <p>
        For the admission and bed side of this, see the{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">IPD admission and bed management guide</Link>;
        for attendance on the day, see{' '}
        <Link href="/guides/hospital-staff-attendance-hr-guide">staff attendance</Link>.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A week grid per nursing unit, built and published by that unit&apos;s in-charge.</li>
        <li>One shift per nurse per day, enforced in the database rather than by convention.</li>
        <li>Copy last week, cyclic patterns anchored to a start date, and ratio-driven auto-fill.</li>
        <li>Auto-fill that spreads work by who has the fewest shifts so far.</li>
        <li>Approved leave excluded from every generation route.</li>
        <li>Per-day shortfall from live occupied beds against a per-unit, per-shift ratio and minimum.</li>
        <li>Shift types a ward can switch off when it does not run them.</li>
        <li>Drafts until published, so staff never read a half-built rota.</li>
        <li>A roster-aware nurse picker showing load against capacity at patient assignment.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Rostering is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>. See the{' '}
        <Link href="/guides/nurse-patient-ratio-india-nabh">nurse-to-patient ratio guide</Link> for the NABH
        context, or <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
