import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { TenantProfile } from '@/lib/types'
import {
  DataTable, InfoGrid, Letterhead, PageChrome, SectionTitle, TextBlock, TitleBand, WriteIn,
  fmtDate, fmtDateTime, registerPdfFonts, s, C, type LogoImage,
} from './parts'
import { INJURY_GRADES, DISPOSALS, INTIMATION_METHODS } from '@/lib/mlc'
import type { PoliceIntimation } from '@/app/actions/mlc'

/**
 * The accident register sheet, and the intimation that goes with it.
 *
 * These carry the hospital's letterhead, unlike the PC&PNDT monthly returns.
 * Those are government returns filed with an Appropriate Authority and are
 * deliberately plain; these are documents the hospital issues — to the police,
 * and to the patient — so they are on its own paper, with its registration
 * number and its seal.
 *
 * ── Why three copies, and why marked ──────────────────────────────────────
 *
 * The register is written in triplicate: the original goes to the police, the
 * duplicate to the injured person or their nominee, the triplicate stays with
 * the hospital. Three identical unmarked sheets are useless — nobody can later
 * say which copy they are holding, and the hospital's own copy is the one it
 * will be asked to produce. So each page says what it is.
 *
 * ── Why the layout is not configurable ────────────────────────────────────
 *
 * Hospitals print these on their own formats and the formats differ in layout
 * while largely agreeing on content. What is modelled here is therefore the
 * union of the fields those formats ask for, rendered once. A hospital whose
 * printed sheet orders things differently still has every field it needs on
 * the page.
 */

export interface MlcRecordData {
  ar_no: string
  status: string
  amends_id: string | null
  amend_reason: string | null

  patient_name: string | null
  patient_age: number | null
  patient_sex: string | null
  patient_address: string | null
  mr_no: string | null
  identification_mark_1: string | null
  identification_mark_2: string | null

  brought_by_name: string | null
  brought_by_relation: string | null
  brought_by_address: string | null
  brought_by_phone: string | null

  mlc_types: string[] | null
  mlc_type_other: string | null
  alleged_cause: string | null
  place_of_occurrence: string | null
  occurred_at: string | null
  arrived_at: string | null
  vehicle_numbers: string | null

  injury_natures: string[] | null
  injury_details: string | null
  injury_grade: string | null
  injury_grade_note: string | null
  smell_of_alcohol: boolean | null
  conscious_state: string | null
  first_aid_given: string | null

  dying_declaration_needed: boolean
  dying_declaration_note: string | null

  examined_by_name: string | null
  examined_by_reg_no: string | null
  disposal: string | null
  disposal_note: string | null

  completed_at: string | null
  /** ip_no and ward, where the patient was admitted from this case. */
  admission: { ip_no: string | null; ward: string | null } | null
}

/** Labels for the option codes, resolved by the caller from mlc_options. */
export type CodeLabels = Record<string, string>

const COPIES = [
  { tag: 'ORIGINAL',   to: 'Police' },
  { tag: 'DUPLICATE',  to: 'Injured person / nominee' },
  { tag: 'TRIPLICATE', to: 'Hospital record' },
] as const

const SEX: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other', unknown: 'Unknown' }

function grade(code: string | null | undefined): string | null {
  if (!code) return null
  const g = INJURY_GRADES.find((x) => x.value === code)
  return g ? g.label : code
}

function disposal(code: string | null | undefined): string | null {
  if (!code) return null
  return DISPOSALS.find((d) => d.value === code)?.label ?? code
}

function labelled(codes: string[] | null, labels: CodeLabels, extra?: string | null): string | null {
  const list = (codes ?? []).map((c) => labels[c] ?? c)
  if (extra?.trim()) list.push(extra.trim())
  return list.length ? list.join('; ') : null
}

/** The copy marker. Says which of the three this sheet is, and where it goes. */
function CopyBand({ tag, to }: { tag: string; to: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 6, paddingVertical: 3, paddingHorizontal: 8,
      borderWidth: 1, borderColor: C.danger,
    }}>
      <Text style={{ fontSize: 10, fontWeight: 700, color: C.danger, letterSpacing: 1.5 }}>{tag}</Text>
      <Text style={{ fontSize: 8, color: C.danger }}>Copy to: {to}</Text>
    </View>
  )
}

/**
 * Where the register ends and the signatures begin.
 *
 * The undersigning doctor is named with their council registration because the
 * duty is personal to them, and because it is this doctor who will be summoned
 * about the case. The hospital seal has its own box: a Tamil Nadu accident
 * register copy is not accepted without it, and a computer-generated format is
 * accepted precisely on the footing that the undersigning authority has
 * verified the contents — so there has to be somewhere to do that.
 */
function MlcSignatures({ data, hospital }: { data: MlcRecordData; hospital: string }) {
  return (
    <View wrap={false} style={{ marginTop: 10 }}>
      <View style={{ paddingVertical: 5, paddingHorizontal: 8, backgroundColor: C.fill }}>
        <Text style={{ fontSize: 8, lineHeight: 1.5, color: C.muted }}>
          I certify that the particulars above were recorded by me on examination of the
          person named, that the injuries described are those I found, and that the opinion
          given is my own. The alleged cause is recorded as stated by the person or the
          informant and is not certified as fact.
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
        <View style={{ width: 150, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3 }}>
          <Text style={s.small}>Date</Text>
          <Text style={{ fontSize: 9, fontWeight: 600, color: C.ink }}>
            {fmtDate(data.completed_at ?? data.arrived_at)}
          </Text>
        </View>
        <View style={{ width: 130, borderWidth: 0.75, borderColor: C.rule, height: 48, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 }}>
          <Text style={s.small}>Hospital seal</Text>
        </View>
        <View style={{ width: 170, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3, alignItems: 'flex-end' }}>
          {data.examined_by_name
            ? <Text style={{ fontSize: 9, fontWeight: 700, color: C.ink }}>{data.examined_by_name}</Text>
            : null}
          {data.examined_by_reg_no
            ? <Text style={s.small}>Regn. No. {data.examined_by_reg_no}</Text>
            : null}
          <Text style={s.small}>Signature of the examining doctor</Text>
          <Text style={[s.small, { fontWeight: 600 }]}>for {hospital}</Text>
        </View>
      </View>
    </View>
  )
}

/** One copy of the register sheet. */
function RegisterBody({
  data, labels, intimations, hospital, profile, logo, copy,
}: {
  data: MlcRecordData
  labels: CodeLabels
  intimations: PoliceIntimation[]
  hospital: string
  profile: TenantProfile | null
  logo: LogoImage
  copy: (typeof COPIES)[number]
}) {
  return (
    <>
      {/*
        The copy marker goes in the running header as well as the band below.
        The sheet runs to a second page, and a page that does not say which of
        the three copies it belongs to is a loose sheet — which is the whole
        problem marking them was meant to solve.
      */}
      <PageChrome hospital={hospital}
        identity={`${copy.tag} copy  ·  ${data.patient_name ?? '—'}  ·  ${data.ar_no}`}
        docRef={data.ar_no} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <CopyBand tag={copy.tag} to={copy.to} />
      <TitleBand
        title="ACCIDENT REGISTER — MEDICO-LEGAL CASE"
        subtitle="Recorded under section 397 of the Bharatiya Nagarik Suraksha Sanhita, 2023"
        numberLabel="AR No" number={data.ar_no}
        date={data.arrived_at ? `D.O.A. ${fmtDateTime(data.arrived_at)}` : ''} />

      {data.amend_reason ? (
        <View style={{ marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: '#FFFBEB', borderLeftWidth: 2, borderLeftColor: '#B45309' }}>
          <Text style={{ fontSize: 8, color: '#78350F' }}>
            <Text style={{ fontWeight: 700 }}>This entry amends an earlier one. </Text>
            {data.amend_reason}
          </Text>
        </View>
      ) : null}

      <InfoGrid items={[
        ['Name', data.patient_name],
        ['M.R. No.', data.mr_no],
        ['Age', data.patient_age != null ? `${data.patient_age} years` : null],
        ['Sex', data.patient_sex ? SEX[data.patient_sex] ?? data.patient_sex : null],
        ['Address', data.patient_address],
        ['Date and time of arrival', fmtDateTime(data.arrived_at)],
        ['Identification mark 1', data.identification_mark_1],
        ['Identification mark 2', data.identification_mark_2],
      ]} />

      {/* Named, per the Madras High Court's direction that a hospital record
          the particulars of whoever brought the victim rather than the vehicle. */}
      <View wrap={false}>
        <SectionTitle>Brought to hospital by</SectionTitle>
        <InfoGrid items={[
          ['Name', data.brought_by_name],
          ['Relationship to the patient', data.brought_by_relation],
          ['Address', data.brought_by_address],
          ['Phone', data.brought_by_phone],
        ]} />
      </View>

      <View wrap={false}>
        <SectionTitle>The incident, as alleged</SectionTitle>
        <InfoGrid items={[
          ['Nature of the case', labelled(data.mlc_types, labels, data.mlc_type_other)],
          ['Place of occurrence', data.place_of_occurrence],
          ['Date and time of occurrence', fmtDateTime(data.occurred_at)],
          ['Vehicle number(s)', data.vehicle_numbers],
        ]} />
        <TextBlock text={data.alleged_cause} empty="Not recorded" />
      </View>

      <View wrap={false}>
        <SectionTitle>On examination</SectionTitle>
        <InfoGrid items={[
          ['Nature of injuries', labelled(data.injury_natures, labels)],
          ['State of consciousness', data.conscious_state],
          ['Smell of alcohol', data.smell_of_alcohol == null ? null : data.smell_of_alcohol ? 'Present' : 'Absent'],
          ['Opinion', [grade(data.injury_grade), data.injury_grade_note].filter(Boolean).join(' — ')],
        ]} />
      </View>
      <TextBlock text={data.injury_details} empty="Not recorded" />

      <View wrap={false}>
        <SectionTitle>First aid and treatment given</SectionTitle>
        <TextBlock text={data.first_aid_given} empty="Not recorded" />
      </View>

      {/* Printed on every copy, because this is the hospital's evidence that it
          discharged the duty — and the police copy should show when they were
          told, not only that the sheet was handed over. */}
      <View wrap={false}>
        <SectionTitle>Intimation to the police</SectionTitle>
        <DataTable
          columns={[
            { label: 'Police station', flex: 2 },
            { label: 'Officer informed', flex: 2 },
            { label: 'How', flex: 1.4 },
            { label: 'Date and time', flex: 1.6 },
            { label: 'Acknowledgement', flex: 1.4 },
          ]}
          rows={intimations.map((i) => [
            i.station_name,
            [i.officer_rank, i.officer_name].filter(Boolean).join(' ') || '—',
            INTIMATION_METHODS.find((m) => m.value === i.method)?.label ?? i.method,
            fmtDateTime(i.intimated_at) ?? '—',
            i.acknowledgement_ref ?? '—',
          ])}
          empty="Not informed"
        />
      </View>

      <View wrap={false}>
        <SectionTitle>Disposal</SectionTitle>
        <InfoGrid items={[
          ['Disposal', disposal(data.disposal)],
          ['Note', data.disposal_note],
          ['Admitted as', data.admission?.ip_no],
          ['Ward', data.admission?.ward],
          ['Dying declaration', data.dying_declaration_needed ? 'Considered necessary' : null],
          ['Action taken', data.dying_declaration_note],
        ]} />
      </View>

      <MlcSignatures data={data} hospital={hospital} />
    </>
  )
}

/**
 * The register sheet, three times, each marked.
 *
 * One document rather than three, because the hospital prints all three at
 * once and a single print job is one fewer thing to get wrong at four in the
 * morning.
 */
export function AccidentRegisterPdf({ data, labels, intimations, profile, logo }: {
  data: MlcRecordData
  labels: CodeLabels
  intimations: PoliceIntimation[]
  profile: TenantProfile | null
  logo: LogoImage
}) {
  registerPdfFonts()
  const hospital = profile?.name || 'Hospital'
  return (
    <Document title={`Accident Register ${data.ar_no}`} author="Uyirly" creator="Uyirly">
      {COPIES.map((copy) => (
        <Page key={copy.tag} size="A4" style={s.page} wrap>
          <RegisterBody data={data} labels={labels} intimations={intimations}
            hospital={hospital} profile={profile} logo={logo} copy={copy} />
        </Page>
      ))}
    </Document>
  )
}

/**
 * The intimation itself — the sheet that is carried to the station.
 *
 * Separate from the register because it is addressed: it names the station, it
 * is signed, and it is handed to somebody who signs for it. A register sheet
 * is a record; this is a letter.
 *
 * It is printed BEFORE the intimation is recorded, which is why the station
 * and officer may be blank — the hospital fills them in by hand if the call
 * came first, or prints after recording and has them filled. Either order
 * works, and insisting on one would mean the paper waits for the form.
 */
export function PoliceIntimationPdf({ data, labels, intimation, profile, logo }: {
  data: MlcRecordData
  labels: CodeLabels
  intimation: PoliceIntimation | null
  profile: TenantProfile | null
  logo: LogoImage
}) {
  registerPdfFonts()
  const hospital = profile?.name || 'Hospital'
  return (
    <Document title={`Police intimation ${data.ar_no}`} author="Uyirly" creator="Uyirly">
      <Page size="A4" style={s.page} wrap>
        <PageChrome hospital={hospital}
          identity={`${data.patient_name ?? '—'}  ·  ${data.ar_no}`} docRef={data.ar_no} />
        <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
        <TitleBand
          title="INTIMATION OF A MEDICO-LEGAL CASE TO THE POLICE"
          subtitle="Under section 397 of the Bharatiya Nagarik Suraksha Sanhita, 2023"
          numberLabel="AR No" number={data.ar_no}
          date={fmtDate(data.completed_at ?? data.arrived_at) ?? ''} />

        <View style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 9, color: C.muted }}>To</Text>
          {intimation?.station_name ? (
            <>
              <Text style={{ fontSize: 10, fontWeight: 700, color: C.ink, marginTop: 2 }}>
                The Station House Officer
              </Text>
              <Text style={{ fontSize: 9.5, color: C.text }}>{intimation.station_name}</Text>
              {intimation.officer_name ? (
                <Text style={{ fontSize: 9, color: C.muted }}>
                  Kind attention: {[intimation.officer_rank, intimation.officer_name].filter(Boolean).join(' ')}
                </Text>
              ) : null}
            </>
          ) : (
            // Left blank on purpose when the station is not yet recorded: the
            // sheet is often written before the call is placed.
            <View style={{ marginTop: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: 700, color: C.ink }}>The Station House Officer</Text>
              <WriteIn label="Police station" lines={2} />
            </View>
          )}
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 9.5, lineHeight: 1.6 }}>
            Sir / Madam,
          </Text>
          <Text style={{ fontSize: 9.5, lineHeight: 1.6, marginTop: 6 }}>
            This is to inform you that the person named below was brought to this hospital
            and has been registered as a medico-legal case in our accident register under
            the number shown above. First aid and treatment have been given. The particulars
            are set out below for your record and further action.
          </Text>
        </View>

        <InfoGrid items={[
          ['Name', data.patient_name],
          ['Age / Sex', [data.patient_age != null ? `${data.patient_age} years` : null,
                         data.patient_sex ? SEX[data.patient_sex] ?? data.patient_sex : null]
                         .filter(Boolean).join(' / ') || null],
          ['Address', data.patient_address],
          ['M.R. No.', data.mr_no],
          ['Brought in by', [data.brought_by_name, data.brought_by_relation].filter(Boolean).join(', ')],
          ['Their phone', data.brought_by_phone],
          ['Date and time of arrival', fmtDateTime(data.arrived_at)],
          ['Date and time of occurrence', fmtDateTime(data.occurred_at)],
          ['Place of occurrence', data.place_of_occurrence],
          ['Vehicle number(s)', data.vehicle_numbers],
          ['Nature of the case', labelled(data.mlc_types, labels, data.mlc_type_other)],
          ['Identification marks', [data.identification_mark_1, data.identification_mark_2]
            .filter(Boolean).join('; ') || null],
        ]} />

        <View wrap={false}>
          <SectionTitle>Alleged cause, as stated</SectionTitle>
          <TextBlock text={data.alleged_cause} empty="Not recorded" />
        </View>

        <View wrap={false}>
          <SectionTitle>Injuries found, and the opinion on them</SectionTitle>
          <TextBlock text={data.injury_details} empty="Not recorded" />
          <View style={{ marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.accentFill }}>
            <Text style={{ fontSize: 9.5, fontWeight: 700, color: C.accent }}>
              Opinion: {grade(data.injury_grade) ?? 'Not stated'}
              {data.injury_grade_note ? ` — ${data.injury_grade_note}` : ''}
            </Text>
          </View>
        </View>

        {/*
          Suppressed entirely when none of it is known yet. A letter carried to
          the station within the hour will often have no disposal — a heading
          with an empty box under it reads as a field somebody forgot, which is
          not what a hospital wants a police file to suggest.
        */}
        <View wrap={false}>
          {[data.conscious_state, data.disposal, data.admission?.ip_no].some(Boolean) ? (
            <>
              <SectionTitle>Present condition and disposal</SectionTitle>
              <InfoGrid items={[
                ['State of consciousness', data.conscious_state],
                ['Disposal', disposal(data.disposal)],
                ['Admitted as', data.admission?.ip_no],
                ['Ward', data.admission?.ward],
              ]} />
            </>
          ) : null}
          {data.dying_declaration_needed ? (
            <View style={{ marginTop: 6, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: C.danger }}>
              <Text style={{ fontSize: 9, fontWeight: 700, color: C.danger }}>
                The patient&apos;s condition is such that a dying declaration may be necessary.
                Your immediate attention is requested.
              </Text>
              {data.dying_declaration_note
                ? <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 2 }}>{data.dying_declaration_note}</Text>
                : null}
            </View>
          ) : null}
        </View>

        <MlcSignatures data={data} hospital={hospital} />

        {/* The receipt. Without it the hospital has a letter and no proof that
            anyone took it — which is the position it is trying to avoid. */}
        <View wrap={false} style={{ marginTop: 18, borderWidth: 0.75, borderColor: C.rule, padding: 8 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 0.6 }}>
            ACKNOWLEDGEMENT — TO BE COMPLETED BY THE RECEIVING OFFICER
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}><WriteIn label="Received by (name and rank)" /></View>
            <View style={{ flex: 1 }}><WriteIn label="Date and time" /></View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1 }}><WriteIn label="G.D. / F.I.R. number" /></View>
            <View style={{ flex: 1 }}><WriteIn label="Signature and station seal" /></View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
