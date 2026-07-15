import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is a ward board in hospital software?',
    a: 'A ward board is a live visual view of every bed in a ward — occupied, available, or under maintenance — so staff can see bed availability at a glance instead of calling around or walking the corridor to check.',
  },
  {
    q: 'What happens when a patient is transferred between wards?',
    a: 'A ward transfer should release the old bed back to available, occupy the new bed, and carry the patient\'s ongoing charges (nursing, treatment) forward under the same admission — not treat it as a new admission with a fresh bill.',
  },
  {
    q: 'Can a patient be admitted straight from OPD?',
    a: 'Yes — a doctor deciding a patient needs inpatient care during an OPD consultation should be able to trigger admission directly from that visit, carrying the patient\'s identity and any same-day charges forward, rather than starting registration over.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Admission is the moment a hospital takes on full responsibility for a patient&apos;s care — and the
        moment billing, nursing and treatment all start accumulating against one continuous stay. Getting bed
        allocation and ward management right is what keeps that stay organized from day one to discharge.
      </p>

      <h2>The ward board: knowing what&apos;s free</h2>
      <p>
        A ward board shows every bed&apos;s live status — available, occupied, or under maintenance — across every
        ward in the hospital. Reception and admitting doctors need this view to allocate a bed without calling
        the ward to ask, and it&apos;s the single most useful screen for anyone managing inpatient capacity.
      </p>

      <h2>Admission workflow</h2>
      <WorkflowDiagram
        title="From decision to admitted"
        steps={[
          { label: 'Admit decision', sublabel: 'From OPD or emergency' },
          { label: 'Bed allotted', sublabel: 'From the ward board' },
          { label: 'Nurse assigned', sublabel: 'Shift-based' },
          { label: 'Charges begin', sublabel: 'Daily bed rent & nursing' },
        ]}
      />
      <p>
        Nurse assignment at admission should be roster-aware — showing which nurses are actually on duty for
        that ward and shift, not a list of every nurse in the hospital &mdash; our{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">nurse duty roster guide</Link> explains how that
        assignment connects to the weekly schedule.
      </p>

      <h2>Ward transfers</h2>
      <p>
        Patients move — from a general ward to ICU and back, or between wards for capacity reasons. A transfer
        should release the old bed, occupy the new one, and keep the patient&apos;s stay as one continuous
        admission with charges carrying forward, not restart the bill as if it were a new stay.
      </p>
      <CalloutBox tone="tip" title="One admission, one bill, however many beds">
        Whether a patient occupies one bed for the whole stay or moves through three wards, the combined bill
        at discharge should reflect one continuous admission — see our{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link> for how daily charges
        accumulate across a stay.
      </CalloutBox>

      <h2>Discharge</h2>
      <p>
        Discharge should release the bed back to the ward board immediately and finalize the combined bill
        from charges that have already been accumulating daily — not trigger a scramble to reconstruct the
        whole stay&apos;s costs at the last minute.
      </p>

      <h2>Where this usually breaks in practice</h2>
      <p>
        The most common failure isn&apos;t a missing feature &mdash; it&apos;s a ward board that isn&apos;t actually live. A
        bed status screen that updates on a delay, or requires refreshing per ward instead of showing the
        whole hospital at once, quietly pushes staff back toward calling around to check availability, which
        defeats the point of having a ward board at all. The second most common failure is a discharge that
        doesn&apos;t release the bed instantly, leaving a ready room sitting invisible while admissions elsewhere
        get delayed for &ldquo;no availability.&rdquo;
      </p>
    </>
  )
}
