import { Text, View } from '@react-pdf/renderer'
import type { ClinicalTemplate, DentalTreatment, EyeExamData, PatientAllergy, Prescription, TenantProfile, Visit } from '@/lib/types'
import {
  A4, DataTable, FactRow, InfoGrid, Letterhead, PageChrome, SectionTitle, Signatures, TextBlock, TitleBand,
  ageSex, fmtDate, shortRef, s, C, type LogoImage,
} from './parts'

export interface RxPatient {
  full_name: string; uhid: string; phone: string | null
  dob: string | null; gender: string | null; blood_group: string | null
}

const TEMPLATE_LABEL: Record<string, string> = {
  general: 'General', dental: 'Dental', ophthalmology: 'Ophthalmology',
}

const n = (v: number | null | undefined) => (v == null ? '—' : String(v))

export function PrescriptionPdf({ visit, patient, prescriptions, allergies, template, dental, profile, logo }: {
  visit: Visit; patient: RxPatient; prescriptions: Prescription[]; allergies: PatientAllergy[]
  template: ClinicalTemplate; dental: DentalTreatment[]; profile: TenantProfile | null; logo: LogoImage
}) {
  const hospital = profile?.name || 'Hospital'
  const ref = shortRef('OP', visit.id)
  const v = visit.vitals ?? {}
  const eye = template === 'ophthalmology' && visit.clinical_data ? (visit.clinical_data as unknown as EyeExamData) : null
  const hasConsult = !!(visit.complaint || visit.diagnosis || visit.icd_code)

  return (
    <A4 title={`Prescription ${patient.full_name}`}>
      <PageChrome hospital={hospital} identity={`${patient.full_name} · UHID ${patient.uhid}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title="OUT-PATIENT PRESCRIPTION"
        subtitle={`${TEMPLATE_LABEL[template] ?? 'General'} consultation`}
        numberLabel="OP Ref" number={ref} date={fmtDate(visit.visit_date)}
      />
      <InfoGrid items={[
        ['Patient', patient.full_name],
        ['UHID', patient.uhid],
        ['Age / Sex', ageSex(patient.dob, patient.gender)],
        ['Phone', patient.phone],
        ['Doctor', visit.doctor?.full_name],
        ['Blood group', patient.blood_group],
      ]} />

      {allergies.length > 0 ? (
        <View wrap={false} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#FEF3C7', borderLeftWidth: 2, borderLeftColor: '#B45309' }}>
          <Text style={{ fontSize: 9, color: '#78350F' }}>
            <Text style={{ fontWeight: 700 }}>Allergies: </Text>
            {allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')}
          </Text>
        </View>
      ) : null}

      {Object.values(v).some(Boolean) ? (
        <View wrap={false}>
          <SectionTitle>Vitals</SectionTitle>
          <FactRow items={[['BP', v.bp], ['Pulse', v.pulse], ['Temp', v.temp], ['SpO₂', v.spo2], ['Weight', v.weight], ['Height', v.height]]} />
        </View>
      ) : null}

      {hasConsult ? (
        <View wrap={false}>
          <SectionTitle>Clinical notes</SectionTitle>
          {visit.complaint ? (
            <View style={{ paddingHorizontal: 6, paddingTop: 5 }}>
              <Text style={s.label}>Chief complaint</Text>
              <Text style={{ fontSize: 9.5 }}>{visit.complaint}</Text>
            </View>
          ) : null}
          {visit.diagnosis || visit.icd_code ? (
            <View style={{ paddingHorizontal: 6, paddingTop: 5 }}>
              <Text style={s.label}>Diagnosis</Text>
              <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink }}>
                {visit.diagnosis ?? ''}{visit.icd_code ? `${visit.diagnosis ? '  ' : ''}(ICD-10 ${visit.icd_code})` : ''}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {eye ? (
        <View wrap={false}>
          <SectionTitle>Eye examination</SectionTitle>
          <FactRow items={[
            ['Visual acuity OD / OS', eye.visualAcuity?.od || eye.visualAcuity?.os ? `${eye.visualAcuity.od || '—'} / ${eye.visualAcuity.os || '—'}` : null],
            ['IOP OD / OS (mmHg)', eye.iop?.od != null || eye.iop?.os != null ? `${n(eye.iop.od)} / ${n(eye.iop.os)}` : null],
          ]} />
          <DataTable
            columns={[{ label: 'Refraction', width: 70 }, { label: 'Sphere', flex: 1, align: 'center' }, { label: 'Cylinder', flex: 1, align: 'center' }, { label: 'Axis', flex: 1, align: 'center' }]}
            rows={(['od', 'os'] as const).map((e) => [
              { text: e.toUpperCase(), bold: true },
              n(eye.refraction?.[e]?.sphere), n(eye.refraction?.[e]?.cylinder), n(eye.refraction?.[e]?.axis),
            ])}
          />
          {eye.notes ? <TextBlock text={eye.notes} /> : null}
        </View>
      ) : null}

      {dental.length > 0 ? (
        <View>
          <View wrap={false}><SectionTitle>Dental treatment</SectionTitle></View>
          <DataTable
            columns={[{ label: 'Tooth', width: 50 }, { label: 'Procedure', flex: 1 }, { label: 'Notes', flex: 1 }]}
            rows={dental.map((t) => [{ text: t.tooth_number != null ? String(t.tooth_number) : '—', bold: true }, t.procedure, { text: t.notes ?? '—', color: C.muted }])}
          />
        </View>
      ) : null}

      <View>
        <View wrap={false}>
          {/* ℞ is kept out of the heading bar: Noto Sans has it, but it reads better as its own mark. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: 700, color: C.accent, marginRight: 6, lineHeight: 1 }}>℞</Text>
            <Text style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 2 }}>MEDICINES</Text>
          </View>
        </View>
        <DataTable
          columns={[
            { label: '#', width: 18 },
            { label: 'Medicine', flex: 1.6 },
            { label: 'Dose', width: 62 },
            { label: 'Frequency', width: 70 },
            { label: 'Duration', width: 58 },
            { label: 'Instructions', flex: 1 },
          ]}
          rows={prescriptions.map((rx, i) => [
            { text: String(i + 1), color: C.faint },
            { text: rx.drug_name, bold: true },
            rx.dosage ?? '—', rx.frequency ?? '—', rx.duration ?? '—',
            { text: rx.instructions ?? '—', color: C.muted },
          ])}
          empty="No medicines prescribed."
        />
      </View>

      {visit.notes ? (
        <View wrap={false}>
          <SectionTitle>Advice / instructions</SectionTitle>
          <TextBlock text={visit.notes} />
        </View>
      ) : null}

      <View wrap={false} style={{ flexDirection: 'row', marginTop: 16, paddingHorizontal: 6 }}>
        <Text style={[s.label, { marginRight: 8 }]}>Next visit / follow-up:</Text>
        <View style={{ flex: 1, maxWidth: 200, borderBottomWidth: 0.75, borderBottomColor: C.rule, borderStyle: 'dashed' }} />
      </View>
      <Signatures hospital={hospital} left={null} right={{ name: visit.doctor?.full_name, role: 'Consulting Doctor' }} />
    </A4>
  )
}
