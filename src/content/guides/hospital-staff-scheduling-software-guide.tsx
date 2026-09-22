import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import RatioBarChart from '@/components/guides/diagrams/RatioBarChart'

export const faqs = [
  {
    q: 'What is hospital staff scheduling software?',
    a: 'It plans and publishes who works when — doctors\' OPD consulting hours and nurses\' shift rosters across wards — in one place, with the required nurse-to-patient ratio checked against the beds actually occupied, and leave handled where the roster can see it.',
  },
  {
    q: 'How is a nurse duty roster different from doctor scheduling?',
    a: 'A nurse duty roster assigns nurses to shifts in a specific nursing unit for each day, and has to meet a minimum ratio. Doctor scheduling publishes each doctor\'s weekly consulting sessions — it is availability, not coverage, and nothing goes short if a doctor does not consult on a Thursday.',
  },
  {
    q: 'What is a nursing unit or nursing station?',
    a: 'A group of rooms — usually a block, floor and wing — staffed together from one central station. Rostering and ratios apply per nursing unit rather than per room, which is how hospitals are actually organised: one team covers every occupied bed across the unit\'s rooms.',
  },
  {
    q: 'How does scheduling software help with nurse-to-patient ratios?',
    a: 'It holds the required ratio per unit and per shift, then flags a shift as short when the rostered nurses do not meet it for the number of beds occupied — so the gap is visible before the shift starts rather than after an incident.',
  },
  {
    q: 'Can staff request leave inside the scheduling system?',
    a: 'Yes. Staff raise a request, an approver accepts or rejects it, and an approved leave makes that person unassignable for those dates — both when a roster is generated and when someone tries to place them by hand.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        &ldquo;Who is on duty right now?&rdquo; is not a trivial question in a hospital. A single day involves
        doctors running OPD sessions, nurses covering shifts across several units, approved leave taking
        people out, and an obligation to keep enough nurses on the floor for the patients admitted. Run on a
        notice board and a WhatsApp group, this breaks quietly — a shift goes uncovered, or a ward slips
        below its ratio, and nobody notices until it matters.
      </p>
      <p>
        Hospital scheduling is really two different jobs that get lumped together, and separating them is
        most of the work.
      </p>

      <h2>Doctors are scheduled by availability</h2>
      <Screenshot
        src="/guides/doctor-hours.png" width={2560} height={2082}
        alt="Doctor Hours tab with a doctor selected, listing OPD sessions Monday to Saturday from 09:00 AM to 01:00 PM labelled Morning OPD, each with a token cap of 20"
        caption="A doctor's week: which days they consult, between which hours, and how many tokens a session takes."
      />
      <p>
        A consultant does not work a shift the way a nurse does. They hold <strong>sessions</strong> — Monday
        to Saturday, 9 to 1, twenty tokens. Recording that gives the hospital a published answer to
        &ldquo;when is Dr Arun in&rdquo;, and gives the patient app a booking calendar: days a doctor does not
        consult are simply not offered, and the token cap is what stops a session being oversold.
      </p>
      <CalloutBox tone="info" title="What doctor hours do and do not gate">
        Be precise about this, because it is the sort of thing that gets overstated. In Uyirly these sessions
        drive the <strong>patient app&apos;s</strong> booking calendar. The front desk booking an appointment
        from inside the hospital is not restricted by them — reception can still book a patient onto a day
        the doctor does not normally sit, which is deliberate, because a receptionist standing in front of a
        patient often knows something the schedule does not. The published hours are the default; the desk
        can override.
      </CalloutBox>
      <p>
        For how those bookings become a queue, see the{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD token and queue guide</Link>.
      </p>

      <h2>Nurses are scheduled by coverage</h2>
      <Screenshot
        src="/guides/nurse-roster.png" width={2560} height={990}
        alt="Nurse roster week grid for one nursing unit with two nurses, each day showing a morning or night shift and a tick or a shortfall count in the day header"
        caption="A week for one nursing unit, with each day's coverage stated in the header."
      />
      <p>
        Nursing is shift work, and the question is not availability but <em>enough</em>. Each day&apos;s
        header says whether the unit meets its required staffing, calculated rather than eyeballed.
      </p>
      <p>
        The mechanics of building a large roster — copy-forward, cyclic patterns, ratio auto-fill, fairness,
        publishing — are covered in{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">how to build a nurse duty roster</Link>. Here
        the point is where it sits in the wider picture.
      </p>

      <h2>Nursing units: how hospitals are actually laid out</h2>
      <p>
        This is where simplistic software falls down. A ward is rarely one room. A hospital is laid out as{' '}
        <strong>blocks, floors and wings</strong> — &ldquo;A · 1 · East&rdquo; might hold ten mixed rooms,
        all staffed from one station. Rostering and ratios belong to that <strong>nursing unit</strong>, not
        to each room.
      </p>
      <p>
        Modelling it correctly matters because coverage is a property of the unit: a set of nurses staffs the
        station for a shift and covers every occupied bed across its rooms. A system that only understands
        rooms forces you to fake it, and the ratio arithmetic stops meaning anything.
      </p>

      <h2>Ratios, and what &ldquo;short&rdquo; means</h2>
      <Screenshot
        src="/guides/roster-coverage.png" width={2560} height={1980}
        alt="Shifts and coverage settings with morning, evening and night shift types and their hours, a coverage ratios card showing one nurse per N patients per unit and shift, and a unit in-charges card"
        caption="Shift types, per-unit ratios, and the nurses allowed to roster each unit."
      />
      <p>
        Required nurses for a shift is <strong>occupied beds ÷ ratio, rounded up</strong>, never below a
        per-unit minimum. Both are set per unit <em>and per shift</em>, because a night shift and a morning
        shift in the same ward are not the same load.
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
        The care-level context is in the{' '}
        <Link href="/guides/nurse-patient-ratio-india-nabh">nurse-to-patient ratio guide</Link>. The
        scheduling job is narrower: hold the target per unit, compare it to the beds occupied right now, and
        show the gap <em>before</em> the shift, while a supervisor can still pull someone in.
      </p>
      <p>
        Note also who is allowed to do this. A nurse named as a unit&apos;s <strong>in-charge</strong> can
        build, publish and approve leave for that unit without being an administrator of the hospital — which
        is how rostering is delegated in practice.
      </p>

      <h2>Leave belongs in the same system</h2>
      <Screenshot
        src="/guides/roster-leave.png" width={2560} height={856}
        alt="Leave requests list with an approved annual leave and a pending casual leave awaiting approval"
        caption="Requested with a type and dates, approved by the in-charge, and then honoured by the roster."
      />
      <WorkflowDiagram
        title="Leave that actually protects the roster"
        steps={[
          { label: 'Request', sublabel: 'Type and dates' },
          { label: 'Approve', sublabel: 'In-charge or admin' },
          { label: 'Unassignable', sublabel: 'Generation and by hand' },
          { label: 'Gap flagged', sublabel: 'In the week header' },
        ]}
      />
      <p>
        Once leave is approved that person is not schedulable on those dates — not merely discouraged. The
        automatic routes skip them, and so does a manual attempt to drop them into a cell. If their absence
        takes a shift below its ratio, the day header says so.
      </p>

      <h2>Attendance is a different record</h2>
      <p>
        The roster is the plan; <Link href="/guides/hospital-staff-attendance-hr-guide">attendance</Link> is
        what happened, marked per person per day. Both live in Uyirly, and both are worth keeping — but they
        are separate records, and the system does not currently reconcile one against the other or compute
        payroll hours from the difference. If a vendor tells you their scheduling module &ldquo;feeds
        payroll&rdquo;, ask to see the payslip it produces.
      </p>

      <h2>Publish on a cadence</h2>
      <p>
        A roster that appears the night before is nearly as bad as none. Staff need notice to arrange
        childcare and travel; supervisors need a window to fix gaps before they become emergencies. Most
        well-run hospitals publish at least a week ahead on a fixed day, which also makes leave manageable:
        if next week is built every Thursday, requests for it have to land before Thursday, and the approver
        can see the coverage consequence while a swap is still possible.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li><strong>Rostering by room rather than by unit</strong> — coverage only makes sense at the station.</li>
        <li><strong>Keeping leave somewhere else</strong> — guarantees someone gets scheduled on an approved day off.</li>
        <li><strong>Treating doctor hours as shifts</strong> — doctors need published availability, not coverage targets.</li>
        <li><strong>Checking ratios afterwards</strong> — then it is a report of a problem, not a chance to fix one.</li>
        <li><strong>Publishing erratically</strong> — leave requests and assignments collide permanently.</li>
      </ul>

      <h2>What Uyirly does</h2>
      <ul>
        <li>Doctor OPD sessions per weekday, with hours, a label and a token cap.</li>
        <li>Those sessions driving the patient app&apos;s booking calendar; the front desk can still override.</li>
        <li>Nursing units modelled as block, floor and wing with a central station.</li>
        <li>A week roster per unit, published by that unit&apos;s in-charge or an admin.</li>
        <li>Required staffing from live occupied beds against a per-unit, per-shift ratio and minimum.</li>
        <li>Shift types the hospital defines, and can switch off when it does not run them.</li>
        <li>Leave requested, approved, and then enforced against both automatic and manual assignment.</li>
        <li>Attendance marked per person per day in the same platform.</li>
      </ul>

      <h2>Where scheduling fits</h2>
      <p>
        Scheduling plugs into admissions — occupied beds drive the nurse requirement, see the{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">IPD guide</Link> — and into OPD, where doctor
        hours shape what patients can book. If you are digitising a hospital end to end, it is one piece of
        the wider sequence in{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">how to digitise a hospital</Link>.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
