import Link from 'next/link'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What does dental software add beyond a normal OPD consultation?',
    a: 'The key addition is tooth-level charting: recording findings, procedures and treatment plans against specific teeth using a dental notation, rather than a single free-text note. A general OPD screen has no concept of individual teeth, which is exactly what dentistry revolves around.',
  },
  {
    q: 'Why is recall scheduling important for a dental clinic?',
    a: 'Much of dentistry is recurring — cleanings, reviews, staged treatments across multiple visits. Recall scheduling brings patients back at the right interval, which is both good clinical care and the main driver of a dental clinic\'s repeat revenue.',
  },
  {
    q: 'Can a multi-specialty hospital run a dental department in the same system?',
    a: 'Yes, if the software offers a dental-specific clinical screen for the dental OPD while sharing the same patient records, billing and pharmacy as the rest of the hospital. The dentist gets tooth charting; the hospital keeps one unified patient and one bill.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Dentistry looks like OPD from a distance — a patient, a chair, a consultation — but the clinical record
        is fundamentally different. Everything a dentist does is anchored to a specific tooth, and much of the
        work recurs over months. Dental software is really about those two things: charting by tooth, and
        bringing patients back.
      </p>

      <h2>Tooth charting is the core difference</h2>
      <p>
        A general OPD note is a paragraph of text. A dental record is a map: findings, procedures and plans
        recorded against individual teeth using a standard dental notation. That structure lets a dentist see
        at a glance what has been done where, track a treatment across visits, and hand the patient a clear
        plan — none of which a single free-text box can do.
      </p>
      <WorkflowDiagram
        title="A dental visit's clinical flow"
        steps={[
          { label: 'Register', sublabel: 'Shared patient record' },
          { label: 'Tooth chart', sublabel: 'Findings per tooth' },
          { label: 'Treatment', sublabel: 'Procedures logged' },
          { label: 'Recall', sublabel: 'Next visit scheduled' },
        ]}
      />

      <h2>Treatment that spans many visits</h2>
      <p>
        A root canal or an orthodontic plan is not one appointment — it is a sequence. The software has to hold
        the plan across visits, showing what is done and what remains, so any dentist in the clinic can pick up
        where the last one left off. This is where a tooth-aware record pays off: the state lives on the teeth,
        not in someone&apos;s memory.
      </p>

      <h2>Recall is the clinic&apos;s repeat revenue</h2>
      <p>
        Cleanings, reviews and staged treatments all depend on the patient returning at the right time. Recall
        scheduling — and a reminder that actually reaches the patient — is both good care and the engine of a
        dental clinic&apos;s income. Tying recalls to{' '}
        <Link href="/guides/patient-records-emr-uhid-guide">the patient record</Link> and to messaging keeps
        the chair filled without manual chasing.
      </p>

      <CalloutBox tone="tip" title="How Uyirly handles it">
        Uyirly gives the dental OPD a tooth-charting clinical screen while sharing the same patient records,
        billing and <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy</Link> as the
        rest of the hospital — so a dental department in a multi-specialty setup keeps one unified patient and
        one bill, and a standalone dental clinic gets exactly the specialty screen it needs.
      </CalloutBox>

      <p>
        If you run a dental clinic or a hospital dental department,{' '}
        <Link href="/signup">start a free trial</Link> and chart a patient tooth by tooth — it is the fastest
        way to tell whether the software was built for dentistry or just bolted onto a general OPD form.
      </p>
    </>
  )
}
