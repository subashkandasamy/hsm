import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a UHID in a hospital?',
    a: 'UHID stands for Unique Health Identification number. It is a single identifier a hospital assigns to a patient the first time they register, and then uses across every visit and department from then on — OPD, IPD, lab, pharmacy, billing — instead of creating a new record each time the patient comes back. One patient, one UHID, one growing history.',
  },
  {
    q: 'What is the full form of UHID?',
    a: 'UHID is short for Unique Health Identification number. Some hospitals expand it as Unique Hospital Identification number — either way it refers to the same thing: the one internal ID that ties all of a patient\'s records together within that hospital.',
  },
  {
    q: 'What is a UHID number or UHID card?',
    a: 'The UHID number is the identifier printed on the patient\'s registration slip or ID card — for example DEMO-UH-2026-00004, where the prefix is the hospital\'s own code and the number runs in sequence. Printing it on a card the patient carries means the front desk can pull up the existing record on the next visit instead of registering them again.',
  },
  {
    q: 'Is UHID the same as ABHA?',
    a: 'No. UHID is a hospital\'s own internal patient identifier, issued and used by that hospital. ABHA (Ayushman Bharat Health Account) is India\'s national health ID, meant to work across providers. A hospital can hold both, but they are different numbers doing different jobs.',
  },
  {
    q: 'What counts as an EMR?',
    a: 'An Electronic Medical Record covers a patient\'s clinical history at one hospital — consultations, diagnoses, prescriptions, allergies, vitals, lab and radiology results, admissions and bills — organised under their UHID so any department can see the relevant history instead of asking the patient to repeat it.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Ask a patient to repeat their history at every department they visit and you have already lost the
        main benefit of digitising a hospital. A Unique Health ID and the record built under it exist so that
        does not happen: one identity, one growing history, visible to whichever department needs it.
      </p>
      <p>
        This guide walks through how a patient record is created, what accumulates on it, and the two places
        where hospitals most often lose the thread.
      </p>

      <h2>What a UHID is</h2>
      <p>
        <strong>UHID</strong> stands for <strong>Unique Health Identification number</strong> — a single ID a
        hospital issues the first time a patient registers. Every OPD visit, admission, test, prescription
        and bill from then on is filed under that number. In Uyirly it looks like{' '}
        <em>DEMO-UH-2026-00004</em>: the hospital&apos;s own code, the year, and a serial that runs in order.
      </p>
      <p>
        It is worth being clear that a UHID is <strong>not</strong> an ABHA number. The UHID is internal —
        this hospital&apos;s own identifier for this patient. ABHA is India&apos;s national health account,
        meant to travel between providers; what that national layer asks of hospital software is a separate
        subject, covered in our{' '}
        <Link href="/guides/abdm-abha-health-id-hospitals-guide">ABDM and ABHA guide</Link>. Everything below
        is about the hospital&apos;s own record, which is what actually runs the day.
      </p>

      <h2>Step 1 — Registering once</h2>
      <Screenshot
        src="/guides/patient-register.png" width={1324} height={1624}
        alt="Patient registration form with full name, phone, date of birth, age, gender, blood group, Aadhaar and address"
        caption="The UHID is issued here, and never typed by anyone."
      />
      <p>
        Registration asks for the things the rest of the system depends on. Gender and age are required, not
        as form-filling but because they decide which clinical form opens later — paediatric growth charts,
        the antenatal record, a paediatric dose check. Most walk-ins give an age rather than a birthday, so
        either satisfies it; enter the age and the date of birth is worked back from it and marked as an
        estimate, so nobody later mistakes it for a real birthday.
      </p>
      <p>
        The step that decides whether any of this works is the one before: <strong>searching</strong>. A
        returning patient found by phone number or name keeps one record. A returning patient registered
        again — because search was slow, or the spelling differed — now has two histories, and every
        department downstream inherits the split.
      </p>

      <h2>Step 2 — Finding them again</h2>
      <Screenshot
        src="/guides/patients.png" width={2560} height={1814}
        alt="Patient list showing UHID, name, age and gender, phone number, last visit and outstanding balance for each patient"
        caption="The register, searchable by name, phone or UHID."
      />
      <p>
        The list carries what reception actually needs to identify someone at a counter — name, age, gender,
        phone — and what accounts needs before the next visit starts: whether anything is still outstanding.
      </p>

      <h2>Step 3 — What accumulates</h2>
      <Screenshot
        src="/guides/patient-profile.png" width={2560} height={1336}
        alt="A patient record showing UHID, age, gender, phone and outstanding balance, with tabs for timeline, encounters, bills, allergies, documents and info, and a clinical timeline listing a radiology study and an admission"
        caption="One record. The timeline fills itself in as the hospital runs."
      />
      <p>
        Nobody maintains this. The X-ray appears on the timeline because radiology reported it; the admission
        appears because a bed was assigned. The tabs split the same record by what you came looking for:
      </p>
      <ul>
        <li><strong>Timeline</strong> — everything clinical in date order, across departments.</li>
        <li><strong>Encounters</strong> — the OPD visits and admissions themselves, each opening the full consultation.</li>
        <li><strong>Bills</strong> — every bill raised, and what is still owed.</li>
        <li><strong>Allergies</strong> — recorded once, used everywhere (below).</li>
        <li><strong>Documents</strong> — scans, consents, referral letters, insurance papers.</li>
        <li><strong>Info</strong> — the demographics, and the Aadhaar number if one was given.</li>
      </ul>
      <p>
        The header carries the two things staff need before they do anything else: what the patient owes, and
        what they are allergic to.
      </p>

      <h2>Step 4 — Allergies, and why they belong here</h2>
      <Screenshot
        src="/guides/patient-allergies.png" width={2560} height={1588}
        alt="Patient record with a red severe allergy banner across the top reading Penicillin, a severe allergy chip in the header, and the allergies tab listing penicillin with its reaction and severity"
        caption="A severe allergy is a banner across the record, not a line to scroll to."
      />
      <p>
        An allergy is recorded as an <strong>allergen, a reaction and a severity</strong> rather than a
        sentence, and that structure is what lets it do something. A severe one becomes a red banner across
        the whole record and a chip beside the patient&apos;s name.
      </p>
      <CalloutBox tone="warning" title="The part that matters is at prescribing time">
        A banner helps someone who is looking at the record. The real check happens when a doctor types a
        drug name into a prescription: the system matches it against the patient&apos;s allergies{' '}
        <em>by drug class</em>, so a recorded penicillin allergy warns on amoxicillin and ampicillin too, not
        only on the word &ldquo;penicillin&rdquo;. It also flags interactions with the other drugs already on
        that prescription. The warning does not block — the doctor decides — but it is raised where the
        decision is made.
      </CalloutBox>

      <h2>Where the record comes apart</h2>
      <WorkflowDiagram
        title="The two ways one patient becomes two"
        steps={[
          { label: 'Search is slow', sublabel: 'Staff register afresh instead' },
          { label: 'Emergency arrival', sublabel: 'No time to look them up' },
          { label: 'Two histories', sublabel: 'Neither one complete' },
        ]}
      />
      <p>
        Both failures happen under time pressure, which is why neither is solved by telling staff to be more
        careful. Search has to be fast enough to be worth using, and an{' '}
        <Link href="/guides/emergency-triage-management-guide">emergency case</Link> has to be able to start
        before the paperwork — attaching to the existing patient once there is a moment to check, rather than
        creating a parallel record at the worst possible time.
      </p>

      <h2>Access and the audit trail</h2>
      <p>
        A record that everybody can open is a different risk from a paper file, because it leaves no trace.
        Access is by role — reception sees demographics and bills, clinical staff see clinical history,
        accounts sees money — and every change is logged with who made it and when. Worth knowing the limit:
        reads are not logged, so the trail answers &ldquo;who altered this record&rdquo; rather than &ldquo;who
        opened it&rdquo;. The wider obligations are covered in our{' '}
        <Link href="/guides/hospital-software-data-security-dpdp">data security and DPDP guide</Link>.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>One UHID per patient, issued at registration in the hospital&apos;s own sequence.</li>
        <li>Search by name, phone or UHID, so a returning patient is found rather than re-created.</li>
        <li>Age accepted instead of a date of birth, with the derived date marked as an estimate.</li>
        <li>A timeline that fills itself in from OPD, IPD, lab, radiology, pharmacy and billing.</li>
        <li>Allergies as allergen, reaction and severity — a banner on the record and a class-aware warning at prescribing.</li>
        <li>Drug interaction warnings against the rest of the same prescription.</li>
        <li>Outstanding balance on the record, so nobody starts a visit unaware of it.</li>
        <li>Role-based access, with every change audit-logged (reads are not).</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The patient record is the core of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link> — the same record every
        module reads and writes. See the{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD guide</Link> for what a visit adds to it,
        or <Link href="/signup">start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
