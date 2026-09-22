import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'

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
        A Laboratory Information System has one job: take a test from the moment a doctor orders it to the
        moment a result reaches them, without anything getting lost, mixed up, or handed over on paper. Most
        of what goes wrong in a hospital lab is not analytical — the analyser is usually fine. It is a
        sample labelled by hand, a result phoned to a ward, or a report that never made it back into the
        patient&apos;s file.
      </p>

      <h2>The three states a test lives in</h2>
      <Screenshot
        src="/guides/lab-orders.png" width={2560} height={732}
        alt="Laboratory worklist with tabs for To Collect, Result Entry and Reported, showing a patient whose CBC is ordered, with buttons to print a label and collect the sample"
        caption="One worklist, three stages. The counts say where the work is."
      />
      <p>
        A lab worklist is only useful if it answers &ldquo;what do I do next&rdquo; rather than &ldquo;what
        exists&rdquo;. Three stages do that:
      </p>
      <ul>
        <li><strong>To Collect</strong> — ordered, sample not yet taken. This is the phlebotomist&apos;s list.</li>
        <li><strong>Result Entry</strong> — sample collected, results not yet entered. This is the technician&apos;s list.</li>
        <li><strong>Reported</strong> — results entered and released to the doctor.</li>
      </ul>
      <p>
        Every order carries an <strong>accession number</strong> — the lab&apos;s own identifier, separate
        from the patient&apos;s UHID and from the bill. It is what goes on the tube, and it is what makes a
        sample traceable when a tube arrives at the bench with nothing but a barcode on it.
      </p>

      <h2>Labelling the sample</h2>
      <p>
        The <strong>Label</strong> button prints a tube label carrying the accession number as a Code 128
        barcode, with the patient name and the test beside it. This is the single highest-value thing a lab
        system does, and it is worth being blunt about why: a handwritten tube label is the most common
        route to a result being attached to the wrong patient. A printed barcode removes the handwriting
        and the transcription both.
      </p>

      <h2>Results, and what gets flagged</h2>
      <Screenshot
        src="/guides/lab-reported.png" width={2560} height={732}
        alt="Laboratory worklist filtered to Reported, showing a completed order with its tests and result flags"
        caption="Reported tests, with abnormal values marked rather than left to be spotted."
      />
      <p>
        Each test in the catalogue carries its reference range. When a numeric result is entered it is
        compared against that range and flagged <strong>high</strong> or <strong>low</strong> automatically
        — nobody decides per result whether something is abnormal, and nobody has to remember the range for
        a test they run twice a month.
      </p>
      <p>
        That flag is what makes a report scannable. A doctor reading twelve values wants the two that are
        outside range to announce themselves.
      </p>

      <h2>Where the order comes from, and where the charge goes</h2>
      <p>
        An order raised during a consultation arrives in the lab attached to that patient and that visit —
        no re-registration, no separate lab file. A ward order for an admitted patient behaves the same way
        and bills to the stay rather than to a counter. The charge follows the order: ordering the test is
        what creates it, so the lab does not have to tell billing what to charge. See{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing</Link> for how those lines land on
        one bill.
      </p>

      <h2>The report</h2>
      <p>
        A released report prints on the hospital&apos;s letterhead with the patient, the tests, the results,
        their reference ranges and the flags — the thing a patient carries to another doctor. Because it
        sits on the patient&apos;s record rather than in a lab folder, the next consultation opens with it
        already there.
      </p>

      <h2>What to check before buying</h2>
      <ol>
        <li><strong>Can it print a tube label?</strong> If samples are still labelled by hand, the rest of the system is decoration.</li>
        <li><strong>Does the reference range live with the test?</strong> Flagging that depends on a technician remembering ranges is not flagging.</li>
        <li><strong>Does an OPD order and a ward order behave the same?</strong> If the ward has its own parallel process, results will go missing from one of them.</li>
      </ol>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A worklist in three stages — to collect, result entry, reported — with counts on each.</li>
        <li>An accession number per order, printed as a Code 128 tube label with the patient and test.</li>
        <li>Reference ranges held on the test, with results flagged high or low automatically.</li>
        <li>Orders raised from an OPD consultation or a ward, both attached to the right patient.</li>
        <li>Charges created by the order itself, reaching the patient&apos;s bill without re-entry.</li>
        <li>Reports on the hospital letterhead, kept on the patient record.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The lab is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing one patient
        record with the consultation that ordered the test.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
