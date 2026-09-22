import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is ophthalmology EMR software?',
    a: 'An eye-specialty clinical record: vision, refraction and intraocular pressure captured separately for each eye as structured values rather than prose, so they can be compared across visits and printed for the patient. A general EMR with one free-text box cannot do either.',
  },
  {
    q: 'Why can\'t a general EMR handle eye exams?',
    a: 'Because eye data is paired and numeric. Nearly everything is recorded for the right eye and the left eye separately, and refraction is three numbers per eye that an optician reads. Typed into a notes field they cannot be compared with last year\'s, and they cannot be printed in the form the patient needs.',
  },
  {
    q: 'What is a spectacle prescription?',
    a: 'The sphere, cylinder and axis for each eye that an optician makes glasses from. It should come straight off the recorded refraction — if a clinic is retyping those numbers onto a separate pad, the record and the glasses can disagree, and the patient is the one who finds out.',
  },
  {
    q: 'Does an eye clinic still need the rest of a hospital system?',
    a: 'Yes. An eye clinic runs an OPD queue, bills consultations and procedures, dispenses drops, schedules cataract lists in a theatre and keeps patient records. The specialty record is most useful as one module inside that, not as a separate app.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        An eye examination is not a paragraph of notes. It is a small table of numbers, recorded twice —
        once for each eye — and most patients leave with some of those numbers in their hand. That shape is
        what an ophthalmology record has to fit.
      </p>

      <h2>The examination</h2>
      <Screenshot
        src="/guides/eye-exam.png" width={2464} height={968}
        alt="Eye examination card split into right eye and left eye, each with visual acuity, intraocular pressure and refraction sphere, cylinder and axis, above a clinical notes box"
        caption="Right and left side by side, each with the same fields — so the two eyes can be read against each other."
      />
      <p>
        The card is split down the middle because that is how the exam is done and how it is read.{' '}
        <strong>OD</strong> is the right eye, <strong>OS</strong> the left, and each side takes:
      </p>
      <ul>
        <li><strong>Visual acuity</strong> — as written on the chart, 6/12, 6/18, and so on.</li>
        <li><strong>Intraocular pressure</strong> in mmHg — the number that matters for glaucoma, and the one worth having a history of.</li>
        <li><strong>Refraction</strong> — sphere, cylinder and axis, the three values an optician works from.</li>
        <li><strong>Clinical notes</strong> — anterior and posterior segment findings, in the clinician&apos;s own words.</li>
      </ul>
      <CalloutBox tone="info" title="Structured where it counts, prose where it doesn't">
        Vision, pressure and refraction are numbers, so they are fields: comparable across visits and
        printable. Segment findings are description, so they stay as notes. A system that forces those into
        dropdowns slows the clinic down for no gain; one that leaves the numbers in free text gives up
        everything useful about them.
      </CalloutBox>

      <h2>What the patient takes away</h2>
      <WorkflowDiagram
        title="From examination to glasses"
        steps={[
          { label: 'Refract', sublabel: 'Sphere · cylinder · axis, per eye' },
          { label: 'Record', sublabel: 'On the visit, not on a pad' },
          { label: 'Print', sublabel: 'Refraction on the prescription' },
        ]}
      />
      <p>
        The prescription PDF for an ophthalmology visit carries the eye block: visual acuity and IOP for both
        eyes, and the refraction as a table — sphere, cylinder and axis, right eye and left. It prints from
        what was recorded, so the numbers on the paper and the numbers in the record are the same numbers.
      </p>
      <p>
        That is the test worth applying to any eye system, and it is a one-minute test: record a refraction,
        print the prescription, and see whether anyone had to type the values twice.
      </p>

      <h2>Where eye care meets the rest of the hospital</h2>
      <p>
        An eye clinic runs everything a small hospital runs, and the specialty record is worth having
        precisely because it sits inside that rather than beside it:
      </p>
      <ul>
        <li>
          <strong>The queue.</strong> Eye patients take tokens and wait like any OPD — see the{' '}
          <Link href="/guides/opd-queue-token-management-guide">OPD queue guide</Link>. The eye card replaces
          the clinical middle of the consultation, not the visit around it.
        </li>
        <li>
          <strong>Theatre.</strong> Cataract lists are scheduled in the{' '}
          <Link href="/guides/ot-scheduling-management-guide">OT module</Link> like any other surgery, with
          the theatre&apos;s own double-booking protection.
        </li>
        <li>
          <strong>Pharmacy and billing.</strong> Drops, the consultation fee and the procedure charge land on
          one bill for the patient, not three.
        </li>
        <li>
          <strong>Follow-up.</strong> Eye disease is long — glaucoma pressures, diabetic retinal screening,
          post-operative reviews. A follow-up recommended at the consultation carries into the appointments
          list, so bringing the patient back is not left to them remembering.
        </li>
      </ul>

      <h2>What this does not do</h2>
      <p>
        Worth being straight about, because eye software is a crowded field and the brochures are
        ambitious. Uyirly&apos;s ophthalmology record covers the examination and the prescription. It does{' '}
        <em>not</em> include biometry or IOL power calculation, structured OCT or visual field storage with
        progression analysis, or an optical shop module. Investigations can be ordered and reported through
        the general <Link href="/guides/radiology-ris-reporting-guide">imaging</Link> and{' '}
        <Link href="/guides/lab-lis-workflow-guide">lab</Link> workflows, and reports attach to the patient
        — but they are not eye-specific instruments feeding an eye-specific chart.
      </p>
      <p>
        For a general hospital&apos;s eye department, or a clinic whose day is consultations, refractions and
        cataract lists, that is the working set. A high-volume tertiary eye hospital running progression
        analysis off its own OCT fleet needs more than this, and should say so early in a demo rather than
        discover it in month three.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A per-eye examination card: visual acuity, intraocular pressure and refraction for OD and OS.</li>
        <li>Refraction as sphere, cylinder and axis — structured values, not a sentence.</li>
        <li>Anterior and posterior segment findings as clinical notes on the same card.</li>
        <li>The eye block printed on the prescription, refraction included, straight from what was recorded.</li>
        <li>The same OPD queue, patient record, pharmacy, theatre and bill as every other department.</li>
        <li>Follow-ups recommended at the consultation and carried into appointments.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        The eye card appears for any doctor in a department set to the ophthalmology template — so a
        standalone eye clinic and a hospital&apos;s eye department are the same setup. It is part of
        Uyirly&apos;s <Link href="/hospital-management-software">hospital management software</Link>, which
        also carries <Link href="/guides/dental-clinic-software-guide">dental</Link> and the other specialty
        records. <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
