import Link from 'next/link'

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
        Radiology follows a workflow shape very similar to the lab — an order, some imaging or diagnostic
        activity, and a report the ordering doctor reads — but with equipment scheduling and, often, image
        files added to the mix.
      </p>

      <h2>How a radiology order flows</h2>
      <p>
        A doctor orders an X-ray, ultrasound, CT or MRI from OPD or IPD. For equipment-heavy modalities (CT,
        MRI), the order needs a scheduled slot so the machine and technician aren&apos;t double-booked; a plain
        X-ray is usually just queued and captured directly. Once imaging is done, a radiologist reviews and
        signs a report, which should appear back on the patient&apos;s record for the ordering doctor to read —
        the same connected pattern as{' '}
        <Link href="/guides/lab-lis-workflow-guide">lab order-to-report tracking</Link>.
      </p>

      <h2>RIS vs. PACS</h2>
      <p>
        The workflow and order management (RIS) is different from image storage and viewing (PACS). Many
        hospital management systems handle the RIS side natively — orders, scheduling, report text — while
        integrating with a specialized PACS for actual image storage and viewing, since PACS has its own
        deep, imaging-specific requirements.
      </p>

      <h2>Billing and combined records</h2>
      <p>
        Like lab, a radiology charge for an admitted patient should post to the running IPD bill the moment
        it&apos;s ordered or performed — see <Link href="/guides/ipd-billing-software-explained">IPD billing explained</Link>{' '}
        — and the report itself becomes part of the patient&apos;s permanent record alongside consultations and
        lab results.
      </p>

      <p>
        In practice, the two things worth confirming before choosing radiology software are whether
        equipment-heavy scans actually get a scheduling slot (preventing the double-booking that causes real
        scheduling headaches), and whether the signed report lands back on the same patient record the order
        came from — rather than becoming a disconnected file the ordering doctor has to go looking for.
      </p>
    </>
  )
}
