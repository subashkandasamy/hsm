import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is Schedule H under the Drugs and Cosmetics Rules?',
    a: 'Schedule H covers prescription-only drugs that cannot be sold over the counter without a registered medical practitioner\'s prescription, and only the prescribed quantity may be dispensed.',
  },
  {
    q: 'What makes Schedule H1 different from Schedule H?',
    a: 'Schedule H1 covers a stricter subset — mainly 3rd and 4th generation antibiotics, certain habit-forming drugs, and anti-TB drugs. Every Schedule H1 sale must be recorded in a separate register with the prescriber\'s name and address, the patient\'s name, the drug and quantity — and that record must be retained for three years.',
  },
  {
    q: 'What is Schedule X?',
    a: 'Schedule X covers a small list of addictive drugs (narcotics and psychotropics) with legitimate medicinal uses. These require prescription-only sale and must be stored under lock and key, with tighter physical and record-keeping controls than Schedule H or H1.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Not every drug a hospital pharmacy dispenses carries the same compliance weight. Schedule H, H1 and X
        under the Drugs and Cosmetics Rules define three tiers of restricted drugs, each with its own
        dispensing and record-keeping requirements — and pharmacy software needs to reflect that difference,
        not treat every drug the same way.
      </p>

      <CalloutBox tone="warning" title="General guide, not legal advice">
        Drug scheduling and its requirements can be updated by government notification. Confirm current
        classifications and requirements with a qualified pharmacist or legal advisor — this is a general
        explainer, not a compliance checklist to rely on directly.
      </CalloutBox>

      <h2>Schedule H — prescription only</h2>
      <p>
        Schedule H covers drugs that can&apos;t be sold without a registered medical practitioner&apos;s prescription,
        and only the quantity actually prescribed may be dispensed — not more, even if the patient asks for
        extra &ldquo;to save a trip.&rdquo;
      </p>

      <h2>Schedule H1 — antibiotics and habit-forming drugs, with a paper trail</h2>
      <p>
        Schedule H1 is a stricter subset, introduced specifically to curb uncontrolled over-the-counter
        antibiotic sales — it mainly covers 3rd and 4th generation antibiotics, certain habit-forming
        medicines, and anti-TB drugs. Every H1 sale must be logged in a separate register: prescriber name and
        address, patient name, drug and quantity — retained for three years and open to inspection.
      </p>

      <h2>Schedule X — locked storage, addictive drugs</h2>
      <p>
        Schedule X covers a small list of drugs with genuine medicinal use but a high potential for misuse —
        narcotics and psychotropics. Beyond prescription-only sale, these must be physically stored under lock
        and key, with tighter access control than Schedule H or H1 items.
      </p>

      <h2>What this means for pharmacy software</h2>
      <ul>
        <li>Drugs need a schedule classification in the master catalog, not just a name and price.</li>
        <li>Schedule H1 dispensing should automatically log the required register fields — prescriber, patient, drug, quantity — rather than relying on a separate physical logbook.</li>
        <li>Records need to be retrievable for at least three years for H1 drugs.</li>
        <li>Schedule X items benefit from tighter access control in the system itself, mirroring the physical lock-and-key requirement.</li>
      </ul>
      <p>
        This connects directly to the dispensing workflow covered in our{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">hospital pharmacy management guide</Link>{' '}
        — a system that tracks batch and expiry well but ignores drug scheduling is only solving half the
        compliance picture.
      </p>
    </>
  )
}
