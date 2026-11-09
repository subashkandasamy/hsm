import { Document, Page, Text, View } from '@react-pdf/renderer'
import { CODE128_X_MM, DOT_MM, tubeCode } from '@/lib/barcode/geometry'
import { Code128, code128WidthMm, fitFontPt, mm } from './barcodes'
import { ageSex, registerPdfFonts } from './parts'

// 50 × 25 mm — the CLSI AUTO12 specimen label size (2 × 1 in), the common
// thermal tube-label roll. Apply lengthwise along the tube (barcode running
// along the tube's length) so analyzers and handheld scanners can read it.
export const SAMPLE_LABEL_MM = { w: 50, h: 25 }

export interface SampleTube {
  sampleType: string
  tests: string[]           // short codes when the catalog has them, else names
  /** The stored barcode. Recomputing it from a position in a list is how a
   *  reprint ends up disagreeing with the label already on the tube. */
  barcode?: string
  /** Cap colour, so a phlebotomist can reach for the right tube. */
  closure?: string | null
}

export interface SampleLabelData {
  accessionNo: string
  priority: 'stat' | 'routine'
  printedAt: string         // label is printed at collection
  encounter: string | null  // IP number, or "OPD"
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null }
  tubes: SampleTube[]
}

const PAD = 1.4 // mm
const BAR_H = 8 // mm

function stamp(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).replace(',', '')
}

export function SampleLabelsPdf({ data }: { data: SampleLabelData }) {
  registerPdfFonts()
  const total = data.tubes.length
  return (
    <Document title={`Sample labels ${data.accessionNo}`} author="Uyirly" creator="Uyirly">
      {data.tubes.map((tube, i) => {
        const code = tube.barcode ?? tubeCode(data.accessionNo, i + 1)
        // Bars stay whole printer dots: 3 dots normally; 2 dots (0.25 mm) only if a very
        // long accession (10,000+ samples in a day) would not fit. Never scaled to fit —
        // a scaled barcode prints uneven bars and stops scanning.
        const room = SAMPLE_LABEL_MM.w - PAD * 2
        const xMm = code128WidthMm(code) <= room ? CODE128_X_MM : 2 * DOT_MM
        if (code128WidthMm(code, xMm) > room) throw new Error(`Barcode ${code} is wider than the label`)
        return (
          // wrap={false}: a label is one sticker — overflow is clipped, never spilled onto the next label.
          <Page key={code} wrap={false} size={[mm(SAMPLE_LABEL_MM.w), mm(SAMPLE_LABEL_MM.h)]}
            style={{ fontFamily: 'Noto Sans', color: '#000', paddingHorizontal: mm(PAD), paddingVertical: mm(1.1) }}>
            {/* Two identifiers first: name + UHID, then age/sex */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: mm(3.1) }}>
              <Text style={{ flex: 1, fontSize: fitFontPt(data.patient.full_name, data.priority === 'stat' ? 39 : 47, 7.5, 5.5), fontWeight: 700, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>
                {data.patient.full_name.toUpperCase()}
              </Text>
              {data.priority === 'stat' ? (
                <Text style={{ fontSize: 6, fontWeight: 700, lineHeight: 1.1, color: '#fff', backgroundColor: '#000', paddingHorizontal: 2, marginLeft: 3 }}>STAT</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', height: mm(2.6) }}>
              <Text style={{ flex: 1, fontSize: 6.5, fontWeight: 600, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>{data.patient.uhid}</Text>
              <Text style={{ fontSize: 6.5, fontWeight: 600, lineHeight: 1.1, marginLeft: 3 }}>{ageSex(data.patient.dob, data.patient.gender) ?? ''}</Text>
            </View>

            <View style={{ alignItems: 'center', marginTop: mm(0.5) }}>
              <Code128 value={code} heightMm={BAR_H} xMm={xMm} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: mm(0.3), height: mm(2.9) }}>
              <Text style={{ fontSize: 7, fontWeight: 700, lineHeight: 1.1, letterSpacing: 0.3 }}>{code}</Text>
              <Text style={{ flex: 1, fontSize: 6.5, fontWeight: 700, lineHeight: 1.1, textAlign: 'right', maxLines: 1, textOverflow: 'ellipsis', marginLeft: 3 }}>
                {tube.sampleType.toUpperCase()}{tube.closure ? ` · ${tube.closure.toUpperCase()}` : ''}{total > 1 ? `  ${i + 1}/${total}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', height: mm(2.3) }}>
              <Text style={{ flex: 1, fontSize: 5.5, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>{tube.tests.join(', ')}</Text>
              <Text style={{ fontSize: 5.5, lineHeight: 1.1, marginLeft: 3 }}>{[data.encounter, stamp(data.printedAt)].filter(Boolean).join('  ·  ')}</Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
