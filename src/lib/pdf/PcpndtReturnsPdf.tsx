import { Text, View, StyleSheet } from '@react-pdf/renderer'
import { A4, C, fmtDate } from './parts'
import type { TenantProfile } from '@/lib/types'

/**
 * The monthly pack, on the district's own forms.
 *
 * Deliberately plain. These are not Uyirly documents — they are the Appropriate
 * Authority's forms with a hospital's figures written into them, and they are
 * printed, signed, sealed and e-mailed. A letterhead, a logo or a product name
 * anywhere on the page would make them look like something other than what the
 * officer receiving them expects, which is the one thing that gets a return
 * handed back.
 *
 * So: the district's titles, the district's column headings, and the signature
 * and seal blocks exactly where the paper has them.
 *
 * ── The layout is Karur's, the data is not ────────────────────────────────
 *
 * Reports I–V as laid out here follow the pack a Karur hospital was handed,
 * reported to be used across Tamil Nadu. The central Act prescribes Form F and
 * the duty to report by the 5th; it does not prescribe these summary sheets,
 * which were not published anywhere I could find. If another district's paper
 * differs, this file is the thing that changes — the registers behind it are
 * central law and do not.
 */

const f = StyleSheet.create({
  page:      { paddingTop: 34, paddingBottom: 34, paddingHorizontal: 32, fontSize: 9 },
  reportNo:  { fontSize: 13, textAlign: 'center', marginBottom: 4, textDecoration: 'underline' },
  title:     { fontSize: 11.5, textAlign: 'center', marginBottom: 14, textDecoration: 'underline' },
  headRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  headCell:  { fontSize: 9, width: '48%' },
  month:     { fontSize: 9, textAlign: 'center', marginBottom: 8 },
  table:     { borderWidth: 0.7, borderColor: '#000', borderBottomWidth: 0 },
  tr:        { flexDirection: 'row' },
  th:        { borderRightWidth: 0.7, borderBottomWidth: 0.7, borderColor: '#000',
               paddingVertical: 4, paddingHorizontal: 3, fontSize: 7.6, textAlign: 'center' },
  td:        { borderRightWidth: 0.7, borderBottomWidth: 0.7, borderColor: '#000',
               paddingVertical: 4, paddingHorizontal: 3, fontSize: 8 },
  footRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 },
  footCell:  { fontSize: 9, width: '48%' },
  sealRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  note:      { fontSize: 7, color: C.faint, marginTop: 26, textAlign: 'center' },
})

export interface ReturnsData {
  month: string            // 'YYYY-MM'
  profile: TenantProfile | null
  reportingPerson: string | null
  reportingPhone: string | null
  reportI: {
    forms_f_obtained: number
    scans: Record<string, number>
    mtp_advised: number
    invasive_procedures: Record<string, number>
    additional_tests: Record<string, number>
  }
  reportIII: {
    live_male: number; live_female: number; live_total: number
    intra_uterine_deaths: number
    mothers_primi: number; mothers_one_daughter: number
    mothers_two_plus_daughters: number; mothers_other: number; mothers_total: number
    abortions_mtp: number
  }
  reportV: Array<{
    report_label: string; opening_qty: number; purchased_qty: number
    invoice_refs: string; suppliers: string; total_qty: number
    used_qty: number; closing_qty: number
  }>
}

const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

/** The two header lines every sheet in the pack carries. */
function FormHead({ data, hospitalLabel }: { data: ReturnsData; hospitalLabel: string }) {
  const p = data.profile
  const address = [p?.address_line1, p?.address_line2, p?.city, p?.pincode].filter(Boolean).join(', ')
  return (
    <>
      <View style={f.headRow}>
        <Text style={f.headCell}>
          {hospitalLabel} : {p?.pcpndt_registered_name || p?.name || ''}
          {address ? `, ${address}` : ''}
        </Text>
        <Text style={f.headCell}>
          Name &amp; contact No. of Reporting Person: {data.reportingPerson ?? ''}
          {data.reportingPhone ? `, ${data.reportingPhone}` : ''}
        </Text>
      </View>
      <Text style={f.month}>Month : {monthName(data.month)}</Text>
    </>
  )
}

/** Date, signature, and the two seals — exactly where the paper has them. */
function FormFoot() {
  return (
    <>
      <View style={f.footRow}>
        <Text style={f.footCell}>Date:</Text>
        <Text style={{ ...f.footCell, textAlign: 'right' }}>Signature of the Doctor</Text>
      </View>
      <View style={f.sealRow}>
        <Text style={f.footCell}>Hospital Round Seal :</Text>
        <Text style={{ ...f.footCell, textAlign: 'center' }}>Doctor&rsquo;s Seal :</Text>
      </View>
    </>
  )
}

function Cell({ children, width, flex, head, align }: {
  children: string; width?: number; flex?: number; head?: boolean; align?: 'center' | 'left' | 'right'
}) {
  return (
    <Text style={{
      ...(head ? f.th : f.td),
      ...(width ? { width } : { flex: flex ?? 1 }),
      ...(align ? { textAlign: align } : {}),
    }}>{children}</Text>
  )
}

// ── Report III ──────────────────────────────────────────────────────────────

export function ReportIIIPdf({ data }: { data: ReturnsData }) {
  const r = data.reportIII
  return (
    <A4 title={`Report III ${data.month}`} landscape>
      <View style={f.page}>
        <Text style={f.reportNo}>Report No &ndash; III</Text>
        <Text style={f.title}>Details of Delivery, Living Children and MTP/IUD</Text>
        <FormHead data={data} hospitalLabel="Name &amp; Address of the Hospital" />

        <View style={f.table}>
          <View style={f.tr}>
            <Cell head width={70}>Month</Cell>
            <Cell head width={56}>Male child</Cell>
            <Cell head width={62}>Female Child</Cell>
            <Cell head width={46}>Total</Cell>
            <Cell head width={46}>Primi</Cell>
            <Cell head width={78}>With One Female Child</Cell>
            <Cell head width={92}>With Two &amp; Above Female Child</Cell>
            <Cell head width={50}>Others</Cell>
            <Cell head width={46}>Total</Cell>
            <Cell head flex={1}>Total No. of Intra Uterine Death</Cell>
            <Cell head flex={1}>Total No. of Abortion / MTP</Cell>
          </View>
          <View style={f.tr}>
            <Cell width={70} align="center">{monthName(data.month)}</Cell>
            <Cell width={56} align="center">{String(r.live_male)}</Cell>
            <Cell width={62} align="center">{String(r.live_female)}</Cell>
            <Cell width={46} align="center">{String(r.live_total)}</Cell>
            <Cell width={46} align="center">{String(r.mothers_primi)}</Cell>
            <Cell width={78} align="center">{String(r.mothers_one_daughter)}</Cell>
            <Cell width={92} align="center">{String(r.mothers_two_plus_daughters)}</Cell>
            <Cell width={50} align="center">{String(r.mothers_other)}</Cell>
            <Cell width={46} align="center">{String(r.mothers_total)}</Cell>
            <Cell flex={1} align="center">{String(r.intra_uterine_deaths)}</Cell>
            <Cell flex={1} align="center">{String(r.abortions_mtp)}</Cell>
          </View>
        </View>

        <FormFoot />
        <Text style={f.note}>
          Counted from the hospital&rsquo;s own registers. Figures are not entered by hand.
        </Text>
      </View>
    </A4>
  )
}

// ── Report V ────────────────────────────────────────────────────────────────

export function ReportVPdf({ data }: { data: ReturnsData }) {
  return (
    <A4 title={`Report V ${data.month}`} landscape>
      <View style={f.page}>
        <Text style={f.reportNo}>Report No &ndash; V</Text>
        <Text style={f.title}>MTP Drugs Status</Text>
        <FormHead data={data} hospitalLabel="Name &amp; Address of the Private Hospital" />

        <View style={f.table}>
          <View style={f.tr}>
            <Cell head width={104}>Name of the Drug</Cell>
            <Cell head width={70}>Opening Balance</Cell>
            <Cell head width={92}>MTP Drugs Purchased During the Month</Cell>
            <Cell head width={88}>Invoice No. &amp; Date</Cell>
            <Cell head flex={1}>Supplier Name &amp; Address</Cell>
            <Cell head width={56}>Total</Cell>
            <Cell head width={88}>MTP Drugs Used during the month</Cell>
            <Cell head width={76}>Closing Balance</Cell>
          </View>
          {data.reportV.length === 0 ? (
            <View style={f.tr}>
              <Cell width={104}>&mdash;</Cell>
              <Cell width={70} align="center">0</Cell>
              <Cell width={92} align="center">0</Cell>
              <Cell width={88}>&mdash;</Cell>
              <Cell flex={1}>&mdash;</Cell>
              <Cell width={56} align="center">0</Cell>
              <Cell width={88} align="center">0</Cell>
              <Cell width={76} align="center">0</Cell>
            </View>
          ) : data.reportV.map((d) => (
            <View style={f.tr} key={d.report_label}>
              <Cell width={104}>{d.report_label}</Cell>
              <Cell width={70} align="center">{String(d.opening_qty)}</Cell>
              <Cell width={92} align="center">{String(d.purchased_qty)}</Cell>
              <Cell width={88}>{d.invoice_refs}</Cell>
              <Cell flex={1}>{d.suppliers}</Cell>
              <Cell width={56} align="center">{String(d.total_qty)}</Cell>
              <Cell width={88} align="center">{String(d.used_qty)}</Cell>
              <Cell width={76} align="center">{String(d.closing_qty)}</Cell>
            </View>
          ))}
        </View>

        <FormFoot />
        <Text style={f.note}>
          Purchases taken from the invoices received; usage from counter sales and ward issues together.
        </Text>
      </View>
    </A4>
  )
}


// ── Report I ────────────────────────────────────────────────────────────────

const SCAN_ORDER_MALE: Array<[string, string]> = [
  ['male_abdomen', 'Abdomen'],
  ['male_cardiac', 'Cardiac'],
]
const SCAN_ORDER_FEMALE: Array<[string, string]> = [
  ['female_general_abdomen', 'General Abdomen'],
  ['female_antenatal', 'Antenatal'],
  ['female_preconception', 'Pre-conception i.e. follicular studies, uterus studies'],
  ['female_transvaginal', 'Trans vaginal studies'],
  ['female_other', 'Other Ultrasound Studies'],
]
const OTHER_PROCEDURES: Array<[string, string, 'invasive' | 'test']> = [
  ['amniocentesis', 'Amniocentesis', 'invasive'],
  ['cvs', 'Chorionic villi biopsy', 'invasive'],
  ['fetal_biopsy', 'Foetal skin biopsy', 'invasive'],
  ['cordocentesis', 'Cordocentesis', 'invasive'],
  ['other', 'Any Other', 'invasive'],
  ['chromosomal', 'Chromosomal Studies', 'test'],
  ['biochemical', 'Bio-Chemical Studies', 'test'],
  ['molecular', 'Molecular Studies', 'test'],
]

export function ReportIPdf({ data }: { data: ReturnsData }) {
  const p = data.profile
  const r = data.reportI
  const n = (k: string) => String(r.scans[k] ?? 0)
  const other = (code: string, kind: 'invasive' | 'test') =>
    String((kind === 'invasive' ? r.invasive_procedures : r.additional_tests)[code] ?? 0)

  return (
    <A4 title={`Report I ${data.month}`} landscape>
      <View style={f.page}>
        <Text style={{ fontSize: 9.5, textAlign: 'center' }}>
          PRE-CONCEPTION AND PRE-NATAL DIAGNOSTIC TECHNIQUES (REGULATION AND PREVENTION OF MISUSE) ACT 1994
        </Text>
        <Text style={{ fontSize: 9, textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
          MONTHLY REPORT TO BE SUBMITTED TO THE APPROPRIATE AUTHORITY FOR THE MONTH OF{' '}
          {monthName(data.month).toUpperCase()}
        </Text>

        <View style={f.headRow}>
          <Text style={f.headCell}>No. of Form-F obtained : {r.forms_f_obtained}</Text>
          <Text style={f.headCell}>
            Registration No.: {p?.pcpndt_reg_no ?? ''}
            {p?.pcpndt_valid_upto ? `    Valid up to : ${fmtDate(p.pcpndt_valid_upto)}` : ''}
          </Text>
        </View>
        <View style={{ ...f.headRow, marginBottom: 10 }}>
          <Text style={f.headCell}>Contact Phone No. {data.reportingPhone ?? p?.phone1 ?? ''}</Text>
          <Text style={f.headCell}>Email ID: {p?.email ?? ''}</Text>
        </View>

        <Text style={{ fontSize: 9, marginBottom: 3 }}>Ultrasound Scan Procedure</Text>
        <View style={f.table}>
          <View style={f.tr}>
            <Cell head width={62}>Details</Cell>
            {SCAN_ORDER_MALE.map(([, label]) => <Cell head key={label} flex={1}>{`Male — ${label}`}</Cell>)}
            {SCAN_ORDER_FEMALE.map(([, label]) => <Cell head key={label} flex={1}>{`Female — ${label}`}</Cell>)}
          </View>
          <View style={f.tr}>
            <Cell width={62}>No. of Cases</Cell>
            {SCAN_ORDER_MALE.map(([k]) => <Cell key={k} flex={1} align="center">{n(k)}</Cell>)}
            {SCAN_ORDER_FEMALE.map(([k]) => <Cell key={k} flex={1} align="center">{n(k)}</Cell>)}
          </View>
        </View>

        <Text style={{ fontSize: 9, marginTop: 12, marginBottom: 3 }}>Other Procedure Advised</Text>
        <View style={f.table}>
          <View style={f.tr}>
            {OTHER_PROCEDURES.map(([, label]) => <Cell head key={label} flex={1}>{label}</Cell>)}
            <Cell head flex={1}>No. of MTP Advised</Cell>
          </View>
          <View style={f.tr}>
            {OTHER_PROCEDURES.map(([code, label, kind]) =>
              <Cell key={label} flex={1} align="center">{other(code, kind)}</Cell>)}
            <Cell flex={1} align="center">{String(r.mtp_advised)}</Cell>
          </View>
        </View>

        <View style={f.footRow}>
          <Text style={f.footCell}>Date :</Text>
          <Text style={{ ...f.footCell, textAlign: 'right' }}>
            Name &amp; Signature and Regn. No. of the{'\n'}Radiologist / Sonologist / Registered Medical Practitioner
          </Text>
        </View>
        <Text style={{ fontSize: 9, marginTop: 20 }}>Seal :</Text>
        <Text style={{ ...f.note, marginTop: 16 }}>
          Note : Report should be submitted within 5th day of every month to the concerned appropriate authority.
        </Text>
      </View>
    </A4>
  )
}

// ── Report II — a register, so it runs to several pages ────────────────────

/**
 * G, P, L, A as the summary writes it.
 *
 * The two registers name the living count differently — Form F calls it
 * living_children_total because field 4 is about children rather than
 * obstetric history, while the MTP record calls it living. Both are read here,
 * because a dash in this column is a blank column on a statutory return.
 */
const gpla = (r: Record<string, unknown>) =>
  [r.gravida, r.para, r.living ?? r.living_children_total, r.abortions]
    .map((v) => (v == null ? '-' : String(v))).join(', ')

export function ReportIIPdf({ data, rows }: { data: ReturnsData; rows: Record<string, unknown>[] }) {
  const p = data.profile
  const addr = (r: Record<string, unknown>) =>
    [r.address_text, r.district, r.state, r.pincode].filter(Boolean).join(', ')

  return (
    <A4 title={`Report II ${data.month}`} landscape>
      <View style={f.page}>
        <Text style={f.reportNo}>Report No &ndash; II</Text>
        <Text style={f.title}>Details of Form - F</Text>
        <View style={f.headRow}>
          <Text style={f.headCell}>
            Name &amp; Address of the Scan Centre : {p?.pcpndt_registered_name || p?.name || ''}
          </Text>
          <Text style={f.headCell}>Registration No. : {p?.pcpndt_reg_no ?? ''}</Text>
        </View>
        <View style={{ ...f.headRow, marginBottom: 8 }}>
          <Text style={f.headCell}>Month : {monthName(data.month)}</Text>
          <Text style={f.headCell}>Total No. of Form-F obtained : {rows.length}</Text>
        </View>

        <View style={f.table}>
          <View style={f.tr} fixed>
            <Cell head width={24}>Sl. No</Cell>
            <Cell head width={48}>Date</Cell>
            <Cell head width={62}>Sl. No. of Form-F</Cell>
            <Cell head flex={1.9}>Name, (W/o, D/o, S/o), Full Address &amp; Contact No.</Cell>
            <Cell head width={40}>Age</Cell>
            <Cell head width={48}>LMP</Cell>
            <Cell head width={56}>G, P, L, A</Cell>
            <Cell head width={44}>MC &amp; FC</Cell>
            <Cell head flex={1.2}>Reason / Purpose for the USG Procedure</Cell>
            <Cell head flex={1.1}>Referred by whom</Cell>
            <Cell head width={40}>GA</Cell>
            <Cell head flex={1.2}>Result</Cell>
            <Cell head width={56}>MTP Advised</Cell>
          </View>
          {rows.length === 0 ? (
            <View style={f.tr}><Cell flex={1} align="center">No scans recorded for this month</Cell></View>
          ) : rows.map((r, i) => {
            const kids = (r.children_snapshot as Array<{ sex: string }> | null) ?? []
            const mc = kids.filter((k) => k.sex === 'male').length
            const fc = kids.filter((k) => k.sex === 'female').length
            const indications = ((r.usg_indications as string[] | null) ?? []).join(', ')
            return (
              <View style={f.tr} key={String(r.id)} wrap={false}>
                <Cell width={24} align="center">{String(i + 1)}</Cell>
                <Cell width={48}>{fmtDate(r.procedure_date as string)}</Cell>
                <Cell width={62}>{String(r.serial_no ?? '')}</Cell>
                <Cell flex={1.9}>
                  {`${r.patient_name ?? ''}, ${relationShort(r.relation_type as string)} ${r.relation_name ?? ''}, ${addr(r)}, ${r.contact_no ?? ''}`}
                </Cell>
                <Cell width={40} align="center">{r.patient_age_years == null ? '-' : String(r.patient_age_years)}</Cell>
                <Cell width={48}>{r.lmp ? fmtDate(r.lmp as string) : '-'}</Cell>
                <Cell width={56} align="center">{gpla(r)}</Cell>
                <Cell width={44} align="center">{`${mc} & ${fc}`}</Cell>
                <Cell flex={1.2}>{indications || '-'}</Cell>
                <Cell flex={1.1}>{String(r.referred_by_name ?? (r.is_self_referral ? 'Self-referral' : '-'))}</Cell>
                <Cell width={40} align="center">
                  {r.weeks_of_pregnancy == null ? '-' : `${r.weeks_of_pregnancy}w`}
                </Cell>
                <Cell flex={1.2}>{String(r.result_text ?? '-')}</Cell>
                <Cell width={56} align="center">{mtpAdvised(r.mtp_indication as string | null)}</Cell>
              </View>
            )
          })}
        </View>

        <FormFoot />
      </View>
    </A4>
  )
}

// ── Report IV ───────────────────────────────────────────────────────────────

export function ReportIVPdf({ data, rows }: { data: ReturnsData; rows: Record<string, unknown>[] }) {
  return (
    <A4 title={`Report IV ${data.month}`} landscape>
      <View style={f.page}>
        <Text style={f.reportNo}>Report No &ndash; IV</Text>
        <Text style={f.title}>Details of MTP / Abortion Cases</Text>
        <FormHead data={data} hospitalLabel="Name &amp; Address of the Private Hospital" />

        <View style={f.table}>
          <View style={f.tr} fixed>
            <Cell head width={24}>Sl. No</Cell>
            <Cell head flex={1.9}>Name, Husband&rsquo;s Name &amp; Complete Postal Address of the Pregnant Women</Cell>
            <Cell head width={62}>Contact Number</Cell>
            <Cell head width={58}>G, P, L, A</Cell>
            <Cell head width={58}>Living Children MC, FC, T</Cell>
            <Cell head width={48}>LMP</Cell>
            <Cell head width={50}>Weeks (GA per USG)</Cell>
            <Cell head flex={1.1}>IP No &amp; Date of Admission / Discharge</Cell>
            <Cell head flex={1}>Dr.&rsquo;s Name, who done the procedure</Cell>
            <Cell head flex={1.2}>Reason for MTP / Abortion</Cell>
          </View>
          {rows.length === 0 ? (
            <View style={f.tr}><Cell flex={1} align="center">No terminations recorded for this month</Cell></View>
          ) : rows.map((r, i) => {
            const mc = (r.living_male as number | null) ?? 0
            const fc = (r.living_female as number | null) ?? 0
            return (
              <View style={f.tr} key={String(r.id)} wrap={false}>
                <Cell width={24} align="center">{String(i + 1)}</Cell>
                <Cell flex={1.9}>
                  {`${r.patient_name ?? ''}, ${r.relation_name ?? ''}, ${[r.address_text, r.district, r.state, r.pincode].filter(Boolean).join(', ')}`}
                </Cell>
                <Cell width={62}>{String(r.contact_no ?? '-')}</Cell>
                <Cell width={58} align="center">{gpla(r)}</Cell>
                <Cell width={58} align="center">{`${mc}, ${fc}, ${mc + fc}`}</Cell>
                <Cell width={48}>{r.lmp ? fmtDate(r.lmp as string) : '-'}</Cell>
                <Cell width={50} align="center">
                  {r.gestation_weeks == null ? '-' : String(r.gestation_weeks)}
                </Cell>
                <Cell flex={1.1}>
                  {`${r.ip_no ?? '-'}${r.admitted_on ? `, ${fmtDate(r.admitted_on as string)}` : ''}${r.discharged_on ? ` – ${fmtDate(r.discharged_on as string)}` : ''}`}
                </Cell>
                <Cell flex={1}>{String(r.performed_by_name ?? '-')}</Cell>
                <Cell flex={1.2}>{String(r.reason_text ?? '-')}</Cell>
              </View>
            )
          })}
        </View>

        <FormFoot />
        <Text style={f.note}>Case sheets are preserved for two years, as the form requires.</Text>
      </View>
    </A4>
  )
}

/** The form writes the relation as W/o, D/o or S/o rather than spelling it out. */
function relationShort(t: string | null): string {
  if (t === 'husband') return 'W/o'
  if (t === 'father') return 'D/o'
  if (t === 'mother') return 'C/o'
  if (t === 'wife') return 'H/o'
  return ''
}

/**
 * The Act expects "NA" written where there is no indication, so the presence
 * of text is not the test — the same trap that had the register flagging every
 * compliant form.
 */
function mtpAdvised(v: string | null): string {
  if (!v) return 'Not Advised'
  const t = v.trim().toLowerCase().replace(/[.\s/]/g, '')
  return ['na', 'nil', 'no', 'none', 'notapplicable', '-'].includes(t) ? 'Not Advised' : 'Advised'
}

export { monthName, fmtDate }
