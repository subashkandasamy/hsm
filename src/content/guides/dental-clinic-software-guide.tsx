import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What does dental software add beyond a normal OPD consultation?',
    a: 'Tooth-level charting. Findings and procedures are recorded against a specific tooth rather than in one free-text note, so the state of a mouth can be read at a glance and carried forward across visits. A general OPD screen has no concept of individual teeth, which is exactly what dentistry revolves around.',
  },
  {
    q: 'Which tooth numbering system should dental software use?',
    a: 'Both FDI (11–48, quadrant-first) and Universal (1–32) are in use, and the one that matters is the one your dentists already write. What you should check is that the software uses one consistently, shows it on the chart, and prints the same number on the treatment record and the bill — mixing notations is how a filling ends up recorded on the wrong tooth.',
  },
  {
    q: 'Why is recall scheduling important for a dental clinic?',
    a: 'Much of dentistry recurs — cleanings, reviews, staged treatment across several visits. A recall is a dated reminder that a patient is due back. It is worth asking a vendor plainly whether recalls produce a list someone works through, or whether a message actually goes out on its own; the two are very different amounts of work.',
  },
  {
    q: 'Can a multi-specialty hospital run a dental department in the same system?',
    a: 'Yes, if the dental OPD gets its own clinical screen while sharing the patient record, pharmacy and billing with the rest of the hospital. The dentist gets tooth charting; the hospital keeps one patient and one bill.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Dentistry looks like OPD from a distance — a patient, a chair, a consultation — but the record is a
        different shape. Almost everything a dentist does is anchored to a particular tooth, and much of it
        recurs over months. Dental software is really about those two things.
      </p>

      <h2>Step 1 — The chart</h2>
      <Screenshot
        src="/guides/dental-chart.png" width={2464} height={520}
        alt="Dental chart showing all 32 teeth in Universal numbering across upper and lower arches, with tooth 30 marked filled, 19 decayed, 14 crowned and 1 missing, and a legend of tooth states"
        caption="One mouth, at a glance. Upper and lower arches, each tooth in its current state."
      />
      <p>
        The chart is the dental record. Each tooth carries a state — healthy, decayed, filled, crowned, root
        canal, missing, extracted or implant — and clicking one opens it to record a finding or a procedure.
        Uyirly uses the <strong>Universal Numbering System</strong> (1–32), laid out as the dentist sees the
        patient: upper right to upper left across the top, lower arch below, with the midline marked.
      </p>
      <CalloutBox tone="info" title="FDI or Universal — pick one and stay on it">
        India uses both notations, often in the same city. The number itself matters less than consistency:
        tooth 46 in FDI and tooth 30 in Universal are the same lower right first molar, and a clinic that
        writes one on the chart and the other on the treatment note will eventually treat the wrong tooth.
      </CalloutBox>

      <h2>Step 2 — Recording what was done</h2>
      <Screenshot
        src="/guides/dental-treatments.png" width={2464} height={418}
        alt="Treatment history listing a filling on tooth 30 for ₹1,800 marked billed, and a cleaning on tooth 19 for ₹900 marked billed"
        caption="Each procedure against its tooth, with what it cost and whether it has reached a bill."
      />
      <p>
        A treatment is logged against the tooth, with a note and a price. Two things then happen without
        anyone doing them:
      </p>
      <ul>
        <li>
          <strong>The chart updates itself.</strong> Recording a filling turns that tooth <em>filled</em>; an
          extraction turns it <em>extracted</em>; a crown, a root canal and an implant likewise. The chart is
          a consequence of the work rather than a second thing to keep in step with it.
        </li>
        <li>
          <strong>The charge reaches the bill.</strong> The price is captured at the time the procedure is
          recorded, so a later change to the tariff does not quietly rewrite what this patient was told.
        </li>
      </ul>
      <p>
        Because the history is per tooth, a dentist who has never met the patient can open the chart and read
        the mouth — which is the whole point when a course of treatment runs across several visits and more
        than one chair.
      </p>

      <h2>Step 3 — Bringing the patient back</h2>
      <p>
        Cleanings, reviews and staged work all depend on the patient returning at the right time. A{' '}
        <strong>recall</strong> is a date and a reason parked on the patient&apos;s record — six months for a
        scale and polish, three weeks for a review — and the clinic gets a list of who is due, which staff
        work through and mark off as they contact people.
      </p>
      <CalloutBox tone="warning" title="A due list is not an automatic reminder">
        Worth being precise, because vendors often are not: Uyirly&apos;s recalls surface the patients who are
        due and track which have been contacted. The message itself is sent by a person. If you are told
        recalls &ldquo;go out automatically&rdquo;, ask to watch one send.
      </CalloutBox>

      <h2>What dentistry shares with the rest of the hospital</h2>
      <p>
        The dental screen replaces the clinical part of a consultation, not the consultation. The patient is
        the same <Link href="/guides/patient-records-emr-uhid-guide">record</Link> with the same UHID,
        allergies included; the prescription reaches the same{' '}
        <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy</Link>; and the
        consultation fee and the procedure charges land on the same bill, which matters when a patient sees
        the dentist and the physician in one trip.
      </p>
      <p>
        The screen appears for any doctor in a department set to the dental template — so a standalone clinic
        and a hospital&apos;s dental department are the same setup, with a different number of departments
        around it.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>A full-mouth chart in Universal numbering, each tooth in one of eight states.</li>
        <li>Procedures recorded against a tooth, with notes and the price at the time.</li>
        <li>The chart updated from the procedure — a filling makes the tooth filled, an extraction extracted.</li>
        <li>Treatment history per patient, readable by whichever dentist sees them next.</li>
        <li>Recalls with a date and reason, and a due list staff work through.</li>
        <li>The same patient record, allergies, prescriptions, pharmacy and bill as the rest of the hospital.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Dental runs standalone or as a department inside Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital software</Link> — see{' '}
        <Link href="/dental-clinic-software">dental clinic software</Link> for the whole picture, or{' '}
        <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
