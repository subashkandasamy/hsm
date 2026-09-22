import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a hospital patient portal?',
    a: 'A self-service app where patients sign in to see their own records — visits, prescriptions, lab and scan reports — and to book appointments, without calling the hospital. It moves routine requests away from the front desk and gives patients access at any hour.',
  },
  {
    q: 'Can one login manage a whole family?',
    a: 'Yes, with a family account. One login holds several members, each a real person with their own records, so a parent can open a child\'s report or book for a spouse without three separate accounts and three forgotten passwords.',
  },
  {
    q: 'How does the portal show records from more than one hospital?',
    a: 'The portal identity is universal rather than tied to one hospital, so every hospital where that person has a record links back to the same account. The patient sees a list of their hospitals; each hospital\'s clinical records stay that hospital\'s own.',
  },
  {
    q: 'How is a family member matched to their hospital records?',
    a: 'By a per-person key, because a family sharing one phone cannot be told apart by phone alone. Aadhaar recorded at registration links automatically; a record can also be linked directly to the account, which is what happens when the booking came from the portal in the first place.',
  },
  {
    q: 'Can new patients register and book from the portal themselves?',
    a: 'Yes. Create an account, add family members, find a listed hospital and book — which creates that member\'s record at the hospital from their profile, so the doctor has it on arrival.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Most of what a hospital front desk answers on the phone is routine: can I get my report, what did
        the doctor prescribe, can I book Tuesday. Each of those is a self-service task — and each one
        currently costs a member of staff a call while somebody stands at the counter waiting.
      </p>
      <p>
        The complication is that families do not have one patient each. A mother manages her child&apos;s
        records, her own, and her father&apos;s. A portal built for one person per login breaks on the first
        real household.
      </p>

      <h2>One login, a family under it</h2>
      <Screenshot
        src="/guides/portal-family.png" width={1800} height={1234}
        alt="Patient portal home showing Your family with two members — the account holder marked You and a child — each listing the hospital they have a record at with its UHID, and links to find a hospital and book"
        caption="Each member, the hospitals they hold a record at, and the UHID at each."
      />
      <p>
        The account is the family; the <strong>members</strong> are the people. Each member shows the
        hospitals where they have a record, with that hospital&apos;s own UHID — because the number is the
        hospital&apos;s, not the portal&apos;s. Adding a member takes a name and, where available, an
        Aadhaar number.
      </p>
      <CalloutBox tone="info" title="Universal identity, records that stay where they are">
        One login can reach every Uyirly hospital a family has visited. That is not the same as pooling the
        data: each hospital&apos;s clinical records remain that hospital&apos;s, and the portal shows the
        patient their record <em>at each place</em> rather than merging everyone&apos;s notes into a shared
        pile. A convenient single login and properly siloed clinical data are compatible — but only if the
        system is built to keep them apart.
      </CalloutBox>

      <h2>What a member can see</h2>
      <Screenshot
        src="/guides/portal-records.png" width={1800} height={660}
        alt="A member's record at one hospital with tabs for appointments, visits, prescriptions, lab and scans, showing a consultation with its diagnosis, complaint and notes and a link to one prescribed medicine"
        caption="One member at one hospital: appointments, visits, prescriptions, lab and scans."
      />
      <p>
        Five tabs, each counting what is in it:
      </p>
      <ul>
        <li><strong>Appointments</strong> — what is booked, and a live queue position on the day.</li>
        <li><strong>Visits</strong> — each consultation with its complaint, diagnosis and the notes written for the patient.</li>
        <li><strong>Rx</strong> — what was prescribed.</li>
        <li><strong>Lab</strong> — finalised results, openable as the report.</li>
        <li><strong>Scans</strong> — reported imaging, including the image where one was uploaded.</li>
      </ul>
      <p>
        Worth saying what is <em>not</em> there: <strong>bills are not in the portal today</strong>. A
        patient can see their care but not their account. If billing self-service matters to you, ask about
        it specifically rather than reading &ldquo;patient portal&rdquo; and assuming.
      </p>

      <h2>Booking, and the queue</h2>
      <WorkflowDiagram
        title="New patient → booked, without touching the desk"
        steps={[
          { label: 'Register', sublabel: 'Name, email, phone' },
          { label: 'Add members', sublabel: 'Family under one login' },
          { label: 'Find a hospital', sublabel: 'From the directory' },
          { label: 'Book', sublabel: 'Record created, token issued' },
        ]}
      />
      <p>
        A booking from the portal is a real booking: it creates the patient&apos;s record at that hospital
        from the member&apos;s profile, takes a token, and raises the consultation bill the way a front-desk
        booking does — collected at the counter on arrival, and cancelled automatically if the patient does
        not come. On the day, the appointment shows a{' '}
        <strong>live queue position</strong>: how many are ahead, and roughly how long. That one number
        replaces most of the calls a front desk takes.
      </p>
      <p>
        Which days can be booked comes from the doctor&apos;s published{' '}
        <Link href="/guides/hospital-staff-scheduling-software-guide">OPD hours</Link> — a day the doctor
        does not consult is simply not offered, and the session&apos;s token cap is what stops it being
        oversold.
      </p>

      <h2>The identity problem</h2>
      <p>
        For the portal to show &ldquo;my records&rdquo;, each hospital record has to attach to the right
        person. A family sharing one phone number cannot be told apart by phone, so Uyirly links a record to
        a member three ways:
      </p>
      <ul>
        <li><strong>Directly</strong> — the record was created from the portal, so it is linked from birth.</li>
        <li><strong>By Aadhaar</strong> — a hospital record carrying the member&apos;s Aadhaar links to them when the member is added.</li>
        <li><strong>By phone</strong> — the fallback, which is why a household sharing a number needs one of the first two to keep members distinct.</li>
      </ul>
      <p>
        This is the practical argument for capturing Aadhaar at registration where the patient is willing:
        it is the only per-person key an Indian hospital reliably has. See{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">UHID and patient records</Link> for how identity
        works on the hospital side.
      </p>

      <h2>Privacy and consent</h2>
      <p>
        A portal showing health records handles sensitive personal data, so two things have to hold. First, a
        patient sees only their own and their members&apos; records, enforced on every request rather than by
        hiding links — the portal checks ownership server-side before it returns anything. Second, adding a
        family member is itself a consent decision: the account holder is asserting they are entitled to
        manage that person. Under India&apos;s DPDP Act that maps to consent, and for children to guardian
        consent. The wider picture is in the{' '}
        <Link href="/guides/hospital-software-data-security-dpdp">DPDP and data security guide</Link>.
      </p>

      <h2>What a patient should and should not see</h2>
      <p>
        A good portal is deliberate about scope. Patients should see what is theirs and finished: visits,
        prescriptions, finalised lab and radiology reports. They should not see draft or unverified results,
        or internal working notes — releasing an un-finalised report causes alarm and occasionally harm.
        Getting that boundary right is what makes clinicians comfortable with a portal existing at all.
      </p>

      <h2>Adoption is an operational habit</h2>
      <p>
        A portal only helps if patients use it, and that is decided at the registration desk rather than in
        the app. Capturing an <strong>email</strong> so the patient can sign in and reset a password, and an{' '}
        <strong>Aadhaar</strong> so their records find the right member, is what makes the portal light up
        the first time someone opens it. If reception treats both as optional, the portal stays empty and
        nobody blames the desk.
      </p>

      <h2>Portal, or WhatsApp and SMS?</h2>
      <p>
        Both, doing different jobs. Messaging is <em>push</em> — your report is ready, your appointment is
        tomorrow. The portal is <em>pull</em> — where the patient goes to read the report. A message that
        notifies and a portal that holds the detail is the combination that works; a portal with no
        notification is a place nobody remembers to visit.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>One login for a family, with members added under it and a relationship on each.</li>
        <li>A universal account: every Uyirly hospital a member has visited, listed with its own UHID.</li>
        <li>Per-member records — appointments, visits, prescriptions, lab reports and scans.</li>
        <li>Self-registration, a hospital directory, and booking that creates the record and issues a token.</li>
        <li>A live queue position on the day of the appointment.</li>
        <li>Booking limited to the doctor&apos;s published sessions and their token caps.</li>
        <li>Records linked by account, by Aadhaar, or by phone as a fallback.</li>
        <li>Ownership checked server-side on every request.</li>
      </ul>

      <h2>Where it fits</h2>
      <p>
        The portal is the patient-facing face of the rest of the system: it surfaces the{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">record</Link>, the reports from{' '}
        <Link href="/guides/lab-lis-workflow-guide">lab</Link> and{' '}
        <Link href="/guides/radiology-ris-reporting-guide">radiology</Link>, and puts bookings into the{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD queue</Link>.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
