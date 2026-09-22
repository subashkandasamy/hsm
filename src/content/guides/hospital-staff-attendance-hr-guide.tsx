import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'How is staff attendance different from the duty roster?',
    a: 'The roster is the plan — who is scheduled to work which shift. Attendance is what happened — who was present, absent, on leave or worked a half day. They answer different questions and are kept as separate records; the useful check is whether your software makes it easy to compare them.',
  },
  {
    q: 'What HR data does hospital software typically track for staff?',
    a: 'Enough to run the day rather than to run payroll: name, role, designation, joining date, contact and emergency contact, and the rates that matter clinically — a doctor\'s consultation fee and a nurse\'s per-shift charge. Full payroll, PF and tax filing are a different class of software.',
  },
  {
    q: 'Why does a hospital staff record need a role rather than a job title?',
    a: 'Because the role decides what the person can see and do. A receptionist registers patients and books appointments; a nurse records vitals but cannot write a consultation; an accountant sees money but not clinical notes. Job titles are for the org chart; the role is the permission.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Staff records are the layer underneath every clinical workflow. A hospital cannot roster nurses,
        price a consultation or know who is on the floor without them — and because every person on the
        system is also a login, the staff record is where the hospital&apos;s security actually lives.
      </p>

      <h2>The directory</h2>
      <Screenshot
        src="/guides/staff-directory.png" width={2560} height={2164}
        alt="Staff directory listing eleven active staff with their role, rate, contact number and status, filters by role, and per-row actions to edit, reset the password and deactivate"
        caption="Every person with a login, what they are allowed to do, and what they cost."
      />
      <p>
        Adding a member of staff creates their login at the same time — there is no second step in which
        someone is on the org chart but cannot sign in, or signs in without being on it. Each record carries:
      </p>
      <ul>
        <li>
          <strong>A role</strong> — admin, doctor, nurse, receptionist, lab technician, pharmacist or
          accountant. This is a permission, not a job title: it decides what the person sees across the whole
          system. An admin who also consults is marked <em>sees patients</em>, so they appear in the doctor
          lists without giving every administrator a clinic.
        </li>
        <li>
          <strong>A rate</strong> — a doctor&apos;s consultation fee, a nurse&apos;s per-shift nursing charge.
          These are what billing reads, so setting them here is what stops a consultation being priced by
          memory at the counter.
        </li>
        <li>
          <strong>Designation, joining date, contact and emergency contact</strong> — the operational
          minimum.
        </li>
      </ul>
      <p>
        The row actions are the ones that matter in practice: reset a password, change the email a person
        signs in with, resend their credentials, and <strong>deactivate</strong> rather than delete. Someone
        who has left keeps their name on everything they recorded, which is what an audit trail requires, but
        can no longer sign in.
      </p>

      <h2>Attendance</h2>
      <Screenshot
        src="/guides/staff-attendance.png" width={2560} height={2108}
        alt="Attendance tab for September 2026 with counts of present, absent, leave and half day, a date picker, and every staff member listed with Present, Absent, Leave and Half Day buttons, several already marked"
        caption="A month at a time, marked per person per day, with today's tally across the top."
      />
      <p>
        Attendance is marked per person per day as <strong>present, absent, leave or half day</strong>, with
        the check-in time captured for those who are in. The month header gives the tally, and the date
        picker means yesterday can be corrected without pretending it is still yesterday.
      </p>
      <CalloutBox tone="warning" title="Attendance and the roster are separate records">
        This is where attendance software is usually oversold, so here is the plain position: Uyirly keeps
        both the roster and attendance, and does not reconcile them. A nurse rostered for the morning who is
        never marked present does not raise an alert, and the system does not compute worked hours or feed
        payroll. If a vendor claims otherwise, ask to see a nurse rostered, not marked in, and whatever is
        supposed to happen next.
      </CalloutBox>
      <p>
        That gap is worth knowing about because the ideal is real: the question &ldquo;the 2pm nurse has not
        checked in — does anyone find out before a patient does?&rdquo; is the one that separates attendance
        as a record from attendance as a safety net. Today Uyirly gives you the record. The safety net is the
        in-charge looking at the{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">roster</Link> and the ward.
      </p>

      <h2>Leave lives with the roster, not with attendance</h2>
      <p>
        Leave is a request-and-approval record on the{' '}
        <Link href="/guides/hospital-staff-scheduling-software-guide">scheduling</Link> side rather than a
        note in the attendance log, and that placement is deliberate. Approved leave has to be something the
        roster respects — it makes the person unschedulable for those dates, in both the automatic and the
        manual routes — which a line in an attendance register can never do.
      </p>

      <h2>Where staff records reach the rest of the system</h2>
      <ul>
        <li>
          <strong>Billing.</strong> The consultation fee on a doctor&apos;s record is what an OPD visit
          charges; the nursing charge per shift is what a nurse assignment adds to an inpatient&apos;s{' '}
          <Link href="/guides/ipd-billing-software-explained">running bill</Link>.
        </li>
        <li>
          <strong>Rostering.</strong> Only active staff with the nurse role appear on the roster and in the
          nurse picker, so a leaver disappears from next week&apos;s grid the moment they are deactivated.
        </li>
        <li>
          <strong>The audit trail.</strong> Every record carries who created it. That is only meaningful
          because staff are people with accounts rather than a shared login at the desk — which remains the
          single most common way a hospital loses its ability to answer &ldquo;who did this&rdquo;.
        </li>
      </ul>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A staff directory where adding a person creates their login, filterable by role.</li>
        <li>Seven roles that decide what each person can see and do, plus a <em>sees patients</em> flag for consulting admins.</li>
        <li>Consultation fee per doctor and nursing charge per shift, read by billing.</li>
        <li>Designation, joining date, contact and emergency contact.</li>
        <li>Password reset, email change, credential resend, and deactivation that preserves the audit trail.</li>
        <li>Attendance marked present, absent, leave or half day, per person per day, with check-in time.</li>
        <li>Leave requested and approved on the scheduling side, where the roster enforces it.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Staff and attendance are part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>. See the{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">nurse duty roster guide</Link> for the planning
        side, or <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
