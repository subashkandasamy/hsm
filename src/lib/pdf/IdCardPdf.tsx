import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import type { TenantProfile } from '@/lib/types'
import { QrCode, mm } from './barcodes'
import { ageSex, fmtDate, registerPdfFonts, type LogoImage } from './parts'
import { realPhone } from '@/lib/patientPhone'

// CR80 — the ISO/IEC 7810 ID-1 card size (85.6 × 53.98 mm) used by PVC card
// printers and wallet card holders. The A4 layout prints the same card at
// true size with cut marks, for clinics without a card printer.
export const CARD_MM = { w: 85.6, h: 53.98 }

export interface IdCardData {
  patient: {
    full_name: string; uhid: string; dob: string | null; gender: string | null; phone: string | null
    blood_group: string | null; created_at: string
    emergency_contact_name: string | null; emergency_contact_phone: string | null
  }
  profile: TenantProfile | null
  logo: LogoImage
}

function Card({ data }: { data: IdCardData }) {
  const p = data.patient
  const h = data.profile
  const emergency = [p.emergency_contact_name, p.emergency_contact_phone].filter(Boolean).join(' · ')
  return (
    <View style={{ width: mm(CARD_MM.w), height: mm(CARD_MM.h), padding: mm(3), fontFamily: 'Noto Sans', color: '#0F172A' }}>
      {/* Hospital */}
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.75, borderBottomColor: '#0F766E', paddingBottom: mm(1.2) }}>
        {data.logo ? <Image src={data.logo} style={{ width: mm(7), height: mm(7), objectFit: 'contain', marginRight: mm(1.5) }} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, lineHeight: 1.1, maxLines: 1, textOverflow: 'ellipsis' }}>{(h?.name || 'Hospital').toUpperCase()}</Text>
          {h?.phone1 ? <Text style={{ fontSize: 5.5, color: '#475569' }}>Ph {h.phone1}{h.emergency_contact ? `  ·  Emergency ${h.emergency_contact}` : ''}</Text> : null}
        </View>
        <Text style={{ fontSize: 5, fontWeight: 700, color: '#0F766E', letterSpacing: 0.6 }}>PATIENT ID</Text>
      </View>

      {/* Patient + QR */}
      <View style={{ flexDirection: 'row', flex: 1, paddingTop: mm(1.5) }}>
        <View style={{ flex: 1, paddingRight: mm(2) }}>
          <Text style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.15, maxLines: 2, textOverflow: 'ellipsis' }}>{p.full_name}</Text>
          <Text style={{ fontSize: 9, fontWeight: 700, color: '#0F766E', marginTop: 1 }}>{p.uhid}</Text>
          <Text style={{ fontSize: 6.5, marginTop: mm(1) }}>
            {[p.dob ? `DOB ${fmtDate(p.dob)}` : null, ageSex(p.dob, p.gender)].filter(Boolean).join('  ·  ') || ' '}
          </Text>
          <Text style={{ fontSize: 6.5 }}>
            {[p.blood_group ? `Blood group ${p.blood_group}` : null, realPhone(p.phone) ? `Ph ${realPhone(p.phone)}` : null].filter(Boolean).join('  ·  ') || ' '}
          </Text>
          {emergency ? <Text style={{ fontSize: 5.5, color: '#475569', marginTop: 1, maxLines: 2, textOverflow: 'ellipsis' }}>Emergency contact: {emergency}</Text> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <QrCode value={p.uhid} sizeMm={21} margin={3} />
        </View>
      </View>

      <Text style={{ fontSize: 5, color: '#64748B' }}>Registered {fmtDate(p.created_at)}  ·  Please bring this card on every visit</Text>
    </View>
  )
}

export function IdCardPdf({ data, layout }: { data: IdCardData; layout: 'card' | 'a4' }) {
  registerPdfFonts()
  const title = `ID card ${data.patient.full_name}`
  if (layout === 'card') {
    return (
      <Document title={title} author="Uyirly" creator="Uyirly">
        <Page wrap={false} size={[mm(CARD_MM.w), mm(CARD_MM.h)]}><Card data={data} /></Page>
      </Document>
    )
  }
  // A4: card at true size, 20 mm from the top-left, with cut marks just outside each corner.
  const L = mm(20), T = mm(20), W = mm(CARD_MM.w), H = mm(CARD_MM.h), g = mm(1.5), len = mm(5)
  const mark = (x: number, y: number, horiz: boolean) => (
    <View style={{ position: 'absolute', left: x, top: y, width: horiz ? len : 0.5, height: horiz ? 0.5 : len, backgroundColor: '#64748B' }} />
  )
  return (
    <Document title={title} author="Uyirly" creator="Uyirly">
      <Page size="A4">
        <View style={{ position: 'absolute', left: L, top: T, borderWidth: 0.5, borderColor: '#CBD5E1', borderStyle: 'dashed' }}>
          <Card data={data} />
        </View>
        {mark(L - g - len, T, true)}{mark(L, T - g - len, false)}
        {mark(L + W + g, T, true)}{mark(L + W, T - g - len, false)}
        {mark(L - g - len, T + H, true)}{mark(L, T + H + g, false)}
        {mark(L + W + g, T + H, true)}{mark(L + W, T + H + g, false)}
        <Text style={{ position: 'absolute', left: L, top: T + H + mm(9), fontSize: 8, color: '#64748B', fontFamily: 'Noto Sans' }}>
          Print at 100% / Actual size (not &quot;Fit to page&quot;), then cut along the marks. Card size 85.6 × 54 mm.
        </Text>
      </Page>
    </Document>
  )
}
