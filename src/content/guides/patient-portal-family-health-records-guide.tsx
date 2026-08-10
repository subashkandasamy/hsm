import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'
import ScreenMock, { MockStat, MockTable } from '@/components/guides/diagrams/ScreenMock'

export const faqs = [
  {
    q: 'What is a hospital patient portal?',
    a: 'A patient portal is a self-service app or website where patients log in to see their own records — visits, prescriptions, lab and scan reports and bills — and to book appointments, without calling the hospital. It shifts routine requests away from the front desk and gives patients 24×7 access to their health information.',
  },
  {
    q: 'Can one login manage a whole family?',
    a: 'Yes, with a family account model. One login (shared email and phone) holds multiple members — each a separate person with their own name and records — so a parent can view a child\'s reports or book for a spouse from a single dashboard, switching between family members.',
  },
  {
    q: 'How does the portal show records from more than one hospital?',
    a: 'If the portal identity is universal (a master patient record) rather than tied to a single hospital, then every hospital where that person has a record links back to the same identity. The patient sees all their hospitals in one place, while each hospital keeps its own clinical records.',
  },
  {
    q: 'How is a family member matched to their hospital records?',
    a: 'By a reliable per-person key — Aadhaar is ideal because a shared family phone cannot distinguish members. When a hospital record carries the member\'s Aadhaar, it links automatically to that member in the portal; records without it can be linked manually.',
  },
  {
    q: 'Can new patients register and book from the portal themselves?',
    a: 'Yes. A new patient can create an account, add family members, find a listed hospital, and book an appointment — which creates their record at that hospital from their profile, ready for the doctor.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Most calls a hospital front desk fields are routine: &ldquo;can I get my report?&rdquo;, &ldquo;what did
        the doctor prescribe?&rdquo;, &ldquo;can I book Tuesday?&rdquo;, &ldquo;send me my bill.&rdquo; Every one
        of those is a self-service task a <strong>patient portal</strong> can handle &mdash; freeing your staff
        and giving patients round-the-clock access to their own health information.
      </p>
      <p>
        But real families don&rsquo;t have one patient each; a parent manages records for children, a spouse, an
        elderly relative. This guide explains what a modern patient portal offers, why a <strong>family account
        </strong> model matters, and how records link cleanly across members and even across hospitals.
      </p>

      <h2>What a patient portal offers</h2>
      <p>
        At its core, a portal lets a patient log in and, for themselves, see and do the everyday things that
        otherwise need a phone call or a counter visit:
      </p>
      <StatGrid stats={[
        { value: 'Records', label: 'Visits, prescriptions' },
        { value: 'Reports', label: 'Lab & radiology results' },
        { value: 'Bills', label: 'View past bills' },
        { value: 'Booking', label: 'Appointments online' },
      ]} />
      <p>
        The payoff is two-sided: patients get 24&times;7 access and stop waiting on hold, and the front desk is
        freed from routine lookups to focus on people who are physically present. (For how online bookings feed
        the doctor&rsquo;s day, see the{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD token &amp; queue guide</Link>.)
      </p>

      <h2>Why a family account, not one login per person</h2>
      <p>
        Tie a portal strictly to one person and you break how families actually use healthcare. A mother booking
        for her child, then checking her father&rsquo;s discharge report, should not need three separate logins.
        The right model is a <strong>family account</strong>:
      </p>
      <ul>
        <li>One <strong>login</strong> &mdash; a shared email and phone the family signs in with.</li>
        <li>Multiple <strong>members</strong> under it &mdash; each a real person with their own name and
          records (self, spouse, child, parent&hellip;).</li>
        <li>A <strong>member switcher</strong> &mdash; pick a person to see their records or book for them.</li>
      </ul>
      <WorkflowDiagram
        title="One login, many members"
        steps={[
          { label: 'Family login', sublabel: 'Email + phone' },
          { label: 'Members', sublabel: 'Self, spouse, child…' },
          { label: 'Pick a member', sublabel: 'Switch profile' },
          { label: 'Records / book', sublabel: 'For that person' },
        ]}
      />

      <h2>Linking records: the identity problem</h2>
      <p>
        For a portal to show &ldquo;my records,&rdquo; each hospital record must attach to the right person. With
        a family sharing one phone, <strong>phone alone can&rsquo;t tell members apart</strong> &mdash; so the
        reliable per-person key is <strong>Aadhaar</strong>. When a hospital captures a member&rsquo;s Aadhaar on
        their record, it links automatically to that member; records without it can be linked once the number is
        added.
      </p>
      <CalloutBox tone="info" title="Universal identity, private records">
        A universal patient identity (one master record per person) means every hospital a person visits links
        back to the same identity &mdash; so the portal can show &ldquo;all my hospitals&rdquo; in one place,
        while each hospital keeps its own clinical records private to it. One login, many hospitals, data still
        siloed where it legally belongs. See <Link href="/guides/patient-records-emr-uhid-guide">UHID, EMR &amp;
        patient records</Link> for how identity underpins this.
      </CalloutBox>

      <h2>Self-registration &amp; online booking</h2>
      <p>
        A portal earns its keep when a brand-new patient can onboard without staff. The flow: create an account,
        add family members, find a listed hospital, and book an appointment &mdash; which creates that
        member&rsquo;s record at the hospital from their profile, so the doctor has everything ready on arrival.
      </p>
      <WorkflowDiagram
        title="New patient → booked, self-service"
        steps={[
          { label: 'Register', sublabel: 'Name, email, phone, Aadhaar' },
          { label: 'Add members', sublabel: 'Family under one login' },
          { label: 'Find hospital', sublabel: 'From the directory' },
          { label: 'Book', sublabel: 'Record auto-created' },
        ]}
      />

      <h2>Privacy, consent and the DPDP Act</h2>
      <p>
        A portal that shows health records is handling sensitive personal data, so privacy is not optional. Two
        principles keep it clean. First, <strong>a patient only ever sees their own (and their family
        members&rsquo;) records</strong> &mdash; never anyone else&rsquo;s &mdash; and the system must enforce
        that ownership on every request, not just hide links in the interface. Second, giving a family member
        access to a person&rsquo;s records is itself a consent decision: the account holder is asserting they are
        entitled to manage that member (a parent for a minor, a caregiver for an elderly parent). Under
        India&rsquo;s DPDP Act, this maps to consent and, for children, guardian consent.
      </p>
      <p>
        There is also a data-residency nuance worth understanding: a <em>universal login</em> is not the same as
        <em> universal data sharing</em>. One login can let a patient reach all their hospitals, while each
        hospital&rsquo;s clinical records remain that hospital&rsquo;s own &mdash; the portal shows the patient
        their data at each place, it does not merge every hospital&rsquo;s notes into a shared pool. That
        distinction is what makes a convenient single login compatible with keeping clinical data siloed where it
        legally belongs. The broader compliance picture is in the{' '}
        <Link href="/guides/hospital-software-data-security-dpdp">DPDP &amp; data security guide</Link>.
      </p>

      <h2>What a patient should &mdash; and shouldn&rsquo;t &mdash; see</h2>
      <p>
        A good portal is deliberate about scope. Patients should see the things that are theirs and finished:
        their visit history, prescriptions, finalised lab and radiology reports, and their bills. They generally
        should <em>not</em> see raw internal working notes, draft or unverified results, or clinical commentary
        not meant for the patient &mdash; releasing an un-finalised report can cause needless alarm. The design
        goal is genuine transparency about completed information, without turning the portal into a live window
        onto every internal note. Getting this boundary right is what makes clinicians comfortable with a portal
        existing at all.
      </p>

      <h2>Driving adoption &mdash; the part hospitals underestimate</h2>
      <p>
        A portal only helps if patients actually use it, and adoption is mostly an operational habit, not a
        technical feature. Two things at the registration desk make the difference: capturing an{' '}
        <strong>email</strong> (so the patient can be reached and can reset a password) and an{' '}
        <strong>Aadhaar</strong> (so their records link to the right family member). If reception treats these as
        optional afterthoughts, the portal stays empty; if capturing them is routine, records light up in the
        portal automatically and patients have a reason to return. A one-line prompt &mdash; &ldquo;add your email
        and you can see your reports and bills online&rdquo; &mdash; at the counter does more for adoption than
        any amount of in-app polish.
      </p>

      <h2>Portal vs WhatsApp and SMS</h2>
      <p>
        A portal does not replace messaging &mdash; they do different jobs. WhatsApp and SMS are <em>push</em>:
        good for a one-way nudge (&ldquo;your report is ready,&rdquo; &ldquo;bill for &#8377;X,&rdquo; an
        appointment reminder). The portal is <em>pull</em>: the place a patient goes to actually see the report,
        review past bills, or book. The strongest experience uses both &mdash; a message notifies, and a link
        leads into the portal for the detail. Until a hospital&rsquo;s messaging provider is live, the portal can
        stand on its own with email-based login and notifications, then layer messaging on top later.
      </p>

      <h2>How Uyirly offers this</h2>
      <p>
        Uyirly runs a universal patient portal where <strong>one login can hold a whole family</strong>, and each
        member&rsquo;s records link by Aadhaar across every Uyirly hospital they visit.
      </p>
      <StatGrid stats={[
        { value: 'One login', label: 'Email + password, whole family' },
        { value: 'Members', label: 'Add spouse / child / parent' },
        { value: 'Aadhaar-linked', label: 'Records find the right member' },
        { value: 'Self-serve', label: 'Register & book online' },
      ]} />
      <p>
        A patient signs in and sees their <strong>family</strong> &mdash; each member with their hospitals and
        records &mdash; and can <strong>add a family member</strong> (name + Aadhaar), then <strong>find a
        hospital and book</strong> for any member. When a member is booked or registered at a hospital, Uyirly
        creates that hospital&rsquo;s record from the member&rsquo;s profile and links it back by Aadhaar &mdash;
        so their reports and bills appear in the portal automatically. Hospital reception can capture Aadhaar at
        registration to link existing records too (with an emergency exception when a patient hasn&rsquo;t brought
        it).
      </p>
      <ScreenMock title="Patient Portal · Your family" caption="One login, each family member with their hospitals — switch member to view records or book.">
        <MockTable
          head={['Member', 'Relationship', 'Hospitals']}
          rows={[
            ['Rahul Sharma', 'You', 'City Care · Revathi MC'],
            ['Anita Sharma', 'Spouse', 'City Care'],
            ['Aarav Sharma', 'Child', '—'],
          ]}
        />
        <div style={{ marginTop: 10, fontSize: 13, color: '#0D9488', fontWeight: 600 }}>+ Add family member · Find a hospital &amp; book</div>
      </ScreenMock>
      <CalloutBox tone="tip" title="Capture email &amp; Aadhaar at the desk">
        The portal only lights up for a patient once their record carries an email (to reach them) and Aadhaar
        (to link the right member). Making these part of routine registration is what turns the portal from a
        feature into something patients actually use.
      </CalloutBox>

      <h2>Where it fits</h2>
      <p>
        The patient portal is the patient-facing face of the whole system &mdash; it surfaces the{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">EMR and records</Link>, the reports from{' '}
        <Link href="/guides/lab-lis-workflow-guide">lab</Link> and{' '}
        <Link href="/guides/radiology-ris-reporting-guide">radiology</Link>, and online booking into the{' '}
        <Link href="/guides/opd-queue-token-management-guide">OPD queue</Link>. Done as a family account with
        universal identity, it becomes something a household keeps and returns to &mdash; not a one-off login they
        forget.
      </p>
    </>
  )
}
