import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What does Schedule H drug mean?',
    a: 'A Schedule H drug is a prescription-only medicine under the Drugs and Cosmetics Rules — it cannot legally be sold over the counter without a registered medical practitioner\'s prescription, and only the quantity prescribed may be dispensed. Its label carries the symbol "Rx" and the caution that it is to be sold by retail on the prescription of a registered medical practitioner only. Most antibiotics, blood-pressure medicines and prescription painkillers fall under Schedule H.',
  },
  {
    q: 'What is the difference between Schedule H, H1 and X drugs?',
    a: 'All three are prescription-only, but the controls tighten as you go. Schedule H needs a valid prescription. Schedule H1 (a stricter subset — mainly newer antibiotics, some habit-forming drugs and anti-TB drugs) additionally requires the sale to be recorded in a dedicated register kept for three years. Schedule X (narcotic and psychotropic drugs) requires all of that plus lock-and-key storage and a licence to stock — the highest level of control.',
  },
  {
    q: 'What is a Schedule H1 drug, and why the extra register?',
    a: 'Schedule H1 was created to slow down the over-the-counter misuse of antibiotics that drives drug resistance. It covers mainly 3rd and 4th generation antibiotics, certain habit-forming medicines and anti-TB drugs. Every H1 sale must be entered in a separate register recording the prescriber\'s name and address, the patient\'s name, the drug and the quantity — and that register must be retained for three years and be available for inspection.',
  },
  {
    q: 'What are some examples of Schedule H drugs?',
    a: 'Broadly, most prescription antibiotics, antihypertensives, antidiabetics, and many prescription painkillers and sedatives are Schedule H. The stricter Schedule H1 subset includes newer antibiotics such as the carbapenems and certain cephalosporins, some habit-forming drugs like tramadol and alprazolam, and anti-TB drugs. Classifications change by government notification, so always confirm a specific drug\'s current schedule rather than relying on a general list.',
  },
  {
    q: 'What is the warning on a Schedule H or H1 label?',
    a: 'A Schedule H drug carries the symbol "Rx" and a warning that it may be sold only on the prescription of a registered medical practitioner. A Schedule H1 drug carries the same "Rx" plus a boxed warning, printed with a red border, stating that it is dangerous to take the preparation except in accordance with medical advice and that it should not be sold in retail without a prescription. Schedule X drugs carry the symbol "XRx".',
  },
  {
    q: 'What is Schedule X?',
    a: 'Schedule X covers a small list of addictive drugs — narcotics and psychotropics — that have genuine medicinal uses but a high potential for misuse. Beyond prescription-only sale, they must be stored under lock and key, sold against a prescription that the pharmacy retains for two years, and stocked only under a special licence, with tighter physical and record-keeping controls than Schedule H or H1.',
  },
]

const ROWS = [
  {
    schedule: 'Schedule H',
    covers: 'Most prescription-only drugs — common antibiotics, antihypertensives, antidiabetics, many painkillers and sedatives',
    sale: 'Valid prescription required',
    record: 'Normal sale record',
    storage: 'Standard pharmacy storage',
    label: 'Rx',
  },
  {
    schedule: 'Schedule H1',
    covers: '3rd & 4th generation antibiotics, certain habit-forming drugs, anti-TB drugs',
    sale: 'Valid prescription required',
    record: 'Separate register (prescriber, patient, drug, quantity) kept 3 years',
    storage: 'Standard pharmacy storage',
    label: 'Rx + red-boxed warning',
  },
  {
    schedule: 'Schedule X',
    covers: 'Narcotic & psychotropic drugs (addictive, high misuse potential)',
    sale: 'Prescription retained; special licence to stock',
    record: 'Register retained 2 years',
    storage: 'Under lock and key',
    label: 'XRx',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Not every drug a hospital pharmacy dispenses carries the same compliance weight. Schedule H, H1 and X
        under the Drugs and Cosmetics Rules define three tiers of restricted, prescription-only drugs, each with
        its own dispensing and record-keeping requirements. If you&apos;ve ever wondered what &ldquo;Schedule H drug&rdquo;
        actually means on a strip of medicine, what the difference is between Schedule H, H1 and X, or why some
        antibiotics now need a separate register &mdash; this guide walks through each one in plain language, and
        what it means for pharmacy software.
      </p>

      <CalloutBox tone="warning" title="General guide, not legal advice">
        Drug scheduling and its requirements can be updated by government notification, and a specific drug&apos;s
        classification can change. Confirm current classifications and requirements with a qualified pharmacist or
        legal advisor &mdash; this is a general explainer, not a compliance checklist to rely on directly.
      </CalloutBox>

      <h2>What &ldquo;Schedule H drug&rdquo; means</h2>
      <p>
        A Schedule H drug is a prescription-only medicine: it cannot be sold without a registered medical
        practitioner&apos;s prescription, and only the quantity actually prescribed may be dispensed &mdash; not more,
        even if the patient asks for extra &ldquo;to save a trip.&rdquo; This is the meaning behind the &ldquo;Rx&rdquo;
        symbol you see printed on the label, alongside the caution that the drug is to be sold by retail on the
        prescription of a registered medical practitioner only. The great majority of everyday prescription
        medicines &mdash; common antibiotics, blood-pressure and diabetes drugs, many painkillers and sedatives &mdash;
        are Schedule H.
      </p>

      <h2>Schedule H1 &mdash; antibiotics and habit-forming drugs, with a paper trail</h2>
      <p>
        Schedule H1 is a stricter subset of Schedule H, introduced specifically to curb the uncontrolled
        over-the-counter antibiotic sales that fuel drug resistance. It mainly covers 3rd and 4th generation
        antibiotics, certain habit-forming medicines, and anti-TB drugs. The practical difference from an ordinary
        Schedule H drug is the record: every H1 sale must be logged in a <strong>separate register</strong> &mdash;
        prescriber name and address, patient name, drug and quantity &mdash; retained for three years and open to
        inspection. The label also carries a distinctive warning printed inside a red box, stating that it is
        dangerous to take the preparation except in accordance with medical advice.
      </p>

      <h2>Schedule X &mdash; locked storage, addictive drugs</h2>
      <p>
        Schedule X covers a small list of drugs with genuine medicinal use but a high potential for misuse &mdash;
        narcotics and psychotropics, carrying the &ldquo;XRx&rdquo; symbol. Beyond prescription-only sale, these must be
        physically stored under lock and key, sold only against a prescription the pharmacy retains, and stocked
        under a special licence, with tighter access control than Schedule H or H1 items.
      </p>

      <h2>Schedule H vs H1 vs X at a glance</h2>
      <p>
        The three schedules are best understood as increasing levels of control over the same idea &mdash; a
        prescription-only drug. This table is the quick answer to &ldquo;what&apos;s the difference between Schedule H,
        H1 and X drugs?&rdquo;
      </p>
      <table>
        <thead>
          <tr>
            <th>Schedule</th>
            <th>What it covers</th>
            <th>Sale</th>
            <th>Record-keeping</th>
            <th>Storage</th>
            <th>Label symbol</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.schedule}>
              <td><strong>{r.schedule}</strong></td>
              <td>{r.covers}</td>
              <td>{r.sale}</td>
              <td>{r.record}</td>
              <td>{r.storage}</td>
              <td>{r.label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Examples of each schedule</h2>
      <p>
        Exact classifications change by notification, so treat these as illustrative rather than a definitive
        list &mdash; but they give a feel for where common drugs sit:
      </p>
      <ul>
        <li><strong>Schedule H</strong> &mdash; most prescription antibiotics (amoxicillin, azithromycin), antihypertensives, antidiabetics, and many prescription painkillers.</li>
        <li><strong>Schedule H1</strong> &mdash; newer antibiotics such as the carbapenems and certain cephalosporins, some habit-forming drugs like tramadol and alprazolam, and anti-TB drugs.</li>
        <li><strong>Schedule X</strong> &mdash; narcotic and psychotropic substances such as certain barbiturates and amphetamines.</li>
      </ul>

      <h2>What this means for pharmacy software</h2>
      <p>
        A hospital pharmacy that treats every drug the same way is quietly out of compliance the moment it
        dispenses an H1 antibiotic. Software should reflect the schedule difference, not just the name and price:
      </p>
      <ul>
        <li>Every drug needs a <strong>schedule classification</strong> in the master catalogue &mdash; H, H1, X or none.</li>
        <li>Schedule H1 dispensing should automatically capture the required register fields &mdash; prescriber, patient, drug, quantity &mdash; rather than relying on a separate physical logbook.</li>
        <li>Those H1 records need to be <strong>retrievable for at least three years</strong>, and ideally exportable for inspection.</li>
        <li>Schedule X items benefit from tighter access control in the system itself, mirroring the physical lock-and-key requirement.</li>
      </ul>
      <p>
        This connects directly to the dispensing workflow covered in our{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">hospital pharmacy management guide</Link>{' '}
        &mdash; a system that tracks batch and expiry well but ignores drug scheduling is only solving half the
        compliance picture. If you&apos;re evaluating software, it&apos;s worth checking on a{' '}
        <Link href="/clinic-management-software">clinic</Link> or{' '}
        <Link href="/hospital-management-software">hospital management system</Link> whether schedule handling is
        built in or bolted on.
      </p>
      <h2>How Uyirly keeps you compliant</h2>
      <p>
        <Link href="/pharmacy-management-software">Uyirly&apos;s pharmacy</Link> carries each drug&apos;s schedule
        (H, H1, X) in the catalogue, so a Schedule H1 antibiotic is never treated like an ordinary medicine.
        When an H1 drug is dispensed, the register fields the law needs &mdash; prescriber, patient, drug and
        quantity &mdash; are captured automatically. Compliance becomes a by-product of dispensing rather than a
        separate physical logbook someone has to remember to fill.
      </p>
      <ul>
        <li>Schedule H, H1 and X carried on every drug in the catalogue.</li>
        <li>Every H1 or X supply written to the register as it is handed over — serial number, date, patient, prescriber, drug, batch and quantity — and exportable for inspection.</li>
        <li>Dispensing tied to the prescription, so records match reality.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        This is built into Uyirly&apos;s <Link href="/pharmacy-management-software">pharmacy management
        software</Link>. See our <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy
        management guide</Link>, or <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
