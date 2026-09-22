import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'

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
        An operation theatre is the most expensive room in a hospital, and the one most easily wasted. The
        two ways it goes wrong are mundane: two cases booked into the same room at the same time, and a
        case that runs without anyone recording what was used in it.
      </p>

      <h2>The list</h2>
      <Screenshot
        src="/guides/ot-schedule.png" width={2560} height={1384}
        alt="Operation theatre schedule showing the day's cases with procedure, surgeon, theatre, time slot and status"
        caption="The day's list: which case, which surgeon, which theatre, and when."
      />
      <p>
        A case carries the procedure, the surgeon, the anaesthetist, the theatre and a time slot. That last
        pair is where the discipline lives.
      </p>

      <h2>Double-booking, prevented rather than discouraged</h2>
      <p>
        Two cases cannot occupy the same theatre at overlapping times. This is not a warning the scheduler
        can click past — it is enforced by the database itself, with an exclusion constraint on the room
        and the time range. An attempt to move a case onto an occupied slot comes back as{' '}
        <em>&ldquo;Room already booked for this time slot&rdquo;</em> and simply does not save.
      </p>
      <p>
        The distinction matters because a warning is only as good as the person reading it at seven in the
        morning, while a constraint holds regardless of who is scheduling or how.
      </p>

      <h2>Consumables and implants</h2>
      <p>
        What gets used in theatre is where the money leaks. Consumables and implants recorded against the
        case become charges on the patient&apos;s bill, rather than being reconstructed afterwards from a
        nurse&apos;s memory — see{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing</Link> for where those lines land.
        Billing happens when the case is marked completed, not when it is scheduled, because a scheduled
        surgery can still be cancelled or moved.
      </p>

      <h2>After the case</h2>
      <p>
        The operative note belongs on the patient&apos;s record, attached to the admission, where the ward
        team and any later doctor can find it. A post-operative bed can be assigned as part of the case, so
        the patient goes somewhere decided in advance rather than wherever is free at the door.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A theatre list by day, with procedure, surgeon, anaesthetist, theatre and slot.</li>
        <li>Double-booking of a theatre prevented by the database, not by a warning.</li>
        <li>A surgical team recorded per case beyond the primary surgeon.</li>
        <li>Consumables and implants captured against the case and billed to the patient.</li>
        <li>Billing on completion rather than on scheduling.</li>
        <li>Operative notes on the patient&apos;s record, tied to the admission, with a post-op bed assignable.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The theatre module is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing a patient
        and a bill with the{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">ward</Link> the patient returns to.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
