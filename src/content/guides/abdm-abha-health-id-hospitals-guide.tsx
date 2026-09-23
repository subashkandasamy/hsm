import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is ABDM?',
    a: 'ABDM (Ayushman Bharat Digital Mission) is India\'s national initiative to build a digital health ecosystem — a set of standards and infrastructure meant to let health records move between hospitals, labs and patients securely, with the patient\'s consent.',
  },
  {
    q: 'What is ABHA?',
    a: 'ABHA (Ayushman Bharat Health Account) is an individual\'s national health ID under ABDM — a 14-digit number that can be linked to health records across different, participating healthcare providers, rather than each hospital holding a completely isolated record.',
  },
  {
    q: 'Is ABDM integration mandatory for hospitals?',
    a: 'It is not universally mandatory today, but adoption is growing, and some government schemes and empanelments increasingly expect ABDM/ABHA compatibility. Hospitals evaluating software should at least check whether a vendor has a path to ABHA linkage, even if not using it immediately.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        India&apos;s health records have historically lived in silos — one hospital&apos;s system rarely talks to
        another&apos;s. The Ayushman Bharat Digital Mission (ABDM) is the government&apos;s effort to change that, and
        ABHA is the patient-facing piece of it that hospital software increasingly needs to support.
      </p>

      <h2>ABDM: the national layer</h2>
      <p>
        ABDM defines standards and infrastructure so that, with a patient&apos;s consent, health records can move
        between participating hospitals, labs and pharmacies — instead of a patient having to carry printed
        reports between providers or repeat their history at every new facility.
      </p>

      <h2>ABHA: the patient&apos;s national ID</h2>
      <p>
        ABHA (Ayushman Bharat Health Account) is an individual&apos;s national health ID — a 14-digit number a
        patient can create once and link across participating providers. It sits alongside, not instead of, a
        hospital&apos;s own internal identifier. We cover how the two relate in our{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">UHID &amp; EMR guide</Link> for how a hospital&apos;s own
        UHID relates to it.
      </p>

      <CalloutBox tone="info" title="UHID and ABHA solve different scopes">
        A UHID identifies a patient within one hospital&apos;s own records. ABHA is meant to identify a patient
        across different hospitals nationally. A hospital system doesn&apos;t need to choose between them — it
        can maintain its own UHID and optionally link it to a patient&apos;s ABHA.
      </CalloutBox>

      <h2>What this means practically for a hospital</h2>
      <ul>
        <li>Patients may arrive already having an ABHA ID — software should be able to capture and link it during registration.</li>
        <li>Some scheme empanelments and government programs increasingly favor or require ABDM-compatible systems.</li>
        <li>Adoption is still growing — a hospital doesn&apos;t need this on day one, but a vendor with no path toward it is worth questioning.</li>
      </ul>
      <h2>Where Uyirly stands on this</h2>
      <p>
        Plainly, because &ldquo;ABDM-ready&rdquo; is a phrase that gets used to mean very little:{' '}
        <Link href="/electronic-medical-records-software">Uyirly</Link> is <strong>not</strong> ABDM
        integrated. There is no ABHA field, no health information exchange, and no ABDM registry
        registration. A hospital that needs to link records to a patient&apos;s ABHA today needs something
        else, or needs to wait.
      </p>
      <p>
        What Uyirly does have is the thing any such linkage rests on: one internal identity per patient,
        with every visit, order, report and bill filed under it. Hospitals whose records are fragmented
        across duplicate registrations cannot link to a national ID even after the integration exists,
        because there is no single record to link. Getting that right is worth doing regardless of what
        happens to ABDM.
      </p>
      <ul>
        <li>A full EMR inside the hospital, with one UHID per patient.</li>
        <li>No ABDM or ABHA integration at present.</li>
        <li>Records held in India &mdash; the database runs in the Mumbai region &mdash; aligned with the DPDP Act.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The EMR is the core of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>. See our <Link href="/guides/patient-records-emr-uhid-guide">EMR &amp; UHID guide</Link>,
        or <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
