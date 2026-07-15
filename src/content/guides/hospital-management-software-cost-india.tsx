import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'How much does hospital management software cost in India?',
    a: 'Cloud hospital management software in India typically ranges from about ₹2,000–₹8,000/month for a small clinic, ₹8,000–₹25,000/month for a hospital running OPD, IPD and pharmacy together, and higher for large multi-specialty hospitals with many modules and users. On-premise/custom-built systems cost considerably more upfront.',
  },
  {
    q: 'Is cloud or on-premise hospital software cheaper?',
    a: 'Cloud (SaaS) hospital software is almost always cheaper to start with, since there\'s no server hardware to buy and maintain, and pricing is a predictable monthly subscription. On-premise systems have higher upfront cost (hardware, licensing, IT staff) but some large hospitals prefer them for data-residency or IT-policy reasons.',
  },
  {
    q: 'What drives the price of hospital management software up?',
    a: 'The biggest factors are the number of modules enabled (OPD-only vs. OPD+IPD+pharmacy+lab), the number of active users, hospital size (beds), and whether pricing is flat or metered per bed/per user. Flat, module-based pricing is usually easier to budget for than per-bed or per-user metering that grows unpredictably.',
  },
  {
    q: 'Are there hidden costs beyond the monthly subscription?',
    a: 'Watch for setup/onboarding fees, training costs, data migration charges, SMS/WhatsApp notification costs (often billed separately per message), and charges for additional modules added later. Ask for all of these upfront rather than discovering them after signing.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Hospital management software pricing in India varies enormously &mdash; from a few thousand rupees a
        month for a small clinic to lakhs a year for a large multi-specialty hospital. Most of that spread
        comes down to three things: hospital size, how many modules you actually need, and whether the
        pricing model is flat or metered. This guide breaks down realistic numbers by hospital size.
      </p>

      <h2>Typical pricing by hospital size</h2>
      <table>
        <thead>
          <tr><th>Hospital size</th><th>Typical monthly cost (cloud)</th><th>Typical annual cost</th></tr>
        </thead>
        <tbody>
          <tr><td>Small clinic (5–25 beds)</td><td>₹2,000 – ₹8,000</td><td>₹50,000 – ₹3 lakh</td></tr>
          <tr><td>Medium hospital (25–100 beds)</td><td>₹8,000 – ₹25,000</td><td>₹3 lakh – ₹12 lakh</td></tr>
          <tr><td>Large hospital (100–300 beds)</td><td>₹15,000 – ₹30,000+</td><td>₹1.5 lakh – ₹5 lakh+</td></tr>
        </tbody>
      </table>
      <p>
        These figures are for cloud (SaaS) hospital software with standard modules. Custom-built or heavily
        on-premise systems generally cost several times more, both to build initially and to maintain year to
        year.
      </p>

      <h2>What actually drives the price</h2>
      <ul>
        <li><strong>Number of modules</strong> &mdash; OPD-only is cheapest; adding IPD, pharmacy, lab, radiology, insurance and staff scheduling each typically adds to the bill.</li>
        <li><strong>Pricing model</strong> &mdash; flat monthly pricing is predictable; per-bed or per-user metering can look cheap at first and become expensive as the hospital grows.</li>
        <li><strong>Number of users</strong> &mdash; some vendors charge per login; others allow unlimited staff accounts under one flat plan.</li>
        <li><strong>Implementation &amp; training</strong> &mdash; a one-time cost, sometimes bundled, sometimes billed separately.</li>
        <li><strong>Support &amp; SLAs</strong> &mdash; 24/7 support and guaranteed uptime commitments often cost more than basic business-hours support.</li>
      </ul>

      <h2>Cloud vs. on-premise</h2>
      <p>
        Cloud-based (SaaS) hospital software is the default choice for most small and mid-size Indian
        hospitals today &mdash; no server hardware to buy, automatic updates, and a predictable monthly cost. It
        also makes multi-location access simpler, since staff can log in from any branch. On-premise systems
        still get chosen by some large hospitals for internal IT-policy or data-residency reasons, but they
        come with meaningfully higher upfront hardware and maintenance cost.
      </p>

      <CalloutBox tone="warning" title="Ask about hidden costs before signing">
        The headline monthly price rarely covers everything. Ask specifically about: onboarding/setup fees,
        data migration cost, per-message SMS/WhatsApp notification charges, and whether adding a new module
        later requires a new contract or just a plan upgrade.
      </CalloutBox>

      <h2>A simple way to budget</h2>
      <p>
        Start from what the hospital actually needs on day one &mdash; usually OPD, billing and pharmacy for a
        smaller facility, or OPD+IPD+pharmacy+lab for anything running inpatient care &mdash; and price that.
        Modular platforms let a hospital add lab, radiology, OT, insurance or staff scheduling later without
        re-platforming, so there&apos;s little value in paying for modules that won&apos;t be used for a year or
        more. See our{' '}
        <Link href="/guides/hospital-management-software-india">buyer&apos;s checklist for choosing hospital software</Link>{' '}
        for what else to evaluate beyond price.
      </p>
    </>
  )
}
