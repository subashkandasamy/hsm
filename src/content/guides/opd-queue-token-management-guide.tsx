import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a token system in hospital OPD?',
    a: 'A token system gives each patient a sequential number for the doctor they are seeing, so they can be called in order without physically holding a place in a line. Combined with appointment slots it lets scheduled and walk-in patients share one fair queue.',
  },
  {
    q: 'Are tokens numbered per doctor or for the whole hospital?',
    a: 'Per doctor, per day. A hospital-wide sequence tells a patient nothing about their turn, because three doctors consulting in parallel produce a number that jumps unpredictably. In Uyirly each doctor has their own counter that resets daily.',
  },
  {
    q: 'How does OPD queue software reduce waiting time?',
    a: 'It does not make consultations faster. It removes the time patients spend forming a line or repeatedly asking how much longer, and it removes the re-registration of a returning patient, which is often the slowest part of the visit.',
  },
  {
    q: 'Can a nurse record vitals before the doctor sees the patient?',
    a: 'Yes. Nurses have permission to record vitals on a visit without being able to write the consultation, so BP, pulse, temperature and weight are already on screen when the doctor opens the patient.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Most OPD waiting rooms are not slow because consultations take too long. They are slow because
        nobody can see the order. Patients stand near the door to hold their place, a returning patient is
        registered from scratch because nobody can find them, and the doctor spends the first two minutes
        of every consultation asking what a nurse could have recorded outside.
      </p>
      <p>
        This guide walks through an OPD visit as the software sees it — booking, arrival, the queue, the
        consultation, and what it leaves behind.
      </p>

      <h2>The flow, end to end</h2>
      <WorkflowDiagram
        title="One OPD visit"
        steps={[
          { label: 'Book or walk in', sublabel: 'Token issued per doctor' },
          { label: 'Check in', sublabel: 'Patient joins the worklist' },
          { label: 'Vitals', sublabel: 'Nurse records before the doctor' },
          { label: 'Consultation', sublabel: 'Complaint, diagnosis, prescription' },
          { label: 'Bill & pharmacy', sublabel: 'Same patient, same bill' },
        ]}
      />

      <h2>Step 1 — Finding the patient, or registering them once</h2>
      <Screenshot
        src="/guides/patient-register.png" width={1324} height={1624}
        alt="Patient registration form with full name, phone, date of birth, age, gender, blood group, Aadhaar and address"
        caption="Registration asks for gender and age because the rest of the system depends on both."
      />
      <p>
        A returning patient should never be registered twice. Searching by phone number or UHID finds them
        with their whole history attached — which is the difference between a two-minute reception step and
        a twenty-second one.
      </p>
      <CalloutBox tone="info" title="Why gender and age are required">
        They are not form-filling. Gender and age decide which clinical form opens, how a paediatric dose is
        checked, whether growth charts appear, and whether the maternity record is available at all. A
        patient registered without them quietly loses those features later, and nobody connects the two.
        Most walk-ins give an age rather than a birthday, so either satisfies it — enter the age and the
        date of birth is worked back from it, marked as an estimate.
      </CalloutBox>

      <h2>Step 2 — The token</h2>
      <Screenshot
        src="/guides/appointments.png" width={2560} height={1534}
        alt="Appointments screen listing the day's bookings with patient, doctor, time, token number and status"
        caption="The day's appointments, each with the doctor it belongs to and its token."
      />
      <p>
        Tokens are issued <strong>per doctor, per day</strong>, from a counter that resets each morning. That
        detail matters more than it sounds: a single hospital-wide sequence tells a patient nothing about
        their turn, because three doctors consulting in parallel make the numbers jump. Token 4 for Dr Arun
        means three patients ahead of you with Dr Arun.
      </p>
      <p>
        Walk-ins and booked appointments take numbers from the same counter, so they share one fair order
        rather than forming two competing queues at the same door.
      </p>

      <h2>Step 3 — The worklist</h2>
      <Screenshot
        src="/guides/opd-queue.png" width={2560} height={772}
        alt="OPD worklist showing checked-in patients with token number, name, UHID, phone, doctor, appointment time, reason and a Start Consultation button"
        caption="Who has arrived, in order, with the reason they came — and one button to begin."
      />
      <p>
        Checking a patient in moves them onto the worklist. Each row carries the token, the patient and
        their UHID, the doctor, the time and the reason for the visit, so the doctor starts the consultation
        already knowing why the patient is there.
      </p>

      <h2>Step 4 — Vitals, before the doctor</h2>
      <Screenshot
        src="/guides/opd-vitals.png" width={2464} height={468}
        alt="Vitals row on a consultation with blood pressure, pulse, temperature, SpO2, weight and height"
        caption="Recorded at the door by a nurse, so they are on screen when the doctor opens the patient."
      />
      <p>
        Nurses can record vitals on a visit without being able to write the consultation itself — a
        genuinely separate permission, not a trust arrangement. In a busy OPD this is the cheapest minute
        you will ever save: six numbers captured outside the room that would otherwise be taken inside it.
      </p>

      <h2>Step 5 — The consultation</h2>
      <Screenshot
        src="/guides/opd-consultation.png" width={2464} height={828}
        alt="Consultation card with chief complaint, diagnosis, ICD code and notes filled in for a diabetes follow-up"
        caption="Complaint, diagnosis, ICD code and notes — the ICD code searchable rather than remembered."
      />
      <p>
        What the consultation asks for depends on the department. A general medicine visit takes complaint,
        diagnosis, ICD code and notes. A paediatric one adds{' '}
        <Link href="/guides/paediatric-growth-chart-who-guide">growth charts and immunisation</Link>; a
        gynaecology one adds{' '}
        <Link href="/guides/antenatal-care-labour-ward-guide">antenatal care</Link>; dental and
        ophthalmology have their own. The template comes from the department the doctor belongs to, so
        nobody chooses it per visit.
      </p>

      <h2>Step 6 — What the visit leaves behind</h2>
      <p>
        A consultation ends by producing things other departments need: a prescription that reaches the{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy</Link> without being
        retyped, lab or imaging orders that reach those{' '}
        <Link href="/guides/lab-lis-workflow-guide">worklists</Link>, and a consultation charge that lands
        on the same bill as everything else the patient does today. That is the real test of whether the
        OPD module is part of the hospital or a standalone queue display.
      </p>

      <h2>The two questions worth asking a vendor</h2>
      <ol>
        <li>
          <strong>Is the token per doctor or per hospital?</strong> A hospital-wide number looks tidy in a
          demo and is useless in a corridor.
        </li>
        <li>
          <strong>What happens to the prescription?</strong> If the answer involves printing it and carrying
          it to the pharmacy counter, the two modules are not connected, whatever the brochure says.
        </li>
      </ol>

      <h2>What Uyirly does</h2>
      <ul>
        <li>One ordered worklist of who has arrived, with appointments and walk-ins in the same queue.</li>
        <li>Tokens numbered per doctor per day, from a counter that resets each morning.</li>
        <li>Returning patients found by phone number or UHID, with their history attached.</li>
        <li>Nurses can record vitals without being able to write the consultation.</li>
        <li>The consultation form follows the department — paediatrics, obstetrics, dental and ophthalmology each get their own.</li>
        <li>Prescription, orders and the consultation charge all reach the same patient and the same bill.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The OPD is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing one patient
        record with pharmacy, lab and billing.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
