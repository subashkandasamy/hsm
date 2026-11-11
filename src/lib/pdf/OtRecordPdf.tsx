import { Text, View } from '@react-pdf/renderer'
import type { OtSchedule, TenantProfile } from '@/lib/types'
import { SAFETY_STEPS, anaesthesiaLabel, stepComplete } from '@/lib/surgery'
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
const when = (iso: string | null | undefined) => (iso ? `${fmtDate(iso)}, ${time(iso)}` : null)

/** What was recorded, or the ruled line to write it on when nothing was. */
function Field({ label, value, lines = 1 }: { label: string; value?: string | null; lines?: number }) {
  if (!value?.trim()) return <WriteIn label={label} lines={lines} />
  return (
    <View wrap={false} style={{ paddingHorizontal: 6, paddingTop: 7 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={{ fontSize: 9.5, color: C.ink, marginTop: 2 }}>{value.trim()}</Text>
    </View>
  )
}

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
  const implants = consumables.filter((c) => c.is_implant)
  const pre = o.pre_op_checklist ?? null
  const yn = (v: boolean | undefined) => (v === undefined ? null : v ? 'Yes' : 'No')
  const anaesthesia = [anaesthesiaLabel(o.anaesthesia_type), o.asa_grade ? `ASA ${o.asa_grade}` : null].filter(Boolean).join(' · ') || null
  const span = (a?: string | null, b?: string | null) => (a || b ? `${a ? time(a) : '—'}  –  ${b ? time(b) : '—'}` : null)

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

      {pre ? (
        <View wrap={false}>
          <SectionTitle>Before surgery</SectionTitle>
          <InfoGrid items={[
            ['Consent signed', yn(pre.consent_signed)],
            ['Nil by mouth since', when(pre.fasting_since)],
            ['Site marked', pre.site_marked === 'not_applicable' ? 'Not applicable' : pre.site_marked === 'yes' ? 'Yes' : pre.site_marked === 'no' ? 'No' : null],
            ['Pre-anaesthetic check-up', yn(pre.pac_done)],
            ['Blood', pre.blood === 'not_needed' ? 'Not needed' : pre.blood === 'arranged' ? 'Arranged' : pre.blood === 'pending' ? 'Requested, not ready' : null],
            ['Investigations reviewed', yn(pre.investigations_reviewed)],
          ]} />
        </View>
      ) : null}

      <View wrap={false}>
        <SectionTitle>WHO surgical safety checklist</SectionTitle>
        <DataTable columns={[{ label: 'Step', width: 90 }, { label: 'When', flex: 1 }, { label: 'Signed', width: 150 }]}
          rows={SAFETY_STEPS.map((st) => {
            const rec = o.safety_checklist?.[st.step]
            const done = stepComplete(rec, st.step)
            return [{ text: st.title, bold: true }, { text: st.when, color: C.muted }, done && rec?.done_at ? when(rec.done_at) ?? '' : '']
          })} />
      </View>

      <View wrap={false}>
        <SectionTitle>Intra-operative record</SectionTitle>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><Field label="Pre-operative diagnosis" value={o.pre_op_diagnosis} /></View>
          <View style={{ flex: 1 }}><Field label="Post-operative diagnosis" value={o.post_op_diagnosis} /></View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><Field label="Anaesthesia type" value={anaesthesia} /></View>
          <View style={{ flex: 1 }}><Field label="Anaesthesia start  /  end" value={span(o.anaesthesia_start, o.anaesthesia_end)} /></View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}><Field label="Incision time  /  Closure time" value={span(o.incision_at, o.closure_at)} /></View>
          <View style={{ flex: 1 }}><Field label="Swab / instrument count correct (Y/N)" value={o.counts_correct == null ? null : o.counts_correct ? 'Yes' : 'NO — see notes'} /></View>
        </View>
      </View>
      <Field label="Findings" value={o.findings} lines={2} />
      <Field label="Procedure details" value={o.procedure_details} lines={3} />
      <View wrap={false} style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}><Field label="Estimated blood loss" value={o.blood_loss_ml != null ? `${o.blood_loss_ml} ml` : null} /></View>
        <View style={{ flex: 1 }}><Field label="Specimens sent (HPE / culture)" value={o.specimens} /></View>
      </View>
      <View wrap={false} style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1 }}><Field label="Drains" value={o.drains} /></View>
        <View style={{ flex: 1 }}><Field label="Complications" value={o.complications} /></View>
      </View>
      {implants.length ? (
        <View wrap={false}>
          <SectionTitle>Implants</SectionTitle>
          <DataTable columns={[{ label: 'Implant', flex: 1 }, { label: 'Lot / batch', width: 110 }, { label: 'Manufacturer', width: 110 }, { label: 'Size', width: 60 }, { label: 'Qty', width: 30, align: 'right' }]}
            rows={implants.map((c) => [c.description, c.implant_lot_no ?? '', c.implant_maker ?? '', c.implant_size ?? '', String(c.qty)])} />
        </View>
      ) : <WriteIn label="Implants used (type / lot no)" />}

      {o.notes?.trim() ? (
        <>
          <View wrap={false}><SectionTitle>Operation notes (recorded)</SectionTitle></View>
          <TextBlock text={o.notes} />
        </>
      ) : null}

      {consumables.some((c) => !c.is_implant) ? (
        <>
          <View wrap={false}><SectionTitle>Consumables used</SectionTitle></View>
          <DataTable columns={[{ label: '#', width: 18 }, { label: 'Item', flex: 1 }, { label: 'Qty', width: 50, align: 'right' }]}
            rows={consumables.filter((c) => !c.is_implant).map((c, i) => [{ text: String(i + 1), color: C.faint }, c.description, String(c.qty)])} />
        </>
      ) : null}

      <View wrap={false}>
        <SectionTitle>Post-operative instructions</SectionTitle>
        <Field label="Shift to / monitoring / orders" value={o.post_op_orders} lines={3} />
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
