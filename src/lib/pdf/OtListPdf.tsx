import { Text } from '@react-pdf/renderer'
import type { OtSchedule, TenantProfile } from '@/lib/types'
import { A4, DataTable, Letterhead, PageChrome, TitleBand, fmtDate, fmtDateTime, s, C, type LogoImage } from './parts'

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })
const STATUS: Record<string, string> = { scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }

export interface OtListRow extends OtSchedule { ipNo: string | null; ward: string | null }

/** Day's theatre list (landscape) for the OT notice board / pre-op checks. */
export function OtListPdf({ date, rows, profile, logo }: { date: string; rows: OtListRow[]; profile: TenantProfile | null; logo: LogoImage }) {
  const hospital = profile?.name || 'Hospital'
  const active = rows.filter((r) => r.status !== 'cancelled').length
  return (
    <A4 title={`OT list ${date}`} landscape>
      <PageChrome hospital={hospital} identity={`OT list · ${fmtDate(date)}`} docRef={`OT-${date}`} landscape />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand title="OPERATION THEATRE LIST" subtitle={`${active} surger${active === 1 ? 'y' : 'ies'}${rows.length > active ? `, ${rows.length - active} cancelled` : ''}`}
        numberLabel="Date" number={fmtDate(date)} date={`Printed ${fmtDateTime(new Date().toISOString())}`} />
      <DataTable
        columns={[
          { label: 'Time', width: 95 },
          { label: 'Theatre', width: 70 },
          { label: 'Patient', flex: 1.3 },
          { label: 'IP No / Ward', width: 110 },
          { label: 'Procedure', flex: 1.5 },
          { label: 'Surgeon', flex: 1 },
          { label: 'Anaesthetist', flex: 1 },
          { label: 'Status', width: 70 },
        ]}
        rows={rows.map((r) => [
          `${time(r.scheduled_start)} – ${time(r.scheduled_end)}`,
          r.room?.name ?? '—',
          { text: r.patient?.full_name ?? '—', bold: true, note: r.patient?.uhid ?? null },
          { text: r.ipNo ?? '—', note: r.ward },
          { text: r.procedure_name, color: r.status === 'cancelled' ? C.faint : C.text },
          r.surgeon?.full_name ?? '—',
          r.anaesthetist?.full_name ?? '—',
          { text: STATUS[r.status] ?? r.status, bold: r.status === 'in_progress', color: r.status === 'cancelled' ? C.danger : C.text },
        ])}
        empty="No surgeries scheduled for this day."
      />
      <Text style={[s.small, { marginTop: 10 }]}>Times in IST. Confirm consent, site marking, fasting status and blood availability before shifting the patient.</Text>
    </A4>
  )
}
