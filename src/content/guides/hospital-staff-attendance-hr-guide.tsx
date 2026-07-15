import Link from 'next/link'

export const faqs = [
  {
    q: 'How is staff attendance different from the duty roster?',
    a: 'The roster is the plan — who is scheduled to work which shift. Attendance is what actually happened — who showed up, checked in, checked out, or was marked absent. Good hospital software keeps both linked, so a no-show on attendance immediately shows as a gap against the roster.',
  },
  {
    q: 'What HR data does hospital software typically track for staff?',
    a: 'Beyond attendance, typically: designation, joining date, department, consultation or shift-based charges (for doctors and nurses), leave records, and contact/emergency information — enough to run daily operations, not necessarily full payroll processing.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Staff attendance and HR records are the operational layer underneath every clinical workflow — a
        hospital can&apos;t roster nurses, calculate nursing charges, or know who&apos;s actually on the floor
        without them.
      </p>

      <h2>Attendance vs. roster: two different questions</h2>
      <p>
        The duty roster answers &ldquo;who is supposed to be working this shift.&rdquo; Attendance answers &ldquo;who
        actually showed up.&rdquo; They need to stay connected — when someone marked present on the roster is
        actually absent, that gap should be visible immediately, not discovered hours into the shift &mdash; how
        rostering and same-day gaps connect is covered in our{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">nurse duty roster guide</Link>.
      </p>

      <h2>Why this connects to billing</h2>
      <p>
        For roles charged per shift — nursing being the clearest example — attendance and assignment together
        determine what gets billed. A nurse who didn&apos;t show up shouldn&apos;t generate a nursing charge on a
        patient&apos;s bill; the two records need to agree. See{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing explained</Link> for how nursing charges
        flow into the combined bill.
      </p>

      <h2>Leave records</h2>
      <p>
        Leave should be a proper request-and-approval record, not just a note in the attendance log — it&apos;s
        what lets a roster generator automatically exclude a nurse from shifts they&apos;re approved to be away
        for, instead of an in-charge discovering the conflict manually.
      </p>

      <h2>The test that actually matters</h2>
      <p>
        Most attendance software can mark someone present or absent. The real test is narrower: when a nurse
        scheduled for the 2pm shift doesn&apos;t check in by 2:15, does anyone find out before a patient does?
        Software where attendance and roster are two disconnected screens fails this test even if both screens
        individually work fine &mdash; the gap only becomes visible when someone happens to compare them manually.
        Software where a no-show immediately flags against the roster passes it without anyone having to look.
      </p>
    </>
  )
}
