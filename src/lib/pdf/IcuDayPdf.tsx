import { Document, Page, Svg, Polyline, Rect, Text, View } from '@react-pdf/renderer'
import type { Admission, IcuObservation, TenantProfile } from '@/lib/types'
import type { IcuDay } from '@/app/actions/icuDay'
import { labelOf, DIETS, DVT_OPTIONS, HUMIDIFIERS, bmi } from '@/lib/round'
import { hourLabel, sheetDayWindow, sheetGrid } from '@/lib/fluids'
import { BUNDLES, BUNDLE_SHIFTS, lineDay, lineKind } from '@/lib/icuBundles'
import { noteKindLabel } from '@/lib/noteKinds'
import { ABG_COLUMNS } from '@/lib/abg'
import { hourCells, newsByHour, rowsFor } from '@/lib/icuRows'
import { registerPdfFonts, ageSex, C, s } from './parts'

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
const dm = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
const dayHead = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

const LABEL_W = 92, COL_W = 38, TOT_W = 46
const cellS = { width: COL_W, fontSize: 7, textAlign: 'center' as const, paddingVertical: 1.5, borderRightWidth: 0.4, borderRightColor: C.rule }
const labelS = { width: LABEL_W, fontSize: 7, paddingVertical: 1.5, paddingHorizontal: 3, borderRightWidth: 0.6, borderRightColor: C.muted }

function Row({ label, cells, total, bold, fill }: { label: string; cells: Array<string | number | null | undefined>; total?: string | number | null; bold?: boolean; fill?: string }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: C.rule, backgroundColor: fill }}>
      <Text style={[labelS, bold ? { fontWeight: 700 } : {}]}>{label}</Text>
      {cells.map((c, i) => <Text key={i} style={[cellS, bold ? { fontWeight: 700 } : {}]}>{c == null ? '' : String(c)}</Text>)}
      <Text style={[cellS, { width: TOT_W, fontWeight: 700 }]}>{total == null ? '' : String(total)}</Text>
    </View>
  )
}

function Trend({ label, obs, start, get, normal }: { label: string; obs: IcuObservation[]; start: number; get: (o: IcuObservation) => number | null | undefined; normal: [number, number] }) {
  const W = COL_W * 24, H = 22
  const pts = obs.map((o) => ({ x: ((new Date(o.recorded_at).getTime() - start) / 3600_000) * COL_W, v: get(o) })).filter((p): p is { x: number; v: number } => p.v != null)
  const lo = Math.min(normal[0], ...pts.map((p) => p.v)), hi = Math.max(normal[1], ...pts.map((p) => p.v)), span = hi - lo || 1
  const y = (v: number) => H - 2 - ((v - lo) / span) * (H - 4)
  return (
    <View wrap={false} style={{ flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: C.rule }}>
      <Text style={[labelS, { color: C.muted }]}>{label} trend</Text>
      <Svg width={W} height={H}>
        <Rect x={0} y={y(Math.min(normal[1], hi))} width={W} height={Math.max(0, y(Math.max(normal[0], lo)) - y(Math.min(normal[1], hi)))} fill="#0D9488" fillOpacity={0.08} />
        {pts.length > 1 ? <Polyline points={pts.map((p) => `${p.x},${y(p.v)}`).join(' ')} stroke="#0D9488" strokeWidth={1.2} fill="none" /> : null}
      </Svg>
      <Text style={[cellS, { width: TOT_W }]}>{pts.length ? String(pts[pts.length - 1].v) : ''}</Text>
    </View>
  )
}

function Box({ title, children, width }: { title: string; children: React.ReactNode; width: number }) {
  return (
    <View style={{ width, borderWidth: 0.6, borderColor: C.muted, padding: 5 }}>
      <Text style={{ fontSize: 8, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{title}</Text>
      {children}
    </View>
  )
}
const t7 = { fontSize: 7, color: C.text, lineHeight: 1.35 }

/**
 * KMCH's ICU Critical Care Chart as an A3 landscape page: the day's 24 hours
 * across, everything Uyirly recorded filled in, and space for what still goes
 * on paper (signatures). Same data as the Day sheet screen.
 */
export function IcuDayPdf({ data, admission: adm, patient, allergies, profile, icuSince }: {
  data: IcuDay; admission: Admission; profile: TenantProfile | null; allergies: string[]; icuSince: string | null
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null; blood_group: string | null }
}) {
  registerPdfFonts()
  const start = sheetDayWindow(data.day).start.getTime()
  const g = sheetGrid(data.fluids as Array<{ direction: 'intake' | 'output'; category: string; volume_ml: number; recorded_at: string }>, data.day)
  const doses = new Map<string, string[]>()
  for (const d of data.doses) {
    const h = Math.floor((new Date(d.given_at ?? d.due_at).getTime() - start) / 3600_000)
    if (h < 0 || h > 23) continue
    const arr = doses.get(d.label) ?? Array(24).fill('')
    // Letters, not ✓/✗ — the PDF font has no check marks and they printed blank.
    arr[h] += d.status === 'given' ? 'G' : d.status === 'missed' ? 'X' : d.status === 'held' ? 'H' : '•'
    doses.set(d.label, arr)
  }
  const icuDay = icuSince ? lineDay(icuSince, new Date(start + 12 * 3600_000)) : null
  const b = bmi(adm.weight_kg, adm.height_cm)
  const labDays = data.labs.days.filter((d) => d <= data.day).slice(-2)
  const labRows = data.labs.rows.filter((r) => labDays.some((d) => r.cells[d])).slice(0, 26)
  const abg = data.labs.abg.filter((a) => a.at.slice(0, 10) <= data.day).slice(-2)

  return (
    <Document title={`ICU chart ${patient.full_name} ${data.day}`} author="Uyirly" creator="Uyirly">
      <Page size="A3" orientation="landscape" style={[s.page, { paddingTop: 22, paddingBottom: 24, paddingHorizontal: 28 }]}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: C.accent, paddingBottom: 4, marginBottom: 6 }}>
          <View>
            <Text style={{ fontSize: 8, color: C.muted }}>{profile?.name ?? 'Hospital'}</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, color: C.accent, letterSpacing: 1 }}>ICU CRITICAL CARE CHART</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: 700, color: C.ink }}>{dayHead(data.day)}, 08:00 – 07:59{icuDay ? `   ·   ICU day ${icuDay}` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {([
            ['Patient', patient.full_name], ['UHID', patient.uhid], ['IP No', adm.ip_no ?? null], ['Age / Sex', ageSex(patient.dob, patient.gender)],
            ['Bed', [adm.ward?.name, adm.bed?.bed_no].filter(Boolean).join(' / ') || null], ['Consultant', adm.doctor?.full_name ?? null],
            ['Blood group', patient.blood_group], ['Weight / BMI', adm.weight_kg ? `${adm.weight_kg} kg${b ? ` · ${b}` : ''}` : null],
            ['Diet', labelOf(DIETS, adm.diet)], ['DVT', labelOf(DVT_OPTIONS, adm.dvt_prophylaxis)],
            ['Code status', adm.code_status ? adm.code_status.toUpperCase() : null], ['Ventilated', adm.on_ventilator ? 'Yes' : 'No'],
          ] as Array<[string, string | null]>).map(([k, v]) => (
            <Text key={k} style={{ fontSize: 8, marginRight: 14, marginBottom: 2 }}><Text style={{ color: C.muted }}>{k}: </Text><Text style={{ fontWeight: 700, color: C.ink }}>{v ?? '—'}</Text></Text>
          ))}
          <Text style={{ fontSize: 8, color: allergies.length ? '#B91C1C' : C.muted, fontWeight: 700 }}>Allergy: {allergies.length ? allergies.join(', ') : 'not recorded'}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {([
            ['Diagnosis', data.context.diagnosis.join('; ')],
            ['Procedure', data.context.procedures.map((p) => `${p.name} (${dm(p.at)})`).join('; ')],
            ['Referral', data.context.consults.map((x) => `${x.doctor ?? 'Consultant'}${x.status === 'requested' ? ' (requested)' : ''}`).join('; ')],
          ] as Array<[string, string]>).map(([k, v]) => (
            <Text key={k} style={{ fontSize: 8, marginRight: 18, marginBottom: 2, maxWidth: 520 }}><Text style={{ color: C.muted }}>{k}: </Text><Text style={{ fontWeight: 700, color: C.ink }}>{v || '—'}</Text></Text>
          ))}
        </View>

        {/* The 24-hour grid */}
        <View style={{ borderTopWidth: 0.6, borderTopColor: C.muted, borderLeftWidth: 0.6, borderLeftColor: C.muted }}>
          <Row label="Hour" cells={Array.from({ length: 24 }, (_, i) => hourLabel(i))} total="24 h" bold fill="#EEF2F7" />
          <Trend label="Pulse" obs={data.obs} start={start} get={(o) => o.hr} normal={[51, 90]} />
          <Trend label="Systolic" obs={data.obs} start={start} get={(o) => o.sbp} normal={[111, 219]} />
          <Trend label="SpO₂" obs={data.obs} start={start} get={(o) => o.spo2} normal={[96, 100]} />
          <Row label="NEWS2" bold cells={newsByHour(data.obs, start, !!adm.on_ventilator).map((n) => n?.score ?? null)} />
          {rowsFor(data.obs).map((r) => <Row key={r.label} label={r.label} cells={hourCells(data.obs, start, r.get).map((c) => c?.value ?? null)} />)}
          <Row label="Intake ml" bold cells={g.intake.hourly.map((v: number) => v || null)} total={g.intake.h24} fill="#F2FAF9" />
          <Row label="Output ml" bold cells={g.output.hourly.map((v: number) => v || null)} total={g.output.h24} fill="#FBF6F1" />
          <Row label="Net ml" bold cells={Array(24).fill(null)} total={g.intake.h24 - g.output.h24} />
          {[...doses.entries()].slice(0, 14).map(([label, marks]) => <Row key={label} label={label.length > 24 ? `${label.slice(0, 23)}…` : label} cells={marks} />)}
        </View>
        <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 2 }}>
          Net 6 h {g.intake.h6 - g.output.h6} ml · 12 h {g.intake.h12 - g.output.h12} ml · 24 h {g.intake.h24 - g.output.h24} ml.   Doses: G given · X missed · H held · • due. GCS: C eyes closed by swelling, T tube. Pupils: size + b/s/f reaction. CPP = MAP − ICP. Readings: latest in each hour.
        </Text>

        {/* Boxes under the grid */}
        <View style={{ flexDirection: 'row', marginTop: 8, gap: 6 }}>
          <Box title="Lines & tubes" width={250}>
            {data.lines.filter((l) => !l.removed_at || l.removed_at > data.asOf).length === 0 ? <Text style={t7}>None in place.</Text> : data.lines.filter((l) => !l.removed_at || l.removed_at > data.asOf).map((l) => (
              <Text key={l.id} style={t7}>{lineKind(l.kind).label}{l.site ? ` — ${l.site}` : ''}{l.size ? ` (${l.size})` : ''}{l.lip_level_cm != null ? `, lip ${l.lip_level_cm} cm` : ''}{l.humidifier ? `, ${labelOf(HUMIDIFIERS, l.humidifier)}` : ''}: day {lineDay(l.inserted_at, new Date(data.asOf))}</Text>
            ))}
          </Box>
          <Box title="Care bundles (done / items)" width={250}>
            <View style={{ flexDirection: 'row' }}><Text style={[t7, { width: 140, fontWeight: 700 }]}>Bundle</Text>{BUNDLE_SHIFTS.map((sh) => <Text key={sh.value} style={[t7, { width: 34, fontWeight: 700, textAlign: 'center' }]}>{sh.letter}</Text>)}</View>
            {BUNDLES.map((bd) => (
              <View key={bd.key} style={{ flexDirection: 'row' }}>
                <Text style={[t7, { width: 140 }]}>{bd.title}</Text>
                {BUNDLE_SHIFTS.map((sh) => {
                  const c = data.bundles.find((x) => x.bundle === bd.key && x.shift === sh.value)
                  return <Text key={sh.value} style={[t7, { width: 34, textAlign: 'center' }]}>{c ? `${bd.items.filter((i) => c.items[i.key]).length}/${bd.items.length}` : '—'}</Text>
                })}
              </View>
            ))}
          </Box>
          <Box title={`Labs ${labDays.map(dayHead).join(' vs ')}`} width={300}>
            {labRows.length === 0 ? <Text style={t7}>No results.</Text> : labRows.map((r) => (
              <View key={r.key} style={{ flexDirection: 'row' }}>
                <Text style={[t7, { width: 150 }]}>{r.label}</Text>
                {labDays.map((d) => <Text key={d} style={[t7, { width: 70, textAlign: 'right', fontWeight: r.cells[d]?.flag && r.cells[d]?.flag !== 'normal' ? 700 : 400 }]}>{r.cells[d]?.value ?? '–'}</Text>)}
              </View>
            ))}
            {abg.map((a) => (
              <Text key={a.orderId} style={[t7, { marginTop: 2 }]}>ABG {hm(a.at)}: {ABG_COLUMNS.map((c) => { const v = a.values[c.code] ?? (c.alt ? a.values[c.alt] : undefined); return v ? `${c.label} ${v.value}` : null }).filter(Boolean).join(', ')}{a.pf != null ? `, P/F ${a.pf}` : ''}{a.fio2 != null ? `; FiO₂ ${a.fio2}%` : ''}{a.vent ? `; ${[a.vent.mode, a.vent.vt != null ? `VT ${a.vent.vt}` : null, a.vent.rr != null ? `RR ${a.vent.rr}` : null, a.vent.ps != null || a.vent.peep != null ? `PS/PEEP ${a.vent.ps ?? '–'}/${a.vent.peep ?? '–'}` : null].filter(Boolean).join(', ')}` : ''}</Text>
            ))}
            {data.labs.cultures.map((c) => <Text key={c.orderId + c.test} style={t7}>{c.test.replace(/ and Sensitivity.*$/, '')}: {c.result ?? 'pending'}</Text>)}
          </Box>
          <Box title="Notes" width={290}>
            {data.notes.length === 0 ? <Text style={t7}>No notes.</Text> : data.notes.slice(-8).map((n) => (
              <Text key={n.id} style={t7}><Text style={{ fontWeight: 700 }}>{hm(n.created_at)} {noteKindLabel(n.kind)}{n.shift ? ` (${n.shift})` : ''}: </Text>{n.note.length > 180 ? `${n.note.slice(0, 179)}…` : n.note}</Text>
            ))}
          </Box>
        </View>

        {/* Second row: KMCH's back-side boxes */}
        <View style={{ flexDirection: 'row', marginTop: 6, gap: 6 }}>
          <Box title="IV fluids & infusions" width={300}>
            {data.context.infusions.length === 0 ? <Text style={t7}>None running.</Text> : data.context.infusions.map((f, i) => (
              <Text key={i} style={t7}>{f.kind === 'fluid' ? 'IV: ' : 'Inf: '}{f.label}{f.dilution ? ` — ${f.dilution}` : ''}{f.rate ? ` @ ${f.rate}` : ''}</Text>
            ))}
          </Box>
          <Box title="Blood transfusions / reservations" width={220}>
            {data.context.blood.length === 0 ? <Text style={t7}>None.</Text> : data.context.blood.map((b, i) => (
              <Text key={i} style={t7}>{b.component} × {b.units} — {b.status.replace('_', ' ')} ({dm(b.at)})</Text>
            ))}
          </Box>
          <Box title="Scans" width={280}>
            {data.context.scans.length === 0 ? <Text style={t7}>None.</Text> : data.context.scans.slice(-6).map((r, i) => (
              <Text key={i} style={t7}>{r.name} ({dm(r.at)}): {r.report ? (r.report.length > 120 ? `${r.report.slice(0, 119)}…` : r.report) : r.status.replace('_', ' ')}</Text>
            ))}
          </Box>
          <Box title="Wound assessment" width={290}>
            {data.context.wound ? <Text style={t7}>{dm(data.context.wound.at)} {hm(data.context.wound.at)}{data.context.wound.author ? ` · ${data.context.wound.author}` : ''}: {data.context.wound.text}</Text> : <Text style={t7}>None recorded.</Text>}
          </Box>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 }}>
          {['Duty doctor', 'Staff nurse — A', 'Staff nurse — B', 'Staff nurse — N', 'Consultant'].map((r) => (
            <View key={r} style={{ width: 190, borderTopWidth: 0.75, borderTopColor: C.muted, paddingTop: 2 }}><Text style={s.small}>{r}</Text></View>
          ))}
        </View>
      </Page>
    </Document>
  )
}
