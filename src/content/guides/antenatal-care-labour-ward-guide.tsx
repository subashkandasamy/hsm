import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'How is a pregnancy dated, and what happens when the scan disagrees with the LMP?',
    a: 'The expected date is first worked out from the last menstrual period. An early scan measures gestational age directly, and where the two disagree by more than a set number of days — the allowance widens as pregnancy advances — the scan is taken as the better estimate. Recording which basis was used matters, because every later decision rests on the dates.',
  },
  {
    q: 'What is a partograph?',
    a: 'A chart of labour as it progresses: cervical dilatation against time, with the fetal heart rate, contractions, and the mother\'s pulse, blood pressure and temperature. Plotted against an alert line and an action line, it shows slow progress early enough to do something about it.',
  },
  {
    q: 'How many antenatal visits should be recorded?',
    a: 'India\'s guidance is a minimum of four visits, with a defined set of tests and measurements at each. What matters in a record system is not the count but whether each expected item has actually been done and can be seen at a glance — the tetanus doses, haemoglobin, blood group, the anomaly scan.',
  },
  {
    q: 'Do the mother and the newborn share a record?',
    a: 'They need separate records — the baby has their own identity, growth chart and immunisation schedule — with a link back to the delivery. Registering a newborn should create that record from the delivery rather than starting again at the front desk.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Maternity is the one clinical area where the record is a timeline rather than a set of visits. A
        pregnancy runs nine months, is seen by several people, and ends in a few hours where everything
        written earlier suddenly matters. A system that treats each antenatal visit as an isolated
        consultation — the way a general OPD does — loses exactly what makes the record useful.
      </p>
      <p>
        This guide covers how antenatal care is recorded visit by visit, and how the labour ward uses that
        record through delivery.
      </p>

      <h2>Dating the pregnancy</h2>
      <Screenshot
        src="/guides/anc-card.png" width={2464} height={2702}
        alt="Obstetrics and gynaecology section of a consultation showing gestation, expected date of delivery, gravida and para, the antenatal check for today and the care schedule"
        caption="One card: where the pregnancy is, today's check, and what the schedule still expects."
      />
      <p>
        Everything downstream rests on the dates. The expected date is first calculated from the last
        menstrual period; an early scan measures gestational age directly and is usually the better
        estimate. Where the two disagree by more than an accepted margin — a handful of days in the first
        trimester, widening as pregnancy advances — the scan should take over.
      </p>
      <CalloutBox tone="info" title="Record which basis was used">
        &ldquo;34 weeks&rdquo; means something different depending on whether it came from a remembered
        period or a 9-week scan. Keeping the basis with the date lets anyone reading the record later judge
        how firm it is — which matters most at exactly the moment nobody has time to ask.
      </CalloutBox>
      <p>
        Alongside it sits the obstetric history in its usual shorthand — gravida, para, living, previous
        caesareans — because a second pregnancy after a caesarean is a different clinical situation from a
        first, and the labour ward needs that at a glance rather than in a paragraph.
      </p>

      <h2>The visit itself</h2>
      <Screenshot
        src="/guides/anc-check.png" width={2380} height={456}
        alt="Antenatal check fields for weight, blood pressure, fundal height, fetal heart rate, urine albumin and sugar, haemoglobin and presentation"
        caption="The same measurements every visit, so a trend exists rather than scattered notes."
      />
      <p>
        An antenatal visit records the same handful of things each time: weight, blood pressure, fundal
        height, fetal heart rate, urine albumin and sugar, haemoglobin, and later the presentation. Recorded
        consistently they form a trend — a blood pressure climbing over three visits is a finding, while
        the same readings scattered through free-text notes are not.
      </p>

      <h3>The schedule, and what has been missed</h3>
      <Screenshot
        src="/guides/anc-schedule.png" width={2380} height={1440}
        alt="Antenatal care schedule listing expected items such as tetanus doses, blood group, haemoglobin and scans, each marked done, due, overdue or upcoming"
        caption="What the schedule expects by this stage, and what is still outstanding."
      />
      <p>
        India&apos;s antenatal guidance defines a minimum number of visits and a set of things that should
        happen across them — tetanus doses, blood group, haemoglobin, the anomaly scan, iron and calcium.
        The value of holding that as a schedule rather than a checklist in a book is that it can say what is
        <em> overdue</em> at 34 weeks, not merely what has been ticked.
      </p>

      <h2>The labour ward</h2>
      <Screenshot
        src="/guides/labour-partograph.png" width={2560} height={2742}
        alt="Labour and delivery panel for an admitted mother showing partograph readings of cervical dilatation, fetal heart rate, contractions and vital signs over time"
        caption="Labour recorded as it progresses — dilatation, fetal heart rate, contractions and the mother's observations."
      />
      <p>
        When the mother is admitted, the pregnancy record comes with her. Labour is then recorded as a
        <strong> partograph</strong>: cervical dilatation plotted against time, with the fetal heart rate,
        contractions per ten minutes, and the mother&apos;s pulse, blood pressure and temperature beside it.
      </p>
      <p>
        Its point is early warning. Dilatation is expected to progress at roughly a centimetre an hour once
        labour is established; an <strong>alert line</strong> marks that pace and an <strong>action
        line</strong> sits a few hours to its right. Crossing the alert line means labour is slow, and
        crossing the action line means a decision is overdue. On paper this is drawn by hand while a
        midwife is also managing the labour, which is why in practice it is often written up afterwards —
        when it can no longer warn anybody.
      </p>

      <h2>Delivery, and the second patient</h2>
      <p>
        A delivery record covers the mode, the time, who conducted it, and the condition of mother and baby.
        Then there are two patients where there was one. The newborn needs their own record — their own
        identity, their own{' '}
        <Link href="/guides/paediatric-growth-chart-who-guide">growth chart</Link> and{' '}
        <Link href="/guides/child-immunisation-schedule-software-guide">immunisation schedule</Link>{' '}
        starting with the birth dose — created from the delivery rather than typed again at the front desk,
        and linked back to the mother.
      </p>
      <p>
        Postnatal observations continue for both. The charges from admission, delivery, theatre if it was a
        caesarean, and pharmacy land on one bill — see the{' '}
        <Link href="/guides/ipd-billing-software-explained">IPD billing guide</Link>.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>Pregnancy dated from LMP or an early scan, with the basis recorded and re-dating limits applied.</li>
        <li>Gravida, para, living and previous caesareans carried on the record.</li>
        <li>The same antenatal measurements each visit, forming a trend rather than scattered notes.</li>
        <li>A care schedule that shows what is done, due, overdue or still upcoming at this stage.</li>
        <li>Danger signs and risk factors flagged from what has been recorded.</li>
        <li>A partograph in the labour ward with alert and action lines.</li>
        <li>Delivery and baby records, with the newborn registered as their own patient from the delivery.</li>
        <li>Postnatal observations, and every charge on the same bill.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Antenatal care appears in consultations once a department is set to the obstetrics and gynaecology
        template, and the labour ward panel appears on an admission for a mother under that department. It
        is part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
