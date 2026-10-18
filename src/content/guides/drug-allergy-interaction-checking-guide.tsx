import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import WorkflowDiagram from '@/components/guides/diagrams/WorkflowDiagram'

export const faqs = [
  {
    q: 'What is drug allergy checking in hospital software?',
    a: 'It is an automatic check, run at the moment a drug is prescribed, against the allergies recorded for that patient. A useful implementation checks by drug class as well as by name, so a recorded penicillin allergy still catches amoxicillin even though the two words share no letters.',
  },
  {
    q: 'What is a drug–drug interaction check?',
    a: 'A check of the drug being prescribed against everything the patient is already taking, flagging pairs known to be dangerous together. It only works if the patient’s current medication list is accurate, which is why medication reconciliation matters more than the checking engine.',
  },
  {
    q: 'What is alert fatigue?',
    a: 'What happens when software warns too often. Clinicians who see warnings on most prescriptions stop reading them, and then dismiss the one that mattered. A system that flags fewer things accurately is safer than one that flags everything.',
  },
  {
    q: 'Does the software decide whether to prescribe?',
    a: 'No, and it must not. A warning is information handed to a prescriber who may have perfectly good reasons to continue. The record should show that the warning was raised and that a person made the decision.',
  },
  {
    q: 'Where should allergies be recorded?',
    a: 'Once, on the patient — not on a visit, an admission or a prescription. An allergy recorded against one encounter is invisible on the next, which defeats the purpose.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        A patient tells the registration desk they are allergic to penicillin. Three weeks later a
        different doctor, in a different department, prescribes amoxicillin. Nothing in that sequence
        involves anybody being careless &mdash; the two words share no letters, the note is in a file
        nobody opened, and the second doctor has eleven minutes.
      </p>
      <p>
        This is the single most preventable category of harm in a hospital, and it is preventable by
        software in a way that most clinical risk is not.
      </p>

      <h2>Record the allergy once, against the patient</h2>
      <p>
        Everything else in this guide depends on this one thing being right.
      </p>
      <p>
        An allergy belongs to the <strong>patient</strong>, not to a visit, an admission or a
        prescription. If it is recorded against an encounter, it is invisible at the next one, and you
        have built a system that only protects people during the consultation where they happened to
        mention it. Check this in any demo: record an allergy in OPD, then open a fresh admission for the
        same patient and see whether it is still there.
      </p>

      <CalloutBox tone="info" title="Ask who can record one">
        Allergies are usually volunteered at reception, not in the consulting room. If only a doctor can
        enter one, most of them never get entered. If anyone can enter one, you need to be able to see
        who did.
      </CalloutBox>

      <h2>Checking by name is not enough</h2>
      <p>
        The naive implementation compares the drug being prescribed against the allergen text. That
        catches &ldquo;allergic to amoxicillin&rdquo; followed by amoxicillin, which is the case that was
        never going to kill anybody.
      </p>
      <p>
        The case that matters is a <strong>class</strong> match: penicillin and amoxicillin, or a
        sulfonamide allergy and co-trimoxazole. For that, the system needs to know which drugs belong to
        which family, and check both directions &mdash; the allergen might name the class and the
        prescription a member, or the other way round.
      </p>

      <WorkflowDiagram
        title="What a real check does"
        steps={[
          { label: 'Drug chosen', sublabel: 'At the prescribing screen' },
          { label: 'Name match', sublabel: 'Direct, either direction' },
          { label: 'Class match', sublabel: 'Penicillin → amoxicillin' },
          { label: 'Interaction check', sublabel: 'Against current medication' },
          { label: 'Warn, do not block', sublabel: 'The prescriber decides' },
        ]}
      />

      <h2>Interactions depend on a list you may not have</h2>
      <p>
        Checking a new drug against everything the patient is already on sounds like the harder problem.
        Technically it is easier than the allergy case. The difficulty is upstream: the check is only as
        good as the current medication list, and in most hospitals that list is incomplete.
      </p>
      <p>
        What the patient was prescribed in your OPD last month is in the system. What they were given at
        another hospital, what they buy over the counter, and what they stopped taking without telling
        anyone are not. This is why medication reconciliation on admission &mdash; actually asking, and
        recording the answer &mdash; does more for safety than any checking engine.
      </p>

      <CalloutBox tone="warning" title="Beware the demo that looks perfect">
        Interaction checking demos beautifully, because the demo patient has a tidy medication list. Ask
        to see it run on a real patient who has been admitted twice and takes something a relative buys
        for them. That is the case your hospital actually has.
      </CalloutBox>

      <h2>Alert fatigue is the failure mode</h2>
      <p>
        It is tempting to assume more warnings are safer. The opposite is true past a threshold, and the
        threshold is lower than people expect.
      </p>
      <p>
        A prescriber who sees a warning on most prescriptions learns, correctly, that the warnings are
        usually noise. They start clicking through them without reading &mdash; and then they click
        through the one that mattered. Published studies of hospital prescribing systems routinely find
        override rates well above half, and the overridden alerts include the serious ones.
      </p>
      <p>
        So the design goal is not coverage. It is <strong>signal</strong>:
      </p>
      <ul>
        <li>Warn on the major ones. Do not warn on every theoretical interaction in the literature.</li>
        <li>Grade them visibly, so a major allergy match does not look like a minor note.</li>
        <li>Say what was found in plain words &mdash; &ldquo;patient is allergic to penicillin&rdquo;, not a code.</li>
        <li>Do not repeat a warning the prescriber has already answered on the same prescription.</li>
      </ul>

      <h2>Warn, never block</h2>
      <p>
        A prescriber may have an excellent reason to give a drug the system is unhappy about: the allergy
        was a childhood rash, the alternative is unavailable, the interaction is manageable with
        monitoring. Software that refuses to proceed will be worked around, and the workaround &mdash;
        prescribing on paper &mdash; removes every other safeguard at the same time.
      </p>
      <p>
        The right behaviour is to raise the warning clearly, let the clinician proceed, and record that
        both happened. That record is also what makes the system defensible afterwards.
      </p>

      <h2>Where this connects to the rest of the hospital</h2>
      <ul>
        <li>
          <strong>Dispensing.</strong> A warning at prescribing is worth little if the pharmacy counter
          cannot see the same allergy list. See the{' '}
          <Link href="/guides/hospital-pharmacy-management-software-guide">pharmacy guide</Link>.
        </li>
        <li>
          <strong>Critical results.</strong> Allergy and interaction checks catch what you are about to
          do; a{' '}
          <Link href="/guides/lab-lis-workflow-guide">critical value register</Link> catches what the
          laboratory has just found. Both are needed.
        </li>
        <li>
          <strong>Deterioration.</strong> For admitted patients, scoring observations with{' '}
          <Link href="/guides/news-early-warning-score-guide">NEWS</Link> covers the third case &mdash;
          harm that is already underway.
        </li>
      </ul>

      <h2>How Uyirly does it</h2>
      <p>
        Allergies are recorded against the patient, so they follow every visit and admission. Each
        prescription is checked against them by name and by drug class, so a recorded penicillin allergy
        flags amoxicillin, and against the patient&rsquo;s current medication for known interactions.
        Warnings are graded and worded plainly, and they do not block &mdash; the prescriber decides, and
        the record shows both the warning and the decision.
      </p>
      <p>
        It is on every plan, including Starter, because a small clinic&rsquo;s patients have the same
        allergies as a large hospital&rsquo;s. More on the{' '}
        <Link href="/electronic-medical-records-software">EMR page</Link>, and on{' '}
        <Link href="/pricing">pricing</Link>.
      </p>
    </>
  )
}
