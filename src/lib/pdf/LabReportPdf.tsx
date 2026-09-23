import { Text, View } from '@react-pdf/renderer'
import type { LabOrder, LabOrderItem, TenantProfile } from '@/lib/types'
import {
  A4, DataTable, InfoGrid, Letterhead, PageChrome, SectionTitle, Signatures, TitleBand,
  ageSex, fmtDateTime, shortRef, s, C, type LogoImage, type TableCell,
} from './parts'

export interface ReportPatient {
  full_name: string; uhid: string
  dob?: string | null; gender?: string | null; phone?: string | null
}

function refRange(item: LabOrderItem): string {
  const t = item.test
  const unit = item.unit ?? t?.unit
  if (t?.reference_range) return t.reference_range
  if (t?.ref_low != null && t?.ref_high != null) return `${t.ref_low} – ${t.ref_high}${unit ? ` ${unit}` : ''}`
  if (t?.ref_high != null) return `< ${t.ref_high}${unit ? ` ${unit}` : ''}`
  if (t?.ref_low != null) return `> ${t.ref_low}${unit ? ` ${unit}` : ''}`
  return '—'
}

const FLAG: Record<string, { label: string; color: string }> = {
  high: { label: 'HIGH', color: C.danger },
  low: { label: 'LOW', color: '#1D4ED8' },
  normal: { label: 'Normal', color: C.ok },
  pending: { label: 'Pending', color: C.faint },
  abnormal: { label: 'ABNORMAL', color: '#B45309' },
  critical_high: { label: 'CRITICAL', color: '#991B1B' },
  critical_low: { label: 'CRITICAL', color: '#1E3A8A' },
  unranged: { label: '', color: C.faint },
}

/** One measurement on the report — a panel member, or a single test's one value. */
export interface ReportAnalyte {
  test_id: string; test_name: string; test_code: string | null; sample_type: string | null
  analyte_id: string; name: string; short_name: string | null
  unit_ucum: string | null; decimals: number; value_type: string; display_order: number
  value_num: number | null; value_text: string | null
  ref_low: number | null; ref_high: number | null; flag: string
}

const ABNORMAL_FLAGS = new Set(['high', 'low', 'abnormal', 'critical_high', 'critical_low'])

function analyteRange(a: ReportAnalyte): string {
  if (a.ref_low != null && a.ref_high != null) return `${a.ref_low} – ${a.ref_high}`
  if (a.ref_high != null) return `< ${a.ref_high}`
  if (a.ref_low != null) return `> ${a.ref_low}`
  return ''
}


export function LabReportPdf({ order, patient, profile, logo, analytes = [], verifiedBy = null }: {
  order: LabOrder; patient: ReportPatient; profile: TenantProfile | null; logo: LogoImage
  analytes?: ReportAnalyte[]; verifiedBy?: string | null
}) {
  const hospital = profile?.name || 'Hospital'
  const ref = order.accession_no ?? shortRef('LAB', order.id)
  const items = order.items ?? []

  // Tests whose results live as analytes. Their lab_order_items row carries no
  // value — the twenty numbers of a CBC are in lab_result_analytes — so it must
  // not also print as an empty line.
  const analyteTestIds = new Set(analytes.map((a) => a.test_id))
  const singles = items.filter((i) => !analyteTestIds.has(i.test_id))

  const abnormal = singles.filter((i) => i.flag === 'high' || i.flag === 'low').length
    + analytes.filter((a) => ABNORMAL_FLAGS.has(a.flag)).length
  const pending = singles.filter((i) => i.result_value == null && !i.result_text).length

  // Group by sample type so a mixed order (blood + urine) reads as separate panels.
  const groups = new Map<string, LabOrderItem[]>()
  for (const it of singles) {
    const key = it.test?.sample_type?.trim() || 'General'
    groups.set(key, [...(groups.get(key) ?? []), it])
  }

  // Panels, each printed under its own heading in report order.
  const panels = new Map<string, ReportAnalyte[]>()
  for (const a of analytes) panels.set(a.test_id, [...(panels.get(a.test_id) ?? []), a])

  return (
    <A4 title={`Lab report ${patient.full_name} ${ref}`}>
      <PageChrome hospital={hospital} identity={`${patient.full_name} · UHID ${patient.uhid}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title="LABORATORY REPORT"
        subtitle={pending > 0 ? `${pending} result${pending > 1 ? 's' : ''} pending — interim report` : abnormal > 0 ? `${abnormal} result${abnormal > 1 ? 's' : ''} outside the reference range` : null}
        numberLabel={order.accession_no ? 'Accession No' : 'Report Ref'} number={ref}
        date={order.reported_at ? `Reported ${fmtDateTime(order.reported_at)}` : 'Not yet reported'}
      />
      <InfoGrid items={[
        ['Patient', patient.full_name],
        ['UHID', patient.uhid],
        ['Age / Sex', ageSex(patient.dob, patient.gender)],
        ['Referred by', order.orderer?.full_name],
        ['Ordered', fmtDateTime(order.ordered_at)],
        ['Priority', order.priority === 'stat' ? 'STAT (urgent)' : 'Routine'],
      ]} />

      {[...panels.entries()].map(([testId, rows]) => (
        <View key={testId}>
          <View wrap={false}>
            <SectionTitle>{rows[0].test_name}</SectionTitle>
          </View>
          <DataTable
            columns={[
              { label: 'Investigation', flex: 1 },
              { label: 'Result', width: 80, align: 'right' },
              { label: 'Unit', width: 60 },
              { label: 'Reference range', width: 120 },
              { label: 'Flag', width: 50, align: 'center' },
            ]}
            rows={rows.map((a): Array<string | TableCell> => {
              const value = a.value_text ?? (a.value_num != null ? String(a.value_num) : '—')
              const f = FLAG[a.flag] ?? FLAG.pending
              const out = ABNORMAL_FLAGS.has(a.flag)
              const range = analyteRange(a)
              return [
                { text: a.short_name ?? a.name, bold: false, note: null },
                { text: value, bold: out, color: out ? f.color : C.ink },
                // Blank, not a dash: 'Protein 2+' has no unit and a dash there
                // reads as a missing value rather than an inapplicable column.
                a.unit_ucum ?? '',
                // An analyte with no range prints nothing rather than a dash
                // that could be read as "nothing abnormal".
                { text: range, color: C.muted },
                { text: f.label, bold: out, color: f.color },
              ]
            })}
            empty="No results."
          />
        </View>
      ))}

      {[...groups.entries()].map(([sample, rows]) => (
        <View key={sample}>
          <View wrap={false}>
            <SectionTitle>{groups.size > 1 || sample !== 'General' ? `Sample: ${sample}` : 'Results'}</SectionTitle>
          </View>
          <DataTable
            columns={[
              { label: 'Investigation', flex: 1 },
              { label: 'Result', width: 80, align: 'right' },
              { label: 'Unit', width: 60 },
              { label: 'Reference range', width: 120 },
              { label: 'Flag', width: 50, align: 'center' },
            ]}
            rows={rows.map((it): Array<string | TableCell> => {
              const result = it.result_value != null ? String(it.result_value) : it.result_text || '—'
              const f = FLAG[it.flag] ?? FLAG.pending
              const out = it.flag === 'high' || it.flag === 'low'
              return [
                { text: it.test?.name ?? 'Test', bold: true, note: it.test?.code ?? null },
                { text: result, bold: out, color: out ? f.color : C.ink },
                it.unit ?? it.test?.unit ?? '—',
                { text: refRange(it), color: C.muted },
                { text: f.label, bold: out, color: f.color },
              ]
            })}
            empty="No tests on this order."
          />
        </View>
      ))}

      <View wrap={false} style={{ marginTop: 14 }}>
        <Text style={[s.small, { textAlign: 'center' }]}>— End of report —</Text>
        <Text style={[s.small, { marginTop: 6 }]}>
          Results relate only to the sample tested. Please correlate clinically; consult your doctor for interpretation.
        </Text>
      </View>
      <Signatures hospital={hospital} left={null}
        right={{ role: 'Pathologist / Lab In-charge', name: verifiedBy ?? undefined }} />
    </A4>
  )
}
