import { Document, Page, Text, View } from '@react-pdf/renderer'
import { QrCode, fitFontPt, mm } from './barcodes'
import { ageSex, fmtDate, registerPdfFonts } from './parts'

// Print area of a standard adult thermal wristband (1 × 4 in, e.g. 1 × 11 in
// bands). Black on white only (thermal). A 2D code is used because a band
// curves around the wrist — 2D symbols read on curved surfaces where linear
// bars distort. The code is printed at both ends so it can be scanned without
// turning the patient's arm. It encodes the UHID; scanning it opens the
// patient's current admission.
export const WRISTBAND_MM = { w: 101.6, h: 25.4 }
const QR_MM = 19

export interface WristbandData {
  hospital: string
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null; blood_group: string | null }
  ipNo: string
  admittedAt: string
  ward: string | null
  bed: string | null
  doctor: string | null
  allergies: string[]
}

export function WristbandPdf({ data }: { data: WristbandData }) {
  registerPdfFonts()
  const p = data.patient
  const dob = p.dob ? `DOB ${fmtDate(p.dob)}` : null
  const idLine = [dob, ageSex(p.dob, p.gender)].filter(Boolean).join('  ·  ')
  // Never print a cut-off allergy list (a hidden allergy is worse than none shown):
  // if it doesn't fit the band, point staff to the chart instead.
  const allergyList = data.allergies.join(', ')
  const allergyText = !data.allergies.length ? null
    : `ALLERGY: ${allergyList}`.length <= 40 ? `ALLERGY: ${allergyList}`
    : `ALLERGIES (${data.allergies.length}) — CHECK CHART`
  const place = [data.ward && data.bed ? `${data.ward} / ${data.bed}` : data.ward || data.bed, data.doctor ? `Dr ${data.doctor.replace(/^dr\.?\s+/i, '')}` : null].filter(Boolean).join('  ·  ')

  return (
    <Document title={`Wristband ${p.full_name}`} author="Uyirly" creator="Uyirly">
      <Page wrap={false} size={[mm(WRISTBAND_MM.w), mm(WRISTBAND_MM.h)]}
        style={{ fontFamily: 'Noto Sans', color: '#000', flexDirection: 'row', alignItems: 'center', paddingHorizontal: mm(1.5) }}>
        <QrCode value={p.uhid} sizeMm={QR_MM} />

        <View style={{ flex: 1, paddingHorizontal: mm(1.5), justifyContent: 'center' }}>
          <Text style={{ fontSize: fitFontPt(p.full_name, 57, 9, 6.5), fontWeight: 700, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>{p.full_name.toUpperCase()}</Text>
          <Text style={{ fontSize: 7, fontWeight: 600, lineHeight: 1.2 }}>{idLine || 'DOB / age not recorded'}</Text>
          <Text style={{ fontSize: 7, lineHeight: 1.2 }}>
            UHID <Text style={{ fontWeight: 700 }}>{p.uhid}</Text>   IP <Text style={{ fontWeight: 700 }}>{data.ipNo}</Text>
          </Text>
          <Text style={{ fontSize: 6, lineHeight: 1.2, maxLines: 1, textOverflow: 'ellipsis' }}>
            Adm {fmtDate(data.admittedAt)}{place ? `  ·  ${place}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
            {p.blood_group ? <Text style={{ fontSize: 6.5, fontWeight: 700, marginRight: 4 }}>{p.blood_group}</Text> : null}
            {allergyText ? (
              <Text style={{ fontSize: 6, fontWeight: 700, color: '#fff', backgroundColor: '#000', paddingHorizontal: 2, maxLines: 1 }}>
                {allergyText}
              </Text>
            ) : (
              <Text style={{ flex: 1, fontSize: 5, textAlign: 'right', maxLines: 1, textOverflow: 'ellipsis' }}>{data.hospital}</Text>
            )}
          </View>
        </View>

        <QrCode value={p.uhid} sizeMm={QR_MM} />
      </Page>
    </Document>
  )
}
