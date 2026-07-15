import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What\'s the difference between pharmacy stock and general hospital inventory?',
    a: 'Pharmacy stock is specifically drugs and consumables dispensed to patients. General hospital inventory covers everything else too — surgical supplies, linens, equipment, housekeeping stock — often across multiple stores (central store, ward stores, OT store).',
  },
  {
    q: 'How does a purchase order prevent stockouts?',
    a: 'By tracking a minimum reorder level per item — when stock falls below that threshold, it triggers a purchase order to the supplier automatically or flags it for a manager to approve, instead of someone noticing the shelf is empty.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A hospital runs on supplies that have to be somewhere, in the right quantity, before they&apos;re needed
        — surgical consumables before an operation, drugs before a ward runs short, linens before the next
        shift. Inventory and purchase order management is the unglamorous system that keeps that true.
      </p>

      <h2>The stock cycle</h2>
      <WorkflowDiagram
        title="From reorder point to shelf"
        steps={[
          { label: 'Stock falls low', sublabel: 'Below reorder threshold' },
          { label: 'Purchase order raised', sublabel: 'To a chosen supplier' },
          { label: 'Goods received', sublabel: 'Checked against the PO' },
          { label: 'Stock updated', sublabel: 'Batch & expiry recorded' },
        ]}
      />

      <h2>Multiple stores, one system</h2>
      <p>
        Larger hospitals don&apos;t keep one stockroom — a central store, ward-level stock, an OT store, and the
        pharmacy might all hold overlapping items. Inventory software needs to track stock per store while
        still giving a hospital-wide total, so a manager can see both &ldquo;how much do we have overall&rdquo; and
        &ldquo;how much is actually on Ward 3 right now.&rdquo;
      </p>

      <h2>Where this connects to pharmacy</h2>
      <p>
        Drug and consumable stock specifically flows into the pharmacy module for dispensing — see our{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy management guide</Link> for
        how batch and expiry tracking carries through from purchase order to patient dispensing.
      </p>

      <h2>What to check in inventory software</h2>
      <ul>
        <li>Configurable reorder thresholds per item, not a single hospital-wide rule.</li>
        <li>Stock tracked per store, with a combined hospital-wide total available too.</li>
        <li>Goods-received matching against the original purchase order, to catch short deliveries.</li>
        <li>Batch and expiry carried through from receipt to dispensing, not tracked separately.</li>
      </ul>
    </>
  )
}
