import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'

export const faqs = [
  {
    q: 'What is the difference between RIS and PACS in radiology?',
    a: 'RIS (Radiology Information System) manages the workflow — orders, scheduling, status and reports. PACS (Picture Archiving and Communication System) stores and displays the actual images. A hospital management system typically handles the RIS side, and either integrates with a separate PACS or a basic image-attachment workflow for smaller facilities.',
  },
  {
    q: 'Does a radiology order need to be scheduled like an OT booking?',
    a: 'For imaging that requires equipment time — CT, MRI, ultrasound with a technician — yes, scheduling avoids equipment double-booking. Simple X-rays are usually handled as a straightforward order-and-capture queue without a booking step.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Radiology has a narrow but unforgiving job: turn an order into a report, attached to the right
        patient, without anything sitting unnoticed in between. The failure modes are mundane — a scan
        performed but never reported, a report written but never seen by the doctor who asked, a study done
        and never billed.
      </p>

      <h2>The worklist, by stage</h2>
      <Screenshot
        src="/guides/radiology-worklist.png" width={2560} height={790}
        alt="Radiology worklist with tabs for Pending, Performed and Reported, listing an ordered obstetric ultrasound with its priority and requesting doctor"
        caption="Three stages with counts — what is waiting, what is done, what has been reported."
      />
      <p>
        Each stage answers a different person&apos;s question. <strong>Pending</strong> is the
        technician&apos;s list: which scans still have to be done. <strong>Performed</strong> is the
        radiologist&apos;s: scans done and waiting for a report — the queue where studies quietly go stale
        in hospitals that track this on paper. <strong>Reported</strong> is the record.
      </p>
      <p>
        An order carries its <strong>priority</strong>. An urgent chest film for a breathless inpatient and
        a routine antenatal scan are not the same job, and a worklist that cannot say so will have them
        worked through in the order they were typed.
      </p>

      <h2>The report</h2>
      <Screenshot
        src="/guides/radiology-reported.png" width={2560} height={834}
        alt="A reported chest X-ray showing the study, modality, requesting doctor, price, billed status and the radiologist's findings text"
        caption="The report is written against the order, so it lands on the patient's record rather than in a folder."
      />
      <p>
        The report is written against the order itself. That is the part that matters: it means the
        findings are attached to the patient, visible in the next consultation alongside their lab results,
        rather than living in a radiology folder that the treating doctor has to go and look for.
      </p>

      <h2>Where the order comes from, and where the charge goes</h2>
      <p>
        A scan ordered during a consultation or for an admitted patient reaches radiology already attached
        to that patient — there is no second registration at the imaging counter. The charge is created by
        the order, so a study that was performed is a study that was billed. For an inpatient it joins the
        running bill; see{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing</Link>.
      </p>

      <h2>What to check before buying</h2>
      <ol>
        <li><strong>Is there a stage between performed and reported?</strong> If a scan goes straight from ordered to reported, nothing tracks the studies that were done and not yet read — which is exactly where delays hide.</li>
        <li><strong>Does the report land on the patient record?</strong> A PDF emailed to the ward is not the same as a report the next consultation opens with.</li>
        <li><strong>Does the order create the charge?</strong> If billing is a separate entry, some studies will be performed for free.</li>
      </ol>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A worklist in three stages — pending, performed, reported — with counts on each.</li>
        <li>Priority on the order, so urgent studies are visible as urgent.</li>
        <li>A catalogue of studies by modality, each with its price.</li>
        <li>The report written against the order and kept on the patient&apos;s record, beside their lab and consultation history.</li>
        <li>Orders raised from an OPD consultation or a ward, without re-registering the patient.</li>
        <li>The charge created by the order, reaching the patient&apos;s bill without re-entry.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Radiology is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link> and shares one
        patient record with the{' '}
        <Link href="/guides/lab-lis-workflow-guide">lab</Link> and the consultation that ordered the scan.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
