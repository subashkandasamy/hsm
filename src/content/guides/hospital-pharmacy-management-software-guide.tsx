import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the difference between OPD pharmacy sale and IPD pharmacy billing?',
    a: 'An OPD pharmacy sale is a walk-in, pay-immediately transaction against a prescription — like a retail pharmacy. IPD pharmacy dispensing is different: medicines issued to a ward for an admitted patient are charged to that patient\'s running combined bill, not paid for on the spot.',
  },
  {
    q: 'How does pharmacy stock get tracked by batch and expiry?',
    a: 'Every incoming stock entry (from a purchase order or supplier delivery) is recorded with its batch number and expiry date. When dispensing, the software should prefer the earliest-expiring batch first (FEFO — first-expiry-first-out) and block or warn against dispensing expired stock.',
  },
  {
    q: 'What is Schedule H1 in pharmacy compliance?',
    a: 'Schedule H1 drugs are a category of prescription medicines — mostly antibiotics and habit-forming drugs — that Indian pharmacies must dispense only against a prescription and log in a separate register with patient and doctor details. The full breakdown is in our drug schedule guide.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A hospital pharmacy is really two different operations wearing one name. One side looks like a retail
        pharmacy: walk-in patients, a prescription, immediate payment. The other side is a supply chain into
        every ward in the hospital: medicines issued against inpatient orders, charged to a running bill, and
        tracked by batch and expiry the whole way. A pharmacy module that only handles one of these well isn&apos;t
        really a hospital pharmacy system.
      </p>

      <h2>The two sides of hospital pharmacy</h2>
      <WorkflowDiagram
        title="Two dispensing paths, one stock"
        steps={[
          { label: 'OPD walk-in', sublabel: 'Prescription → sale → paid now' },
          { label: 'IPD ward request', sublabel: 'Order → dispense → billed to stay' },
        ]}
      />
      <p>
        Both paths draw from the same physical stock, which is exactly why they need to live in one system.
        A drug dispensed to Ward 3 has to reduce the same stock count as one sold across the counter &mdash;
        otherwise the pharmacy&apos;s recorded stock drifts from what is actually on the shelf, and nobody notices
        until a stock-take turns up a mismatch.
      </p>

      <h2>Inventory: batch and expiry tracking</h2>
      <p>
        Every unit of stock a hospital pharmacy holds should be traceable to the batch it arrived in and the
        date it expires. This matters for two reasons: patient safety (never dispense expired medicine) and
        cost control (never write off medicine that expired because older stock wasn&apos;t used first).
      </p>
      <ul>
        <li><strong>FEFO dispensing</strong> &mdash; first-expiry-first-out, so older batches get used before newer ones.</li>
        <li><strong>Expiry alerts</strong> &mdash; a running list of stock expiring in the next 30&ndash;90 days, so it can be used, returned, or written off deliberately rather than discovered too late.</li>
        <li><strong>Reorder thresholds</strong> &mdash; a minimum stock level per drug that triggers a restock alert before the shelf actually runs empty.</li>
      </ul>
      <p>
        For how purchase orders and supplier stock intake feed this pipeline, see our{' '}
        <Link href="/guides/hospital-inventory-purchase-order-guide">hospital inventory &amp; purchase order guide</Link>.
      </p>

      <h2>Dispensing against a prescription</h2>
      <p>
        Whether OPD or IPD, dispensing should always trace back to a prescription &mdash; drug name, dosage,
        frequency and the prescribing doctor. This isn&apos;t just good practice; several drug categories are
        legally required to be dispensed only against a recorded prescription. See{' '}
        <Link href="/guides/drug-schedule-h-h1-x-pharmacy-compliance">Schedule H, H1 &amp; X compliance</Link> for
        which drug categories carry stricter recording requirements.
      </p>
      <CalloutBox tone="warning" title="Brand vs. generic matters for search">
        Pharmacy stock and prescriptions are usually written by brand name, but hospitals often want to
        substitute or compare against the generic/molecule name for cost and stock reasons. A pharmacy module
        that only searches by exact brand name will constantly send staff hunting — searching by brand,
        manufacturer and molecule together is worth the extra setup.
      </CalloutBox>

      <h2>Billing: how pharmacy connects to the patient&apos;s bill</h2>
      <p>
        For an OPD sale, billing is immediate &mdash; the transaction is the bill. For an IPD ward request, the
        dispensed items become a line item on that patient&apos;s running combined bill instead of a standalone
        invoice, so the patient sees one bill at discharge rather than a stack of separate pharmacy slips. See
        our <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> for how that combined
        bill comes together across every department.
      </p>

      <h2>The one-stock-count test</h2>
      <p>
        There&apos;s a fast way to tell whether a pharmacy module actually unifies OPD and IPD, or just runs them
        as two disconnected features under one login: dispense an item to a ward, then check the OPD sale
        screen for that same drug. If the stock count dropped there too, it&apos;s genuinely one system. If it
        didn&apos;t, the &ldquo;single pharmacy module&rdquo; is really two separate stock ledgers wearing one interface
        &mdash; and that gap is exactly where physical stock and recorded stock quietly drift apart.
      </p>
      <h2>How Uyirly runs the pharmacy</h2>
      <p>
        <Link href="/pharmacy-management-software">Uyirly&apos;s pharmacy</Link> tracks every medicine by batch and
        expiry, and dispenses oldest-valid-first, so stock stays accurate and money does not walk out as
        expiry write-offs. A doctor&apos;s prescription flows straight to the pharmacy, which dispenses against it
        &mdash; so the medicine matches the consultation and the charge lands on the same patient bill.
      </p>
      <ul>
        <li>Batch-wise stock with expiry alerts before items lapse.</li>
        <li>Oldest-valid-batch suggested first (FEFO), so nothing expires unused.</li>
        <li>One counter for OPD walk-in sales and IPD ward issues.</li>
        <li>Schedule H, H1 and X carried on each drug, with H1 register fields captured on dispensing.</li>
        <li>Low-stock flags feed straight into purchase orders.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The pharmacy is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link> and shares the same patient and bill as the doctor. See our{' '}
        <Link href="/guides/drug-schedule-h-h1-x-pharmacy-compliance">Schedule H, H1 &amp; X guide</Link> for
        the compliance detail, or <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
