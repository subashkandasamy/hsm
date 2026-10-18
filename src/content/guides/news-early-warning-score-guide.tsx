import Link from 'next/link'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'
import StatGrid from '@/components/guides/diagrams/StatGrid'

export const faqs = [
  {
    q: 'What is the NEWS score?',
    a: 'NEWS — the National Early Warning Score — turns six routine bedside observations into a single number between 0 and 20 that indicates how unwell a patient is. It was developed by the Royal College of Physicians and is used because it is simple enough that every grade of staff reads it the same way.',
  },
  {
    q: 'Which observations go into NEWS?',
    a: 'Respiratory rate, oxygen saturation, systolic blood pressure, pulse rate, level of consciousness and temperature, plus whether the patient is on supplemental oxygen. Each is scored 0 to 3 against banded ranges and the scores are added.',
  },
  {
    q: 'What NEWS score is concerning?',
    a: 'Broadly: 0–4 is low risk and handled by ward staff, 5–6 or any single parameter scoring 3 warrants an urgent review, and 7 or above calls for an emergency response. Every hospital sets its own escalation policy, and the thresholds should match that policy rather than a software default.',
  },
  {
    q: 'Why calculate it in software instead of on paper?',
    a: 'Because on paper it gets skipped. Adding six banded scores by hand at the end of a twelve-hour shift is exactly the task that gets deferred, and a score that is calculated late is a score that did not help. Software computes it the moment the observations are entered, every time, without being asked.',
  },
  {
    q: 'Does NEWS replace clinical judgement?',
    a: 'No, and treating it as if it does is the main way it is misused. A low score on a patient a nurse is worried about is a reason to escalate anyway. The score exists to catch deterioration nobody has noticed yet, not to overrule somebody who has.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Almost nobody in a hospital deteriorates without warning. The observations are nearly always
        there, written down, in the file. What is usually missing is the moment where somebody puts them
        together and realises that this patient is worse than they were four hours ago.
      </p>
      <p>
        That is the gap early warning scores exist to close, and it is a gap software is unusually well
        suited to filling &mdash; because the work involved is arithmetic that happens at exactly the
        moment a nurse has least time to do it.
      </p>

      <h2>What NEWS is</h2>
      <p>
        The National Early Warning Score takes six observations that are already being recorded on every
        patient and turns them into one number. It was developed by the Royal College of Physicians, and
        its strength is not sophistication &mdash; it is that it is simple enough to be used the same way
        by a first-week nurse, a visiting consultant and a night duty doctor.
      </p>

      <h3>The six parameters</h3>
      <ul>
        <li><strong>Respiratory rate</strong> &mdash; the most sensitive of the six, and the one most often estimated rather than counted</li>
        <li><strong>Oxygen saturation</strong>, and separately whether the patient is on supplemental oxygen</li>
        <li><strong>Systolic blood pressure</strong></li>
        <li><strong>Pulse rate</strong></li>
        <li><strong>Level of consciousness</strong></li>
        <li><strong>Temperature</strong></li>
      </ul>
      <p>
        Each is scored 0 to 3 depending on which band it falls into, and the scores are added. A
        completely normal set of observations scores 0.
      </p>

      <StatGrid stats={[
        { value: '0–4', label: 'Low — ward-level monitoring' },
        { value: '5–6', label: 'Medium — urgent review' },
        { value: '7+', label: 'High — emergency response' },
      ]} />

      <CalloutBox tone="warning" title="One parameter scoring 3 matters on its own">
        A patient can total only 3 and still be in trouble, if that 3 came from a single badly deranged
        observation. Most escalation policies treat any single parameter scoring 3 as requiring urgent
        review regardless of the total. Make sure whatever you adopt reflects your own policy rather than
        a vendor&rsquo;s default.
      </CalloutBox>

      <h2>Why it fails on paper</h2>
      <p>
        Hospitals that adopt NEWS on paper charts usually find compliance is good for a month and poor
        after six. This is not carelessness. Adding six banded scores by hand, correctly, is a two-minute
        job at the end of a round where a nurse has twelve other patients and a drug trolley waiting.
      </p>
      <p>
        So the score gets written in later, or estimated, or skipped on the quiet patients &mdash; who are
        precisely the patients it exists to catch. A deterioration score that is only calculated on
        patients somebody is already worried about has no value at all.
      </p>

      <h3>What software changes</h3>
      <ul>
        <li>
          <strong>It is never skipped.</strong> The score is computed from the observations as they are
          entered. There is no separate step to forget.
        </li>
        <li>
          <strong>It is never wrong.</strong> Banding errors and addition slips disappear.
        </li>
        <li>
          <strong>It becomes a list, not a number.</strong> This is the real gain. A score on a chart has
          to be found. A worklist of everyone currently scoring high, worst first, comes to you.
        </li>
        <li>
          <strong>The trend is visible.</strong> A patient who has gone from 2 to 5 over three sets of
          observations is a different problem from one who has been at 5 all day.
        </li>
      </ul>

      <CalloutBox tone="tip" title="The design detail that decides whether it works">
        An alert that can be dismissed will be dismissed, at three in the morning, by someone who means to
        come back to it. A worklist that stays populated until the patient improves or somebody records an
        action cannot be cleared by accident. Prefer the second.
      </CalloutBox>

      <h2>Fitting it to an Indian hospital</h2>
      <p>
        Two practical cautions, both learned the hard way by hospitals that adopted scoring systems
        wholesale.
      </p>
      <p>
        <strong>The escalation policy is the hard part, not the score.</strong> A number is only useful if
        it is attached to an agreed answer to &ldquo;and then who is called?&rdquo; In a hospital with one
        duty doctor overnight, an escalation policy that assumes a rapid response team is theatre. Write
        the policy you can actually staff, then set the software to match it.
      </p>
      <p>
        <strong>Respiratory rate has to be counted.</strong> NEWS leans heavily on it, and it is the
        observation most often entered as &ldquo;18&rdquo; because that is what gets written when nobody
        counted. A scoring system built on an invented number produces confident nonsense. This is a
        training problem, not a software one, but it will decide whether your scores mean anything.
      </p>

      <h2>Beyond the score: what else belongs on a critical care record</h2>
      <p>
        A score is one line of a much longer picture, and it is worth checking that whatever system you
        use holds the rest of it on the same record rather than on separate charts.
      </p>
      <ul>
        <li>
          <strong>Fluid balance.</strong> Intake and output read alongside the observations, not from a
          different clipboard.
        </li>
        <li>
          <strong>Oxygen requirement.</strong> FiO&#8322; captured with the observations, so the score is
          read in the context of how much support the patient is already on.
        </li>
        <li>
          <strong>Who is actually looking after this patient.</strong> An ICU patient usually has several
          doctors. If the record only names the admitting one, the chart is lying about who is involved.
        </li>
      </ul>

      <h2>How Uyirly does it</h2>
      <p>
        NEWS is computed on every set of observations as they are entered for a critical-care admission
        &mdash; nobody adds it up and nobody can skip it. Patients whose latest score is elevated appear
        on a deterioration worklist, worst first, which stays populated rather than being a notification
        somebody can dismiss. Fluid balance and FiO&#8322; sit on the same admission record, and a care
        team of several doctors can be attached to one patient with their consults and visits tracked.
      </p>
      <p>
        Detail on the <Link href="/icu-management-software">ICU and critical care page</Link>. How the
        admission itself is run is covered in the{' '}
        <Link href="/guides/ipd-admission-bed-management-guide">IPD admission and bed management guide</Link>,
        and what it costs the patient in{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing</Link>.
      </p>
    </>
  )
}
