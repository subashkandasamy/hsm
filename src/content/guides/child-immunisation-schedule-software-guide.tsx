import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'How does a clinic know which vaccine a child is due for?',
    a: 'From the child\'s date of birth and what has already been given. Each dose in the national schedule has an age it becomes due, a minimum interval after the previous dose, and in some cases a dose it must follow. The software applies those rules to the child in front of you instead of the receptionist counting months on a card.',
  },
  {
    q: 'What happens if a child misses a dose?',
    a: 'The later doses of that vaccine cannot simply be given on their original dates — most need a minimum gap after the dose before them. A catch-up is worked out from the dose the child actually had, and doses that depended on the missed one are shown as waiting rather than due.',
  },
  {
    q: 'Can vaccination be recorded if the vaccine was given elsewhere?',
    a: 'Yes, and it should be. A child arriving from another clinic or a government centre has a history that has to be entered before the schedule means anything. Doses can be recorded with an exact date, or as given without a known date when the card is lost.',
  },
  {
    q: 'Does the vaccine come out of pharmacy stock?',
    a: 'Yes. A vaccine is stock like any other medicine — batch, expiry and a fridge location. Marking a dose given reduces the vial count, and the charge reaches the same bill as the consultation.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Immunisation is the one part of paediatrics where the clinic, not the parent, is expected to keep
        count. A child has around twenty separate doses before the age of five, each with an age it becomes
        due, a minimum gap from the dose before it, and consequences for the doses that follow if it is
        missed. Most clinics track this on a paper card the parent carries, which works until the card is
        lost, the family moves, or a dose is skipped and nobody recalculates what that does to the rest.
      </p>
      <p>
        This guide covers how that tracking works when the clinic holds it — what the schedule knows, what
        happens after a missed dose, and how a vaccine goes from the fridge into the child&apos;s record.
      </p>

      <h2>The schedule is per child, not a chart on the wall</h2>
      <Screenshot
        src="/guides/paed-vaccinations.png" width={2380} height={2080}
        alt="Vaccination section of a paediatric consultation, grouped into vaccines that can be given today and vaccines waiting for an earlier dose"
        caption="A two-year-old's schedule: five doses can be given today, seven are waiting on an earlier dose."
      />
      <p>
        The same national schedule produces a different list for every child, because it is applied to their
        date of birth and their actual history. Each dose sits in one of a few states:
      </p>
      <ul>
        <li><strong>Given</strong> — recorded, with the date if it is known.</li>
        <li><strong>Due</strong> — the child has reached the age and any earlier dose has been given.</li>
        <li><strong>Overdue</strong> — due some time ago and still not given, which is the list worth chasing.</li>
        <li><strong>Waiting</strong> — the age has come but a dose it depends on has not been given yet.</li>
        <li><strong>Upcoming</strong> — a date in the future, shown so a parent can be told when to return.</li>
      </ul>
      <p>
        Grouping matters more than it sounds. A receptionist reading a flat list of twenty vaccines has to
        work out which ones are actually givable today; a list that already separates <em>can be given
        today</em> from <em>waiting for an earlier dose</em> removes that judgement from the counter.
      </p>

      <h2>Missed doses, and why the rest of the schedule moves</h2>
      <p>
        The rules that matter after a missed dose are the <strong>minimum interval</strong> between doses of
        the same vaccine and the <strong>dose it must follow</strong>. A child who missed the second dose of
        a three-dose course cannot have the third on its original date: the third has to come a minimum
        interval after the second, whenever the second is finally given.
      </p>
      <CalloutBox tone="info" title="What a catch-up actually needs">
        Three things, per dose: the age it becomes due, the minimum gap after the previous dose, and which
        dose it follows. With those, a schedule can be rebuilt from whatever the child has actually had —
        which is the situation in most clinics, because children arrive mid-schedule from somewhere else.
      </CalloutBox>

      <h2>Recording what was given elsewhere</h2>
      <p>
        A child arriving from another clinic, a government centre or another city has a history that must be
        entered before any of this means anything. That history is rarely complete: a parent may remember
        that BCG was given at birth without remembering the date. Both cases need to be recordable — a dose
        with an exact date, and a dose known to have been given but not when — otherwise staff either
        invent dates or leave the record empty, and both distort the schedule.
      </p>
      <p>
        A patient&apos;s identity carries this across visits. See{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">UHID and patient records</Link> for how one
        identifier keeps a child&apos;s history together as they grow.
      </p>

      <h2>From the fridge to the record</h2>
      <p>
        A vaccine is stock like any other medicine: a batch, an expiry, a fridge shelf, a cost and a price.
        Which means the clinical side and the pharmacy side have to agree, or the fridge count drifts.
      </p>
      <ol>
        <li>The doctor marks a dose to be given today. That reaches the pharmacy as an order.</li>
        <li>The pharmacy dispenses it against payment, taking it from a specific vial batch.</li>
        <li>The dose is recorded on the child with its batch, so a recall can find who received it.</li>
      </ol>
      <p>
        Only vaccines the clinic actually stocks should be offerable in the first place — a schedule that
        lets a doctor promise a vaccine the fridge does not contain just moves the disappointment to the
        counter. How that stock is received, tracked and billed is covered in the{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy guide</Link>.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>The national immunisation schedule applied per child, from date of birth and actual history.</li>
        <li>Due, overdue, waiting and upcoming separated, so the counter sees what can be given today.</li>
        <li>Catch-up worked out from the dose the child actually had, using minimum intervals.</li>
        <li>Past doses recordable with a date, or as given with the date unknown.</li>
        <li>Only stocked vaccines offered; the dose reduces the vial count and reaches the same bill.</li>
        <li>Each dose recorded against its batch, so a recall can be traced.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Immunisation sits inside the paediatric consultation, alongside{' '}
        <Link href="/guides/paediatric-growth-chart-who-guide">WHO growth charts</Link>, and is part of
        Uyirly&apos;s <Link href="/hospital-management-software">hospital management software</Link>.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
