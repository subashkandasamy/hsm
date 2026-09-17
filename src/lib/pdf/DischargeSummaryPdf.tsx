import { Text, View } from '@react-pdf/renderer'
import type { Admission, PatientAllergy, TenantProfile } from '@/lib/types'
import {
  A4, InfoGrid, Letterhead, PageChrome, SectionTitle, Signatures, TextBlock, TitleBand,
  ageSex, fmtDateTime, shortRef, s, C, type LogoImage,
} from './parts'

type DischargeAdmission = Admission & {
  patient?: Admission['patient'] & { dob?: string | null; gender?: string | null }
}

function stayDays(from: string, to: string | null): number {
  const a = new Date(from).getTime(), b = to ? new Date(to).getTime() : Date.now()
  return Math.max(1, Math.ceil((b - a) / 86_400_000))
}

export function DischargeSummaryPdf({ admission: adm, allergies, profile, logo }: {
  admission: DischargeAdmission; allergies: PatientAllergy[]; profile: TenantProfile | null; logo: LogoImage
}) {
  const hospital = profile?.name || 'Hospital'
  const p = adm.patient
  const discharged = !!adm.discharged_at
  const ref = adm.ip_no ?? shortRef('IP', adm.id)
  const allergyText = allergies.length
    ? allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')
    : p?.allergies || null

  return (
    <A4 title={`Discharge summary ${p?.full_name ?? ''}`}>
      <PageChrome hospital={hospital} identity={`${p?.full_name ?? ''} · UHID ${p?.uhid ?? ''}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title={discharged ? 'DISCHARGE SUMMARY' : 'DISCHARGE SUMMARY (DRAFT)'}
        subtitle={discharged ? null : 'Patient is still admitted — this is not the final summary'}
        numberLabel="IP Ref" number={ref}
        date={discharged ? `Discharged ${fmtDateTime(adm.discharged_at)}` : `Printed ${fmtDateTime(new Date().toISOString())}`}
      />
      <InfoGrid items={[
        ['Patient', p?.full_name],
        ['UHID', p?.uhid],
        ['Age / Sex', ageSex(p?.dob, p?.gender)],
        ['Phone', p?.phone],
        ['Admitted', fmtDateTime(adm.admitted_at)],
        ['Discharged', discharged ? fmtDateTime(adm.discharged_at) : 'Currently admitted'],
        ['Ward / Bed', [adm.ward?.name, adm.bed?.bed_no].filter(Boolean).join(' / ') || null],
        ['Length of stay', `${stayDays(adm.admitted_at, adm.discharged_at)} days`],
        ['Consultant', adm.doctor?.full_name],
        ['Blood group', p?.blood_group],
      ]} />

      {allergyText ? (
        <View wrap={false} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#FEF3C7', borderLeftWidth: 2, borderLeftColor: '#B45309' }}>
          <Text style={{ fontSize: 9, color: '#78350F' }}><Text style={{ fontWeight: 700 }}>Allergies: </Text>{allergyText}</Text>
        </View>
      ) : null}

      {adm.reason ? (
        <>
          <View wrap={false}><SectionTitle>Reason for admission / provisional diagnosis</SectionTitle></View>
          <TextBlock text={adm.reason} />
        </>
      ) : null}

      <View wrap={false}><SectionTitle tone="accent">Summary of stay, treatment and advice</SectionTitle></View>
      <TextBlock text={adm.discharge_summary} empty="No discharge summary has been recorded for this admission yet." size={10} />

      <View wrap={false} style={{ marginTop: 14 }}>
        <Text style={[s.small, { color: C.muted }]}>
          In case of fever, severe pain, bleeding, breathlessness or any worsening of symptoms, report to the hospital immediately
          {profile?.emergency_contact ? ` or call ${profile.emergency_contact}` : ''}.
        </Text>
      </View>
      <Signatures hospital={hospital} left="Patient / Relative (name & relationship)" right={{ name: adm.doctor?.full_name, role: 'Treating Consultant' }} />
    </A4>
  )
}
