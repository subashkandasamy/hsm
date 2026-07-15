import Link from 'next/link'
import BillBreakdown from '@/components/guides/diagrams/BillBreakdown'

export const faqs = [
  {
    q: 'What must a hospital bill include?',
    a: 'At minimum: hospital name and address, patient name and a unique identifier (UHID), bill number and date, an itemized breakdown by service (room rent, nursing, consultation, pharmacy, lab, etc.), subtotal, any tax applied, discounts, and the final payable amount.',
  },
  {
    q: 'Should OPD and IPD bills look different?',
    a: 'They cover different things — an OPD bill is usually a single visit (consultation, maybe a same-day test or medicine), while an IPD bill combines every department\'s charges across a multi-day stay — but both should follow the same itemized, transparent format.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        An itemized bill is both a compliance requirement and, often, the last impression a patient has of a
        hospital stay. This guide shows what a well-structured hospital bill looks like for both OPD and IPD.
      </p>

      <h2>What every hospital bill needs</h2>
      <ul>
        <li>Hospital name, address and registration details.</li>
        <li>Patient name and a unique identifier (UHID).</li>
        <li>Bill number and date.</li>
        <li>An itemized list of charges by department/service — not a single lump amount.</li>
        <li>Subtotal, applicable tax, discounts, and the final payable amount.</li>
        <li>Payment method and amount paid, with any balance due clearly shown.</li>
      </ul>

      <h2>Sample OPD bill</h2>
      <BillBreakdown
        title="Sample OPD bill — single visit"
        items={[
          { label: 'Consultation — General Physician', amount: 400 },
          { label: 'Blood test — CBC', amount: 350 },
          { label: 'Pharmacy — Prescribed medicines', amount: 280 },
        ]}
        total={1030}
      />

      <h2>Sample IPD bill</h2>
      <p>
        An IPD bill spans the whole stay and combines every department that touched the patient — see our
        full worked example in the{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing explained guide</Link>, which breaks
        down a 3-day admission line by line.
      </p>

      <h2>Why itemization matters</h2>
      <p>
        A single lump-sum bill invites disputes, since the patient has no way to see what they&apos;re actually
        paying for. Itemized bills — by department, by day where relevant — build trust and make it much
        faster to resolve any billing question at the front desk. It also matters for tax treatment, since
        some charges (like room rent above a threshold) are taxed differently from others — see our{' '}
        <Link href="/guides/hospital-gst-billing-rules-india">GST rules for hospital billing</Link>.
      </p>
    </>
  )
}
