import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What does OT scheduling software actually prevent?',
    a: 'Its core job is preventing double-booking — the same operation theatre, surgeon, or anaesthetist being committed to two procedures at once. It does this by treating each of those as a resource that can only hold one booking in a given time slot, so a clash is refused at the point of scheduling instead of being discovered on the morning of surgery.',
  },
  {
    q: 'How are OT consumables billed accurately?',
    a: 'Consumables (sutures, implants, disposables) are recorded against the specific procedure as they are used, then flow onto that admission\'s bill as a separate line from the surgeon and theatre charges. This keeps the itemised bill defensible for the patient and for insurance/TPA scrutiny, where lumped-together surgical charges are often queried.',
  },
  {
    q: 'Does the whole surgical team need to be recorded?',
    a: 'Yes — surgeon, assistant, anaesthetist and scrub nurse should each be captured against the procedure. It matters for clinical records, for paying or crediting each team member, and for audits where "who was in theatre" is a real question.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        The operation theatre is the most expensive room in a hospital by the hour, so an empty or
        double-booked OT is costly in a way an empty consultation room never is. That is why OT scheduling is
        less about a calendar and more about protecting three scarce resources at once — the theatre, the
        surgeon, and the anaesthetist.
      </p>

      <h2>Why OT scheduling is a three-resource problem</h2>
      <p>
        A consultation needs one resource: the doctor. A surgery needs a theatre <em>and</em> a surgeon
        <em> and</em> an anaesthetist all free for the same window. Scheduling software has to check every one
        of them before it confirms a slot — booking the theatre while the anaesthetist is committed elsewhere
        just moves the clash to the morning of surgery, which is the worst possible time to find it.
      </p>
      <WorkflowDiagram
        title="A surgery from booking to bill"
        steps={[
          { label: 'Schedule', sublabel: 'Theatre + team, no clash' },
          { label: 'Pre-op', sublabel: 'Consent, fitness, checklist' },
          { label: 'Procedure', sublabel: 'Team + consumables recorded' },
          { label: 'Billing', sublabel: 'Surgery + consumables itemised' },
        ]}
      />

      <h2>The surgical team, not just the surgeon</h2>
      <p>
        A procedure is performed by a team — a lead surgeon, an assistant, an anaesthetist and a scrub nurse.
        Recording each role against the procedure is what makes the clinical record complete and lets the
        hospital credit or pay each contributor correctly, rather than attributing the whole case to one name.
        It also answers the question every audit eventually asks: who was actually in the theatre?
      </p>

      <h2>Consumables are where surgical bills leak</h2>
      <p>
        Sutures, implants and disposables used during a case are easy to forget and hard to reconstruct after
        the fact. The reliable pattern is to record them against the procedure as they are used, so they land
        on the patient&apos;s bill as their own line items — separate from the theatre and surgeon charges. A
        lumped &ldquo;surgical charges&rdquo; figure is exactly what an insurance TPA queries first; an itemised
        one is defensible.
      </p>

      <CalloutBox tone="tip" title="How Uyirly handles it">
        In Uyirly, scheduling a surgery reserves the theatre and the team together and refuses a clashing slot,
        the full team is captured by role, and consumables are billed to the procedure as separate line items
        that flow straight onto the admission&apos;s bill. See how it fits the ward flow in the{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">IPD admission &amp; bed management guide</Link>.
      </CalloutBox>

      <h2>Where OT connects to the rest of the hospital</h2>
      <p>
        A scheduled surgery rarely stands alone. It usually follows an{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">inpatient admission</Link>, draws staff from
        the <Link href="/guides/nurse-duty-roster-hospital-guide">nursing roster</Link>, and its charges join
        the running <Link href="/guides/ipd-billing-software-explained">IPD bill</Link>. OT scheduling that
        lives inside the same system as admission, nursing and billing avoids the re-keying and reconciliation
        that standalone theatre calendars force on staff.
      </p>

      <p>
        If you are digitising a hospital with a busy surgical department,{' '}
        <Link href="/signup">start a free trial</Link> and schedule a test procedure end to end — from booking
        the theatre to seeing the consumables on the bill — to judge whether the flow matches how your OT
        really runs.
      </p>
      <h2>How Uyirly runs the operation theatre</h2>
      <p>
        <Link href="/operation-theatre-management-software">Uyirly&apos;s OT module</Link> schedules cases against
        theatre and team availability, so a theatre, surgeon or anaesthetist is never double-booked and the
        day&apos;s OT list is clear to everyone. The pre-op safety checklist runs as part of the case, consumables
        and implants are recorded against it, and the operative notes join the patient record &mdash; while the
        charges post to the same IPD bill.
      </p>
      <ul>
        <li>Clash-free scheduling with surgeon, anaesthetist and room per case.</li>
        <li>Pre-op checklist &mdash; consent, fasting, investigations and surgical site &mdash; recorded before entry.</li>
        <li>Consumables and implants captured against the case and posted to the bill.</li>
        <li>Operative notes on the patient&apos;s record, tied to the admission.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        OT is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management software</Link>,
        useful for any <Link href="/multi-specialty-hospital-software">multi-specialty hospital</Link>. You can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
