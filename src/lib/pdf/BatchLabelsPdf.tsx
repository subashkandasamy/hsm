import { Document, Page, Text, View } from '@react-pdf/renderer'
import { CODE128_X_MM, DOT_MM } from '@/lib/barcode/geometry'
import { Code128, code128WidthMm, fitFontPt, mm } from './barcodes'
import { registerPdfFonts } from './parts'

// 50 × 25 mm — the same thermal roll the tube labels use, so a pharmacy that
// already has a label printer needs nothing new.
export const BATCH_LABEL_MM = { w: 50, h: 25 }

export interface BatchLabel {
  /** Our own code for this exact box — what the barcode carries. */
  labelCode: string
  brand: string
  generic: string | null
  strength: string | null
  form: string | null
  batchNo: string
  /** 'YYYY-MM-DD' */
  expiry: string
  mrp: number
  packSize: number | null
  packUnit: string | null
  storage: string | null
  copies: number
}

const PAD = 1.4
const BAR_H = 8

/** "Sept 2028" — the month is what matters on a shelf, not the day. */
function expiryText(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function BatchLabelsPdf({ labels }: { labels: BatchLabel[] }) {
  registerPdfFonts()
  // One page per sticker, repeated for however many copies were asked for.
  const pages = labels.flatMap((l) => Array.from({ length: Math.max(1, l.copies) }, () => l))

  return (
    <Document title="Stock labels" author="Uyirly" creator="Uyirly">
      {pages.map((l, i) => {
        const room = BATCH_LABEL_MM.w - PAD * 2
        // Whole printer dots only — a barcode scaled to fit prints uneven bars
        // and stops scanning.
        const xMm = code128WidthMm(l.labelCode) <= room ? CODE128_X_MM : 2 * DOT_MM
        if (code128WidthMm(l.labelCode, xMm) > room) throw new Error(`Barcode ${l.labelCode} is wider than the label`)
        const pack = l.packSize && l.packUnit ? `${l.packSize} ${l.packUnit}` : null

        return (
          // wrap={false}: a label is one sticker — overflow is clipped, never
          // spilled onto the next one.
          <Page key={`${l.labelCode}-${i}`} wrap={false} size={[mm(BATCH_LABEL_MM.w), mm(BATCH_LABEL_MM.h)]}
            style={{ fontFamily: 'Noto Sans', color: '#000', paddingHorizontal: mm(PAD), paddingVertical: mm(1.1) }}>

            {/* What it is */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', height: mm(3.2) }}>
              <Text style={{ flex: 1, fontSize: fitFontPt(l.brand, 40, 8, 5.5), fontWeight: 700, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>
                {l.brand.toUpperCase()}
              </Text>
              {l.strength ? (
                <Text style={{ fontSize: 6.5, fontWeight: 700, lineHeight: 1.1, marginLeft: 3 }}>{l.strength}</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', height: mm(2.4) }}>
              <Text style={{ flex: 1, fontSize: 5.5, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>
                {[l.generic, l.form].filter(Boolean).join(' · ')}
              </Text>
              {pack ? <Text style={{ fontSize: 5.5, lineHeight: 1.1, marginLeft: 3 }}>{pack}</Text> : null}
            </View>

            <View style={{ alignItems: 'center', marginTop: mm(0.4) }}>
              <Code128 value={l.labelCode} heightMm={BAR_H} xMm={xMm} />
            </View>

            {/* Batch and expiry: what a pharmacist checks before handing it over */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: mm(0.3), height: mm(3) }}>
              <Text style={{ flex: 1, fontSize: 7, fontWeight: 700, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>
                B: {l.batchNo}
              </Text>
              <Text style={{ fontSize: 7.5, fontWeight: 700, lineHeight: 1.1, marginLeft: 3 }}>
                EXP {expiryText(l.expiry).toUpperCase()}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', height: mm(2.4) }}>
              <Text style={{ flex: 1, fontSize: 6, fontWeight: 700, lineHeight: 1.1 }}>MRP {l.mrp.toFixed(2)}</Text>
              <Text style={{ fontSize: 5.5, lineHeight: 1.1, marginLeft: 3, maxLines: 1, textOverflow: 'ellipsis' }}>
                {l.storage ?? l.labelCode}
              </Text>
            </View>
          </Page>
        )
      })}
    </Document>
  )
}
