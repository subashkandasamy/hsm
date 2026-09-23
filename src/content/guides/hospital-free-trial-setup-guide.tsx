import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What do you need ready before starting a hospital software free trial?',
    a: 'Your hospital name, the departments you run, a handful of staff with their roles, and your basic rates — consultation fees, bed rates, common procedures. A few sample patients make the trial far more useful than clicking around an empty system. None of it needs to be your real production data.',
  },
  {
    q: 'How long does it take to get a hospital live on new software?',
    a: 'The core — profile, departments, staff logins, rates — is a morning\'s work. Going fully live across every department happens over the following days as each one is switched on and the staff who use it get comfortable.',
  },
  {
    q: 'What is a hospital code and why does it matter?',
    a: 'A short prefix on every patient ID and bill number, like CITY-UH-2026-00005. It is worth setting before you register anyone, because it appears on every identifier the hospital issues from then on.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A trial is only worth anything if you set the system up the way your hospital actually runs. Clicking
        through someone else&apos;s demo data tells you the software has screens. Registering your own
        patient, prescribing from your own stock and printing your own bill tells you whether it fits.
      </p>
      <p>
        This is what the first morning looks like.
      </p>

      <h2>Signing up</h2>
      <Screenshot
        src="/guides/signup.png" width={1604} height={2190}
        alt="Signup form asking for hospital name, a login address ending in uyirly.com, your name, mobile, email and password, then a grid of starting departments to switch on, ending in a create button and a 30-day free trial note"
        caption="The one screen that decides two things worth thinking about for a minute."
      />
      <p>Two fields on this page are worth slowing down for.</p>
      <ul>
        <li>
          <strong>The login address.</strong> This becomes your hospital&apos;s own web address, the one
          every member of staff types every morning. Short is better than complete — your hospital&apos;s
          name, not its full legal title.
        </li>
        <li>
          <strong>The starting departments.</strong> These are not labels. The department a doctor belongs to
          decides which clinical form opens for their consultations: choose Paediatrics and those doctors get
          growth charts and immunisation schedules; choose Gynaecology and they get the antenatal record and
          the labour ward. Getting this right at signup saves discovering, a month later, that your
          paediatrician has been typing weights into a general notes box.
        </li>
      </ul>
      <CalloutBox tone="info" title="You can change both later, but one is cheaper than the other">
        Departments can be added or removed any time in Settings. The login address is the one that is
        awkward to change once staff have it in their browsers and your printed material carries it.
      </CalloutBox>

      <h2>The setup checklist</h2>
      <p>
        Once you are in, a <strong>Getting started</strong> page tracks what is still outstanding. It is not
        a tour — each item checks the database and ticks itself when the thing is actually there, and the
        list only shows the steps that apply to the modules you turned on.
      </p>
      <WorkflowDiagram
        title="What the checklist asks for"
        steps={[
          { label: 'Profile & code', sublabel: 'What prints on bills' },
          { label: 'Your team', sublabel: 'Logins and roles' },
          { label: 'Catalogues', sublabel: 'Tests, scans, medicines' },
          { label: 'Rates & wards', sublabel: 'Before the first bill' },
          { label: 'First patient', sublabel: 'The whole flow, once' },
        ]}
      />
      <ol>
        <li>
          <strong>Hospital profile</strong> — logo, address and contact details, because these are what
          appear on every bill, prescription and report you print.
        </li>
        <li>
          <strong>Hospital code</strong> — the short prefix on patient IDs and bill numbers. Set it before
          you register anyone.
        </li>
        <li>
          <strong>Your team</strong> — adding a person creates their login, and their role decides what they
          can see. See{' '}
          <Link href="/guides/hospital-staff-attendance-hr-guide">staff and attendance</Link>.
        </li>
        <li>
          <strong>Doctor OPD hours</strong> — each doctor&apos;s weekly sessions, which the patient app books
          against.
        </li>
        <li>
          <strong>Lab and radiology catalogues</strong> — the tests and scans you offer, with sample types,
          prices and reference ranges. Ranges are what make a result flag itself as abnormal later.
        </li>
        <li>
          <strong>Pharmacy stock</strong> — your medicines and opening stock, so you can dispense and bill
          rather than typing names in free text.
        </li>
        <li>
          <strong>Wards and beds</strong> — if you admit patients.
        </li>
        <li>
          <strong>Billing rates</strong> — consultation and procedure charges, before the first bill rather
          than after it.
        </li>
        <li>
          <strong>Your first patient</strong> — the point of the whole exercise.
        </li>
      </ol>

      <h2>The test that matters</h2>
      <p>
        Run <strong>one patient end to end</strong>, and have the people who will actually do each step do
        it. Not the owner clicking through everything alone — a receptionist registering the walk-in, a nurse
        recording vitals, the doctor prescribing, the pharmacy dispensing, the cashier taking the money.
      </p>
      <p>
        What you are checking is not whether each screen works. It is whether the prescription reached the
        pharmacy without being retyped, whether the consultation fee and the medicines landed on{' '}
        <em>one</em> bill, and whether the nurse could record vitals without being able to write the
        consultation. Those joins are where hospital software is actually decided, and they are invisible
        until someone walks a patient through them.
      </p>
      <p>
        Our <Link href="/guides/hospital-management-software-india">buyer&apos;s checklist</Link> covers what
        else to evaluate during a trial.
      </p>

      <h2>Then go live gradually</h2>
      <p>
        Nobody should move a whole hospital in one night. Start with the department that hurts most —
        usually OPD and the pharmacy — and add the rest as each one settles. If you are coming off paper
        registers rather than another system, our{' '}
        <Link href="/guides/switching-from-spreadsheets-to-hms">guide to switching from spreadsheets</Link>{' '}
        covers a phased rollout that does not disrupt patient care, and the{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">digitisation workflow guide</Link> sets out
        the order.
      </p>

      <h2>Getting started</h2>
      <p>
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card, and your hospital gets its
        own private workspace from the first minute. After the trial it is flat monthly pricing; see{' '}
        <Link href="/pricing">pricing</Link>.
      </p>
    </>
  )
}
