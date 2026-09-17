import { Image, Text, View } from '@react-pdf/renderer'
import type { RadiologyOrder, TenantProfile } from '@/lib/types'
import {
  A4, InfoGrid, Letterhead, PageChrome, SectionTitle, Signatures, TextBlock, TitleBand,
  ageSex, fmtDateTime, shortRef, s, C, type LogoImage,
} from './parts'
import type { ReportPatient } from './LabReportPdf'

export function RadiologyReportPdf({ order, patient, profile, logo, image, attachmentIsPdf }: {
  order: RadiologyOrder; patient: ReportPatient; profile: TenantProfile | null; logo: LogoImage
  image: LogoImage; attachmentIsPdf: boolean
}) {
  const hospital = profile?.name || 'Hospital'
  const ref = shortRef('RAD', order.id)
  const modality = order.test?.modality?.toUpperCase()

  return (
    <A4 title={`Radiology report ${patient.full_name} ${ref}`}>
      <PageChrome hospital={hospital} identity={`${patient.full_name} · UHID ${patient.uhid}`} docRef={ref} />
      <Letterhead profile={profile} fallbackName={hospital} logo={logo} />
      <TitleBand
        title="RADIOLOGY REPORT"
        subtitle={[order.test?.name, modality].filter(Boolean).join(' · ') || null}
        numberLabel="Report Ref" number={ref}
        date={order.reported_at ? `Reported ${fmtDateTime(order.reported_at)}` : 'Not yet reported'}
      />
      <InfoGrid items={[
        ['Patient', patient.full_name],
        ['UHID', patient.uhid],
        ['Age / Sex', ageSex(patient.dob, patient.gender)],
        ['Referred by', order.orderer?.full_name],
        ['Study', order.test?.name],
        ['Modality', modality],
        ['Ordered', fmtDateTime(order.ordered_at)],
        ['Priority', order.priority === 'stat' ? 'STAT (urgent)' : 'Routine'],
      ]} />

      <View wrap={false}>
        <SectionTitle>Findings / Impression</SectionTitle>
      </View>
      <TextBlock text={order.report} empty="No report text recorded." size={10} />

      {image ? (
        // The image never splits; if it doesn't fit it moves to the next page whole.
        <View wrap={false} style={{ marginTop: 6 }}>
          <SectionTitle>Scan image</SectionTitle>
          <View style={{ alignItems: 'center', paddingTop: 6 }}>
            <Image src={image} style={{ maxWidth: 460, maxHeight: 300, objectFit: 'contain' }} />
          </View>
        </View>
      ) : attachmentIsPdf ? (
        <Text style={[s.small, { marginTop: 10, paddingHorizontal: 6, color: C.muted }]}>
          The study images are attached as a separate PDF on the patient&apos;s record.
        </Text>
      ) : null}

      <View wrap={false} style={{ marginTop: 14 }}>
        <Text style={[s.small, { textAlign: 'center' }]}>— End of report —</Text>
      </View>
      <Signatures hospital={hospital} left={null} right={{ role: 'Radiologist' }} />
    </A4>
  )
}
