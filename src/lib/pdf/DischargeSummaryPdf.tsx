import { Text, View } from '@react-pdf/renderer'
import type { Admission, PatientAllergy, TenantProfile } from '@/lib/types'
import type { LabourContext } from '@/app/actions/labour'
import { formatGa } from '@/lib/obstetrics/dating'
import { deliveryModeLabel, isCaesarean } from '@/lib/obstetrics/labour'
import { dischargeDocumentTitle, DISCHARGE_TYPE_OPTIONS } from '@/lib/dischargeType'
import {
  A4, DataTable, FactRow, InfoGrid, Letterhead, PageChrome, SectionTitle, Signatures, TextBlock, TitleBand,
  ageSex, fmtDateTime, shortRef, s, C, type LogoImage,
} from './parts'

type DischargeAdmission = Admission & {
  patient?: Admission['patient'] & { dob?: string | null; gender?: string | null }
}

function stayDays(from: string, to: string | null): number {
  const a = new Date(from).getTime(), b = to ? new Date(to).getTime() : Date.now()
  return Math.max(1, Math.ceil((b - a) / 86_400_000))
}

export function DischargeSummaryPdf({ admission: adm, allergies, profile, logo, labour = null }: {
  admission: DischargeAdmission; allergies: PatientAllergy[]; profile: TenantProfile | null; logo: LogoImage
  labour?: LabourContext | null
}) {
  const hospital = profile?.name || 'Hospital'
  const p = adm.patient
  const discharged = !!adm.discharged_at
  const ref = adm.ip_no ?? shortRef('IP', adm.id)
  const type = adm.discharge_type ?? null
  const died = discharged && type === 'death'
  const typeLabel = DISCHARGE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? null
  const allergyText = allergies.length
    ? allergies.map((a) => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')
    : p?.allergies || null

  return (
    <A4 title={`${died ? 'Death summary' : 'Discharge summary'} ${p?.full_name ?? ''}`}>
      <PageChrome hospital={hospital} identity={`${p?.full_name ?? ''} · UHID ${p?.uhid ?? ''}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title={discharged ? dischargeDocumentTitle(type) : 'DISCHARGE SUMMARY (DRAFT)'}
        subtitle={discharged ? null : 'Patient is still admitted — this is not the final summary'}
        numberLabel="IP Ref" number={ref}
        date={died && adm.death_at ? `Died ${fmtDateTime(adm.death_at)}`
          : discharged ? `Discharged ${fmtDateTime(adm.discharged_at)}` : `Printed ${fmtDateTime(new Date().toISOString())}`}
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
        ...(discharged && typeLabel ? [['Discharge type', typeLabel] as [string, string]] : []),
        ...(died ? [['Time of death', fmtDateTime(adm.death_at)] as [string, string]] : []),
      ]} />

      {died && adm.death_cause ? (
        <>
          <View wrap={false}><SectionTitle>Cause of death</SectionTitle></View>
          <TextBlock text={adm.death_cause} />
        </>
      ) : null}

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

      {labour?.delivery ? <DeliveryBlock labour={labour} /> : null}

      <View wrap={false}><SectionTitle tone="accent">{died ? 'Course in hospital and events leading to death' : 'Summary of stay, treatment and advice'}</SectionTitle></View>
      <TextBlock text={adm.discharge_summary} empty="No discharge summary has been recorded for this admission yet." size={10} />

      {died || type === 'absconded' ? null : (
        <View wrap={false} style={{ marginTop: 14 }}>
          <Text style={[s.small, { color: C.muted }]}>
            In case of fever, severe pain, bleeding, breathlessness or any worsening of symptoms, report to the hospital immediately
            {profile?.emergency_contact ? ` or call ${profile.emergency_contact}` : ''}.
          </Text>
        </View>
      )}
      <Signatures hospital={hospital}
        left={died ? 'Body received by (name & relationship)' : type === 'absconded' ? null : 'Patient / Relative (name & relationship)'}
        right={{ name: adm.doctor?.full_name, role: 'Treating Consultant' }} />

      {discharged && type === 'dama' ? <DamaDeclaration hospital={hospital} patient={p?.full_name ?? ''} uhid={p?.uhid ?? ''} ipRef={ref} /> : null}
    </A4>
  )
}

const TEAR = { none: 'No tear', first: '1st-degree tear', second: '2nd-degree tear', third: '3rd-degree tear', fourth: '4th-degree tear' } as const

/** Delivery and baby details for a maternity admission. */
function DeliveryBlock({ labour }: { labour: LabourContext }) {
  const d = labour.delivery!
  const cs = isCaesarean(d.mode)
  return (
    <View wrap={false}>
      <SectionTitle>Delivery</SectionTitle>
      <FactRow items={[
        ['Delivered', fmtDateTime(d.delivered_at)],
        ['Mode', deliveryModeLabel(d.mode)],
        ['Gestation', d.gestation_days != null ? formatGa(d.gestation_days) : null],
        ['Anaesthesia', d.anaesthesia ? d.anaesthesia[0].toUpperCase() + d.anaesthesia.slice(1) : null],
        ['Blood loss', d.blood_loss_ml != null ? `${d.blood_loss_ml} mL` : null],
        ['Perineum', cs ? null : `${d.episiotomy ? 'Episiotomy, ' : ''}${TEAR[d.perineal_tear as keyof typeof TEAR] ?? d.perineal_tear}`],
        ['Placenta', d.placenta ? d.placenta[0].toUpperCase() + d.placenta.slice(1).replace('_', ' ') : null],
      ]} />
      {d.indication ? <Text style={{ fontSize: 9, paddingHorizontal: 6, paddingTop: 2 }}><Text style={{ fontWeight: 700 }}>Indication: </Text>{d.indication}</Text> : null}
      {labour.babies.length ? (
        <DataTable
          columns={[{ label: 'Baby', flex: 1.3 }, { label: 'Born', flex: 1.1 }, { label: 'Weight', width: 52, align: 'right' }, { label: 'APGAR', width: 48, align: 'right' }, { label: 'UHID / notes', flex: 1.4 }]}
          rows={labour.babies.map((b) => [
            { text: `${labour.babies.length > 1 ? `${b.birth_order}. ` : ''}${b.sex === 'male' ? 'Boy' : b.sex === 'female' ? 'Girl' : 'Indeterminate'}${b.outcome === 'live_birth' ? '' : b.outcome === 'fresh_stillbirth' ? ' — fresh stillbirth' : ' — macerated stillbirth'}`, bold: true },
            fmtDateTime(b.born_at),
            b.birth_weight_kg != null ? `${b.birth_weight_kg} kg` : '—',
            b.apgar_1 != null ? `${b.apgar_1}/${b.apgar_5 ?? '-'}` : '—',
            [b.baby_patient?.uhid, b.nicu ? 'NICU' : null, b.anomalies].filter(Boolean).join(' · ') || '—',
          ])}
        />
      ) : null}
    </View>
  )
}

/**
 * Discharge against medical advice: the page the family signs. Printed with
 * the summary so the hospital keeps both; the wording is a plain default the
 * hospital can have its own legal adviser replace.
 */
function DamaDeclaration({ hospital, patient, uhid, ipRef }: { hospital: string; patient: string; uhid: string; ipRef: string }) {
  const line = { borderBottomWidth: 0.75, borderBottomColor: C.muted, height: 16, marginTop: 4 }
  return (
    <View break>
      <TitleBand title="DECLARATION — DISCHARGE AGAINST MEDICAL ADVICE" subtitle={null} numberLabel="IP Ref" number={ipRef} date="" />
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 10, lineHeight: 1.6 }}>
          I, ______________________________ (name), the ______________ (relationship) of the patient{' '}
          <Text style={{ fontWeight: 700 }}>{patient}</Text> (UHID {uhid}), am taking the patient home from {hospital} against
          the advice of the treating doctors.
        </Text>
        <Text style={{ fontSize: 10, lineHeight: 1.6, marginTop: 8 }}>
          The doctors have explained to me, in a language I understand, the patient&apos;s present condition, the treatment that
          is still needed, and the risks of stopping it now — including worsening of the illness, disability and death. I have
          had the opportunity to ask questions. I take full responsibility for this decision and its consequences, and I will not
          hold the hospital or its staff responsible for them.
        </Text>
        <Text style={{ fontSize: 10, lineHeight: 1.6, marginTop: 8 }}>Reason for leaving (optional):</Text>
        <View style={line} />
        <View style={line} />
        <Text style={{ fontSize: 10, lineHeight: 1.6, marginTop: 8 }}>Risks explained by the doctor:</Text>
        <View style={line} />
        <View style={line} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 36 }}>
        {['Signature / thumb impression of patient or relative', 'Witness (name & signature)', 'Doctor (name & signature)'].map((l) => (
          <View key={l} style={{ width: 150, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3 }}>
            <Text style={s.small}>{l}</Text>
          </View>
        ))}
      </View>
      <Text style={[s.small, { marginTop: 14 }]}>Date and time: ____________________</Text>
    </View>
  )
}
