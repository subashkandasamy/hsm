// Shared building blocks for generated PDF documents (bills, summaries, reports).
// Server-only: rendered with @react-pdf/renderer inside route handlers.
//
// Why PDFs instead of browser printing: a generated PDF looks the same on every
// browser and printer — repeating header/footer and page numbers on every page,
// rows never split across pages, no browser "headers & footers" or app
// background leaking in — and it can be downloaded or shared with a TPA.

import path from 'path'
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import type { TenantProfile } from '@/lib/types'

// ── Fonts ─────────────────────────────────────────────────────────────────────
// Noto Sans (SIL Open Font License) — the built-in PDF fonts have no ₹ glyph.
let fontsRegistered = false
export function registerPdfFonts() {
  if (fontsRegistered) return
  const dir = path.join(process.cwd(), 'src/lib/pdf/fonts')
  Font.register({
    family: 'Noto Sans',
    fonts: [
      { src: path.join(dir, 'NotoSans-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'NotoSans-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(dir, 'NotoSans-Bold.ttf'), fontWeight: 700 },
    ],
  })
  // Never hyphenate words mid-line (medicine and test names read badly split).
  Font.registerHyphenationCallback((word) => [word])
  fontsRegistered = true
}

// ── Palette (print-safe: darker than the screen teal, readable on cheap printers)
export const C = {
  ink: '#0F172A',
  text: '#1E293B',
  muted: '#475569',
  faint: '#64748B',
  rule: '#CBD5E1',
  hair: '#E2E8F0',
  fill: '#F1F5F9',
  accent: '#0F766E',
  accentFill: '#E6F4F2',
  danger: '#B91C1C',
  ok: '#15803D',
}

export const s = StyleSheet.create({
  page: { fontFamily: 'Noto Sans', fontSize: 9, color: C.text, paddingTop: 28, paddingBottom: 46, paddingHorizontal: 32, lineHeight: 1.35 },
  row: { flexDirection: 'row' },
  small: { fontSize: 7.5, color: C.faint },
  label: { fontSize: 7, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4 },
  h1: { fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.2 },
  bold: { fontWeight: 700 },
  semi: { fontWeight: 600 },
  right: { textAlign: 'right' },
})

// ── Formatting ────────────────────────────────────────────────────────────────
export const money = (n: number) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d.length === 10 ? `${d}T00:00:00+05:30` : d)
    .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

/** "30 Jul – 16 Sep 2026" for a range, a single date when equal. */
export function fmtDateRange(from: string, to: string): string {
  if (from === to) return fmtDate(from)
  const a = new Date(`${from}T00:00:00+05:30`), b = new Date(`${to}T00:00:00+05:30`)
  const sameYear = a.getFullYear() === b.getFullYear()
  const left = a.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'Asia/Kolkata' })
  return `${left} – ${fmtDate(to)}`
}

export function ageSex(dob: string | null | undefined, gender: string | null | undefined): string | null {
  const parts: string[] = []
  if (dob) {
    const d = new Date(dob), now = new Date()
    let years = now.getFullYear() - d.getFullYear()
    if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) years--
    parts.push(years >= 1 ? `${years} Y` : `${Math.max(0, Math.floor((now.getTime() - d.getTime()) / 2629800000))} M`)
  }
  if (gender) parts.push(gender[0].toUpperCase() + gender.slice(1))
  return parts.length ? parts.join(' / ') : null
}

export type LogoImage = { data: Buffer; format: 'png' | 'jpg' } | null

/** Fetches the hospital logo for embedding; PDFs support PNG/JPEG only. */
export async function loadLogo(url: string | null | undefined): Promise<LogoImage> {
  if (!url) return null
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    const format = type.includes('png') ? 'png' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : null
    if (!format) return null
    const raw = Buffer.from(await res.arrayBuffer())
    // Uploaded logos are often large photos; the PDF only needs ~2x its 54pt box.
    try {
      const sharp = (await import('sharp')).default
      const data = await sharp(raw).resize(240, 240, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
      return { data, format: 'png' }
    } catch {
      return { data: raw, format }
    }
  } catch {
    return null
  }
}

// ── Letterhead ────────────────────────────────────────────────────────────────
export function Letterhead({ profile, fallbackName, logo }: { profile: TenantProfile | null; fallbackName: string; logo: LogoImage }) {
  const p = profile
  const address = [p?.address_line1, p?.address_line2, [p?.city, p?.state].filter(Boolean).join(', '), p?.pincode].filter(Boolean).join(', ')
  const contact = [p?.phone1 && `Ph: ${p.phone1}`, p?.phone2, p?.email, p?.website].filter(Boolean).join('  ·  ')
  const legal = [p?.gst_no && `GSTIN: ${p.gst_no}`, p?.cin_no && `CIN: ${p.cin_no}`].filter(Boolean).join('  ·  ')
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: C.accent }}>
      {logo ? <Image src={logo} style={{ width: 54, height: 54, objectFit: 'contain', marginRight: 12 }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={s.h1}>{(p?.name || fallbackName).toUpperCase()}</Text>
        {(p?.tagline || p?.tagline2) ? <Text style={{ fontSize: 8, color: C.accent, fontWeight: 600, marginTop: 2 }}>{[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}</Text> : null}
        {address ? <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{address}</Text> : null}
        {contact ? <Text style={{ fontSize: 8, color: C.muted }}>{contact}</Text> : null}
        {legal ? <Text style={{ fontSize: 8, color: C.muted }}>{legal}</Text> : null}
      </View>
    </View>
  )
}

/** Document title band with the document number/date on the right. */
export function TitleBand({ title, subtitle, numberLabel, number, date }: { title: string; subtitle?: string | null; numberLabel: string; number: string; date: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.accentFill, paddingVertical: 6, paddingHorizontal: 10, marginTop: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: 1.2 }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 7.5, color: C.muted }}>{subtitle}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 9.5, fontWeight: 700, color: C.ink }}>{numberLabel}: {number}</Text>
        <Text style={{ fontSize: 8, color: C.muted }}>{date}</Text>
      </View>
    </View>
  )
}

/** Two-column label/value details block. Empty values are skipped. */
export function InfoGrid({ items }: { items: Array<[string, string | null | undefined]> }) {
  const shown = items.filter(([, v]) => v)
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderWidth: 0.75, borderColor: C.hair, marginTop: 8 }}>
      {shown.map(([label, value], i) => (
        <View key={label} style={{ width: '50%', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: i < shown.length - (shown.length % 2 === 0 ? 2 : 1) ? 0.75 : 0, borderBottomColor: C.hair, borderRightWidth: i % 2 === 0 ? 0.75 : 0, borderRightColor: C.hair }}>
          <Text style={s.label}>{label}</Text>
          <Text style={{ fontSize: 9, fontWeight: 600, color: C.ink }}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

/** Running header (page 2+) and footer with page numbers — fixed on every page. */
export function PageChrome({ hospital, identity, docRef }: { hospital: string; identity: string; docRef: string }) {
  return (
    <>
      <View fixed style={{ position: 'absolute', top: 12, left: 32, right: 32 }} render={({ pageNumber }) => (
        pageNumber > 1 ? (
          <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: C.hair, paddingBottom: 2 }}>
            <Text style={[s.small, { flex: 1 }]}>{hospital}  ·  {identity}</Text>
            <Text style={s.small}>{docRef}</Text>
          </View>
        ) : null
      )} />
      {/* Anchored with `top`, not `bottom`: react-pdf misplaces bottom-anchored fixed
          elements on pages whose content overflows. A4 is 841.89pt tall. */}
      <View fixed style={{ position: 'absolute', top: 841.89 - 36, left: 32, right: 32, flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: C.hair, paddingTop: 4 }}>
        <Text style={[s.small, { flex: 1 }]}>Computer-generated document  ·  {docRef}  ·  Powered by Uyirly</Text>
        <Text style={s.small} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  )
}

// ── Charges table ─────────────────────────────────────────────────────────────
export interface ChargeRow {
  date?: string | null        // already formatted
  description: string
  note?: string | null        // small line under the description
  hsn?: string | null
  qty: number
  rate: number
  gstRate?: number
  amount: number
  cancelled?: boolean
}
export interface ChargeSection { label: string; rows: ChargeRow[]; subtotal: number }

export function ChargesTable({ sections, showDate, showHsn, showGst }: { sections: ChargeSection[]; showDate: boolean; showHsn: boolean; showGst: boolean }) {
  const col = {
    date: { width: 96 }, desc: { flex: 1, paddingRight: 6 }, hsn: { width: 46 }, qty: { width: 30, textAlign: 'right' as const },
    rate: { width: 62, textAlign: 'right' as const }, gst: { width: 34, textAlign: 'right' as const }, amt: { width: 70, textAlign: 'right' as const },
  }
  const Head = () => (
    <View style={{ flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: C.rule, paddingVertical: 3, paddingHorizontal: 6 }}>
      {showDate ? <Text style={[s.label, col.date]}>Date</Text> : null}
      <Text style={[s.label, col.desc]}>Description</Text>
      {showHsn ? <Text style={[s.label, col.hsn]}>HSN/SAC</Text> : null}
      <Text style={[s.label, col.qty]}>Qty</Text>
      <Text style={[s.label, col.rate]}>Rate</Text>
      {showGst ? <Text style={[s.label, col.gst]}>GST</Text> : null}
      <Text style={[s.label, col.amt]}>Amount</Text>
    </View>
  )
  const Row = ({ r }: { r: ChargeRow }) => {
    const strike = r.cancelled ? { textDecoration: 'line-through' as const, color: C.faint } : {}
    return (
      <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.hair }}>
        {showDate ? <Text style={[col.date, { color: C.muted }, strike]}>{r.date ?? ''}</Text> : null}
        <View style={col.desc}>
          <Text style={strike}>{r.description}{r.cancelled ? '  (cancelled)' : ''}</Text>
          {r.note ? <Text style={s.small}>{r.note}</Text> : null}
        </View>
        {showHsn ? <Text style={[col.hsn, { color: C.muted }, strike]}>{r.hsn || '—'}</Text> : null}
        <Text style={[col.qty, strike]}>{r.qty}</Text>
        <Text style={[col.rate, strike]}>{money(r.rate)}</Text>
        {showGst ? <Text style={[col.gst, { color: C.muted }, strike]}>{(r.gstRate ?? 0) > 0 ? `${r.gstRate}%` : '—'}</Text> : null}
        <Text style={[col.amt, { fontWeight: 600 }, strike]}>{money(r.amount)}</Text>
      </View>
    )
  }
  return (
    <View style={{ marginTop: 10 }}>
      {sections.map((sec) => {
        const heading = (
          <>
            <View style={{ backgroundColor: C.fill, paddingVertical: 3, paddingHorizontal: 6 }}>
              <Text style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: 0.8 }}>{sec.label.toUpperCase()}</Text>
            </View>
            <Head />
          </>
        )
        const total = (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 3, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 8, color: C.faint, marginRight: 10 }}>{sec.label} total</Text>
            <Text style={[col.amt, { fontWeight: 700 }]}>{money(sec.subtotal)}</Text>
          </View>
        )
        const rows = sec.rows
        const last = rows.length - 1
        // Unbreakable blocks keep the heading with the first row and the total with
        // the last row, so neither is stranded alone at a page edge.
        return (
          <View key={sec.label} style={{ marginBottom: 6 }}>
            {rows.length <= 1 ? (
              <View wrap={false}>{heading}{rows[0] ? <Row r={rows[0]} /> : null}{total}</View>
            ) : (
              <>
                <View wrap={false}>{heading}<Row r={rows[0]} /></View>
                {rows.slice(1, last).map((r, i) => <View key={i} wrap={false}><Row r={r} /></View>)}
                <View wrap={false}><Row r={rows[last]} />{total}</View>
              </>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ── Totals, words, signatures ─────────────────────────────────────────────────
export interface TotalLine { label: string; value: number; strong?: boolean; big?: boolean; rule?: boolean; tone?: 'danger' | 'ok' | 'muted'; negative?: boolean }

export function TotalsBox({ lines, left }: { lines: TotalLine[]; left?: ReactNode }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', marginTop: 8, borderTopWidth: 1.5, borderTopColor: C.accent, paddingTop: 6 }}>
      <View style={{ flex: 1, paddingRight: 16 }}>{left}</View>
      <View style={{ width: 230 }}>
        {lines.map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', paddingVertical: l.big ? 3 : 1.5, borderTopWidth: l.rule ? 0.75 : 0, borderTopColor: C.rule, marginTop: l.rule ? 3 : 0 }}>
            <Text style={{ flex: 1, fontSize: l.big ? 10 : 9, fontWeight: l.strong ? 700 : 400, color: l.tone === 'muted' ? C.faint : C.text }}>{l.label}</Text>
            <Text style={{ fontSize: l.big ? 11 : 9, fontWeight: l.strong ? 700 : 600, color: l.tone === 'danger' ? C.danger : l.tone === 'ok' ? C.ok : l.tone === 'muted' ? C.faint : C.ink }}>
              {l.negative ? '− ' : ''}{money(Math.abs(l.value))}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function AmountInWords({ words }: { words: string }) {
  return (
    <View wrap={false} style={{ marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: C.fill }}>
      <Text><Text style={s.label}>Amount in words:  </Text><Text style={{ fontWeight: 600 }}>{words}</Text></Text>
    </View>
  )
}

export function Signatures({ hospital, left = 'Patient / Attendant' }: { hospital: string; left?: string }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 34 }}>
      <View style={{ width: 170, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3 }}>
        <Text style={s.small}>{left}</Text>
      </View>
      <View style={{ width: 170, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 3, alignItems: 'flex-end' }}>
        <Text style={s.small}>Authorised Signatory</Text>
        <Text style={[s.small, { fontWeight: 600 }]}>for {hospital}</Text>
      </View>
    </View>
  )
}

export function A4({ title, children }: { title: string; children: ReactNode }) {
  registerPdfFonts()
  return (
    <Document title={title} author="Uyirly" creator="Uyirly">
      <Page size="A4" style={s.page} wrap>
        {children}
      </Page>
    </Document>
  )
}

/** PDF HTTP response — inline (opens in the browser's viewer) or as a download. */
export function pdfResponse(buffer: Buffer, filename: string, download: boolean): Response {
  const safe = filename.replace(/[^A-Za-z0-9._-]+/g, '_')
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safe}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
