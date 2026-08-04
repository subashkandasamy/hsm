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

      <h2>The failure mode this is designed to prevent</h2>
      <p>
        Stockouts on essential surgical consumables rarely happen because nobody was watching the shelf &mdash;
        they happen because the reorder threshold was set hospital-wide instead of per item, so a
        fast-moving suture ran out weeks before its &ldquo;low stock&rdquo; alert would have fired under a generic
        rule. The fix isn&apos;t more vigilance; it&apos;s a reorder point calculated per item from how quickly it
        actually moves, checked automatically against goods received so a short delivery gets caught before
        it becomes a shortage during a procedure.
      </p>
      <h2>How Uyirly handles inventory and purchase orders</h2>
      <p>
        <Link href="/hospital-management-software">Uyirly</Link> tracks general stores and consumables by
        batch and expiry, issues oldest-valid-first, and flags items that are low or about to expire. When
        stock runs low, you raise a purchase order to a supplier, receive it against the order, and the stock
        updates itself &mdash; so the register is never out of date and nothing quietly expires on the shelf.
      </p>
      <ul>
        <li>Batch and expiry tracking with low-stock and near-expiry alerts.</li>
        <li>Reorder levels that turn into purchase orders in a click.</li>
        <li>Receive a PO against its order; stock and cost update automatically.</li>
        <li>Supplier records tied to each purchase order.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Inventory is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>, alongside the <Link href="/pharmacy-management-software">pharmacy</Link> for drug
        stock. You can <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
