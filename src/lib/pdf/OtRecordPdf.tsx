import { Text, View } from '@react-pdf/renderer'
import type { OtSchedule, TenantProfile } from '@/lib/types'
import {
  A4, DataTable, InfoGrid, Letterhead, PageChrome, SectionTitle, TextBlock, TitleBand, WriteIn,
  ageSex, fmtDate, shortRef, s, C, type LogoImage,
} from './parts'

const TEAM_ROLE: Record<string, string> = {
  surgeon: 'Surgeon', assistant: 'Assistant surgeon', anaesthetist: 'Anaesthetist', scrub_nurse: 'Scrub nurse', other: 'Other',
}
const STATUS: Record<string, string> = { scheduled: 'Scheduled', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }

export interface OtRecordExtra {
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null; blood_group: string | null }
  ipNo: string | null
  allergies: string[]
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })

/**
 * Operation record. Prints what the system holds (patient, schedule, team, notes,
 * consumables) and ruled write-in fields for the intra-operative details the
 * theatre records by hand, so it can be filed as the OT register sheet.
 */
export function OtRecordPdf({ schedule: o, extra, profile, logo }: { schedule: OtSchedule; extra: OtRecordExtra; profile: TenantProfile | null; logo: LogoImage }) {
  const hospital = profile?.name || 'Hospital'
  const ref = shortRef('OT', o.id)
  const p = extra.patient
  const ward = o.admission?.direct_ot ? 'Direct to OT' : [o.admission?.ward?.name, o.admission?.bed?.bed_no].filter(Boolean).join(' / ') || null

  const team: Array<[string, string]> = []
  if (o.surgeon?.full_name) team.push(['Surgeon', o.surgeon.full_name])
  if (o.anaesthetist?.full_name) team.push(['Anaesthetist', o.anaesthetist.full_name])
  for (const m of o.team_members ?? []) {
    if (m.profile?.full_name) team.push([TEAM_ROLE[m.role] ?? m.role, m.profile.full_name])
  }
  const consumables = (o.consumables ?? []).filter((c) => c.qty > 0)

  return (
    <A4 title={`Operation record ${p.full_name}`}>
      <PageChrome hospital={hospital} identity={`${p.full_name} · UHID ${p.uhid}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title={o.status === 'cancelled' ? 'OPERATION RECORD (CANCELLED)' : 'OPERATION RECORD'}
        subtitle={o.procedure_name}
        numberLabel="OT Ref" number={ref}
        date={`${fmtDate(o.scheduled_start)}, ${time(o.scheduled_start)} – ${time(o.scheduled_end)}`}
      />
      <InfoGrid items={[
        ['Patient', p.full_name],
        ['UHID', p.uhid],
        ['Age / Sex', ageSex(p.dob, p.gender)],
        ['IP No', extra.ipNo],
        ['Ward / Bed', ward],
        ['Blood group', p.blood_group],
        ['Theatre', o.room?.name],
        ['Status', STATUS[o.status] ?? o.status],
      ]} />

      <View wrap={false} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: extra.allergies.length ? '#FEF3C7' : C.fill, borderLeftWidth: 2, borderLeftColor: extra.allergies.length ? '#B45309' : C.rule }}>
        <Text style={{ fontSize: 9, color: extra.allergies.length ? '#78350F' : C.muted }}>
          <Text style={{ fontWeight: 700 }}>Allergies: </Text>{extra.allergies.length ? extra.allergies.join(', ') : 'none recorded — confirm before induction'}
        </Text>
      </View>

      <View wrap={false}>
        <SectionTitle>Surgical team</SectionTitle>
        <DataTable columns={[{ label: 'Role', width: 150 }, { label: 'Name', flex: 1 }, { label: 'Signature', width: 150 }]}
          rows={team.map(([role, name]) => [{ text: role, color: C.muted }, { text: name, bold: true }, ''])}
          empty="No team recorded." />
      </View>

      <View wrap={false}>
        <SectionTitle>Intra-operative record</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><WriteIn label="Pre-operative diagnosis" /></View>
          <View style={{ flex: 1 }}><WriteIn label="Post-operative diagnosis" /></View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><WriteIn label="Anaesthesia type" /></View>
          <View style={{ flex: 1 }}><WriteIn label="Incision time  /  Closure time" /></View>
        </View>
        <WriteIn label="Findings" lines={2} />
        <WriteIn label="Procedure details" lines={3} />
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><WriteIn label="Estimated blood loss" /></View>
          <View style={{ flex: 1 }}><WriteIn label="Specimens sent (HPE / culture)" /></View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><WriteIn label="Implants used (type / lot no)" /></View>
          <View style={{ flex: 1 }}><WriteIn label="Swab / instrument count correct (Y/N)" /></View>
        </View>
      </View>

      {o.notes?.trim() ? (
        <>
          <View wrap={false}><SectionTitle>Operation notes (recorded)</SectionTitle></View>
          <TextBlock text={o.notes} />
        </>
      ) : null}

      {consumables.length ? (
        <>
          <View wrap={false}><SectionTitle>Consumables used</SectionTitle></View>
          <DataTable columns={[{ label: '#', width: 18 }, { label: 'Item', flex: 1 }, { label: 'Qty', width: 50, align: 'right' }]}
            rows={consumables.map((c, i) => [{ text: String(i + 1), color: C.faint }, c.description, String(c.qty)])} />
        </>
      ) : null}

      <View wrap={false}>
        <SectionTitle>Post-operative instructions</SectionTitle>
        <WriteIn label="Shift to / monitoring / orders" lines={3} />
      </View>

      <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 }}>
        {[['Surgeon', o.surgeon?.full_name], ['Anaesthetist', o.anaesthetist?.full_name], ['Scrub nurse', null]].map(([role, name]) => (
          <View key={role} style={{ width: 160, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3 }}>
            {name ? <Text style={{ fontSize: 9, fontWeight: 700, color: C.ink }}>{name}</Text> : null}
            <Text style={s.small}>{role}</Text>
          </View>
        ))}
      </View>
    </A4>
  )
}
