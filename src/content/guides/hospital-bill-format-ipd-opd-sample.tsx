import Link from 'next/link'
import BillBreakdown from '@/components/guides/diagrams/BillBreakdown'

export const faqs = [
  {
    q: 'What is the format of a hospital OPD bill?',
    a: 'An OPD bill covers a single outpatient visit. Its format includes the hospital name and address, the patient name and UHID, a bill number and date, then an itemized list — consultation fee, any same-day tests, and pharmacy items — followed by the subtotal, any tax or discount, and the final payable amount with the payment method.',
  },
  {
    q: 'What is the format of an IPD bill?',
    a: 'An IPD (inpatient) bill combines every department\'s charges across a multi-day stay: bed / room rent per day, nursing per shift, admission fee, doctor rounds, lab, pharmacy, radiology and OT charges, minus any advance paid — itemized so the patient can see each component, not a single lump sum.',
  },
  {
    q: 'What must a hospital bill include?',
    a: 'At minimum: hospital name and address, patient name and a unique identifier (UHID), bill number and date, an itemized breakdown by service (room rent, nursing, consultation, pharmacy, lab, etc.), subtotal, any tax applied, discounts, and the final payable amount with the payment method.',
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
        An itemized hospital bill is both a compliance requirement and, often, the last impression a patient has
        of their stay. This guide shows what a well-structured hospital bill format looks like &mdash; a worked
        <strong> OPD bill format</strong> for a single visit and an <strong>IPD bill format</strong> for a
        multi-day admission &mdash; and the fields every hospital bill must include.
      </p>

      <h2>What every hospital bill needs</h2>
      <ul>
        <li>Hospital name, address and registration details.</li>
        <li>Patient name and a unique identifier (UHID).</li>
        <li>Bill number and date.</li>
        <li>An itemized list of charges by department/service &mdash; not a single lump amount.</li>
        <li>Subtotal, applicable tax, discounts, and the final payable amount.</li>
        <li>Payment method and amount paid, with any balance due clearly shown.</li>
      </ul>

      <h2>OPD bill format &mdash; sample</h2>
      <p>
        An outpatient (OPD) bill is the simplest case: one visit, usually a consultation plus perhaps a same-day
        test and some medicine. Here is a sample OPD bill in a clean itemized format:
      </p>
      <BillBreakdown
        title="Sample OPD bill — single visit"
        items={[
          { label: 'Consultation — General Physician', amount: 400 },
          { label: 'Blood test — CBC', amount: 350 },
          { label: 'Pharmacy — Prescribed medicines', amount: 280 },
        ]}
        total={1030}
      />

      <h2>IPD bill format &mdash; sample</h2>
      <p>
        An inpatient (IPD) bill spans the whole stay and combines every department that touched the patient &mdash;
        bed rent per day, nursing per shift, consultations, lab, pharmacy and any procedure. Here is a sample IPD
        bill for a 3-day general-ward admission, itemized so each component is visible:
      </p>
      <BillBreakdown
        title="Sample IPD bill — 3-day general ward stay"
        items={[
          { label: 'Bed rent — General Ward', note: '3 days × ₹1,500', amount: 4500 },
          { label: 'Nursing — Morning & Night shifts', note: '3 days × 2 shifts × ₹150', amount: 900 },
          { label: 'Admission fee', amount: 500 },
          { label: 'Consultation — Doctor rounds', note: '3 days × ₹300', amount: 900 },
          { label: 'Laboratory — CBC, LFT', amount: 850 },
          { label: 'Pharmacy — Ward medication', amount: 1240 },
        ]}
        total={8890}
      />
      <p>
        Any advance paid at admission is applied against this total &mdash; a ₹5,000 advance here would leave
        ₹3,890 due at discharge. For the full department-by-department breakdown of how an IPD bill accumulates
        day by day, see our{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing explained guide</Link>.
      </p>

      <h2>Why itemization matters</h2>
      <p>
        A single lump-sum bill invites disputes, since the patient has no way to see what they&apos;re actually
        paying for. An itemized bill &mdash; by department, by day where relevant &mdash; builds trust and makes it
        much faster to resolve any billing question at the front desk. It also matters for tax treatment, since
        some charges (like room rent above a threshold) are taxed differently from others &mdash; see our{' '}
        <Link href="/guides/hospital-gst-billing-rules-india">GST rules for hospital billing</Link>. Getting a
        clean, itemized bill out at discharge is one of the clearest signs a hospital&apos;s{' '}
        <Link href="/hospital-management-software">management software</Link> is doing its job.
      </p>
    </>
  )
}
