import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import StatGrid from '@/components/guides/diagrams/StatGrid'

export const faqs = [
  {
    q: 'What is a Hospital Management System (HMS)?',
    a: 'A Hospital Management System is software that connects a hospital\'s clinical and administrative departments — OPD, IPD, pharmacy, lab, radiology, billing and more — into one platform, so patient information and charges flow between departments automatically instead of being tracked separately on paper or in spreadsheets.',
  },
  {
    q: 'Is HMS the same as HIS or EMR?',
    a: 'They overlap but aren\'t identical. HMS (Hospital Management System) and HIS (Hospital Information System) are generally used interchangeably to mean the whole platform. EMR (Electronic Medical Record) is narrower — it usually refers specifically to the clinical record-keeping part (diagnoses, prescriptions, history), which is one module inside a full HMS.',
  },
  {
    q: 'What modules does a hospital management system usually include?',
    a: 'A typical HMS includes OPD, IPD, pharmacy, laboratory, radiology, billing, operation theatre, nursing/ward management, inventory, insurance/TPA claims, and staff/HR. Larger platforms add blood bank, emergency/triage, and specialty modules like dental or ophthalmology.',
  },
  {
    q: 'Do small clinics need a full hospital management system?',
    a: 'Not the whole thing at once. Most modern HMS platforms are modular — a small clinic can start with OPD, billing and pharmacy, and turn on IPD, lab, radiology or other modules only when the hospital actually needs them, without switching software later.',
  },
  {
    q: 'How much does a hospital management system cost in India?',
    a: 'It depends on the pricing model more than the number. Per-bed and per-user pricing rises as you grow, while flat monthly pricing stays predictable. Cloud systems like Uyirly start from a few thousand rupees a month with a free trial, and there is no server to buy. See our hospital management software cost guide for a full breakdown.',
  },
  {
    q: 'How long does it take to set up an HMS?',
    a: 'A cloud-based HMS can be live the same day — you sign up, add your staff and departments, and register your first patient, with nothing to install. On-premise systems take longer because a server has to be bought and configured first.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Walk into most Indian hospitals below a certain size and you&apos;ll still find the same thing: a
        registration register, a separate pharmacy stock book, lab reports handed over on paper, and a
        billing clerk manually adding up charges from four different departments at discharge. A Hospital
        Management System (HMS) exists to replace that scattered paper trail with one connected system.
      </p>

      <h2>Why a hospital needs an HMS</h2>
      <p>
        When every department keeps its own register, the hospital spends its day reconciling them. The
        pharmacy stock never matches the bill. A lab result is ready but never reaches the ward. A discharge
        waits an hour while someone totals the charges by hand. Worst of all, money quietly leaks out through
        charges that were given but never billed. An HMS fixes this by giving every department{' '}
        <strong>one shared patient and one shared bill</strong>, so there is only ever one set of numbers to
        trust — and the reconciliation work simply disappears.
      </p>

      <h2>What a hospital management system actually does</h2>
      <p>
        At its core, an HMS gives every department &mdash; reception, OPD, wards, pharmacy, lab, radiology,
        billing &mdash; the same live view of a patient, instead of each keeping its own separate record. When
        a doctor orders a lab test in OPD, the lab sees the order without a paper slip. When pharmacy
        dispenses medicine to a ward, it shows up on that patient&apos;s bill automatically. That connectedness,
        more than any single feature, is what &ldquo;hospital management software&rdquo; means in practice.
      </p>

      <h2>How a patient moves through an HMS</h2>
      <p>A simplified patient journey shows how the pieces connect:</p>
      <WorkflowDiagram
        title="A typical patient journey through hospital software"
        steps={[
          { label: 'Registration', sublabel: 'UHID created once' },
          { label: 'OPD consultation', sublabel: 'Vitals, diagnosis, prescription' },
          { label: 'Admission (if needed)', sublabel: 'Bed & ward assigned' },
          { label: 'Nursing & treatment', sublabel: 'Charges accrue daily' },
          { label: 'Billing & discharge', sublabel: 'One combined bill' },
        ]}
      />
      <p>
        Every step in that chain writes to the same patient record and the same running bill, instead of each
        department starting from a blank slate. We cover this flow in more depth in our{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">hospital digitization workflow guide</Link>.
      </p>

      <h2>The core modules</h2>
      <p>
        Most hospital management systems are built around the same core set of modules, though not every
        hospital turns all of them on:
      </p>
      <StatGrid stats={[
        { value: '70–80%', label: 'of hospital visits are OPD' },
        { value: '60–70%', label: 'of hospital revenue comes from IPD' },
      ]} />
      <ul>
        <li><strong>OPD</strong> &mdash; outpatient registration, appointments, queues and consultations. See <Link href="/guides/opd-queue-token-management-guide">OPD queue &amp; token management</Link>.</li>
        <li><strong>IPD</strong> &mdash; admissions, bed allotment, ward transfers and discharge. See <Link href="/guides/ipd-admission-bed-management-guide">IPD admission &amp; bed management</Link>.</li>
        <li><strong>Pharmacy</strong> &mdash; drug stock, dispensing and pharmacy billing. See <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy management guide</Link>.</li>
        <li><strong>Laboratory &amp; Radiology</strong> &mdash; test orders, sample tracking and reporting. See <Link href="/guides/lab-lis-workflow-guide">lab (LIS) workflow</Link> and <Link href="/guides/radiology-ris-reporting-guide">radiology workflow</Link>.</li>
        <li><strong>Billing</strong> &mdash; charges from every department combined into one bill. See <Link href="/guides/ipd-billing-software-explained">IPD billing explained</Link>.</li>
        <li><strong>Nursing &amp; staff scheduling</strong> &mdash; duty rosters and patient-to-nurse assignment. See <Link href="/guides/nurse-duty-roster-hospital-guide">nurse duty roster guide</Link>.</li>
        <li><strong>Operation Theatre, Blood Bank, Emergency</strong> &mdash; for hospitals that run surgeries, transfusions or a casualty department.</li>
        <li><strong>Inventory, Insurance/TPA, HR</strong> &mdash; the administrative backbone connecting supplies, claims and staff to the clinical side.</li>
      </ul>

      <h2>HMS vs. HIS vs. EMR &mdash; are they the same thing?</h2>
      <p>
        In everyday use, <strong>HMS</strong> (Hospital Management System) and <strong>HIS</strong> (Hospital
        Information System) mean the same thing &mdash; the whole platform. <strong>EMR</strong> (Electronic
        Medical Record) is narrower: it&apos;s specifically the clinical documentation part &mdash; history,
        diagnosis, prescriptions &mdash; which lives as one module inside a full HMS rather than being a
        separate product &mdash; we go deeper on that distinction in our{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">EMR &amp; UHID guide</Link>.
      </p>

      <h2>Do you need every module on day one?</h2>
      <p>
        No. Most modern platforms are modular by design &mdash; a small clinic can run OPD, billing and
        pharmacy alone, and switch on IPD, lab, radiology, OT or insurance only when the hospital actually
        grows into needing them. That&apos;s the difference between choosing software that scales with the
        hospital and choosing software you&apos;ll have to replace in two years. Our{' '}
        <Link href="/guides/hospital-management-software-india">buyer&apos;s guide for small &amp; mid-size hospitals</Link>{' '}
        covers how to evaluate that.
      </p>

      <h2>The benefits of a hospital management system</h2>
      <p>Put simply, a good HMS changes the day-to-day like this:</p>
      <ul>
        <li><strong>No double entry</strong> &mdash; a patient is registered once and used everywhere.</li>
        <li><strong>No lost charges</strong> &mdash; every test, medicine and bed charge lands on the bill.</li>
        <li><strong>Faster discharge</strong> &mdash; the bill is ready as care happens, not totalled by hand.</li>
        <li><strong>Fewer errors</strong> &mdash; results and prescriptions are structured, not scribbled.</li>
        <li><strong>Clear visibility</strong> &mdash; owners see live revenue, footfall, beds and stock.</li>
        <li><strong>Easier compliance</strong> &mdash; GST billing, insurance/TPA claims and NABH-style records are built in.</li>
      </ul>

      <h2>Cloud-based vs on-premise</h2>
      <p>
        An HMS can run on your own server (on-premise) or online (cloud). A{' '}
        <Link href="/cloud-based-hospital-management-system">cloud-based hospital management system</Link> has
        nothing to install, no server to buy or maintain, automatic backups, and works on any device or
        branch. For most hospitals today that is the simpler and safer choice — on-premise ties you to one
        machine and someone to keep it running.
      </p>

      <h2>Getting started with an HMS</h2>
      <p>
        You do not have to buy everything up front or take weeks to go live. A cloud HMS like{' '}
        <Link href="/hospital-management-software">Uyirly</Link> lets you sign up, add your team and
        departments, and register your first patient the same day. It fits a{' '}
        <Link href="/clinic-management-software">clinic</Link>, a{' '}
        <Link href="/nursing-home-management-software">nursing home</Link> or a full{' '}
        <Link href="/multi-specialty-hospital-software">multi-specialty hospital</Link> on the same platform,
        so you never have to switch systems as you grow. You can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card and judge it on your own
        patients.
      </p>
    </>
  )
}
