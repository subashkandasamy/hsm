import { Text, View } from '@react-pdf/renderer'
import { isGstRegistered, isCompositionDealer, COMPOSITION_DECLARATION } from '@/lib/gst'
import { rupeesInWords, summarizeBillGst } from '@/lib/gst'
import type { CombinedBillData, CombinedBillSection, TenantProfile } from '@/lib/types'
import {
  A4, AmountInWords, ChargesTable, InfoGrid, Letterhead, PageChrome, Signatures, TitleBand, TotalsBox,
  ageSex, fmtDate, fmtDateRange, fmtDateTime, money, s, C, type ChargeRow, type ChargeSection, type LogoImage, type TotalLine,
} from './parts'

/**
 * Collapses identical repeated charges (same description, rate and GST — e.g. a
 * daily room rent or nursing shift) into one line with a date range and the day
 * count, so a 30-day stay reads as one line per charge instead of 30. Order of
 * first appearance is kept. Cancelled rows are never merged with live ones.
 */
export function consolidateSection(sec: CombinedBillSection): ChargeRow[] {
  const groups: Array<{ key: string; rows: CombinedBillSection['rows'] }> = []
  for (const r of sec.rows) {
    const key = [r.description, r.unitPrice, r.gstRate ?? 0, r.hsn_sac ?? '', r.cancelled ? 1 : 0].join('|')
    const g = groups.find((x) => x.key === key)
    if (g) g.rows.push(r)
    else groups.push({ key, rows: [r] })
  }
  return groups.map(({ rows }) => {
    const dates = rows.map((r) => r.date).sort()
    const days = new Set(dates).size
    const qty = rows.reduce((t, r) => t + Number(r.qty), 0)
    // "32 days" when it is one a day; "37 charges over 34 days" when some day was charged twice.
    const note = days > 1 ? (rows.length === days ? `${days} days` : `${rows.length} charges over ${days} days`) : rows.length > 1 ? `${rows.length} charges` : null
    return {
      date: fmtDateRange(dates[0], dates[dates.length - 1]),
      description: rows[0].description,
      note,
      hsn: rows[0].hsn_sac ?? null,
      qty,
      rate: Number(rows[0].unitPrice),
      gstRate: rows[0].gstRate ?? 0,
      amount: rows.reduce((t, r) => t + Number(r.amount), 0),
      cancelled: !!rows[0].cancelled,
    }
  })
}

function daysBetween(from: string, to: string | null): number {
  const a = new Date(from).getTime(), b = to ? new Date(to).getTime() : Date.now()
  return Math.max(1, Math.ceil((b - a) / 86_400_000))
}

export function SummaryBillPdf({ data, profile, detailed, logo }: { data: CombinedBillData; profile: TenantProfile | null; detailed: boolean; logo: LogoImage }) {
  const hospital = profile?.name || data.tenantName
  const enc = data.encounter
  const kind = data.kind ?? 'patient'

  const title =
    kind === 'ipd' ? (enc?.dischargedAt ? 'IPD FINAL BILL' : 'IPD INTERIM BILL')
      : kind === 'opd' ? 'OPD BILL SUMMARY'
      : 'PATIENT BILL SUMMARY'

  const allRows = data.sections.flatMap((x) => x.rows)
  const liveRows = allRows.filter((r) => !r.cancelled)
  const gstRegistered = isGstRegistered(profile)
  const composition = isCompositionDealer(profile)
  const taxed = liveRows.some((r) => (r.gstRate ?? 0) > 0)
  const showHsn = gstRegistered && liveRows.some((r) => !!r.hsn_sac)

  const sections: ChargeSection[] = data.sections.map((sec) => ({
    label: sec.label,
    subtotal: sec.subtotal,
    rows: detailed
      ? sec.rows.map((r) => ({ date: fmtDate(r.date), description: r.description, hsn: r.hsn_sac ?? null, qty: Number(r.qty), rate: Number(r.unitPrice), gstRate: r.gstRate ?? 0, amount: Number(r.amount), cancelled: !!r.cancelled }))
      : consolidateSection(sec),
  }))

  const advanceAdjusted = Number(data.advanceAdjusted ?? 0)
  const refunded = Number(data.refunded ?? 0)
  const paidNew = Math.max(0, Number(data.totalPaid) - advanceAdjusted)
  const insurance = Number(data.insuranceApproved ?? 0)

  const lines: TotalLine[] = [{ label: 'Grand total', value: data.grandTotal, strong: true, big: true }]
  if (paidNew > 0) lines.push({ label: 'Payments received', value: paidNew, tone: 'ok' })
  if (advanceAdjusted > 0) lines.push({ label: 'Adjusted from advance', value: advanceAdjusted, tone: 'ok' })
  if (refunded > 0) lines.push({ label: 'Refunded (credit notes)', value: refunded, negative: true, tone: 'muted' })
  if (insurance > 0) lines.push({ label: 'Insurance approved (pending)', value: insurance })
  lines.push({ label: 'Balance due', value: data.balanceDue, strong: true, big: true, rule: true, tone: data.balanceDue > 0 ? 'danger' : 'ok' })
  if (insurance > 0 && data.patientBalance != null) lines.push({ label: 'Payable by patient', value: data.patientBalance, strong: true, tone: data.patientBalance > 0 ? 'danger' : 'ok' })

  const advanceAvailable = Math.max(0, data.advanceCollected - advanceAdjusted - data.advanceRefunded)
  const gst = taxed ? summarizeBillGst(liveRows.map((r) => ({ amount: Number(r.amount), gst_rate: r.gstRate ?? 0, tax_inclusive: !!r.taxInclusive }))) : null

  const info: Array<[string, string | null | undefined]> = [
    ['Patient', data.patient.full_name],
    ['UHID', data.patient.uhid],
    ['Age / Sex', ageSex(data.patient.dob, data.patient.gender)],
    ['Phone', data.patient.phone],
  ]
  if (kind === 'ipd' && enc) {
    info.push(['Admitted', fmtDateTime(enc.admittedAt)])
    info.push(['Discharged', enc.dischargedAt ? fmtDateTime(enc.dischargedAt) : 'Currently admitted'])
    info.push(['Ward / Bed', [enc.ward, enc.bed].filter(Boolean).join(' / ') || null])
    info.push(['Consultant', enc.doctor])
    if (enc.admittedAt) info.push(['Length of stay', `${daysBetween(enc.admittedAt, enc.dischargedAt ?? null)} days`])
  } else if (kind === 'opd' && enc) {
    info.push(['Visit date', fmtDate(enc.visitDate)])
    info.push(['Doctor', enc.doctor])
  }
  if (data.patient.address) info.push(['Address', data.patient.address])

  return (
    <A4 title={`${title} ${data.combinedBillNo}`}>
      <PageChrome hospital={hospital} identity={`${data.patient.full_name} · UHID ${data.patient.uhid}`} docRef={data.combinedBillNo} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title={title}
        subtitle={detailed ? 'Detailed statement — every charge line' : 'Identical daily charges are combined; ask for the detailed statement for each day'}
        numberLabel="Summary No" number={data.combinedBillNo} date={`Printed ${fmtDateTime(data.generatedAt)}`}
      />
      <InfoGrid items={info} />

      {/* At-a-glance: one line per category, so the total is readable on page 1. */}
      <View wrap={false} style={{ marginTop: 10, borderWidth: 0.75, borderColor: C.hair }}>
        <View style={{ backgroundColor: C.fill, paddingVertical: 3, paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 0.8 }}>CHARGES AT A GLANCE</Text>
        </View>
        {data.sections.map((sec) => (
          <View key={sec.label} style={{ flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.hair }}>
            <Text style={{ flex: 1 }}>{sec.label}</Text>
            <Text style={{ fontWeight: 600 }}>{money(sec.subtotal)}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6 }}>
          <Text style={{ flex: 1, fontWeight: 700 }}>Grand total</Text>
          <Text style={{ fontWeight: 700 }}>{money(data.grandTotal)}</Text>
        </View>
      </View>

      {data.sections.length === 0
        ? <Text style={{ marginTop: 20, textAlign: 'center', color: C.faint }}>No charges found</Text>
        : <ChargesTable sections={sections} showDate showHsn={showHsn} showGst={gstRegistered && taxed} />}

      <TotalsBox lines={lines} left={
        <View>
          {kind === 'ipd' && data.advanceCollected > 0 ? (
            <View style={{ marginBottom: 6 }}>
              <Text style={[s.label, { marginBottom: 2 }]}>Advance account</Text>
              <Text style={{ fontSize: 8, color: C.muted }}>Deposited {money(data.advanceCollected)}  ·  Adjusted {money(advanceAdjusted)}</Text>
              <Text style={{ fontSize: 8, color: C.muted }}>Refunded {money(data.advanceRefunded)}  ·  Available {money(advanceAvailable)}</Text>
            </View>
          ) : null}
          {gst ? (
            <View>
              <Text style={[s.label, { marginBottom: 2 }]}>GST summary</Text>
              {gst.rateSummary.map((r) => (
                <Text key={r.rate} style={{ fontSize: 8, color: C.muted }}>{r.rate}%  ·  taxable {money(r.taxableValue)}  ·  CGST {money(r.cgst)}  ·  SGST {money(r.sgst)}</Text>
              ))}
            </View>
          ) : composition ? (
            <Text style={{ fontSize: 8, color: C.muted }}>{COMPOSITION_DECLARATION}</Text>
          ) : gstRegistered ? (
            <Text style={{ fontSize: 8, color: C.faint }}>Healthcare services are exempt from GST.</Text>
          ) : null}
        </View>
      } />

      <AmountInWords words={rupeesInWords(data.grandTotal)} />
      <Signatures hospital={hospital} />
      {profile?.emergency_contact ? <Text style={[s.small, { marginTop: 10, textAlign: 'center' }]}>For emergencies call {profile.emergency_contact}</Text> : null}
    </A4>
  )
}
