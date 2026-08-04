import Link from 'next/link'
import RatioBarChart from '@/components/guides/diagrams/RatioBarChart'
import CalloutBox from '@/components/guides/diagrams/CalloutBox'

export const faqs = [
  {
    q: 'What is the nurse-to-patient ratio in a general ward as per NABH?',
    a: 'NABH recommends 1 nurse for every 6 patients (1:6) in a general ward at a non-teaching hospital. Teaching hospitals, which carry higher patient acuity and a training role, are typically staffed more tightly. Super-speciality wards are staffed at around 1:4.',
  },
  {
    q: 'What is the nurse patient ratio in ICU under NABH norms?',
    a: 'For the ICU, NABH recommends 1:1 for ventilated patients and 1:2 for non-ventilated patients. In other words, a ventilated ICU patient should have a nurse dedicated to them. The same 1:1 / 1:2 split applies to emergency and trauma units with ventilated patients, and the neonatal ICU is staffed at 1:1.',
  },
  {
    q: 'What is the nurse-to-patient ratio in India generally?',
    a: 'There is no single number — it depends on the unit. NABH lays out ratios by ward type, from 1:1 in intensive units down to about 1:6 in a general ward, with most step-down and specialty units between 1:2 and 1:4. National averages across Indian hospitals are often much thinner than these recommendations, which is exactly why the NABH norms exist as a staffing benchmark.',
  },
  {
    q: 'What is the formula to calculate nurses required from the ratio?',
    a: 'Required nurses per shift = occupied beds ÷ ratio, rounded up. For example, 24 occupied beds in a general ward at a 1:6 ratio needs 4 nurses that shift. To get the sanctioned headcount for the ward across the roster, add roughly 45% on top of that as a leave reserve to cover weekly offs, annual leave and sick leave.',
  },
  {
    q: 'Do these ratios include the leave reserve?',
    a: 'No — the ratios are for nurses actually present on a shift. NABH separately recommends roughly 45% additional nurses on the total sanctioned strength as a leave reserve, to account for annual leave, sick leave and weekly offs across the year.',
  },
  {
    q: 'Are NABH nurse ratios legally mandatory?',
    a: 'NABH accreditation is voluntary, but hospitals pursuing or maintaining accreditation are assessed against these staffing norms, and many state licensing and insurance-empanelment processes reference NABH standards indirectly. Even without accreditation, they are the most widely used nurse-to-patient staffing benchmark for Indian hospitals.',
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
        asks when staffing a ward &mdash; and in India, the most common answer references the nurse-to-patient
        ratios set by NABH (the National Accreditation Board for Hospitals &amp; Healthcare Providers). This guide
        lays out the exact NABH-recommended nurse-to-patient ratios by unit type &mdash; general ward, ICU, HDU,
        emergency, OT and more &mdash; and shows how to turn a ratio into a real staffing number for your hospital.
      </p>

      <h2>Nurse-to-patient ratio in a general ward</h2>
      <p>
        Because it&apos;s the most-asked figure, start here: as per NABH, a <strong>general ward</strong> in a
        non-teaching hospital is staffed at <strong>1:6</strong> &mdash; one nurse for every six patients on a
        shift. A super-speciality ward, where patients are sicker, tightens to around 1:4, and a High Dependency
        Unit (HDU) to 1:3. Teaching hospitals, which carry higher patient acuity and a training responsibility,
        generally staff their wards more richly than the non-teaching general-ward figure &mdash; confirm which
        standard applies to your hospital, since teaching and non-teaching norms differ.
      </p>

      <h2>NABH nurse-to-patient ratios by unit</h2>
      <p>
        The chart below shows the recommended ratio for each unit type. A shorter bar means fewer nurses are
        needed per patient (a general ward); a longer, more intense bar means a unit requires much closer
        staffing (ICU, neonatal ICU).
      </p>
      <RatioBarChart title="NABH-recommended nurse : patient ratios" rows={RATIOS} />
      <p>Three units follow a slightly different rule and aren&apos;t ratio-based per patient:</p>
      <ul>
        <li><strong>Labour room</strong> &mdash; 2 nurses per labour table (not per patient count).</li>
        <li><strong>Major OT</strong> &mdash; 2 nurses per operating table.</li>
        <li><strong>General OPD</strong> &mdash; roughly 1 nurse per 50 patients seen.</li>
      </ul>

      <h2>Nurse ratio in the ICU</h2>
      <p>
        The ICU is where the ratio matters most. NABH recommends <strong>1:1 for a ventilated patient</strong> and
        <strong> 1:2 for a non-ventilated patient</strong> &mdash; a patient on a ventilator should effectively have
        a nurse to themselves. The same 1:1 / 1:2 split applies to emergency and trauma units handling ventilated
        patients, and the <strong>neonatal ICU</strong> is staffed at 1:1. Post-operative recovery and step-down
        units sit at 1:2, between the ICU and the general ward.
      </p>

      <h2>How to turn a ratio into a staffing number</h2>
      <p>The formula is straightforward once you know the ratio for a ward:</p>
      <blockquote>required nurses (per shift) = occupied beds &divide; ratio, rounded up</blockquote>
      <p>
        For example, a 30-bed general ward running at 24 occupied beds, at a 1:6 ratio, needs{' '}
        <strong>4 nurses</strong> that shift (24 &divide; 6 = 4). A 10-bed ICU running at 8 occupied beds, all
        ventilated, at a 1:1 ratio, needs <strong>8 nurses</strong> that shift.
      </p>
      <CalloutBox tone="info" title="Use a minimum floor, not just the formula">
        Even a near-empty ward should never drop to zero nurses. Most hospitals set a minimum headcount per shift
        per ward (commonly 1&ndash;2 nurses) regardless of how low occupancy falls, so the ward is never left
        unstaffed.
      </CalloutBox>

      <h2>Don&apos;t forget the leave reserve</h2>
      <p>
        The ratios above describe nurses who need to be <em>present</em> on a given shift &mdash; they are not your
        total sanctioned headcount. Every nurse takes annual leave, sick leave, and weekly offs across the year,
        so NABH guidance recommends roughly <strong>45% additional nurses</strong> on top of the ratio-based number
        to cover for absences without leaving shifts short.
      </p>
      <p>
        In practice, this means a ward that needs 4 nurses present per shift, seven days a week, needs a
        sanctioned strength closer to 10&ndash;12 nurses once you account for weekly offs, annual leave and sick
        leave across the roster cycle &mdash; not just 4 people cycling endlessly through every shift.
      </p>

      <h2>Turning ratios into a working roster</h2>
      <p>
        Ratios are only useful if they actually drive the day-to-day roster. In a well-set-up hospital management
        system, each ward has its ratio configured once, and the software then:
      </p>
      <ul>
        <li>computes required headcount per shift automatically from the live bed count,</li>
        <li>shows a clear &ldquo;3 of 4 rostered&rdquo; badge on any shift that falls short, and</li>
        <li>can auto-fill the gap from available, not-on-leave nurses when a manager asks it to.</li>
      </ul>
      <p>
        For how this connects to the actual weekly roster, cyclic shift patterns and leave handling, see our{' '}
        <Link href="/guides/nurse-duty-roster-hospital-guide">guide to building a nurse duty roster</Link>. For the
        broader NABH documentation and readiness picture beyond staffing, see our{' '}
        <Link href="/guides/nabh-accreditation-software-checklist">NABH accreditation software checklist</Link>, and
        for how staffing sits inside the wider system, our{' '}
        <Link href="/hospital-management-software">hospital management software</Link> overview.
      </p>
      <h2>How Uyirly helps you meet the ratio</h2>
      <p>
        Knowing the required nurse-to-patient ratio is one thing; staffing to it every shift is another.{' '}
        <Link href="/hospital-management-software">Uyirly</Link> builds ward rosters on a week grid and shows
        each day&apos;s coverage against the ward&apos;s required staffing, so an understaffed shift is flagged before
        it happens rather than discovered on the day. Because the roster sits on the same platform as
        admissions, the number of occupied beds and the nurses on duty line up.
      </p>
      <ul>
        <li>Ward rosters with per-day coverage against the required ratio.</li>
        <li>Understaffed shifts flagged in advance.</li>
        <li>Occupied beds and staffing on one system, so the ratio is real, not on paper.</li>
      </ul>

      <h2>Getting started</h2>
      <p>
        Rostering is part of Uyirly&apos;s <Link href="/hospital-management-software">hospital management
        software</Link>. See our <Link href="/guides/nurse-duty-roster-hospital-guide">nurse duty roster
        guide</Link>, or <Link href="/signup">start a 30-day free trial</Link> with no credit card.
      </p>
    </>
  )
}
