import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What is an LIS in hospital software?',
    a: 'LIS stands for Laboratory Information System — the module that manages test orders, sample tracking, processing and report generation for a hospital lab, connected to the same patient record as everything else.',
  },
  {
    q: 'How does a lab order reach the lab without a paper slip?',
    a: 'When a doctor orders a test from OPD or IPD, it should appear directly in the lab\'s order queue electronically, tagged to the patient and the ordering doctor — no printed requisition needs to physically travel to the lab.',
  },
  {
    q: 'Does the lab report automatically appear on the patient\'s bill?',
    a: 'It should. Once a test is ordered, its charge can post to the patient\'s bill immediately (OPD) or to the running IPD bill, so billing doesn\'t require the lab and billing desk to reconcile separately at the end of the day.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A lab order that starts as a doctor&apos;s instruction and ends as a signed report touches several
        hands along the way — the ordering doctor, sample collection, the lab technician processing it, and
        whoever verifies and releases the result. A Laboratory Information System (LIS) exists to keep that
        chain connected electronically instead of relying on paper requisition slips and manually delivered
        reports.
      </p>

      <h2>The order-to-report workflow</h2>
      <WorkflowDiagram
        title="How a lab order moves"
        steps={[
          { label: 'Order placed', sublabel: 'From OPD or IPD' },
          { label: 'Sample collected', sublabel: 'Tagged to the order' },
          { label: 'Processing', sublabel: 'Results entered' },
          { label: 'Verified & released', sublabel: 'Report reaches the doctor' },
        ]}
      />
      <p>
        Each step should update the same order record rather than creating disconnected paperwork — a doctor
        checking a patient&apos;s chart should see whether a test is ordered, collected, in-process, or reported,
        without calling the lab to ask.
      </p>

      <h2>Priority and turnaround</h2>
      <p>
        Not every test is equal. Emergency and stat orders need to visibly jump the queue ahead of routine
        tests, and a lab worklist should make that priority obvious rather than relying on the lab technician
        remembering which orders were urgent.
      </p>

      <h2>Where lab connects to the rest of the hospital</h2>
      <p>
        A lab order for an admitted patient should post its charge to that patient&apos;s running IPD bill
        automatically — see our <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link>.
        For radiology, which follows a very similar order-to-report shape with imaging in place of a physical
        sample, see our <Link href="/guides/radiology-ris-reporting-guide">radiology workflow guide</Link>.
      </p>

      <h2>The paper slip is the tell</h2>
      <p>
        A simple way to judge whether a lab is genuinely digitized: does a printed requisition slip still
        physically travel from the ward to the lab? If it does, the order-tracking, the priority flagging and
        the automatic billing described above aren&apos;t actually connected yet &mdash; they&apos;re running alongside a
        paper process rather than replacing it, which means every one of those benefits depends on someone
        remembering to also update the digital record.
      </p>
      <h2>How Uyirly runs the lab</h2>
      <p>
        <Link href="/lab-management-software">Uyirly&apos;s lab</Link> follows every sample by barcode from
        collection to a verified report. A test ordered in a consultation appears on the lab worklist with no
        paper slip; the technician enters results against the reference ranges, which flag high and low values
        automatically; a pathologist verifies before anything is released; and the letterhead PDF report is
        delivered to the patient by WhatsApp or a patient portal.
      </p>
      <ul>
        <li>Barcoded samples with a live worklist of pending, in-process and verified tests.</li>
        <li>Reference ranges flag abnormal values automatically.</li>
        <li>Verified reports become clean letterhead PDFs, delivered without a second visit.</li>
        <li>Walk-in and ward orders both bill to the right patient with no re-registration.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The lab runs standalone or inside Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing the patient
        record with OPD and <Link href="/radiology-information-system-software">radiology</Link>. You can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
