import Link from 'next/link'
import RatioBarChart from '@/components/guides/diagrams/RatioBarChart'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the NABH nurse-to-patient ratio for a general ward?',
    a: 'NABH recommends 1 nurse for every 6 patients (1:6) in a general ward at a non-teaching hospital. Super-speciality wards are staffed more tightly, at around 1:4.',
  },
  {
    q: 'What is the nurse ratio in ICU under NABH norms?',
    a: 'NABH recommends 1:1 for ventilated ICU patients and 1:2 for non-ventilated ICU patients. The same 1:1 / 1:2 split applies to emergency and trauma units with ventilated patients.',
  },
  {
    q: 'Do these ratios include leave reserve?',
    a: 'No — the ratios above are for nurses actually present on a shift. NABH separately recommends roughly 45% additional nurses on the total sanctioned strength as a leave reserve, to account for annual leave, sick leave and holidays across the year.',
  },
  {
    q: 'Are NABH nurse ratios legally mandatory?',
    a: 'NABH accreditation is voluntary, but hospitals pursuing or maintaining accreditation are assessed against these staffing norms, and many state licensing and insurance-empanelment processes reference NABH standards indirectly. Even without accreditation, they are the most widely used staffing benchmark for Indian hospitals.',
  },
]

const RATIOS = [
  { label: 'General ward', ratio: 6, note: 'Non-teaching hospital' },
  { label: 'Super-speciality ward', ratio: 4 },
  { label: 'High Dependency Unit (HDU)', ratio: 3 },
  { label: 'Paediatric ward', ratio: 5 },
  { label: 'Antenatal / postnatal ward', ratio: 4 },
  { label: 'Palliative care unit', ratio: 4 },
  { label: 'Chemotherapy / day-care unit', ratio: 3 },
  { label: 'Acute respiratory / burns unit', ratio: 2 },
  { label: 'ICU / post-op recovery (non-ventilated)', ratio: 2 },
  { label: 'Emergency & trauma (non-ventilated)', ratio: 2 },
  { label: 'ICU (ventilated)', ratio: 1 },
  { label: 'Emergency & trauma (ventilated)', ratio: 1 },
  { label: 'Neonatal ICU', ratio: 1 },
  { label: 'Minor OT', ratio: 1 },
]

export default function Guide() {
  return (
    <>
      <p>
        &ldquo;How many nurses do we actually need?&rdquo; is one of the first questions any hospital administrator
        asks when staffing a new ward &mdash; and one of the most common answers in India references NABH
        (National Accreditation Board for Hospitals &amp; Healthcare Providers) staffing norms. This guide lays
        out the exact recommended nurse-to-patient ratios by unit type, and how to turn them into an actual
        staffing number for your hospital.
      </p>

      <h2>NABH nurse-to-patient ratios by unit</h2>
      <p>
        The chart below shows the recommended ratio for each unit type. A shorter bar means fewer nurses are
        needed per patient (a general ward); a longer, more intense bar means a unit requires much closer
        staffing (ICU, neonatal ICU).
      </p>
      <RatioBarChart title="NABH-recommended nurse : patient ratios" rows={RATIOS} />
      <p>Two units follow a slightly different rule and aren&apos;t ratio-based per patient:</p>
      <ul>
        <li><strong>Labour room</strong> &mdash; 2 nurses per labour table (not per patient count).</li>
        <li><strong>Major OT</strong> &mdash; 2 nurses per operating table.</li>
        <li><strong>General OPD</strong> &mdash; roughly 1 nurse per 50 patients seen.</li>
      </ul>

      <h2>How to turn a ratio into a staffing number</h2>
      <p>The formula is straightforward once you know the ratio for a ward:</p>
      <blockquote>required nurses (per shift) = occupied beds &divide; ratio, rounded up</blockquote>
      <p>
        For example, a 30-bed general ward running at 24 occupied beds, at a 1:6 ratio, needs{' '}
        <strong>4 nurses</strong> that shift (24 &divide; 6 = 4). A 10-bed ICU running at 8 occupied beds, all
        ventilated, at a 1:1 ratio, needs <strong>8 nurses</strong> that shift.
      </p>
      <CalloutBox tone="info" title="Use a minimum floor, not just the formula">
        Even a near-empty ward should never drop to zero nurses. Most hospitals set a minimum headcount per
        shift per ward (commonly 1&ndash;2 nurses) regardless of how low occupancy falls, so the ward is never
        left unstaffed.
      </CalloutBox>

      <h2>Don&apos;t forget the leave reserve</h2>
      <p>
        The ratios above describe nurses who need to be <em>present</em> on a given shift &mdash; they are not
        your total sanctioned headcount. Every nurse takes annual leave, sick leave, and weekly offs across the
        year, so NABH guidance recommends roughly <strong>45% additional nurses</strong> on top of the ratio-based
        number to cover for absences without leaving shifts short.
      </p>
      <p>
        In practice, this means a ward that needs 4 nurses present per shift, seven days a week, needs a
        sanctioned strength closer to 10&ndash;12 nurses once you account for weekly offs, annual leave and sick
        leave across the roster cycle &mdash; not just 4 people cycling endlessly through every shift.
      </p>

      <h2>Turning ratios into a working roster</h2>
      <p>
        Ratios are only useful if they actually drive the day-to-day roster. In a well-set-up hospital
        management system, each ward has its ratio configured once, and the software then:
      </p>
      <ul>
        <li>computes required headcount per shift automatically from the live bed count,</li>
        <li>shows a clear &ldquo;3 of 4 rostered&rdquo; badge on any shift that falls short, and</li>
        <li>can auto-fill the gap from available, not-on-leave nurses when a manager asks it to.</li>
      </ul>
      <p>
        For how this connects to the actual weekly roster, cyclic shift patterns, and leave handling, see our{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">guide to building a nurse duty roster</Link>. For
        the broader NABH documentation and readiness picture beyond staffing, see our{' '}
        <Link href="/guides/nabh-accreditation-software-checklist">NABH accreditation software checklist</Link>.
      </p>
    </>
  )
}
