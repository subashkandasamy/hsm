import { Text, View } from '@react-pdf/renderer'
import type { EmergencyCase, Prescription, TenantProfile, Visit } from '@/lib/types'
import {
  A4, DataTable, FactRow, InfoGrid, Letterhead, PageChrome, SectionTitle, Signatures, TextBlock, TitleBand, WriteIn,
  ageSex, fmtDateTime, shortRef, s, C, type LogoImage,
} from './parts'

export const TRIAGE_LABEL: Record<number, string> = { 1: 'Resuscitation', 2: 'Emergent', 3: 'Urgent', 4: 'Less urgent', 5: 'Non-urgent' }

export interface EmergencyRecordData {
  ec: EmergencyCase
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null; phone: string | null; blood_group: string | null }
  allergies: string[]
  visit: (Visit & { doctor?: { full_name: string } | null }) | null
  prescriptions: Prescription[]
  investigations: Array<{ name: string; kind: 'Lab' | 'Imaging'; status: string }>
  admission: { ip_no: string | null; ward: string | null; bed: string | null } | null
}

/**
 * Emergency record. While the patient is in the ER it is the case sheet; once
 * resolved it becomes the discharge note or referral note that goes with the patient.
 */
export function EmergencyRecordPdf({ data, profile, logo }: { data: EmergencyRecordData; profile: TenantProfile | null; logo: LogoImage }) {
  const hospital = profile?.name || 'Hospital'
  const { ec, patient: p, visit: v } = data
  const ref = shortRef('ER', ec.id)
  const title = ec.status === 'referred' ? 'EMERGENCY REFERRAL NOTE'
    : ec.status === 'discharged' ? 'EMERGENCY DISCHARGE NOTE'
    : 'EMERGENCY CASE SHEET'
  const disposition = ec.status === 'referred' ? 'Referred to another facility'
    : ec.status === 'discharged' ? 'Discharged from emergency'
    : ec.status === 'admitted' ? `Admitted${data.admission?.ip_no ? ` — ${data.admission.ip_no}` : ''}${data.admission?.ward ? `, ${[data.admission.ward, data.admission.bed].filter(Boolean).join(' / ')}` : ''}`
    : ec.status === 'in_treatment' ? 'Under treatment' : 'Waiting'
  const vitals = v?.vitals ?? {}
  const doctor = v?.doctor?.full_name ?? ec.attendant?.full_name ?? null

  return (
    <A4 title={`${title} ${p.full_name}`}>
      <PageChrome hospital={hospital} identity={`${p.full_name} · UHID ${p.uhid}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand title={title} subtitle={`Triage ${ec.triage_level} — ${TRIAGE_LABEL[ec.triage_level] ?? ''}`}
        numberLabel="ER Ref" number={ref} date={`Arrived ${fmtDateTime(ec.arrived_at)}`} />
      <InfoGrid items={[
        ['Patient', p.full_name],
        ['UHID', p.uhid],
        ['Age / Sex', ageSex(p.dob, p.gender)],
        ['Phone', p.phone && !p.phone.startsWith('PROV-') ? p.phone : null],
        ['Arrival', ec.arrival_mode ? ec.arrival_mode.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) : null],
        ['Blood group', p.blood_group],
        ['Attending doctor', doctor],
        ['Disposition', disposition],
      ]} />

      <View wrap={false} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: data.allergies.length ? '#FEF3C7' : C.fill, borderLeftWidth: 2, borderLeftColor: data.allergies.length ? '#B45309' : C.rule }}>
        <Text style={{ fontSize: 9, color: data.allergies.length ? '#78350F' : C.muted }}>
          <Text style={{ fontWeight: 700 }}>Allergies: </Text>{data.allergies.length ? data.allergies.join(', ') : 'none recorded'}
        </Text>
      </View>

      <View wrap={false}>
        <SectionTitle>Presenting complaint</SectionTitle>
        <TextBlock text={v?.complaint || ec.complaint} empty="Not recorded" />
      </View>

      {Object.values(vitals).some(Boolean) ? (
        <View wrap={false}>
          <SectionTitle>Vitals</SectionTitle>
          <FactRow items={[['BP', vitals.bp], ['Pulse', vitals.pulse], ['Temp', vitals.temp], ['SpO₂', vitals.spo2], ['Weight', vitals.weight]]} />
        </View>
      ) : ec.status === 'waiting' || ec.status === 'in_treatment' ? (
        <View wrap={false}>
          <SectionTitle>Vitals</SectionTitle>
          <View style={{ flexDirection: 'row' }}>
            {['BP', 'Pulse', 'Temp', 'SpO₂', 'RR', 'GCS'].map((l) => <View key={l} style={{ flex: 1 }}><WriteIn label={l} /></View>)}
          </View>
        </View>
      ) : null}

      {v?.diagnosis || v?.icd_code ? (
        <View wrap={false}>
          <SectionTitle>Diagnosis</SectionTitle>
          <TextBlock text={`${v.diagnosis ?? ''}${v.icd_code ? `  (ICD-10 ${v.icd_code})` : ''}`} />
        </View>
      ) : null}

      {data.investigations.length ? (
        <>
          <View wrap={false}><SectionTitle>Investigations</SectionTitle></View>
          <DataTable columns={[{ label: 'Test / study', flex: 1 }, { label: 'Type', width: 70 }, { label: 'Status', width: 90 }]}
            rows={data.investigations.map((i) => [{ text: i.name, bold: true }, i.kind, { text: i.status, color: C.muted }])} />
        </>
      ) : null}

      {data.prescriptions.length ? (
        <>
          <View wrap={false}><SectionTitle>Medicines</SectionTitle></View>
          <DataTable
            columns={[{ label: 'Medicine', flex: 1.5 }, { label: 'Dose', width: 70 }, { label: 'Frequency', width: 75 }, { label: 'Duration', width: 60 }, { label: 'Instructions', flex: 1 }]}
            rows={data.prescriptions.map((r) => [{ text: r.drug_name, bold: true }, r.dosage ?? '—', r.frequency ?? '—', r.duration ?? '—', { text: r.instructions ?? '—', color: C.muted }])} />
        </>
      ) : null}

      {v?.notes ? (
        <>
          <View wrap={false}><SectionTitle>Treatment / notes</SectionTitle></View>
          <TextBlock text={v.notes} />
        </>
      ) : null}

      {ec.status === 'waiting' || ec.status === 'in_treatment' ? (
        <View wrap={false}>
          <SectionTitle>Treatment given in emergency</SectionTitle>
          <WriteIn label="Time — treatment / procedure — given by" lines={4} />
        </View>
      ) : null}

      <View wrap={false}>
        <SectionTitle tone="accent">{ec.status === 'referred' ? 'Reason for referral / condition at transfer' : ec.status === 'discharged' ? 'Condition at discharge / advice' : 'Disposition'}</SectionTitle>
        <Text style={{ fontSize: 9.5, fontWeight: 700, paddingHorizontal: 6, paddingTop: 5, color: C.ink }}>{disposition}</Text>
        {ec.outcome ? <TextBlock text={ec.outcome} /> : ec.status === 'referred' || ec.status === 'discharged' ? null : <WriteIn label="Notes" lines={2} />}
        {ec.status === 'referred' ? <WriteIn label="Referred to (hospital / doctor)  ·  Mode of transfer  ·  Accompanied by" lines={2} /> : null}
      </View>

      {ec.status === 'discharged' ? (
        <Text style={[s.small, { marginTop: 10, color: C.muted }]}>
          Return to the emergency department immediately if symptoms worsen, or in case of chest pain, breathlessness, bleeding, fainting or high fever
          {profile?.emergency_contact ? ` — call ${profile.emergency_contact}` : ''}.
        </Text>
      ) : null}

      <Signatures hospital={hospital} left="Patient / Relative" right={{ name: doctor, role: 'Emergency Medical Officer' }} />
    </A4>
  )
}
