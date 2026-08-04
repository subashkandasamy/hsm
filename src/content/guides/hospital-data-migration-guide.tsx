import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What data is most important to migrate to a new hospital system?',
    a: 'Active patient records (recent visits, ongoing treatment), current inventory counts, and any open/unpaid bills. Years of fully closed historical records are usually lower priority and can often stay archived rather than migrated in full.',
  },
  {
    q: 'How do you avoid losing records during migration?',
    a: 'Keep the old system or paper records accessible (read-only) for a defined period after cutover, run a reconciliation check comparing record counts before and after migration, and avoid deleting the old source until the new system has been in stable use for at least a few weeks.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Migrating to new hospital software is where good intentions meet real risk — a rushed migration can
        lose records, duplicate patients, or leave billing history incomplete. This guide covers a safer,
        staged approach.
      </p>

      <h2>A staged migration plan</h2>
      <WorkflowDiagram
        title="Migration sequence"
        steps={[
          { label: 'Export & clean', sublabel: 'From the old system/registers' },
          { label: 'Import to staging', sublabel: 'Test environment first' },
          { label: 'Reconcile counts', sublabel: 'Old vs. new record counts match' },
          { label: 'Cut over', sublabel: 'Old system kept read-only' },
        ]}
      />

      <h2>What to prioritize</h2>
      <ul>
        <li><strong>Active patients</strong> — anyone with a recent or ongoing relationship with the hospital.</li>
        <li><strong>Current inventory</strong> — actual stock counts, not historical purchase history.</li>
        <li><strong>Open bills and dues</strong> — anything unpaid needs to carry over accurately.</li>
        <li><strong>Staff and role data</strong> — so day-one logins and permissions are ready.</li>
      </ul>
      <p>
        Full historical registers going back years are usually lower priority — see our{' '}
        <Link href="/guides/switching-from-spreadsheets-to-hms">guide to switching from spreadsheets</Link> for
        why archiving old records instead of fully migrating them is often the more realistic choice.
      </p>

      <CalloutBox tone="warning" title="Never delete the old source immediately">
        Keep the old system or paper records accessible, read-only, for at least a few weeks after cutover.
        If a reconciliation gap surfaces later, you need somewhere to check the original record against.
      </CalloutBox>

      <h2>Reconciliation: proving nothing was lost</h2>
      <p>
        Before fully cutting over, compare record counts between the old and new system — number of active
        patients, number of open bills, current stock quantities. A mismatch here is far easier to catch and
        fix before go-live than after staff have started relying on the new system exclusively.
      </p>

      <h2>Checklist</h2>
      <ul>
        <li>Migrate to a staging/test environment first, never directly to production.</li>
        <li>Prioritize active patients, current inventory, and open bills over full history.</li>
        <li>Reconcile record counts before declaring migration complete.</li>
        <li>Keep the old system read-only and accessible for a defined grace period.</li>
      </ul>
      <h2>How Uyirly handles data migration</h2>
      <p>
        Moving to <Link href="/hospital-management-software">Uyirly</Link> does not mean re-typing years of
        records before you can start. You can go live immediately with new patients and bring historical data
        across in the background &mdash; patients, and the essentials like contact details and key history &mdash; so
        the hospital is running from day one while the old data catches up. Because it is cloud-based, there
        is no server to set up first, and your data is stored in India and backed up automatically.
      </p>
      <ul>
        <li>Go live with new patients the same day; migrate history in parallel.</li>
        <li>Patient records carry a single UHID, so nothing is duplicated.</li>
        <li>Data stored in India with automatic backups.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        See our <Link href="/guides/switching-from-spreadsheets-to-hms">guide to switching from spreadsheets</Link>
        {' '}for the rollout plan, or <Link href="/signup">start a 30-day free trial</Link> of{' '}
        <Link href="/hospital-management-software">Uyirly</Link> with no credit card.
      </p>
    </>
  )
}
