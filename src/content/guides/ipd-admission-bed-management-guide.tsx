import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a ward board in hospital software?',
    a: 'A live view of every bed in every ward — occupied, available or under maintenance — so staff can see what is free at a glance instead of calling around or walking the corridor to check.',
  },
  {
    q: 'What happens when a patient is transferred between wards?',
    a: 'The old bed is released back to available, the new bed is occupied, and the stay continues under the same admission so charges carry forward. A transfer that starts a new admission produces two bills for one stay and loses the thread of the treatment.',
  },
  {
    q: 'Can a patient be admitted straight from OPD or from Emergency?',
    a: 'Both. An admission records the visit or emergency case it came from, so the patient is not registered again and the trail from first contact to bed is intact.',
  },
  {
    q: 'How do bed and nursing charges reach the bill?',
    a: 'They accrue each day for as long as the patient occupies the bed, from the room type\'s daily rate, and post to the running bill without anyone entering them. Nobody counts nights at discharge.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Inpatient care is the part of a hospital where the software either holds the whole stay together or
        quietly fragments it. A stay runs across days, wards, doctors and departments, and ends in one
        bill. The two things that make it work are knowing which beds are free, and keeping everything that
        happens attached to one admission.
      </p>

      <h2>Step 1 — Knowing what is free</h2>
      <Screenshot
        src="/guides/ward-board.png" width={2560} height={3300}
        alt="Ward board grouped by room type — General Ward, ICU, Labour Room, Private AC and Semi-Private — showing each room, its floor and block, and every bed as available or occupied"
        caption="Every bed in the hospital, grouped by room type, with its floor and wing."
      />
      <p>
        The board is grouped by <strong>room type</strong> rather than by corridor, because that is the
        question being asked at admission: not &ldquo;what is on the second floor&rdquo; but &ldquo;is
        there an ICU bed, and what does it cost a day&rdquo;. Each room carries its floor and block, so
        the answer includes where to send the patient.
      </p>
      <p>
        A bed is <strong>available</strong>, <strong>occupied</strong>, or under{' '}
        <strong>maintenance</strong> — the last of which matters more than it seems. A bed that is broken,
        being cleaned or held for isolation is not available, and a board that cannot say so will keep
        offering it.
      </p>
      <CalloutBox tone="info" title="Overflow wards, for the night it is full">
        Every hospital eventually admits a patient when nothing is free. A ward can be marked as overflow,
        where beds are created on demand at admission rather than pre-defined — so the patient is admitted
        properly instead of being recorded nowhere until a bed opens.
      </CalloutBox>

      <h2>Step 2 — Admitting</h2>
      <WorkflowDiagram
        title="Where an admission comes from"
        steps={[
          { label: 'OPD consultation', sublabel: 'Doctor decides to admit' },
          { label: 'Emergency', sublabel: 'Straight from triage' },
          { label: 'Direct', sublabel: 'Planned surgery or transfer in' },
        ]}
      />
      <p>
        An admission records where it came from — the OPD visit or the emergency case — so the patient is
        never re-registered and the trail from first contact to bed stays intact. It captures the admitting
        doctor, the ward and bed, and the reason, and the bed becomes occupied the moment it is assigned.
      </p>
      <Screenshot
        src="/guides/ipd-list.png" width={2560} height={874}
        alt="Inpatient list showing admitted patients with their ward, bed, admitting doctor and how long they have been admitted"
        caption="Who is in the hospital right now, where, and under whom."
      />

      <h2>Step 3 — The stay</h2>
      <Screenshot
        src="/guides/ipd-admission.png" width={2560} height={2514}
        alt="An admission record showing the reason for admission, the care team, daily vitals and notes, and the tabs for treatment, nursing and billing"
        caption="One admission, holding everything that happens during the stay."
      />
      <p>
        Everything that happens now attaches to this admission rather than floating loose: progress notes,
        nursing observations, treatment orders, medicines issued from the{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy</Link>,{' '}
        <Link href="/guides/lab-lis-workflow-guide">lab</Link> and imaging orders, and theatre if it comes
        to that. A maternity admission additionally opens the{' '}
        <Link href="/guides/antenatal-care-labour-ward-guide">labour ward record</Link>.
      </p>
      <p>
        Meanwhile the money accrues by itself. Bed rent and nursing charges are added each day from the
        room type&apos;s daily rate, for as long as the patient occupies the bed. Nobody counts nights at
        discharge, and nobody forgets a day.
      </p>

      <h2>Step 4 — Transfers</h2>
      <p>
        A transfer between wards should do three things at once: release the old bed to available, occupy
        the new one, and keep the stay under the <strong>same admission</strong>. The last is the one to
        check in a demo. A transfer that closes one admission and opens another produces two bills for one
        stay, splits the treatment history in half, and restarts the daily charges — and it is a
        surprisingly common way for systems to handle it, because it is easier to build.
      </p>
      <p>
        It also has to price correctly. Moving from a general ward to ICU changes the daily rate from the
        day of the move, not from the beginning of the stay.
      </p>

      <h2>Step 5 — Discharge</h2>
      <p>
        Discharge releases the bed, stops the daily charges, and closes the admission with a discharge
        summary. What should <em>not</em> happen at discharge is a scramble to assemble the bill: if
        pharmacy, lab, theatre and bed charges have been posting to the running bill all along, the bill is
        already there and the advance already applied. Our{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> covers how that total
        comes together.
      </p>

      <h2>Where this usually breaks</h2>
      <ul>
        <li><strong>The board is stale.</strong> If the bed is only released when someone remembers to update it, the board becomes a second thing to maintain and staff go back to phoning the ward.</li>
        <li><strong>Transfers start a new admission.</strong> Two bills, split history, restarted charges.</li>
        <li><strong>Charges are entered at discharge.</strong> Anything remembered at the end is something that can be forgotten, and it is always the hospital that loses.</li>
        <li><strong>Emergency admissions register the patient again.</strong> A duplicate record for someone who already exists, created at the worst possible moment.</li>
      </ul>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A live bed board across every ward — available, occupied or under maintenance — grouped by room type with floor and block.</li>
        <li>Admission from an OPD visit, from Emergency, or direct, recording where it came from.</li>
        <li>Overflow wards whose beds are created on demand when nothing is free.</li>
        <li>Transfers that move the bed and keep one admission, repricing from the day of the move.</li>
        <li>Bed and nursing charges accruing daily onto the running bill without being entered.</li>
        <li>Progress notes, nursing records, treatment orders, pharmacy, lab and theatre all attached to the one admission.</li>
        <li>Discharge that releases the bed, stops the charges and closes the record with a summary.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        IPD is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing one patient
        and one bill with every other department.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
