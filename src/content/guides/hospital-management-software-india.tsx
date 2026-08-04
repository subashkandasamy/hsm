import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What should a small hospital look for in management software, beyond features?',
    a: 'Beyond the feature checklist, check the pricing model (flat vs. per-bed/per-user), whether it\'s truly modular so you don\'t pay for modules you don\'t need yet, how easily data can be exported if you ever switch, and whether support is responsive during actual business hours your staff work.',
  },
  {
    q: 'Is a free trial enough to evaluate hospital software?',
    a: 'A free trial tells you if the software works, but the real test is whether your own staff — receptionists, nurses, pharmacists — can use it without heavy training. Run the trial with your actual staff on a realistic day, not just an admin exploring the demo alone.',
  },
  {
    q: 'What\'s the biggest mistake hospitals make when choosing software?',
    a: 'Choosing based on the longest feature list rather than the workflows the hospital actually runs today. A hospital without an OT doesn\'t need OT scheduling; a hospital with 15 beds doesn\'t need enterprise-grade multi-location reporting. Buy for the hospital you have, with room to grow into the one you\'ll become.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Searching for &ldquo;best hospital management software in India&rdquo; turns up dozens of comparison lists,
        most ranking vendors by feature count. That&apos;s the wrong way to evaluate software for a specific
        hospital. This is a practical checklist for what actually matters when a small or mid-size Indian
        hospital is choosing hospital management software &mdash; not a ranked list of vendors.
      </p>

      <h2>Start from your workflows, not a feature list</h2>
      <p>
        The right question isn&apos;t &ldquo;what features does this have&rdquo; &mdash; it&apos;s &ldquo;does this match how our
        hospital actually runs.&rdquo; A 20-bed nursing home without an operation theatre doesn&apos;t need OT
        scheduling on day one. A hospital that never handles cashless insurance doesn&apos;t need a complex TPA
        claims workflow yet. Buy for the workflows you run today, on a platform that can add the rest later.
      </p>

      <h2>The evaluation checklist</h2>
      <h3>1. Is it genuinely modular?</h3>
      <p>
        Can you start with OPD, billing and pharmacy, and add IPD, lab, radiology, OT or insurance later
        without migrating to different software? Modular pricing also means you&apos;re not paying for modules
        sitting unused for the first year.
      </p>
      <h3>2. Is the pricing model predictable?</h3>
      <p>
        Flat, module-based monthly pricing is easier to budget than per-bed or per-user metering, which can
        grow unpredictably as the hospital adds staff or beds &mdash; our{' '}
        <Link href="/guides/hospital-management-software-cost-india">hospital software cost guide</Link> has
        realistic pricing ranges by hospital size.
      </p>
      <h3>3. Does billing actually connect across departments?</h3>
      <p>
        Ask to see a combined bill, not a feature slide. If lab, pharmacy, nursing and bed charges don&apos;t
        land on one bill automatically, discharge will still involve manual reconciliation regardless of what
        else the software does well. See <Link href="/guides/ipd-billing-software-explained">IPD billing explained</Link>.
      </p>
      <h3>4. Can your actual staff use it, not just an admin?</h3>
      <p>
        A receptionist registering a walk-in, a nurse assigning herself to a patient, a pharmacist dispensing
        against a prescription &mdash; these are the daily interactions that matter, not the admin dashboard.
        Run the trial with real staff, on a real busy day, before committing.
      </p>
      <h3>5. Is patient data secure and compliant?</h3>
      <p>
        Check where data is stored, whether the vendor is aligned with India&apos;s DPDP Act, and what happens to
        your data if you ever leave. See{' '}
        <Link href="/guides/hospital-software-data-security-dpdp">data security &amp; DPDP guide</Link>.
      </p>
      <h3>6. What does switching away look like?</h3>
      <p>
        Ask this before signing, not after a bad experience. Can patient records, billing history and
        inventory be exported in a usable format? A vendor confident in their product won&apos;t make this hard
        to ask about.
      </p>

      <CalloutBox tone="tip" title="Run the trial with real staff, not just yourself">
        The single best predictor of whether hospital software will actually get used is whether your
        receptionist, nurse and pharmacist can operate it comfortably within their first week — not whether
        the demo looked impressive to the person signing the contract.
      </CalloutBox>

      <h2>Red flags to watch for</h2>
      <ul>
        <li>Per-bed or per-user pricing with no visibility into what it costs as the hospital grows.</li>
        <li>No way to export your own patient and billing data.</li>
        <li>Support only available during hours that don&apos;t match a hospital&apos;s actual operating hours.</li>
        <li>A feature list heavy on modules you don&apos;t currently run, light on the ones you do.</li>
      </ul>

      <h2>If you&apos;re switching from paper or spreadsheets</h2>
      <p>
        Moving off registers and Excel is a different evaluation question than switching between two software
        products. We wrote a dedicated guide on{' '}
        <Link href="/guides/switching-from-spreadsheets-to-hms">switching from registers &amp; spreadsheets to hospital software</Link>{' '}
        covering a realistic, low-disruption rollout.
      </p>

      <h2>Where Uyirly fits</h2>
      <p>
        We built <Link href="/hospital-management-software">Uyirly</Link> to pass this exact checklist: it is
        modular (start with OPD and grow), flat-priced with no per-bed fees, cloud-based with data stored in
        India, and every department shares one patient and one bill. It fits a{' '}
        <Link href="/clinic-management-software">clinic</Link>, a{' '}
        <Link href="/nursing-home-management-software">nursing home</Link> or a full{' '}
        <Link href="/multi-specialty-hospital-software">multi-specialty hospital</Link> on the same platform.
        The fairest way to judge it is the trial itself — you can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card and run it on your own
        patients. If you want a broader comparison first, see our{' '}
        <Link href="/best-hospital-management-software-in-india">best HMS in India</Link> guide.
      </p>
    </>
  )
}
