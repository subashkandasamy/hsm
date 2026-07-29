import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a UHID in a hospital?',
    a: 'UHID stands for Unique Health Identification number (also written Unique Health ID). It is a single identifier a hospital assigns to a patient the first time they register, and then uses across every visit and department from then on — OPD, IPD, lab, pharmacy, billing — instead of creating a new record each time the patient comes back. One patient, one UHID, one growing history.',
  },
  {
    q: 'What is the full form of UHID?',
    a: 'UHID is short for Unique Health Identification number. Some hospitals expand it as Unique Hospital Identification number — either way it refers to the same thing: the one internal ID that ties all of a patient\'s records together within that hospital.',
  },
  {
    q: 'What is a UHID number or UHID card?',
    a: 'The UHID number is the actual identifier (for example UH-2026-000123 or a numeric string) printed on the patient\'s registration slip or ID card. Many hospitals print it on a UHID card the patient carries, so on the next visit the front desk can pull up the existing record instantly instead of registering them afresh.',
  },
  {
    q: 'Is UHID the same as ABHA?',
    a: 'They are related but not identical. UHID is a hospital\'s own internal patient identifier. ABHA (Ayushman Bharat Health Account) is India\'s national health ID, meant to work across different hospitals and providers. A hospital system can link a patient\'s internal UHID to their national ABHA ID so the two point to the same person.',
  },
  {
    q: 'What counts as an EMR?',
    a: 'An Electronic Medical Record (EMR) covers a patient\'s clinical history at one hospital — diagnoses, prescriptions, allergies, vitals, lab and radiology results — organized under their UHID so any department can see relevant history instead of asking the patient to repeat it.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Ask a patient to repeat their medical history at every department they visit, and you&apos;ve already lost
        the main benefit of digitizing a hospital. A Unique Health ID (UHID) and the electronic medical record
        built under it exist so that doesn&apos;t happen &mdash; one identity, one growing history, visible to
        whichever department needs it.
      </p>

      <h2>What is a UHID? (meaning and full form)</h2>
      <p>
        <strong>UHID</strong> stands for <strong>Unique Health Identification number</strong> &mdash; a single ID a
        hospital gives a patient the very first time they register. From then on, every OPD visit, admission, lab
        test, prescription and bill is filed under that one number, so the patient&apos;s whole history lives in one
        place. It&apos;s usually printed on the registration slip or a <strong>UHID card</strong> the patient carries
        (something like <em>UH-2026-000123</em>), which lets the front desk find the existing record in seconds on
        the next visit rather than starting a fresh one. In short: the UHID is the thread the entire patient
        record hangs on.
      </p>

      <h2>Why UHID has to come first</h2>
      <p>
        Every other module &mdash; OPD, IPD, pharmacy, billing &mdash; depends on reliably finding the same patient
        record across visits. If registration creates a fresh record every time (because staff couldn&apos;t search
        by phone number, name, or an existing ID), a patient ends up with three or four fragmented histories
        instead of one. This is why UHID discipline at registration is worth getting right before digitizing
        anything else &mdash; see our{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">hospital digitization workflow guide</Link>.
      </p>

      <h2>What an EMR actually holds</h2>
      <ul>
        <li>Diagnoses and consultation notes across every OPD visit and admission.</li>
        <li>Prescriptions and medication history.</li>
        <li>Allergies &mdash; visible immediately to any doctor or nurse, not buried in a note.</li>
        <li>Lab and radiology results, linked back to the order that produced them.</li>
        <li>Vitals recorded over time.</li>
      </ul>
      <CalloutBox tone="warning" title="Allergies need to be impossible to miss">
        An allergy recorded once should surface as a visible banner wherever a doctor prescribes or a nurse
        administers medication &mdash; not something staff have to remember to scroll down and check.
      </CalloutBox>

      <h2>UHID vs. ABHA: internal ID vs. national ID</h2>
      <p>
        A hospital&apos;s UHID is internal &mdash; it identifies a patient within that hospital&apos;s own records.
        India&apos;s ABHA (Ayushman Bharat Health Account) is a national health ID meant to work across different
        hospitals and providers, part of the Ayushman Bharat Digital Mission (ABDM). A good system can hold both
        and link them, so the internal UHID and the national ABHA number point to the same patient &mdash; what that
        national layer means for hospital software specifically is covered in our{' '}
        <Link href="/guides/abdm-abha-health-id-hospitals-guide">ABDM &amp; ABHA guide</Link>.
      </p>

      <h2>The registration-desk test</h2>
      <p>
        The clearest way to judge a patient-record system isn&apos;t reading its feature list &mdash; it&apos;s watching
        a receptionist register a returning patient who doesn&apos;t remember their ID. If search by phone number or
        name reliably finds the existing record, UHID discipline is working. If it doesn&apos;t, and a duplicate
        record gets created &ldquo;just this once,&rdquo; that patient now has two fragmented histories, and every
        department downstream inherits the confusion. For how this sits inside the wider system, see our{' '}
        <Link href="/electronic-medical-records-software">electronic medical records software</Link> overview.
      </p>
    </>
  )
}
