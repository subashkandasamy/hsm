import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the difference between OPD pharmacy sale and IPD pharmacy billing?',
    a: 'An OPD pharmacy sale is a walk-in, pay-immediately transaction against a prescription — like a retail pharmacy. IPD pharmacy dispensing is different: medicines issued to a ward for an admitted patient are charged to that patient\'s running combined bill, not paid for on the spot.',
  },
  {
    q: 'How does pharmacy stock get tracked by batch and expiry?',
    a: 'Every batch is received with its own batch number, expiry and cost. When medicines are handed over, the earliest-expiring batch still in date is used first (FEFO), and an expired batch cannot be sold at all.',
  },
  {
    q: 'How do I add my opening stock without typing every medicine?',
    a: 'Import the distributor\'s invoice. A CSV file — or rows pasted straight out of Excel — is read, its columns matched to batch, expiry, quantity, rate and MRP, and each medicine name matched against a catalogue of about 15,000 molecules and 240,000 Indian brands. You check the lines on screen and save the whole invoice at once.',
  },
  {
    q: 'What is Schedule H1 in pharmacy compliance?',
    a: 'Schedule H1 drugs are a category of prescription medicines — mostly second- and third-line antibiotics and habit-forming drugs — that must be dispensed only against a prescription and recorded in a separate register kept for three years. In Uyirly that register writes itself as the medicine is handed over.',
  },
  {
    q: 'Can a barcode scanner be used at the pharmacy counter?',
    a: 'Yes, and any keyboard-wedge scanner works with nothing to configure. The first time an unknown pack is scanned you say once which medicine it is; from then on it goes straight into the bill. Where a pack carries a GS1 code, the batch and expiry are read from it too.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A hospital pharmacy is really two operations wearing one name. One side looks like a retail
        pharmacy: walk-in patients, a prescription, immediate payment. The other is a supply chain into
        every ward — medicines issued against inpatient orders, charged to a running bill, tracked by batch
        and expiry the whole way. A module that only handles one of them well is not a hospital pharmacy
        system.
      </p>
      <p>
        This guide walks through how that works in practice, screen by screen: getting stock in, keeping it
        straight, handing it over, and the records the law expects you to keep. Every screenshot is of the
        running product, taken from a demo hospital.
      </p>

      <h2>What a pharmacy day is made of</h2>
      <Screenshot
        src="/guides/pharmacy-tabs.png" width={1258} height={84}
        alt="Pharmacy tab bar showing Sale Cart, Dispense, IPD Ward, Vaccines, Stock, Alerts and H1 Register, each with a count beside it"
        caption="Everything the counter does, with the queue length on each tab."
        priority
      />
      <p>
        The counts are the point. <strong>Dispense</strong> is how many prescriptions are waiting,{' '}
        <strong>IPD Ward</strong> how many ward requests are unfilled, <strong>Alerts</strong> how many
        medicines need attention. A pharmacist can read the state of the shelf without opening anything.
      </p>

      <h2>Step 1 — Getting stock in</h2>
      <p>
        Stock arrives as a distributor&apos;s invoice: one supplier, one invoice number, twenty or thirty
        medicines under it. So that is how it is entered — the invoice once at the top, then a line per
        medicine with only the things that change.
      </p>
      <Screenshot
        src="/guides/pharmacy-receive.png" width={2560} height={1262}
        alt="Receive stock screen with supplier, invoice number, date and invoice total across the top, and a medicine line below with batch, expiry, packs, free, rate and MRP"
        caption="The invoice is typed once. Each line needs batch, expiry, quantity and rate — the rest fills in from the catalogue."
      />
      <p>
        Picking the medicine fills in its pack size, HSN code and GST rate from a catalogue of roughly
        15,000 molecules and 240,000 Indian brands, so a line is four fields rather than twelve. Type the
        expiry as it is printed on the pack — <strong>09/28</strong> — and it is stored as the last day of
        that month. The running total at the foot is compared with the invoice total you entered, so a
        missed line or a mistyped rate surfaces before saving rather than at the next stock take.
      </p>

      <h3>Or let the invoice type itself</h3>
      <p>
        A thirty-line invoice is still a hundred and twenty fields. If the distributor sends a CSV — or you
        can copy the rows out of an Excel sheet — the whole thing can be read in one go.
      </p>
      <Screenshot
        src="/guides/pharmacy-receive-import.png" width={2560} height={1762}
        alt="Import panel showing the detected header row, dropdowns matching each column to Medicine, Batch, Expiry, Quantity, Rate and MRP, and a preview of the first rows"
        caption="The header row is found automatically, the columns are matched by name, and the first rows are previewed before anything loads."
      />
      <p>
        Exports usually open with the shop&apos;s name and GSTIN, so the header row is found by looking for
        the one that names the most columns. Headings like <em>Item</em>, <em>Particulars</em>,{' '}
        <em>B.No</em>, <em>Exp. Date</em> and <em>PTR</em> are recognised on sight; anything it cannot
        place is a dropdown away. Expiry is understood however it is printed — <code>09/28</code>,{' '}
        <code>30-11-2027</code>, <code>Mar-28</code>, <code>2028-06-30</code>.
      </p>
      <p>
        Each medicine name is then matched against the catalogue. <code>DOLO 650 TAB 15&apos;S</code> is
        stripped of its pack and form words before searching, so it finds the brand Dolo 650. A confident
        match fills the line; a guess is marked <strong>check</strong>; anything unmatched arrives with the
        invoice&apos;s own wording sitting in the search box, ready to pick.
      </p>
      <CalloutBox tone="warning" title="MRP per strip, or per tablet?">
        Distributors print it both ways, and reading it wrongly sets a selling price ten or fifteen times
        off. Whichever reading leaves a believable margin against the purchase rate is chosen, shown on
        screen, and can be flipped in one click — worth a glance every time.
      </CalloutBox>

      <h2>Step 2 — Keeping the shelf straight</h2>
      <Screenshot
        src="/guides/pharmacy-stock.png" width={2560} height={2264}
        alt="Stock tab listing ten medicines with filter chips for running low, expiring soon, out of stock and vaccines, and badges on individual rows for expiry, out of stock and Schedule H1"
        caption="Every medicine on the shelf, with the ones that need attention marked."
      />
      <p>
        Search reaches the brand you bought, the salt, the batch number and the rack label — so a strip in
        hand or a shelf tag finds the medicine. The chips narrow the list to what needs doing, each with
        its own count:
      </p>
      <ul>
        <li><strong>Running low</strong> — at or below the reorder level set for that medicine.</li>
        <li><strong>Expiring soon</strong> — a batch within 90 days of expiry, while it can still be used or returned.</li>
        <li><strong>Out of stock</strong> — nothing left, so it appears when you are ordering rather than when a patient asks.</li>
        <li><strong>Vaccines</strong> — the cold-chain items, which have screens of their own.</li>
      </ul>
      <Screenshot
        src="/guides/pharmacy-stock-filters.png" width={2560} height={896}
        alt="Stock tab filtered to Running low, showing a single medicine at 45 tablets against a reorder level of 90"
        caption="One filter, one answer: Pan 40 is at 45 against a reorder level of 90."
      />
      <p>
        Opening a row shows its batches, earliest expiry first, with the rack each sits on and who it was
        bought from — which is what you need when a batch has to go back to the distributor. Reorder level,
        quantity, MRP, cost and rack can all be corrected in place.
      </p>

      <h3>What the alerts are for</h3>
      <Screenshot
        src="/guides/pharmacy-alerts.png" width={2560} height={940}
        alt="Alerts tab showing two low-stock medicines with quantity remaining, reorder level and rack, and an Order what's low button"
        caption="Low stock, near expiry and expired batches — with one button that starts the purchase."
      />
      <p>
        <strong>Order what&apos;s low</strong> opens the receive screen with every medicine below its reorder
        level already listed, carrying its last supplier, pack, rate and a suggested quantity. It is a
        starting point you edit, not an order sent to anyone. Formal purchase orders to suppliers live in
        the <Link href="/guides/hospital-inventory-purchase-order-guide">inventory module</Link>, which
        tracks consumables rather than medicines.
      </p>

      <h2>Step 3 — Handing medicines over</h2>
      <WorkflowDiagram
        title="Two paths, one stock"
        steps={[
          { label: 'OPD walk-in', sublabel: 'Prescription → sale → paid now' },
          { label: 'IPD ward request', sublabel: 'Order → dispense → billed to the stay' },
        ]}
      />
      <p>
        Both draw on the same physical stock, which is exactly why they belong in one system. A medicine
        issued to a ward reduces the same count as one sold across the counter — otherwise recorded stock
        drifts from what is on the shelf, and nobody notices until a stock take.
      </p>
      <Screenshot
        src="/guides/pharmacy-dispense-queue.png" width={2560} height={1168}
        alt="Dispense tab listing patients whose prescriptions are waiting, each showing the prescribing doctor and the medicines prescribed"
        caption="Prescriptions waiting at the window, in the order they arrived."
      />
      <p>
        A prescription written during the consultation arrives here by itself — no retyping, and the
        medicine handed over is the one the doctor actually wrote. The earliest-expiring batch still in date
        is used first, so nothing quietly ages out at the back of the shelf, and an expired batch cannot be
        sold at all.
      </p>

      <h3>Scanning the pack</h3>
      <p>
        Any keyboard-wedge barcode scanner works, with nothing to configure — the counter recognises a
        scanner by how fast it types. The catch with medicine barcodes is that only about 300 formulations
        must carry a QR code today, and the plain EAN-13 on nearly every other pack identifies the product
        while carrying no batch and no expiry.
      </p>
      <p>
        So the counter learns. The first time an unknown pack is scanned you say once which medicine it is;
        every scan after that goes straight into the bill, and scanning the same pack again adds one more.
        Where a pack does carry a GS1 code, its batch and expiry are read as well. Receiving stock is the
        natural moment to teach codes, because the box is in your hand and you are about to say what it is
        anyway.
      </p>
      <CalloutBox tone="info" title="Your own labels, for the exact box">
        A manufacturer&apos;s barcode names the product but not the box — two batches of the same brand scan
        identically. Printing a stock label puts a code of your own on each batch, so a scan at the counter
        bills that exact box, and that box is the one taken off the shelf. Scan a box that is not the
        earliest to expire and it says so; scan an expired one and it refuses.
      </CalloutBox>

      <h2>Step 4 — The records the law expects</h2>
      <p>
        Schedule H1 covers second- and third-line antibiotics and several habit-forming medicines. Rule
        65(11A) requires every supply of one to be entered in a <strong>separate register</strong> — the
        patient, the prescriber, the drug, the quantity and the date — kept for three years and produced on
        inspection. Most pharmacies keep it as a paper logbook written up at the end of the day, which is
        exactly how entries go missing.
      </p>
      <Screenshot
        src="/guides/pharmacy-h1-register.png" width={2560} height={862}
        alt="H1 Register tab showing an entry with serial number, date, patient name and UHID, prescriber, medicine, batch, quantity and who supplied it, above a date range and an Export CSV button"
        caption="The register fills itself as medicines are handed over. Pick a date range and export it."
      />
      <p>
        The catalogue already knows each medicine&apos;s schedule, so the entry writes itself the moment an
        H1 or X medicine is handed over — serial number, date, patient and UHID, prescriber, drug, batch,
        quantity, and who supplied it. The stock list carries a <strong>Schedule H1</strong> badge on the
        medicine, so the pharmacist sees the duty before handing it over rather than after. Nothing in the
        app can edit the register once it is written.
      </p>
      <p>
        For which drugs fall under each schedule and what the label warnings mean, see{' '}
        <Link href="/guides/drug-schedule-h-h1-x-pharmacy-compliance">Schedule H, H1 &amp; X drugs</Link>.
      </p>

      <h2>Step 5 — How it reaches the bill</h2>
      <p>
        For an OPD sale the transaction is the bill: the patient pays at the counter, and the stock moves
        when the medicines are handed over — after payment, not before. For a ward request the dispensed
        items become lines on that patient&apos;s running combined bill, so they see one bill at discharge
        rather than a stack of pharmacy slips. Our{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> covers how that bill
        comes together across every department.
      </p>

      <h2>The one-stock-count test</h2>
      <p>
        There is a fast way to tell whether a pharmacy module genuinely unifies OPD and IPD or merely runs
        them as two features under one login: dispense an item to a ward, then look at the same medicine on
        the sale screen. If the count dropped in both places it is one system. If it did not, the
        &ldquo;single pharmacy module&rdquo; is two stock ledgers wearing one interface — and that gap is
        exactly where physical stock and recorded stock drift apart.
      </p>

      <h2>What Uyirly&apos;s pharmacy does</h2>
      <ul>
        <li>Receive a whole distributor invoice at once, or import it from a CSV or an Excel paste.</li>
        <li>Batch and expiry on every medicine, earliest-expiring used first, expired stock blocked.</li>
        <li>Search by brand, salt, batch number or rack; filters for running low, expiring soon, out of stock and vaccines.</li>
        <li>Barcode scanning that learns each pack once, and reads batch and expiry from GS1 codes.</li>
        <li>Printed stock labels, so a scan means one exact box rather than just the product.</li>
        <li>Schedule H, H1 and X shown on the medicine, and every H1 or X supply written to the register as it is handed over.</li>
        <li>One counter for OPD walk-in sales and IPD ward issues, drawing on the same stock.</li>
        <li>Low-stock flags start the next purchase already filled in.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The pharmacy is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link> and shares the same
        patient and the same bill as the doctor. The quickest way to see it with your own stock is to
        import one distributor invoice —{' '}
        <Link href="/signup">start a 30-day free trial</Link>, no credit card.
      </p>
    </>
  )
}
