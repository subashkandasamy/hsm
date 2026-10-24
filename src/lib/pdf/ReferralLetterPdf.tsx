import { Text, View } from '@react-pdf/renderer'
import type { TenantProfile } from '@/lib/types'
import {
  A4, InfoGrid, Letterhead, PageChrome, SectionTitle, TextBlock, TitleBand,
  fmtDate, fmtDateTime, s, C, type LogoImage,
} from './parts'

/**
 * The referral letter.
 *
 * Laid out as a letter and not as a form, because that is what it is: it is
 * addressed to a named doctor at a named hospital, it makes a request, and it
 * is signed. The hospital's forms have the same fields arranged as boxes, but
 * the thing a receiving registrar does with it at two in the morning is read
 * it, so the clinical story runs as prose in the order they need it — what is
 * wrong, what has been found, what has been done, how the patient is now, and
 * what is being asked for.
 *
 * On the hospital's letterhead, like the accident register and unlike the
 * PC&PNDT returns. This one is signed by a doctor and carried by a patient.
 */

export interface ReferralLetterData {
  ref_no: string
  source: string
  patient_name: string | null
  patient_age: number | null
  patient_sex: string | null
  address_text: string | null
  contact_no: string | null
  mr_no: string | null
  op_no: string | null
  ip_no: string | null
  doa: string | null
  referred_at: string

  diagnosis: string | null
  investigations_done: string | null
  treatment_given: string | null
  condition_at_referral: string | null
  vitals_text: string | null
  reason: string | null

  to_doctor: string | null
  to_institution: string | null
  to_department: string | null
  to_address: string | null

  transport: string | null
  accompanied_by: string | null
  transport_note: string | null

  referred_by_name: string | null
  referred_by_qualification: string | null
  referred_by_reg_no: string | null
  updated_at?: string | null
  first_printed_at?: string | null
}

const SEX: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other', unknown: 'Unknown' }

const TRANSPORT: Record<string, string> = {
  own: 'Their own transport',
  hospital_ambulance: 'Hospital ambulance',
  other_ambulance: 'Ambulance (108 or private)',
  other: 'Other',
}

export function ReferralLetterPdf({ data, profile, logo }: {
  data: ReferralLetterData
  profile: TenantProfile | null
  logo: LogoImage
}) {
  const hospital = profile?.name || 'Hospital'
  const who = [
    data.patient_age != null ? `${data.patient_age} years` : null,
    data.patient_sex ? SEX[data.patient_sex] ?? data.patient_sex : null,
  ].filter(Boolean).join(' / ')

  // "a case of X" reads as the forms do, and falls back gracefully when no
  // diagnosis has been reached — which is itself a common and honest reason to
  // refer somebody.
  const caseOf = data.diagnosis?.trim() || data.reason?.trim() || null

  // Only a change made AFTER a copy went out is worth announcing. Correcting
  // a letter before anybody has seen it is just writing it.
  const revised = !!(data.first_printed_at && data.updated_at
    && new Date(data.updated_at).getTime() > new Date(data.first_printed_at).getTime())

  return (
    <A4 title={`Referral letter ${data.patient_name ?? ''}`}>
      <PageChrome hospital={hospital}
        identity={`${data.patient_name ?? '—'}  ·  ${data.ref_no}`} docRef={data.ref_no} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand title="REFERRAL LETTER" numberLabel="Ref No" number={data.ref_no}
        date={fmtDate(data.referred_at) ?? ''} />

      {/*
        Said plainly when a copy is already out in the world.

        The patient may be carrying the earlier sheet and the receiving doctor
        treats them on whichever one they are handed. Two letters with the
        same number and nothing to tell them apart is the problem; one line
        solves it, and a locking scheme would only stop a doctor correcting
        something they have realised is wrong.
      */}
      {revised ? (
        <View style={{ marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#FFFBEB', borderLeftWidth: 2, borderLeftColor: '#B45309' }}>
          <Text style={{ fontSize: 8.5, color: '#78350F' }}>
            <Text style={{ fontWeight: 700 }}>Revised {fmtDateTime(data.updated_at)}. </Text>
            This supersedes the copy issued on {fmtDateTime(data.first_printed_at)}.
          </Text>
        </View>
      ) : null}

      {/* The address block. A letter, so it is addressed. */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 9, color: C.muted }}>To</Text>
        {data.to_doctor
          ? <Text style={{ fontSize: 10, fontWeight: 700, color: C.ink, marginTop: 2 }}>{data.to_doctor}</Text>
          : <Text style={{ fontSize: 10, fontWeight: 700, color: C.ink, marginTop: 2 }}>The Medical Officer on duty</Text>}
        {data.to_department ? <Text style={{ fontSize: 9.5, color: C.text }}>{data.to_department}</Text> : null}
        {data.to_institution ? <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.text }}>{data.to_institution}</Text> : null}
        {data.to_address ? <Text style={{ fontSize: 9, color: C.muted }}>{data.to_address}</Text> : null}
      </View>

      <View style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 9.5, lineHeight: 1.6 }}>Dear Doctor,</Text>
        <Text style={{ fontSize: 9.5, lineHeight: 1.6, marginTop: 6 }}>
          I am referring {data.patient_name ?? 'the patient named below'}
          {who ? `, ${who}` : ''}
          {caseOf ? `, a case of ${caseOf}` : ''}
          {data.to_department ? `, to your department` : ''} for your kind opinion and
          further management. The details of the treatment given here are set out below.
          Kindly do the needful.
        </Text>
      </View>

      <InfoGrid items={[
        ['Name', data.patient_name],
        ['Age / Sex', who || null],
        ['M.R. No.', data.mr_no],
        ['OP / IP No.', [data.op_no, data.ip_no].filter(Boolean).join(' / ') || null],
        ['Address', data.address_text],
        ['Phone', data.contact_no],
        [data.ip_no ? 'Date of admission' : 'First seen', fmtDateTime(data.doa)],
        ['Date and time of referral', fmtDateTime(data.referred_at)],
      ]} />

      {data.diagnosis ? (
        <View wrap={false}>
          <SectionTitle>Diagnosis</SectionTitle>
          <TextBlock text={data.diagnosis} />
        </View>
      ) : null}

      {data.investigations_done ? (
        <View wrap={false}>
          <SectionTitle>Investigations already done</SectionTitle>
          <TextBlock text={data.investigations_done} />
          {/* Said plainly, because repeating a scan the patient had two hours
              ago costs them money and, for a CT, a second radiation dose. */}
          <Text style={[s.small, { paddingHorizontal: 6, paddingTop: 3 }]}>
            Reports accompany the patient where available.
          </Text>
        </View>
      ) : null}

      {data.treatment_given ? (
        <View wrap={false}>
          <SectionTitle>Treated with</SectionTitle>
          <TextBlock text={data.treatment_given} />
        </View>
      ) : null}

      {(data.condition_at_referral || data.vitals_text) ? (
        <View wrap={false}>
          <SectionTitle>Condition at the time of referral</SectionTitle>
          {/*
            Only when there is something to say. The section appears if either
            the note or the vitals are present, so rendering a placeholder dash
            for a missing note left a letter reading "Condition: —" directly
            above a perfectly good set of vitals.
          */}
          {data.condition_at_referral ? <TextBlock text={data.condition_at_referral} /> : null}
          {data.vitals_text
            ? <Text style={{ fontSize: 9, paddingHorizontal: 6, paddingTop: 5, color: C.muted }}>
                {data.vitals_text}
              </Text>
            : null}
        </View>
      ) : null}

      <View wrap={false}>
        <SectionTitle tone="accent">Reason for referral</SectionTitle>
        <TextBlock text={data.reason} />
      </View>

      {(data.transport || data.accompanied_by || data.transport_note) ? (
        <View wrap={false}>
          <SectionTitle>Transfer</SectionTitle>
          <InfoGrid items={[
            ['Travelling by', data.transport ? TRANSPORT[data.transport] ?? data.transport : null],
            ['Accompanied by', data.accompanied_by],
            ['Note', data.transport_note],
          ]} />
        </View>
      ) : null}

      <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 }}>
        <View style={{ width: 150, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3 }}>
          <Text style={s.small}>Date</Text>
          <Text style={{ fontSize: 9, fontWeight: 600, color: C.ink }}>{fmtDate(data.referred_at)}</Text>
        </View>
        <View style={{ width: 130, borderWidth: 0.75, borderColor: C.rule, height: 48, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 }}>
          <Text style={s.small}>Hospital seal</Text>
        </View>
        <View style={{ width: 180, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3, alignItems: 'flex-end' }}>
          {data.referred_by_name
            ? <Text style={{ fontSize: 9, fontWeight: 700, color: C.ink }}>{data.referred_by_name}</Text>
            : null}
          {data.referred_by_qualification
            ? <Text style={s.small}>{data.referred_by_qualification}</Text>
            : null}
          {data.referred_by_reg_no
            ? <Text style={s.small}>Regn. No. {data.referred_by_reg_no}</Text>
            : null}
          <Text style={s.small}>Signature of the referring doctor</Text>
          <Text style={[s.small, { fontWeight: 600 }]}>for {hospital}</Text>
        </View>
      </View>
    </A4>
  )
}
