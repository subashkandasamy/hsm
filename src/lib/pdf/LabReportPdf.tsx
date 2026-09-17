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
}


export function LabReportPdf({ order, patient, profile, logo }: { order: LabOrder; patient: ReportPatient; profile: TenantProfile | null; logo: LogoImage }) {
  const hospital = profile?.name || 'Hospital'
  const ref = order.accession_no ?? shortRef('LAB', order.id)
  const items = order.items ?? []
  const abnormal = items.filter((i) => i.flag === 'high' || i.flag === 'low').length
  const pending = items.filter((i) => i.result_value == null && !i.result_text).length

  // Group by sample type so a mixed order (blood + urine) reads as separate panels.
  const groups = new Map<string, LabOrderItem[]>()
  for (const it of items) {
    const key = it.test?.sample_type?.trim() || 'General'
    groups.set(key, [...(groups.get(key) ?? []), it])
  }

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
      <Signatures hospital={hospital} left={null} right={{ role: 'Pathologist / Lab In-charge' }} />
    </A4>
  )
}
