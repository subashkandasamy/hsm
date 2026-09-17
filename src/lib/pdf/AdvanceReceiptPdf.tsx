import { rupeesInWords } from '@/lib/gst'
import type { AdvanceReceiptData, TenantProfile } from '@/lib/types'
import {
  A4, AmountInWords, DataTable, InfoGrid, Letterhead, PageChrome, Signatures, TitleBand, TotalsBox,
  SectionTitle, fmtDate, fmtDateTime, money, shortRef, type LogoImage,
} from './parts'

const METHOD: Record<string, string> = { cash: 'Cash', card: 'Card', upi: 'UPI', bank_transfer: 'Bank transfer', cheque: 'Cheque' }

export function AdvanceReceiptPdf({ data, profile, logo }: { data: AdvanceReceiptData; profile: TenantProfile | null; logo: LogoImage }) {
  const hospital = profile?.name || data.tenantName
  const ref = shortRef('IP', data.admission.id)
  const last = data.payments[data.payments.length - 1]

  return (
    <A4 title={`Advance receipt ${data.patient.full_name}`}>
      <PageChrome hospital={hospital} identity={`${data.patient.full_name} · UHID ${data.patient.uhid}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title="ADVANCE PAYMENT RECEIPT"
        subtitle={`${data.payments.length} deposit${data.payments.length === 1 ? '' : 's'} against this admission`}
        numberLabel="IP Ref" number={ref} date={last ? `Last received ${fmtDate(last.received_at)}` : ''}
      />
      <InfoGrid items={[
        ['Patient', data.patient.full_name],
        ['UHID', data.patient.uhid],
        ['Phone', data.patient.phone],
        ['Admitted', fmtDateTime(data.admission.admitted_at)],
        ['Ward / Bed', [data.admission.ward, data.admission.bed].filter(Boolean).join(' / ') || null],
      ]} />

      <SectionTitle>Deposits received</SectionTitle>
      <DataTable
        columns={[
          { label: '#', width: 18 },
          { label: 'Received on', flex: 1.2 },
          { label: 'Mode', width: 80 },
          { label: 'Received by', flex: 1 },
          { label: 'Amount', width: 90, align: 'right' },
        ]}
        rows={data.payments.map((pmt, i) => [
          String(i + 1), fmtDateTime(pmt.received_at), METHOD[pmt.method] ?? pmt.method,
          pmt.receiverName ?? '—', { text: money(pmt.amount), bold: true },
        ])}
        empty="No advance received yet."
      />

      <TotalsBox lines={[{ label: 'Total advance received', value: data.totalCollected, strong: true, big: true }]} />
      <AmountInWords words={rupeesInWords(data.totalCollected)} />
      <Signatures hospital={hospital} left="Received from (patient / attendant)" />
    </A4>
  )
}
