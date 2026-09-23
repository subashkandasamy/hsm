import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the difference between pharmacy stock and general hospital inventory?',
    a: 'Pharmacy stock is drugs dispensed to patients, priced and billed per patient. General inventory is everything else the hospital consumes — gloves, syringes, cannulas, sutures, linen, housekeeping supplies — which is issued to a ward rather than sold to a person. They behave differently enough that they are usually separate registers.',
  },
  {
    q: 'How does a reorder level prevent stockouts?',
    a: 'Each item carries its own minimum. When stock falls below it the item is flagged, so a shortage is visible while there is still time to order rather than when somebody reaches for an empty shelf. The level has to be per item: a fast-moving suture and a rarely used instrument cannot share a threshold.',
  },
  {
    q: 'Why track batch and expiry on consumables?',
    a: 'Because sterile consumables expire, and an expired cannula is as unusable as an expired drug. Tracking batches lets the store issue the oldest valid stock first and warn before anything passes its date, instead of discovering it during a procedure.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A hospital runs on supplies that have to be in the right place, in the right quantity, before anyone
        needs them — consumables before an operation, linen before the next shift. The general store is the
        unglamorous register that keeps that true, and it is separate from the{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy</Link> because the two
        behave differently: pharmacy stock is sold to a patient, store stock is issued to a ward.
      </p>

      <h2>The register</h2>
      <Screenshot
        src="/guides/inventory-items.png" width={2560} height={1474}
        alt="Inventory items list with tabs for items, suppliers, orders, low stock and expiry, showing six items with their category, stock on hand and reorder level, two of them in red below their reorder point"
        caption="Every item with its own reorder level — the two in red are below theirs."
      />
      <p>
        An item is a name, a category, a unit and two numbers: <strong>what is on hand</strong> and{' '}
        <strong>the level below which it needs reordering</strong>. Each item&apos;s reorder level is its
        own, which is the whole point. Gloves at 40 pairs against a threshold of 100 is urgent; hand
        sanitiser at 46 bottles against a threshold of 30 is fine. A single hospital-wide rule would have
        flagged the wrong one.
      </p>
      <CalloutBox tone="tip" title="Set the level from how fast it moves">
        The useful reorder level is roughly what you consume during the lead time to get more, plus a
        buffer. An item your supplier delivers in two days needs a much lower threshold than one that takes
        a fortnight — and for anything used in theatre, the buffer should assume the delivery is late.
      </CalloutBox>

      <h2>The cycle</h2>
      <WorkflowDiagram
        title="From reorder point to shelf"
        steps={[
          { label: 'Stock falls low', sublabel: 'Flagged on its own level' },
          { label: 'PO raised', sublabel: 'Lines and a supplier' },
          { label: 'Marked ordered', sublabel: 'Placed, and waiting' },
          { label: 'Received', sublabel: 'Batch and expiry recorded' },
        ]}
      />
      <Screenshot
        src="/guides/inventory-orders.png" width={2560} height={864}
        alt="Purchase orders tab showing one order, PO-2026-00001 to Kumaran Surgicals, marked Ordered for ten thousand rupees, with a Receive button"
        caption="A purchase order moves draft → ordered → received, and receiving it is what updates stock."
      />
      <p>
        A purchase order is lines of item, quantity and price against a supplier. It starts as a{' '}
        <strong>draft</strong>, becomes <strong>ordered</strong> when it is actually placed, and is{' '}
        <strong>received</strong> against itself when the goods arrive. That last step is the one that
        matters: receiving records the batch, expiry and unit cost, and the stock figure moves as a
        consequence rather than being typed in. A delivery that is short is received short, and the order
        stays partially received instead of quietly closing.
      </p>
      <p>
        Raising the PO is a deliberate act, not an automatic one. The low-stock tab tells you what needs
        ordering; a person decides what to order and from whom. That is the right place for judgement —
        nobody wants software posting orders to a supplier on its own — but it does mean somebody has to
        look at the tab, which is worth building into a weekly routine rather than hoping.
      </p>

      <h2>Batches and expiry</h2>
      <Screenshot
        src="/guides/inventory-expiry.png" width={2560} height={816}
        alt="Expiry tab listing batches approaching their expiry date with the item, batch number, quantity remaining and days left"
        caption="Batches nearing their date, while there is still time to use or return them."
      />
      <p>
        Sterile consumables expire. Stock is held as <strong>batches</strong>, each with its own expiry and
        cost, and issuing takes from the batch that expires first — the same first-expiry-first-out rule the
        pharmacy uses. The expiry tab shows what is approaching its date, which is the difference between
        returning stock to a supplier and writing it off.
      </p>
      <p>
        It also means the cost you paid is attached to the stock you hold, rather than being an average
        nobody can trace back to a delivery.
      </p>

      <h2>What this does not do</h2>
      <p>
        Uyirly&apos;s store is a single register for the hospital. It does <em>not</em> model{' '}
        <strong>separate stores</strong> — a central store, an OT store and ward-level stock as distinct
        locations with transfers between them. If your hospital needs to answer &ldquo;how much is on Ward
        3 right now&rdquo; as opposed to &ldquo;how much do we have&rdquo;, that is a real gap and worth
        raising before you buy rather than after.
      </p>
      <p>
        Nor does it calculate reorder levels from consumption history — you set them, and revise them when
        experience says they are wrong.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>An item register with category, unit, stock on hand and a per-item reorder level.</li>
        <li>A low-stock tab listing exactly what is below its own threshold.</li>
        <li>Suppliers with a contact person, phone and email, attached to orders and batches.</li>
        <li>Purchase orders with lines and a total, moving draft → ordered → received or partially received.</li>
        <li>Receiving that records batch, expiry and unit cost, and updates stock from that.</li>
        <li>Issue and adjustment that consume the earliest-expiring batch first.</li>
        <li>An expiry tab for batches approaching their date.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The general store is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, alongside the{' '}
        <Link href="/pharmacy-management-software">pharmacy</Link> for drug stock — which has its own batch,
        expiry and dispensing workflow.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
