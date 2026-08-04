import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What should a hospital digitize first when moving off spreadsheets?',
    a: 'Patient registration and OPD, then billing. These give the most immediate, visible benefit and the least disruption, since they don\'t require migrating years of historical inpatient or inventory records before staff see value.',
  },
  {
    q: 'Should old registers and spreadsheets be migrated in fully, or just referenced?',
    a: 'For most hospitals, a full historical migration isn\'t worth the effort. A more practical approach is to migrate a limited window of recent, actively-referenced data (recent patients, current inventory) and keep old registers accessible as an archive for anything older.',
  },
  {
    q: 'How long does the transition usually take?',
    a: 'Core modules (registration, OPD, billing) can typically go live within days to a couple of weeks. Full transition across every department, with staff comfortable using it day-to-day, more realistically takes a few weeks to a couple of months.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Most hospitals don&apos;t start from nothing — they start from paper registers, a patchwork of Excel
        sheets, and staff who have made that system work through sheer familiarity. Switching to software
        isn&apos;t really a technology decision at that point; it&apos;s a change-management one. This guide covers
        how to do it without disrupting patient care.
      </p>

      <h2>Don&apos;t try to switch everything on one day</h2>
      <p>
        The instinct to flip every department to digital simultaneously is understandable and almost always a
        mistake. A phased rollout — registration and OPD first, then billing, then IPD, then the rest — lets
        staff build confidence on a smaller workflow before taking on the next one &mdash; the recommended sequence
        is laid out in our{' '}
        <Link href="/guides/hospital-digitization-workflow-guide">hospital digitization workflow guide</Link>.
      </p>

      <h2>Run in parallel before you cut over</h2>
      <p>
        For at least the first week of any new module, keep the old paper process available as a fallback
        while staff get comfortable with the new one. This isn&apos;t inefficiency — it&apos;s insurance against a
        software hiccup disrupting patient care on day one.
      </p>

      <h2>What data actually needs migrating</h2>
      <p>
        Migrating years of historical registers in full is rarely worth the effort. A more realistic approach:
        bring in active/recent patients, current inventory counts, and anything staff reference daily — and
        keep older paper records as an archive rather than trying to digitize everything retroactively. See
        our detailed{' '}
        <Link href="/guides/hospital-data-migration-guide">hospital data migration guide</Link> for a
        step-by-step approach.
      </p>

      <CalloutBox tone="tip" title="Train on real, messy cases — not the happy path">
        Staff training that only covers the simple, clean scenario leaves people stuck the first time a
        real-world edge case comes up (a walk-in with no ID, a returning patient staff can&apos;t find). Include
        those cases in training from the start.
      </CalloutBox>

      <h2>A realistic rollout sequence</h2>
      <ol>
        <li>Registration + UHID discipline — get this right before anything else.</li>
        <li>OPD queue, vitals and consultation.</li>
        <li>Billing — the workflow that proves the earlier steps actually connected.</li>
        <li>IPD — admission, bed management, nursing.</li>
        <li>Lab, radiology, pharmacy.</li>
        <li>Everything else — insurance, inventory, HR, specialty modules — as the hospital needs them.</li>
      </ol>
      <p>
        For what to evaluate when choosing the software itself, see our{' '}
        <Link href="/guides/hospital-management-software-india">buyer&apos;s checklist for hospital software</Link>.
      </p>
      <h2>How Uyirly makes the switch easy</h2>
      <p>
        <Link href="/hospital-management-software">Uyirly</Link> is cloud-based, so there is nothing to install
        and no server to buy &mdash; you sign up and start the same day. A built-in setup guide walks you through
        it: add your team, switch on the departments you use, add your services and medicines, and register
        your first patient. You can move one workflow at a time (registration and OPD first, then billing,
        then the rest) and keep your old register as a backup for a week while staff settle in.
      </p>
      <ul>
        <li>Nothing to install; live the same day.</li>
        <li>A guided setup checklist that ticks itself off as you go.</li>
        <li>Switch on modules in phases &mdash; no big-bang cutover.</li>
        <li>Flat pricing and a free trial, so trying it costs nothing but your time.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        You can <Link href="/signup">start a 30-day free trial</Link> with no credit card and run your real
        front desk before paying anything. See our{' '}
        <Link href="/guides/hospital-free-trial-setup-guide">free-trial setup guide</Link> for the exact steps.
      </p>
    </>
  )
}
