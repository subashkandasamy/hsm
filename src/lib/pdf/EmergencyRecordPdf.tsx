import { Text, View } from '@react-pdf/renderer'
import type { EmergencyCase, Prescription, TenantProfile, Visit } from '@/lib/types'
import { DISPOSITIONS, EFAST_VIEWS, burnTotal, gcsTotal, type AssessmentData } from '@/lib/initialAssessment'
import { EXAM_SIGN_LABELS, SURVEY_SYSTEMS } from '@/lib/clinicalExam'
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
  /** The ER Initial Evaluation, when one was written. */
  evaluation?: AssessmentData | null
  ageYears?: number | null
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
  const ev = data.evaluation ?? null
  const oa = ev?.on_arrival
  const num = (x: number | null | undefined, unit = '') => (x != null ? `${x}${unit}` : null)
  const arrivalFacts: Array<[string, string | null]> = oa ? [
    ['AVPU', oa.avpu || null], ['Pulse', num(oa.hr)], ['BP', oa.sbp != null && oa.dbp != null ? `${oa.sbp}/${oa.dbp}` : null],
    ['RR', num(oa.rr)], ['SpO₂', num(oa.spo2, '%')], ['Temp', num(oa.temp, ' °C')], ['GRBS', num(oa.grbs)],
    ['GCS', gcsTotal(oa) != null ? `${gcsTotal(oa)} (E${oa.gcs_e} V${oa.gcs_v} M${oa.gcs_m})` : null], ['Weight', num(oa.weight, ' kg')],
  ] : []
  const ps = ev?.primary_survey
  const primary: Array<[string, string]> = ps ? ([
    ['A — Airway', [ps.airway?.status?.replace('_', ' '), ps.airway?.intervention].filter(Boolean).join(' — ')],
    ['B — Breathing', [ps.breathing?.findings, ps.breathing?.intervention].filter(Boolean).join(' — ')],
    ['C — Circulation', [ps.circulation?.crt && `CRT ${ps.circulation.crt}`, ps.circulation?.bleeding && `bleeding: ${ps.circulation.bleeding}`, ps.circulation?.iv_access && `IV ${ps.circulation.iv_access}`, ps.circulation?.findings].filter(Boolean).join('; ')],
    ['D — Disability', [ps.disability?.pupils_right && `R pupil ${ps.disability.pupils_right}`, ps.disability?.pupils_left && `L pupil ${ps.disability.pupils_left}`, ps.disability?.findings].filter(Boolean).join('; ')],
    ['E — Exposure', ps.exposure?.findings ?? ''],
  ] as Array<[string, string]>).filter(([, t]) => t) : []
  const signs = Object.entries(ev?.secondary_survey?.signs ?? {}).filter(([, on]) => on).map(([k]) => EXAM_SIGN_LABELS[k] ?? k)
  const systems = SURVEY_SYSTEMS.map((f) => [f.label, ev?.secondary_survey?.systems?.[f.key]?.trim() ?? ''] as [string, string]).filter(([, t]) => t)
  const burns = burnTotal(ev?.burns?.areas, data.ageYears ?? null)
  const treatment = (ev?.treatment ?? []).filter((t) => t.item?.trim())

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

      {arrivalFacts.some(([, x]) => x) ? (
        <View wrap={false}>
          <SectionTitle>On arrival</SectionTitle>
          <FactRow items={arrivalFacts} />
        </View>
      ) : null}

      {primary.length ? (
        <View wrap={false}>
          <SectionTitle>Primary survey</SectionTitle>
          <DataTable columns={[{ label: '', width: 100 }, { label: 'Findings / intervention', flex: 1 }]}
            rows={primary.map(([k, t]) => [{ text: k, bold: true }, t])} />
        </View>
      ) : null}

      {ev?.sample && (ev.sample.history || ev.sample.events || ev.sample.medications) ? (
        <View wrap={false}>
          <SectionTitle>History</SectionTitle>
          <TextBlock text={[ev.sample.history, ev.sample.events && `Events: ${ev.sample.events}`, ev.sample.medications && `Medications: ${ev.sample.medications}`,
            ev.sample.last_meal && `Last meal: ${ev.sample.last_meal}`, ev.sample.lmp && `LMP: ${ev.sample.lmp}`].filter(Boolean).join('\n')} />
        </View>
      ) : null}

      {ev?.efast?.done === 'yes' ? (
        <View wrap={false}>
          <SectionTitle>eFAST</SectionTitle>
          <TextBlock text={[EFAST_VIEWS.filter((x) => ev.efast?.results?.[x.key]).map((x) => `${x.label}: ${ev.efast?.results?.[x.key]}`).join('; '), ev.efast.notes].filter(Boolean).join('\n')} />
        </View>
      ) : null}

      {signs.length || systems.length || ev?.secondary_survey?.general ? (
        <View wrap={false}>
          <SectionTitle>Examination</SectionTitle>
          <TextBlock text={[ev?.secondary_survey?.general, signs.length ? `Present: ${signs.join(', ')}` : null, ...systems.map(([k, t]) => `${k}: ${t}`)].filter(Boolean).join('\n')} />
        </View>
      ) : null}

      {burns > 0 ? (
        <View wrap={false}>
          <SectionTitle>Burns</SectionTitle>
          <TextBlock text={`${burns}% of body surface${ev?.burns?.depth ? ` — ${ev.burns.depth}` : ''}`} />
        </View>
      ) : null}

      {arrivalFacts.some(([, x]) => x) ? null : Object.values(vitals).some(Boolean) ? (
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

      {ev?.plan && (ev.plan.provisional_diagnosis || ev.plan.plan) ? (
        <View wrap={false}>
          <SectionTitle>Assessment &amp; plan</SectionTitle>
          <TextBlock text={[ev.plan.provisional_diagnosis && `Provisional diagnosis: ${ev.plan.provisional_diagnosis}`, ev.plan.investigations && `Investigations: ${ev.plan.investigations}`,
            ev.plan.plan, ev.plan.service_contacted && `Contacted: ${ev.plan.service_contacted}`,
            ev.plan.disposition && `Disposition: ${DISPOSITIONS.find((d) => d.value === ev.plan?.disposition)?.label ?? ev.plan.disposition}`].filter(Boolean).join('\n')} />
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

      {treatment.length ? (
        <View wrap={false}>
          <SectionTitle>Treatment given in emergency</SectionTitle>
          <DataTable columns={[{ label: 'Time', width: 45 }, { label: 'Treatment / procedure', flex: 1 }, { label: 'Dose', width: 70 }, { label: 'Route', width: 50 }, { label: 'Given by', width: 90 }]}
            rows={treatment.map((t) => [t.at, { text: t.item, bold: true }, t.dose ?? '', t.route ?? '', { text: t.by ?? '', color: C.muted }])} />
        </View>
      ) : ec.status === 'waiting' || ec.status === 'in_treatment' ? (
        <View wrap={false}>
          <SectionTitle>Treatment given in emergency</SectionTitle>
          <WriteIn label="Time — treatment / procedure — given by" lines={4} />
        </View>
      ) : null}

      {ev?.shifting && (ev.shifting.to || ev.shifting.condition) ? (
        <View wrap={false}>
          <SectionTitle>Shifting note</SectionTitle>
          <TextBlock text={[ev.shifting.to && `Shifted to: ${ev.shifting.to}${ev.shifting.at ? `, ${fmtDateTime(ev.shifting.at)}` : ''}`,
            ev.shifting.condition && `Condition: ${ev.shifting.condition}`, ev.shifting.escort && `Escort: ${ev.shifting.escort}`,
            ev.shifting.handed_over_to && `Handed over to: ${ev.shifting.handed_over_to}`].filter(Boolean).join('\n')} />
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
