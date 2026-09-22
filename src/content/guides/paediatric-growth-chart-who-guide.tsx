import Link from 'next/link'
import Screenshot from '@/components/guides/Screenshot'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What does a z-score on a growth chart mean?',
    a: 'It is how far a child sits from the median for their age and sex, measured in standard deviations. A z-score of 0 is exactly median; −2 is the line below which a child is counted underweight, stunted or wasted depending on which measurement it is; −3 is severe. It lets a 14-month-old and a 4-year-old be compared on the same scale.',
  },
  {
    q: 'Which measurements should a paediatric clinic record at every visit?',
    a: 'Weight and length or height at minimum, head circumference under two years, and MUAC where acute malnutrition is a concern. Length is measured lying down under two and height standing after, and the WHO standards differ between the two, so which one was taken matters.',
  },
  {
    q: 'Why plot growth rather than just record the weight?',
    a: 'A single weight tells you where a child is; a line tells you where they are going. A child tracking steadily along the −1 line is usually fine. A child who was on the median and has crossed two lines downward needs attention even if the current weight still looks acceptable.',
  },
  {
    q: 'What is MUAC used for?',
    a: 'Mid-upper arm circumference screens for acute malnutrition in children from about six months to five years. It is quick, needs only a tape, and is largely independent of age, which is why it is used where a scale is not practical.',
  },
]

export default function Guide() {
  return (
    <>
      <p>
        Every paediatric consultation produces a weight. Most clinics write it in a file, and that is where
        it stays — a column of numbers nobody compares. The number by itself answers almost nothing: 11.4 kg
        is healthy for one two-year-old and a warning for another, and the same child&apos;s weight last
        year matters more than either.
      </p>
      <p>
        This guide covers what the WHO growth standards actually give you, how a z-score should be read, and
        what a paediatric clinic needs to capture at each visit for any of it to work.
      </p>

      <h2>What gets measured</h2>
      <Screenshot
        src="/guides/paed-measurements.png" width={2380} height={620}
        alt="Measurement row of a paediatric consultation with fields for weight in kilograms, length in centimetres, head circumference and MUAC"
        caption="Four measurements, taken at the same point in every visit."
      />
      <ul>
        <li><strong>Weight</strong> — the one everybody takes, and on its own the least informative.</li>
        <li><strong>Length or height</strong> — lying down under two years, standing after. The standards differ between the two, so which was taken matters.</li>
        <li><strong>Head circumference</strong> — under two, where it tracks brain growth and catches problems a weight never would.</li>
        <li><strong>MUAC</strong> — mid-upper arm circumference, for acute malnutrition from about six months.</li>
      </ul>
      <CalloutBox tone="warning" title="Units are where this goes wrong">
        Grams typed into a kilogram box, millimetres into a centimetre one, or a head circumference typed
        into the MUAC box will all plot as a real point on a real chart and be read by a real clinician.
        Each value should be checked against a plausible range for a child and the offending field named —
        a 9980 in the weight box is not a 9.98 kg child.
      </CalloutBox>

      <h2>Reading the chart</h2>
      <Screenshot
        src="/guides/paed-growth-chart.png" width={2380} height={1134}
        alt="WHO weight-for-age chart with median, plus and minus two and three standard deviation lines, and a child's two measurements plotted tracking just below the median"
        caption="Two visits, plotted against the WHO standard. The green line is the median; amber is ±2 SD, red ±3 SD."
      />
      <p>
        The green line is the median for that age and sex. The amber lines are two standard deviations
        either side, the red lines three. A z-score simply says which of those bands a child falls in:
      </p>
      <ul>
        <li><strong>−2 to +2</strong> — within the normal range.</li>
        <li><strong>Below −2</strong> — underweight (weight-for-age), stunted (length-for-age) or wasted (weight-for-length), depending on the measurement.</li>
        <li><strong>Below −3</strong> — the severe form of the same, and usually a referral.</li>
        <li><strong>Above +2</strong> — worth noting on weight-for-length, where it indicates overweight.</li>
      </ul>
      <p>
        The value of the chart over the number is the <strong>direction</strong>. A child tracking steadily
        along the −1 line is usually fine. A child who was on the median and has crossed two lines downward
        needs attention even if today&apos;s weight still reads as normal — which is precisely what a column
        of weights in a paper file will not tell you.
      </p>

      <h2>Milestones alongside the measurements</h2>
      <Screenshot
        src="/guides/paed-milestones.png" width={2380} height={830}
        alt="Developmental milestones for the child's age group, listed with the ability expected at that age"
        caption="Milestones for the child's current age, so development is asked about rather than remembered."
      />
      <p>
        Growth and development are different questions, and the second is easy to skip in a busy OPD. Having
        the milestones for the child&apos;s current age in front of the doctor turns it into a prompt rather
        than something to remember — and a delay noticed at two is worth far more than one noticed at four.
      </p>

      <h2>Why the whole consultation matters</h2>
      <Screenshot
        src="/guides/paed-assessment.png" width={2464} height={5072}
        alt="The full paediatric assessment card: measurements, growth assessment, WHO chart, vaccinations due and developmental milestones"
        caption="Measurements, chart, immunisation and milestones in one card, in the order a paediatric consultation runs."
      />
      <p>
        A paediatric visit is one flow: measure, plot, check what is due, ask about development. Splitting
        those across different screens is how the last two get skipped. Immunisation is covered on its own
        in the{' '}
        <Link href="/guides/child-immunisation-schedule-software-guide">child immunisation guide</Link>.
      </p>

      <h2>What Uyirly does</h2>
      <ul>
        <li>Weight, length or height, head circumference and MUAC captured at each visit.</li>
        <li>WHO Child Growth Standards for weight, length/height and head circumference, plotted against median, ±2 SD and ±3 SD.</li>
        <li>Every past measurement on the same chart, so the direction is visible, not just today&apos;s point.</li>
        <li>Each measurement checked against a plausible range, naming the field that looks wrong.</li>
        <li>Birth history — gestation, birth weight, delivery mode, feeding — kept with the child.</li>
        <li>Milestones for the child&apos;s current age shown during the consultation.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Growth charts appear automatically in a consultation once a department is set to the paediatric
        template, as part of Uyirly&apos;s{' '}
        <Link href="/hospital-management-software">hospital management software</Link>.{' '}
        <Link href="/signup">Start a 30-day free trial</Link> — no credit card.
      </p>
    </>
  )
}
