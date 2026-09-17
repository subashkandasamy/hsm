import { Text, View } from '@react-pdf/renderer'
import { rupeesInWords, summarizeBillGst } from '@/lib/gst'
import type { Bill, CreditNote, TenantProfile } from '@/lib/types'
import {
  A4, AmountInWords, ChargesTable, InfoGrid, Letterhead, PageChrome, Signatures, TitleBand, TotalsBox,
  ageSex, fmtDate, money, s, C, type ChargeSection, type LogoImage, type TotalLine,
} from './parts'

export const SOURCE_LABELS: Record<string, string> = {
  consultation: 'Consultation', bed: 'Room Charges', lab: 'Laboratory', radiology: 'Radiology',
  pharmacy: 'Pharmacy', ipd_pharmacy: 'Pharmacy', pharmacy_sale_item: 'Pharmacy', ot: 'Operation Theatre',
  ot_consumable: 'OT Consumables', blood: 'Blood Bank', dental: 'Dental', manual: 'Other Charges',
  nursing: 'Nursing', nursing_morning: 'Nursing', nursing_night: 'Nursing', icu: 'Critical Care',
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI', bank_transfer: 'Bank transfer', insurance: 'Insurance', advance: 'Advance',
}

export function BillPdf({ bill, profile, creditNotes, logo }: { bill: Bill; profile: TenantProfile | null; creditNotes: CreditNote[]; logo: LogoImage }) {
  const hospital = profile?.name || 'Hospital'
  const items = (bill.items ?? []).filter(Boolean)

  // Sections by source, in first-seen order.
  const sections: ChargeSection[] = []
  for (const it of items) {
    const label = SOURCE_LABELS[it.source] ?? 'Charges'
    let sec = sections.find((x) => x.label === label)
    if (!sec) { sec = { label, rows: [], subtotal: 0 }; sections.push(sec) }
    sec.rows.push({ description: it.description, hsn: it.hsn_sac ?? null, qty: Number(it.qty), rate: Number(it.unit_price), gstRate: Number(it.gst_rate ?? 0), amount: Number(it.amount) })
    sec.subtotal += Number(it.amount)
  }

  const gstRegistered = !!profile?.gst_enabled
  const taxed = items.some((i) => Number(i.gst_rate ?? 0) > 0)
  const showHsn = gstRegistered && items.some((i) => !!i.hsn_sac)
  const title = gstRegistered ? (taxed ? 'TAX INVOICE' : 'BILL OF SUPPLY') : 'BILL'
  const kind = bill.admission_id ? 'In-patient (IPD)' : bill.visit_id || bill.appointment_id ? 'Out-patient (OPD)' : null
  const sectionNames = [...new Set(sections.map((x) => x.label))].join(', ')

  // Payments by method; advance shown as "adjusted", not as new money.
  const byMethod = new Map<string, number>()
  for (const p of bill.payments ?? []) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + Number(p.amount))
  const refunded = creditNotes.reduce((t, c) => t + Number(c.amount), 0)
  const balance = Math.max(0, Number(bill.total) - Number(bill.paid))

  const lines: TotalLine[] = []
  if (gstRegistered || Number(bill.subtotal) !== Number(bill.total)) lines.push({ label: taxed ? 'Taxable value' : 'Subtotal', value: Number(bill.subtotal) })
  if (Number(bill.discount) > 0) lines.push({ label: `Discount${Number(bill.discount_pct ?? 0) > 0 ? ` (${bill.discount_pct}%)` : ''}`, value: Number(bill.discount), negative: true })
  if (Number(bill.cgst ?? 0) > 0) lines.push({ label: 'CGST', value: Number(bill.cgst) })
  if (Number(bill.sgst ?? 0) > 0) lines.push({ label: 'SGST', value: Number(bill.sgst) })
  if (Number(bill.igst ?? 0) > 0) lines.push({ label: 'IGST', value: Number(bill.igst) })
  if (Number(bill.round_off ?? 0) !== 0) lines.push({ label: 'Round off', value: Number(bill.round_off), negative: Number(bill.round_off) < 0 })
  lines.push({ label: 'Grand total', value: Number(bill.total), strong: true, big: true, rule: true })
  for (const [m, amt] of byMethod) {
    if (m === 'advance') continue
    lines.push({ label: `Paid · ${METHOD_LABELS[m] ?? m}`, value: amt, tone: 'ok' })
  }
  if (byMethod.get('advance')) lines.push({ label: 'Adjusted from advance', value: byMethod.get('advance')!, tone: 'ok' })
  if (refunded > 0) lines.push({ label: 'Refunded (credit note)', value: refunded, negative: true, tone: 'muted' })
  lines.push({ label: 'Balance due', value: balance, strong: true, big: true, rule: true, tone: balance > 0 ? 'danger' : 'ok' })

  const gst = taxed ? summarizeBillGst(items.map((i) => ({ amount: Number(i.amount), gst_rate: Number(i.gst_rate ?? 0), tax_inclusive: !!i.tax_inclusive }))) : null

  return (
    <A4 title={`${title} ${bill.bill_no}`}>
      <PageChrome hospital={hospital} identity={`${bill.patient?.full_name ?? ''} · UHID ${bill.patient?.uhid ?? ''}`} docRef={bill.bill_no} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand title={title} subtitle={sectionNames || null} numberLabel="Bill No" number={bill.bill_no} date={fmtDate(bill.billing_date ?? bill.created_at)} />
      <InfoGrid items={[
        ['Patient', bill.patient?.full_name],
        ['UHID', bill.patient?.uhid],
        ['Age / Sex', ageSex(bill.patient?.dob, bill.patient?.gender)],
        ['Phone', bill.patient?.phone],
        ['Status', bill.status === 'cancelled' ? 'CANCELLED' : balance <= 0 ? 'Paid' : Number(bill.paid) > 0 ? 'Partly paid' : 'Unpaid'],
        ['Type', kind],
      ]} />

      {items.length === 0
        ? <Text style={{ marginTop: 20, textAlign: 'center', color: C.faint }}>No line items</Text>
        : <ChargesTable sections={sections} showDate={false} showHsn={showHsn} showGst={gstRegistered && taxed} />}

      <TotalsBox lines={lines} left={gst ? (
        <View>
          <Text style={[s.label, { marginBottom: 2 }]}>GST summary</Text>
          {gst.rateSummary.filter((r) => r.rate > 0).map((r) => (
            <Text key={r.rate} style={{ fontSize: 8, color: C.muted }}>
              {r.rate}%  ·  taxable {money(r.taxableValue)}  ·  CGST {money(r.cgst)}  ·  SGST {money(r.sgst)}
            </Text>
          ))}
        </View>
      ) : gstRegistered ? (
        <Text style={{ fontSize: 8, color: C.faint }}>Healthcare services on this bill are exempt from GST.</Text>
      ) : null} />

      <AmountInWords words={rupeesInWords(Number(bill.total))} />
      <Signatures hospital={hospital} />
      {profile?.emergency_contact ? <Text style={[s.small, { marginTop: 10, textAlign: 'center' }]}>For emergencies call {profile.emergency_contact}</Text> : null}
    </A4>
  )
}
