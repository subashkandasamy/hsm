import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'

export const faqs = [
  {
    q: 'What is triage in a hospital emergency department?',
    a: 'Triage is sorting arriving patients by how urgently they need care, not by who arrived first. A patient with chest pain is seen before a patient with a minor cut who came earlier. Emergency software supports this by letting staff assign a priority level at arrival and ordering the queue by urgency.',
  },
  {
    q: 'Why does emergency registration need to be faster than OPD?',
    a: 'Emergency patients arrive without an appointment, often unable to give full details, sometimes unconscious. Registration must let staff start care immediately — with a minimal or provisional identity — and complete the record later, rather than blocking treatment on paperwork.',
  },
  {
    q: 'Should an emergency case be able to become an admission?',
    a: 'Yes. Many casualty patients are stabilised and then admitted as inpatients. The emergency record should carry forward into the admission so the history isn\'t re-entered, and the system should prevent registering a patient who is already an admitted inpatient as a fresh emergency case.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Emergency is the one department where registration cannot come first. A patient arrives by
        ambulance, unconscious, with no name and no phone — and the clock that matters started before they
        reached the door. Software that insists on a complete record before anything can be recorded is
        software that will be worked around.
      </p>

      <h2>Triage decides the order, not arrival</h2>
      <Screenshot
        src="/guides/emergency.png" width={2560} height={1248}
        alt="Emergency screen listing cases by triage level with the complaint, arrival mode, time waiting and status"
        caption="Cases ordered by severity, with how they arrived and how long they have been waiting."
      />
      <p>
        Every case carries a <strong>triage level from 1 to 5</strong> — the standard five-point scale,
        where 1 is resuscitation and 5 is non-urgent. The list is read by severity rather than by arrival
        time, which is the entire point of triage: the person who walked in twenty minutes ago with chest
        pain is seen before the person who arrived an hour ago with a sore throat.
      </p>
      <p>
        Arrival mode is recorded too — walk-in, ambulance or referral — because a patient brought in by
        ambulance carries different expectations and often a different handover.
      </p>

      <h2>The unidentified patient</h2>
      <p>
        A case can be registered with what is actually known: an approximate age, an apparent gender, and
        nothing else. A provisional record is created so treatment can be recorded against someone, and the
        identity is filled in later when a relative arrives. Insisting on a phone number or an Aadhaar at
        that moment does not produce better data — it produces a workaround.
      </p>

      <h2>Two registrations that should not happen</h2>
      <p>
        The system refuses both, and this is worth knowing because both are common under pressure:
      </p>
      <ul>
        <li><strong>A second emergency case for a patient who already has an active one</strong> — the existing case is resolved or continued, not duplicated.</li>
        <li><strong>An emergency case for a patient already admitted as an inpatient</strong> — an admitted patient who deteriorates is a ward event, not a new ER arrival.</li>
      </ul>
      <p>
        Duplicate records made in an emergency are the hardest kind to merge later, because the two halves
        of the story are both real.
      </p>

      <h2>Where the case goes</h2>
      <p>
        An emergency ends in one of a few ways: treated and sent home, referred elsewhere, or admitted.
        Admission from the ER carries the record with it — the{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">admission</Link> records the emergency case
        it came from, so the trail from ambulance to bed is intact and the patient is not registered twice.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>Registration in seconds, including for a patient nobody can name yet.</li>
        <li>Triage levels 1 to 5, with the list read by severity rather than arrival.</li>
        <li>Arrival mode — walk-in, ambulance or referral — recorded on the case.</li>
        <li>A second active emergency case, or one for an already-admitted patient, refused at the source.</li>
        <li>Admission straight into IPD, recording the emergency case it came from.</li>
        <li>Charges reaching the same patient bill as everything else.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Emergency is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing one patient
        record with the ward, lab and pharmacy that the case will touch.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
