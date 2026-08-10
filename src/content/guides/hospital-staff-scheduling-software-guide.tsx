import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import RatioBarChart from '@/components/guides/diagrams/RatioBarChart'
import ScreenMock, { MockStat, MockTable } from '@/components/guides/diagrams/ScreenMock'

export const faqs = [
  {
    q: 'What is hospital staff scheduling software?',
    a: 'Hospital staff scheduling software plans and publishes who works when — doctors\' OPD consulting hours, nurses\' shift rosters across wards, and duty coverage for each shift — in one place. A good system also enforces nurse-to-patient ratios, handles leave requests and approvals, and links to attendance so the published plan and the actual worked hours stay connected.',
  },
  {
    q: 'How is a nurse duty roster different from doctor scheduling?',
    a: 'A nurse duty roster assigns nurses to shifts (morning / evening / night) in a specific ward or nursing unit for each day, and must meet a minimum nurse-to-patient ratio. Doctor scheduling is about publishing each doctor\'s weekly OPD consulting hours so patients can be booked into the right session — it is availability, not shift coverage.',
  },
  {
    q: 'What is a nursing unit or nursing station?',
    a: 'A nursing unit (or nursing station) is a group of rooms — often a block, floor and wing, e.g. "Block A, 1st floor, B wing" — staffed together from one central station. Rostering and nurse-to-patient ratios are applied per nursing unit rather than per individual room, which is how most real hospitals are actually organised.',
  },
  {
    q: 'How does scheduling software help with NABH nurse-to-patient ratios?',
    a: 'It lets you set the required ratio per unit (for example 1:6 in a general ward, 1:1 in ICU), then flags a shift as under-staffed when the assigned nurses do not meet that ratio for the number of occupied beds — so the gap is visible before the shift starts, not after an incident.',
  },
  {
    q: 'Can staff request leave inside the scheduling system?',
    a: 'Yes. Staff raise a leave request, an authorised approver accepts or rejects it, and an approved leave removes that person from the roster for those dates so they are not scheduled by mistake — keeping the published roster and who is actually available in sync.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        In a hospital, &ldquo;who is on duty right now?&rdquo; is not a trivial question. A single day involves
        doctors running OPD sessions, nurses covering morning, evening and night shifts across several wards,
        approved leave taking people out, and a legal obligation to keep enough nurses on the floor for the
        number of patients admitted. Run on a paper roster or a WhatsApp group, this quietly breaks &mdash; a
        shift goes uncovered, a doctor&rsquo;s clinic is double-booked, or a ward slips below its
        nurse-to-patient ratio without anyone noticing until it matters.
      </p>
      <p>
        <strong>Hospital staff scheduling software</strong> puts all of this in one place: doctor OPD hours,
        nurse duty rosters, per-unit coverage, leave, and attendance. This guide explains how hospital
        scheduling actually works &mdash; doctors and nurses are scheduled very differently &mdash; and how a
        modern system keeps the published plan honest.
      </p>

      <h2>What &ldquo;staff scheduling&rdquo; covers in a hospital</h2>
      <p>
        Hospital scheduling is really three connected jobs, each with its own rhythm:
      </p>
      <ul>
        <li><strong>Doctor availability (OPD hours)</strong> &mdash; the weekly consulting sessions each doctor
          runs, so appointments and tokens can only be booked when the doctor is actually in.</li>
        <li><strong>Nurse duty roster</strong> &mdash; which nurses cover which shift, in which ward or nursing
          unit, every day.</li>
        <li><strong>Coverage &amp; compliance</strong> &mdash; making sure each shift meets the required
          nurse-to-patient ratio, and that leave and attendance are reflected so the roster is trustworthy.</li>
      </ul>
      <p>
        Treating these as one &ldquo;scheduling&rdquo; problem is what causes chaos. The rest of this guide
        takes them in turn.
      </p>

      <h2>Doctor OPD hours: scheduling availability, not shifts</h2>
      <p>
        A consultant does not work a &ldquo;shift&rdquo; the way a nurse does &mdash; they hold{' '}
        <strong>OPD sessions</strong>: e.g. Dr. Aanya sees patients Mon/Wed/Fri, 10:00&ndash;13:00. Scheduling a
        doctor means publishing those weekly windows so the front desk (and patients booking online) can only
        place appointments inside them. In a token-based OPD &mdash; how most Indian hospitals run &mdash; this
        also decides which day&rsquo;s queue a patient joins. If you want the deeper mechanics of tokens and
        queues, see the{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD token &amp; queue management guide</Link>.
      </p>
      <CalloutBox tone="info" title="Why doctor hours belong in scheduling, not just the calendar">
        When a doctor&rsquo;s availability lives in the scheduling system, an unavailable day automatically
        greys out for booking, follow-up recommendations respect it, and the OPD queue for that doctor only
        forms on days they actually consult. Kept on paper, double-bookings and &ldquo;doctor on leave, patient
        already here&rdquo; situations are inevitable.
      </CalloutBox>

      <h2>The nurse duty roster</h2>
      <p>
        Nursing is shift work. A duty roster assigns each nurse to a <strong>shift</strong> &mdash; typically
        morning, evening and night &mdash; for a specific ward or nursing unit, for each date. Build it well and
        every shift has known, adequate cover; build it badly and you get last-minute scrambles, unfair
        distribution, and burnout. The mechanics of building a large roster (rotation, fairness, weekly
        publishing) are covered in depth in{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">how to build a nurse duty roster</Link>; here we
        focus on how it fits the wider scheduling picture.
      </p>
      <WorkflowDiagram
        title="A day on the nursing roster"
        steps={[
          { label: 'Nursing unit', sublabel: 'Block / floor / wing' },
          { label: 'Shift', sublabel: 'Morning / evening / night' },
          { label: 'Assign nurses', sublabel: 'Against occupied beds' },
          { label: 'Check ratio', sublabel: 'Meets required cover?' },
          { label: 'Publish', sublabel: 'Roster visible to staff' },
        ]}
      />

      <h2>Nursing units: how real hospitals are organised</h2>
      <p>
        Here is where paper rosters and simplistic software fall down. A ward is rarely a single room. In
        practice a hospital is laid out as <strong>blocks, floors and wings</strong> &mdash; for example
        &ldquo;Block A, 1st floor, B wing&rdquo; might hold ten mixed rooms, all staffed together from one{' '}
        <strong>central nursing station</strong>. Rostering and ratios apply to that <strong>nursing
        unit</strong>, not to each individual room.
      </p>
      <p>
        Modelling this correctly matters because coverage is a property of the <em>unit</em>: you assign a set
        of nurses to the station for a shift, and they cover every occupied bed across its rooms. A system that
        only understands &ldquo;rooms&rdquo; forces you to fake this, and the ratio maths stops reflecting
        reality.
      </p>
      <ScreenMock title="Scheduling · Nurse roster" caption="A nursing unit (block / floor / wing) rostered per shift, with live coverage against occupied beds.">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <MockStat label="Nursing unit" value="Block A · 1F · B wing" />
          <MockStat label="Occupied beds" value="8 / 10" />
          <MockStat label="Required ratio" value="1 : 6" />
        </div>
        <MockTable
          head={['Shift', 'Nurses assigned', 'Cover']}
          rows={[
            ['Morning', 'Priya, Anjali', { v: 'OK', color: '#15803D' }],
            ['Evening', 'Fatima', { v: 'OK', color: '#15803D' }],
            ['Night', '—', { v: 'Under-staffed', color: '#B91C1C' }],
          ]}
        />
      </ScreenMock>

      <h2>Nurse-to-patient ratio &amp; NABH compliance</h2>
      <p>
        The number of nurses a shift needs is not a matter of preference &mdash; NABH and good clinical
        practice set expected <strong>nurse-to-patient ratios</strong> that vary by care level. Scheduling
        software earns its keep by making the required ratio configurable per unit and then <em>flagging</em> a
        shift that falls short for the beds actually occupied.
      </p>
      <RatioBarChart
        title="Typical nurse-to-patient ratios by care level"
        rows={[
          { label: 'ICU / Critical', ratio: 1, note: '1:1 – 1:2' },
          { label: 'HDU / Step-down', ratio: 3, note: '~1:3' },
          { label: 'General ward', ratio: 6, note: '~1:6' },
        ]}
      />
      <p>
        The full picture of ratios, care levels and what NABH expects is in the{' '}
        <Link href="/guides/nurse-patient-ratio-india-nabh">nurse-to-patient ratio (NABH) guide</Link>. The
        scheduling job is simply to hold the target per unit and surface the gap <em>before</em> the shift, so a
        supervisor can pull in cover rather than discover the shortfall after an incident.
      </p>

      <h2>Leave requests &amp; approvals</h2>
      <p>
        A roster is only as trustworthy as the leave data behind it. If staff request leave in a separate book,
        someone inevitably gets scheduled on a day they are off. Bringing leave into the same system closes the
        loop:
      </p>
      <WorkflowDiagram
        title="Leave that actually protects the roster"
        steps={[
          { label: 'Request', sublabel: 'Staff apply for dates' },
          { label: 'Approve / reject', sublabel: 'Authorised approver' },
          { label: 'Roster blocks', sublabel: 'Person not schedulable' },
          { label: 'Coverage recheck', sublabel: 'Gap flagged if any' },
        ]}
      />
      <p>
        Once leave is approved, that person should simply not be assignable for those dates &mdash; and if their
        absence drops a shift below ratio, that shift should light up as needing cover. Leave, roster and ratio
        are one connected system, not three.
      </p>

      <h2>Attendance closes the loop</h2>
      <p>
        Scheduling says who <em>should</em> be on duty; attendance records who <em>actually</em> was. Keeping
        them in the same platform means you can compare planned versus worked hours, spot no-shows, and feed
        accurate hours into payroll and HR. The attendance side is covered in the{' '}
        <Link href="/guides/hospital-staff-attendance-hr-guide">staff attendance &amp; HR guide</Link> &mdash;
        for scheduling, the key point is that the roster is the plan and attendance is the truth, and a good
        system holds both.
      </p>

      <h2>How far ahead to publish, and why cadence matters</h2>
      <p>
        A roster that appears the night before is almost as bad as no roster. Staff need enough notice to plan
        childcare, travel and personal commitments, and supervisors need a window to fix gaps before they become
        emergencies. Most well-run hospitals publish the nursing roster <strong>at least a week in advance</strong>,
        in a fixed weekly cadence, so everyone knows exactly when the next roster drops.
      </p>
      <p>
        A predictable cadence also makes leave manageable: if the roster for next week is built every Thursday,
        leave requests for that week must land before Thursday, and the approver can see the coverage impact
        while there is still time to arrange a swap. When rosters are published erratically, leave requests and
        shift assignments collide constantly &mdash; the software should make the cadence effortless so it can
        actually be kept. The same discipline applies to doctor OPD hours: publish changes ahead of time so
        already-booked patients are never stranded by a session that quietly moved.
      </p>

      <h2>Common scheduling mistakes</h2>
      <ul>
        <li><strong>Rostering by room, not by unit</strong> &mdash; coverage and ratios only make sense at the
          nursing-unit (block/floor/wing) level.</li>
        <li><strong>Separating leave from the roster</strong> &mdash; guarantees someone is scheduled on an
          approved day off.</li>
        <li><strong>Treating doctor hours like nurse shifts</strong> &mdash; doctors need published OPD
          availability that gates booking, not shift assignments.</li>
        <li><strong>Checking ratios after the fact</strong> &mdash; the gap must be visible before the shift, or
          it is just a report of a problem that already happened.</li>
        <li><strong>No single source of truth</strong> &mdash; a roster on paper, leave in a book and hours in a
          register can never agree.</li>
      </ul>

      <h2>What Uyirly offers</h2>
      <p>
        Uyirly brings doctor availability, nurse rostering, nursing units, ratios, leave and attendance into a
        single <strong>Scheduling</strong> module, so the plan on screen matches what happens on the floor.
      </p>
      <StatGrid stats={[
        { value: '3 shifts', label: 'Morning / evening / night, configurable' },
        { value: 'Per-unit', label: 'Block · floor · wing coverage' },
        { value: 'Live', label: 'Ratio flagged vs occupied beds' },
        { value: '1 place', label: 'Roster · leave · attendance' },
      ]} />
      <p>
        <strong>Doctor OPD hours</strong> are set on the Scheduling page (the &ldquo;Doctor Hours&rdquo; tab) and
        directly gate appointment booking &mdash; patients, and your own front desk, can only book a doctor on
        days and sessions they actually consult. On a token-based OPD this also drives that day&rsquo;s queue.
      </p>
      <p>
        <strong>Nurse rostering works at the nursing-unit level</strong> &mdash; you define units as block,
        floor and wing with a central station, set the required nurse-to-patient ratio for each, and assign
        nurses per shift. Uyirly shows live coverage against <em>occupied</em> beds and flags an under-staffed
        shift before it starts.
      </p>
      <ScreenMock title="Scheduling · Doctor Hours" caption="Each doctor's weekly OPD sessions publish straight into appointment booking.">
        <MockTable
          head={['Doctor', 'Days', 'Session']}
          rows={[
            ['Dr. Aanya Sharma', 'Mon · Wed · Fri', '10:00 – 13:00'],
            ['Dr. Rahul Nair', 'Tue · Thu', '17:00 – 20:00'],
            ['Dr. Meera Iyer', 'Mon – Sat', '09:00 – 12:00'],
          ]}
        />
      </ScreenMock>
      <p>
        <strong>Leave is built in.</strong> Staff raise a leave request, an approver accepts or rejects it, and
        an approved leave removes that person from the roster for those dates &mdash; with coverage rechecked so
        any resulting gap is visible. And because <strong>attendance</strong> lives in the same platform, the
        published roster and the hours actually worked stay connected, ready for HR and payroll.
      </p>
      <CalloutBox tone="tip" title="Set it up once">
        Model your wards as nursing units (block / floor / wing), set each unit&rsquo;s ratio, publish your
        doctors&rsquo; OPD hours, and the day-to-day roster becomes a quick assign-and-check exercise &mdash;
        with under-staffed shifts and leave conflicts surfaced for you, not left to spot by eye.
      </CalloutBox>

      <h2>Where scheduling fits</h2>
      <p>
        Staff scheduling does not stand alone &mdash; it plugs into admissions (occupied beds drive nurse
        requirements), OPD (doctor hours drive booking), and HR (attendance and leave). If you are digitising a
        hospital end to end, scheduling is one piece of the wider workflow described in{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">how to digitize a hospital</Link>. Done right,
        it turns &ldquo;who&rsquo;s on tonight?&rdquo; from an anxious phone call into a glance at one screen.
      </p>
    </>
  )
}
