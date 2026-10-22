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

export { monthName, fmtDate }
