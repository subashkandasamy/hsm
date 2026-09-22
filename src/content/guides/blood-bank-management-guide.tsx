import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'

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
        A blood bank is a traceability problem wearing a fridge. Every unit has to be followed from the
        donor who gave it to the patient who received it, and at no point may an unscreened or incompatible
        unit reach a person. The software&apos;s job is to make the unsafe path impossible rather than
        merely discouraged.
      </p>

      <h2>What is on the shelf</h2>
      <Screenshot
        src="/guides/blood-bank.png" width={2560} height={1854}
        alt="Blood bank inventory showing availability by blood group and component, with individual units, their bag numbers, volumes and expiry dates"
        caption="Availability by group and component — the question a ward actually asks."
      />
      <p>
        Stock is counted by <strong>group and component</strong> together, because that is the request. A
        ward does not need &ldquo;blood&rdquo;; it needs O-negative packed cells, or platelets, and those
        are different shelves with very different expiry windows — platelets last days, plasma months.
      </p>

      <h2>Screening comes before availability</h2>
      <p>
        A donated unit is not stock until it has been screened for HIV, hepatitis B and C, syphilis and
        malaria, and each result is held against the unit rather than in a separate register. A unit that
        has not passed screening should not be offerable to anyone, which is a property of the data, not a
        matter of discipline.
      </p>

      <h2>Cross-match, then issue</h2>
      <p>
        A request from a ward names the patient, the group and the component. A unit is cross-matched
        against that request and the result recorded; only then does the request advance to a state where
        the unit can be issued. The gate is in the database — the issue is permitted because the
        cross-match exists, not because a screen allowed it.
      </p>
      <p>
        Oldest compatible unit first, as with any dated stock, so short-dated components are used rather
        than discarded.
      </p>

      <h2>Traceability, both directions</h2>
      <p>
        Two questions have to be answerable years later: <em>who received this donor&apos;s unit</em>, and{' '}
        <em>where did this patient&apos;s unit come from</em>. Both are audit matters and occasionally
        public-health ones, which is why the bag number, the donor, the screening results, the cross-match
        and the recipient stay linked rather than living in separate books.
      </p>
      <p>
        The issue charge posts to the patient&apos;s bill like any other, so a transfusion is not billed
        from memory.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>Availability by blood group and component, with each unit&apos;s bag number, volume and expiry.</li>
        <li>Screening results — HIV, HBsAg, HCV, syphilis, malaria — held on the unit, with unscreened units unavailable.</li>
        <li>Cross-match recorded against the request, and issue permitted only once it exists.</li>
        <li>Oldest compatible unit used first, with expiry tracked per component.</li>
        <li>Donor-to-recipient traceability in both directions, audit-logged.</li>
        <li>Issue charges posting to the patient&apos;s bill.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The blood bank is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>, sharing the patient
        record with the ward that requested the unit.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
