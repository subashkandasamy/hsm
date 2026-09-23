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
        records before you can start. The usual path is to go live with <strong>new</strong> patients the same
        day and let the record build forwards, keeping the old register or system available for looking up
        history when someone returns. Within a few months almost every regular patient has been seen once and
        has a real record; the ones who have not are the ones you were rarely looking up anyway.
      </p>
      <p>
        Be clear-eyed about the alternative: there is <strong>no self-serve bulk patient import</strong> in
        Uyirly today. If you need a patient list loaded before you start, that is a conversation to have
        before go-live rather than an afternoon&apos;s work in the app. And however it is loaded, the
        deduplication question from earlier in this guide applies &mdash; a bad import is worse than none.
      </p>
      <ul>
        <li>Go live with new patients the same day; no migration has to finish first.</li>
        <li>Every patient carries one UHID, so the forward-built record does not fragment.</li>
        <li>Data held in India &mdash; the database runs in the Mumbai region &mdash; with automatic backups.</li>
        <li>No bulk import tool in the product; talk to us before go-live if history has to come across.</li>
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
