import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'Why does a blood bank track components, not just blood groups?',
    a: 'A single whole-blood donation is separated into components — packed red cells, plasma, platelets and cryoprecipitate — each with its own shelf life and clinical use. Software must track stock by both group and component, because a hospital can be short on platelets while holding plenty of red cells of the same group.',
  },
  {
    q: 'What is cross-matching and why must software enforce it?',
    a: 'Cross-matching tests a specific unit against the specific patient before issue, to confirm compatibility beyond the ABO/Rh group. Software should block a unit from being issued until it is cross-matched and marked compatible, because a mismatched transfusion is one of the most dangerous errors in a hospital.',
  },
  {
    q: 'What does donor-to-patient traceability mean?',
    a: 'Every issued unit should be traceable both ways: from the donor and donation through screening, storage and cross-match to the exact patient who received it. If a donor is later found unsuitable, or a reaction occurs, the hospital must be able to follow the chain in either direction quickly.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A blood bank is unlike any other hospital store: its stock is alive, perishable, grouped by
        compatibility, and can harm a patient if the wrong unit is issued. That combination is why blood bank
        software is built around safety gates and traceability rather than simple stock counts.
      </p>

      <h2>Stock is two-dimensional: group × component</h2>
      <p>
        One donation becomes several products — packed red cells, fresh frozen plasma, platelets,
        cryoprecipitate — each with a different shelf life. So &ldquo;how much O+ do we have?&rdquo; is the
        wrong question; the real one is &ldquo;how many O+ <em>platelets</em>, expiring when?&rdquo; Good
        software tracks inventory by group and component together, with expiry visible, so a shortage of one
        component isn&apos;t hidden behind a surplus of another.
      </p>
      <WorkflowDiagram
        title="A unit from donation to transfusion"
        steps={[
          { label: 'Donation', sublabel: 'Donor screened, unit logged' },
          { label: 'Components', sublabel: 'Separated, grouped, dated' },
          { label: 'Cross-match', sublabel: 'Tested against the patient' },
          { label: 'Issue', sublabel: 'Released, traceability recorded' },
        ]}
      />

      <h2>Cross-matching is a hard gate, not a note</h2>
      <p>
        The single most important rule the software enforces is that a unit cannot be issued to a patient until
        it has been cross-matched against that patient and marked compatible. This is a blocking check, not a
        reminder — the danger of a mismatched transfusion is severe enough that the safe design refuses the
        issue outright rather than warning and allowing it.
      </p>

      <CalloutBox tone="warning" title="Safety before convenience">
        A blood bank module that lets staff &ldquo;issue now, cross-match later&rdquo; to save a step is a
        liability. The correct behaviour is to make the compatible cross-match a precondition of issue — the
        few seconds it costs are the point.
      </CalloutBox>

      <h2>Traceability runs in both directions</h2>
      <p>
        Every issued unit ties a donor and donation to a specific patient. That chain has to be followable
        forwards (this donor&apos;s units went to these patients) and backwards (this patient received units
        from these donations), because recalls and transfusion-reaction investigations can start at either end.
        Component-level pricing and issue records also make the charge to the patient itemised and auditable,
        which matters when an <Link href="/guides/health-insurance-tpa-claims-guide">insurance TPA</Link>{' '}
        reviews the bill.
      </p>

      <CalloutBox tone="tip" title="How Uyirly handles it">
        Uyirly&apos;s blood bank tracks stock by group and component with expiry, gates issue behind a
        compatible cross-match, prices each component, and records full donor-to-patient traceability on every
        unit — with an emergency path that ties directly into{' '}
        <Link href="/guides/emergency-triage-management-guide">casualty</Link> and{' '}
        <Link href="/guides/ot-scheduling-management-guide">theatre</Link>.
      </CalloutBox>

      <p>
        If your hospital runs its own blood bank, <Link href="/signup">start a free trial</Link> and walk one
        unit from donation to cross-match to issue — the traceability trail it leaves is the clearest test of
        whether the software is built for safety.
      </p>
      <h2>How Uyirly runs the blood bank</h2>
      <p>
        <Link href="/blood-bank-management-software">Uyirly&apos;s blood bank</Link> gives each unit an identity
        from donation and tracks it through testing, storage, cross-match and issue &mdash; so at any moment you
        know what is in stock, where each unit came from and where it went. Stock is held by blood group and
        component with expiry warnings, and a unit is only issued against a valid request and a completed
        cross-match, with the authoriser and recipient recorded.
      </p>
      <ul>
        <li>Live availability by blood group and component, used oldest-valid-first.</li>
        <li>Cross-match tied to the request before a unit can be issued.</li>
        <li>Full traceability from donor to recipient, fully audit-logged.</li>
        <li>Issue charges post to the patient&apos;s bill; requests link to the admission.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The blood bank is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>, sharing the patient record and billing with the rest of the hospital. You can{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
