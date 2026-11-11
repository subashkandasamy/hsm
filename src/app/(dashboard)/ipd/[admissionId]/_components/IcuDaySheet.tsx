'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Printer, Cable, ShieldCheck, FlaskConical, NotebookPen } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { getIcuDay, addLine, removeLine, saveBundle, type IcuDay } from '@/app/actions/icuDay'
import { computeNews, NEWS_BAND_STYLE } from '@/lib/earlyWarning'
import { onOxygen } from '@/lib/round'
import { hourLabel, sheetDayOf, sheetDayWindow, sheetGrid } from '@/lib/fluids'
import { BUNDLES, BUNDLE_SHIFTS, LINE_KINDS, lineDay, lineKind } from '@/lib/icuBundles'
import { shiftOf, noteKindLabel } from '@/lib/noteKinds'
import { ABG_COLUMNS } from '@/lib/abg'
import type { Admission, IcuObservation } from '@/lib/types'

const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
const dayHead = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
function toLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** The latest reading in each hour column of the sheet day. */
function byHour(obs: IcuObservation[], day: string): Array<IcuObservation | null> {
  const start = sheetDayWindow(day).start.getTime()
  const cols: Array<IcuObservation | null> = Array(24).fill(null)
  for (const o of obs) {
    const h = Math.floor((new Date(o.recorded_at).getTime() - start) / 3600_000)
    if (h >= 0 && h < 24 && (!cols[h] || o.recorded_at >= cols[h]!.recorded_at)) cols[h] = o
  }
  return cols
}

const ROWS: Array<{ label: string; get: (o: IcuObservation) => string | number | null | undefined; always?: boolean }> = [
  { label: 'Pulse', get: (o) => o.hr, always: true },
  { label: 'BP', get: (o) => (o.sbp != null ? `${o.sbp}/${o.dbp ?? '–'}` : null), always: true },
  { label: 'MAP', get: (o) => o.map },
  { label: 'CVP', get: (o) => o.cvp },
  { label: 'SpO₂', get: (o) => o.spo2, always: true },
  { label: 'Resp. rate', get: (o) => o.rr, always: true },
  { label: 'Temp °C', get: (o) => o.temp, always: true },
  { label: 'AVPU / GCS', get: (o) => o.avpu ?? (o.gcs_total != null ? `${o.gcs_total}${o.gcs_e != null ? ` (${o.gcs_e}${o.gcs_v}${o.gcs_m})` : ''}` : null) },
  { label: 'Pupils R/L', get: (o) => (o.pupil_r_mm != null || o.pupil_l_mm != null ? `${o.pupil_r_mm ?? '–'}${(o.pupil_r_react ?? '').charAt(0)}/${o.pupil_l_mm ?? '–'}${(o.pupil_l_react ?? '').charAt(0)}` : null) },
  { label: 'Power', get: (o) => ([o.power_rul, o.power_lul, o.power_rll, o.power_lll].some((x) => x != null) ? `${o.power_rul ?? '–'}${o.power_lul ?? '–'}/${o.power_rll ?? '–'}${o.power_lll ?? '–'}` : null) },
  { label: 'Vent mode', get: (o) => o.vent_mode },
  { label: 'FiO₂ / O₂', get: (o) => (o.fio2 != null ? `${o.fio2}%` : o.o2_lpm != null ? `${o.o2_lpm} L` : null) },
  { label: 'PEEP', get: (o) => o.peep },
  { label: 'PIP / Pplat', get: (o) => (o.pip != null || o.pplat != null ? `${o.pip ?? '–'}/${o.pplat ?? '–'}` : null) },
  { label: 'Sugar', get: (o) => o.glucose_mg_dl },
  { label: 'Insulin u', get: (o) => o.insulin_units },
]

/**
 * KMCH's ICU Critical Care Chart, as a screen: one day (08:00 → 07:59) at a
 * glance — the trend, every hour's readings, NEWS2, fluids, doses — and the
 * lines, bundles, labs and notes beside it. Everything is read from where it
 * was written (rounds, fluids, drug chart, lab, notes); only lines and
 * bundles are entered here.
 */
export default function IcuDaySheet({ admission: adm, canNurse }: { admission: Admission; canNurse: boolean }) {
  const [today] = useState(() => sheetDayOf(new Date()))
  const [day, setDay] = useState(today)
  const [data, setData] = useState<IcuDay | null>(null)
  const load = useCallback(() => { getIcuDay(adm.id, day).then(setData) }, [adm.id, day])
  useEffect(() => { load() }, [load])
  const open = adm.status === 'admitted'

  if (!data) return <GlassCard className="p-4"><p className="text-sm" style={{ color: '#94A3B8' }}>Loading the day…</p></GlassCard>

  const cols = byHour(data.obs, day)
  const shownRows = ROWS.filter((r) => r.always || cols.some((o) => o && r.get(o) != null && r.get(o) !== ''))
  const g = sheetGrid(data.fluids as Array<{ direction: 'intake' | 'output'; category: string; volume_ml: number; recorded_at: string }>, day)
  const start = sheetDayWindow(day).start.getTime()
  const hourOf = (iso: string) => Math.floor((new Date(iso).getTime() - start) / 3600_000)
  const doseRows = new Map<string, Array<{ h: number; mark: string; title: string }>>()
  for (const d of data.doses) {
    const at = d.given_at ?? d.due_at
    const h = hourOf(at); if (h < 0 || h > 23) continue
    const mark = d.status === 'given' ? '✓' : d.status === 'missed' ? '✗' : d.status === 'held' ? 'H' : '•'
    const title = `${d.label} — ${d.status}${d.given_at ? ` ${hm(d.given_at)}` : ` due ${hm(d.due_at)}`}${d.nurse ? ` by ${d.nurse}` : ''}${d.checker ? `, checked ${d.checker}` : ''}${d.bag_no ? `, bag ${d.bag_no}` : ''}`
    const arr = doseRows.get(d.label) ?? []; arr.push({ h, mark, title }); doseRows.set(d.label, arr)
  }
  const td = 'px-1 py-1 text-center tabular-nums whitespace-nowrap'

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Day sheet</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>08:00 → 07:59. Hover a cell for the time and who recorded it.</p>
          </div>
          <div className="flex items-center gap-1">
            <button aria-label="Previous day" onClick={() => setDay(addDays(day, -1))} className="p-1.5 rounded-lg" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer' }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium px-2" style={{ color: '#0F172A' }}>{dayHead(day)}{day === today ? ' (today)' : ''}</span>
            <button aria-label="Next day" onClick={() => setDay(addDays(day, 1))} disabled={day >= today} className="p-1.5 rounded-lg" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: day >= today ? 'not-allowed' : 'pointer', opacity: day >= today ? 0.4 : 1 }}><ChevronRight className="w-4 h-4" /></button>
            <a href={`/print/ipd/${adm.id}/icu-day/pdf?day=${day}`} target="_blank" rel="noopener"
              className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }}>
              <Printer className="w-3.5 h-3.5" /> Print A3
            </a>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
          <table className="text-[11px]" style={{ minWidth: '74rem', width: '100%' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th className="px-2 py-1.5 text-left font-semibold sticky left-0" style={{ background: '#F8FAFC', minWidth: '7rem' }}>Hour</th>
                {Array.from({ length: 24 }, (_, i) => <th key={i} className="px-1 py-1.5 font-semibold text-center">{hourLabel(i)}</th>)}
                <th className="px-2 py-1.5 font-semibold text-center" style={{ background: '#EEF2F7' }}>24 h</th>
              </tr>
            </thead>
            <tbody>
              {/* Trend rows on the same hour columns — one measure per row, its own scale */}
              {([['Pulse', (o: IcuObservation) => o.hr, [51, 90]], ['Systolic', (o: IcuObservation) => o.sbp, [111, 219]], ['SpO₂', (o: IcuObservation) => o.spo2, [96, 100]]] as const).map(([label, get, normal]) => (
                <tr key={`trend-${label}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="px-2 py-0.5 sticky left-0" style={{ background: '#fff', color: '#64748B' }}>{label} trend</td>
                  <td colSpan={24} className="p-0"><TrendLine obs={data.obs} start={start} get={get} normal={normal as readonly [number, number]} /></td>
                  <td />
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #E2E8F0' }}>
                <td className="px-2 py-1 font-semibold sticky left-0" style={{ background: '#fff', color: '#0F172A' }}>NEWS2</td>
                {cols.map((o, i) => {
                  if (!o) return <td key={i} />
                  const n = computeNews({ rr: o.rr, spo2: o.spo2, sbp: o.sbp, hr: o.hr, temp: o.temp, gcs_total: o.gcs_total, avpu: o.avpu, on_oxygen: onOxygen(o, !!adm.on_ventilator) })
                  if (!n.params) return <td key={i} />
                  return <td key={i} className={td}><span className="px-1 rounded font-bold" style={{ background: NEWS_BAND_STYLE[n.band].bg, color: NEWS_BAND_STYLE[n.band].color }}>{n.score}</span></td>
                })}
                <td />
              </tr>
              {shownRows.map((r) => (
                <tr key={r.label} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="px-2 py-1 sticky left-0" style={{ background: '#fff', color: '#334155' }}>{r.label}</td>
                  {cols.map((o, i) => {
                    const v = o ? r.get(o) : null
                    return <td key={i} className={td} title={o ? `${hm(o.recorded_at)}${o.recorder?.full_name ? ` · ${o.recorder.full_name}` : ''}` : undefined}>{v ?? ''}</td>
                  })}
                  <td />
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid #E2E8F0', background: 'rgba(13,148,136,0.04)' }}>
                <td className="px-2 py-1 font-semibold sticky left-0" style={{ background: '#F2FAF9', color: '#0F172A' }}>Intake ml</td>
                {g.intake.hourly.map((v: number, i: number) => <td key={i} className={td}>{v || ''}</td>)}
                <td className={td} style={{ fontWeight: 700 }}>{g.intake.h24}</td>
              </tr>
              <tr style={{ borderTop: '1px solid #F1F5F9', background: 'rgba(180,83,9,0.04)' }}>
                <td className="px-2 py-1 font-semibold sticky left-0" style={{ background: '#FBF6F1', color: '#0F172A' }}>Output ml</td>
                {g.output.hourly.map((v: number, i: number) => <td key={i} className={td}>{v || ''}</td>)}
                <td className={td} style={{ fontWeight: 700 }}>{g.output.h24}</td>
              </tr>
              <tr style={{ borderTop: '1px solid #F1F5F9' }}>
                <td className="px-2 py-1 font-semibold sticky left-0" style={{ background: '#fff', color: '#0F172A' }}>Net</td>
                <td colSpan={24} />
                <td className={td} style={{ fontWeight: 700, color: g.intake.h24 - g.output.h24 >= 0 ? '#0F766E' : '#92400E' }}>{g.intake.h24 - g.output.h24 > 0 ? '+' : ''}{g.intake.h24 - g.output.h24}</td>
              </tr>
              {[...doseRows.entries()].map(([label, marks]) => (
                <tr key={`dose-${label}`} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="px-2 py-1 sticky left-0 truncate" style={{ background: '#fff', color: '#334155', maxWidth: '12rem' }} title={label}>{label}</td>
                  {Array.from({ length: 24 }, (_, h) => {
                    const m = marks.filter((x) => x.h === h)
                    return <td key={h} className={td} title={m.map((x) => x.title).join('\n') || undefined}
                      style={{ color: m.some((x) => x.mark === '✗') ? '#B91C1C' : m.some((x) => x.mark === '✓') ? '#15803D' : '#94A3B8', fontWeight: 700 }}>{m.map((x) => x.mark).join('')}</td>
                  })}
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] mt-2" style={{ color: '#94A3B8' }}>Doses: ✓ given · ✗ missed · H held · • due. Pupils: size + b(risk)/s(luggish)/f(ixed). Power: RUL LUL / RLL LLL.</p>
      </GlassCard>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <LinesCard admissionId={adm.id} lines={data.lines} canEdit={canNurse && open} onChange={load} />
        <BundlesCard admissionId={adm.id} day={day} today={today} checks={data.bundles} canEdit={canNurse && open && day === today} onChange={load} />
        <LabsCard data={data} day={day} />
        <NotesCard notes={data.notes} />
      </div>
    </div>
  )
}

function TrendLine({ obs, start, get, normal }: { obs: IcuObservation[]; start: number; get: (o: IcuObservation) => number | null | undefined; normal: readonly [number, number] }) {
  const pts = obs.map((o) => ({ x: ((new Date(o.recorded_at).getTime() - start) / 3600_000) * 100, v: get(o) })).filter((p): p is { x: number; v: number } => p.v != null)
  const W = 2400, H = 34, pad = 4
  if (!pts.length) return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden />
  const lo = Math.min(normal[0], ...pts.map((p) => p.v)), hi = Math.max(normal[1], ...pts.map((p) => p.v)), span = hi - lo || 1
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="trend">
      <rect x={0} width={W} y={y(Math.min(normal[1], hi))} height={Math.max(0, y(Math.max(normal[0], lo)) - y(Math.min(normal[1], hi)))} fill="#0D9488" opacity={0.07} />
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${y(p.v)}`).join(' ')} fill="none" stroke="#0D9488" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={y(p.v)} r={3} fill={p.v < normal[0] || p.v > normal[1] ? '#DC2626' : '#0D9488'} vectorEffect="non-scaling-stroke"><title>{String(p.v)}</title></circle>)}
    </svg>
  )
}

function Card({ icon: Icon, title, children, right }: { icon: typeof Cable; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2"><Icon className="w-4 h-4" style={{ color: '#0D9488' }} /><h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</h3></div>
        {right}
      </div>
      {children}
    </GlassCard>
  )
}

function LinesCard({ admissionId, lines, canEdit, onChange }: { admissionId: string; lines: IcuDay['lines']; canEdit: boolean; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ kind: 'peripheral_iv', site: '', size: '', at: '' })
  const [removing, setRemoving] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function add() {
    setError(null)
    const r = await addLine(admissionId, { kind: f.kind, site: f.site || null, size: f.size || null, inserted_at: f.at ? new Date(f.at).toISOString() : null })
    if (!r.success) { setError(r.error); return }
    setAdding(false); setF({ kind: 'peripheral_iv', site: '', size: '', at: '' }); onChange()
  }
  async function remove(id: string) {
    setError(null)
    const r = await removeLine(id, { reason: reason || null })
    if (!r.success) { setError(r.error); return }
    setRemoving(null); setReason(''); onChange()
  }
  const active = lines.filter((l) => !l.removed_at), removed = lines.filter((l) => l.removed_at)
  return (
    <Card icon={Cable} title="Lines & tubes" right={canEdit && !adding ? <button onClick={() => setAdding(true)} className="text-xs font-semibold" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add</button> : null}>
      {adding && (
        <div className="grid gap-2 grid-cols-2 mb-3">
          <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Line type">
            {LINE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </Select>
          <Input value={f.site} placeholder="Site (e.g. R IJV)" onChange={(e) => setF({ ...f, site: e.target.value })} />
          <Input value={f.size} placeholder="Size (e.g. 7 Fr, 18G)" onChange={(e) => setF({ ...f, size: e.target.value })} />
          <Input type="datetime-local" value={f.at} max={toLocal(new Date())} onChange={(e) => setF({ ...f, at: e.target.value })} aria-label="Inserted at" />
          <div className="col-span-2 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#475569', cursor: 'pointer' }}>Cancel</button>
            <button onClick={add} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Save line</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs mb-2" style={{ color: '#DC2626' }}>{error}</p>}
      {active.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>No lines or tubes in place.</p> : (
        <div className="space-y-1.5">
          {active.map((l) => {
            const k = lineKind(l.kind), d = lineDay(l.inserted_at), long = d > k.watchDays
            return (
              <div key={l.id} className="flex items-center gap-2 flex-wrap text-xs rounded-lg px-2.5 py-1.5" style={{ background: long ? '#FFFBEB' : '#F8FAFC', border: `1px solid ${long ? '#FDE68A' : '#E2E8F0'}` }}>
                <span className="font-semibold" style={{ color: '#0F172A' }}>{k.label}</span>
                <span style={{ color: '#64748B' }}>{[l.site, l.size].filter(Boolean).join(' · ')}</span>
                <span className="px-1.5 py-0.5 rounded-md font-bold" style={{ background: long ? '#FEF3C7' : 'rgba(13,148,136,0.08)', color: long ? '#92400E' : '#0F766E' }} title={long ? `Over ${k.watchDays} days — review` : undefined}>Day {d}</span>
                {canEdit && (removing === l.id ? (
                  <span className="flex items-center gap-1 ml-auto">
                    <Input value={reason} placeholder="Reason" onChange={(e) => setReason(e.target.value)} style={{ width: '9rem', minHeight: '30px', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} />
                    <button onClick={() => remove(l.id)} className="px-2 py-1 rounded-md font-semibold" style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>Remove</button>
                    <button onClick={() => setRemoving(null)} className="px-2 py-1 rounded-md" style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Keep</button>
                  </span>
                ) : <button onClick={() => { setRemoving(l.id); setReason('') }} className="ml-auto" style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>Remove…</button>)}
              </div>
            )
          })}
        </div>
      )}
      {removed.length > 0 && (
        <p className="text-[11px] mt-2" style={{ color: '#94A3B8' }}>
          Removed: {removed.map((l) => `${lineKind(l.kind).label}${l.site ? ` (${l.site})` : ''} ${hm(l.removed_at!)}${l.removal_reason ? ` — ${l.removal_reason}` : ''}`).join('; ')}
        </p>
      )}
    </Card>
  )
}

function BundlesCard({ admissionId, day, today, checks, canEdit, onChange }: { admissionId: string; day: string; today: string; checks: IcuDay['bundles']; canEdit: boolean; onChange: () => void }) {
  const [shift, setShift] = useState<string>(() => (day === today ? shiftOf(new Date()) : 'morning'))
  const saved = (bundle: string) => checks.find((c) => c.shift === shift && c.bundle === bundle)
  const [ticks, setTicks] = useState<Record<string, Record<string, boolean>>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const itemsOf = (bundle: string) => ticks[`${shift}:${bundle}`] ?? saved(bundle)?.items ?? {}
  async function save(bundle: string) {
    setMsg(null)
    const r = await saveBundle(admissionId, { sheet_day: day, shift, bundle, items: itemsOf(bundle) })
    if (!r.success) { setMsg(r.error); return }
    onChange()
  }
  return (
    <Card icon={ShieldCheck} title="Care bundles" right={
      <div className="flex gap-1">
        {BUNDLE_SHIFTS.map((s) => (
          <button key={s.value} onClick={() => setShift(s.value)} className="w-7 h-7 rounded-lg text-xs font-bold"
            style={shift === s.value ? { background: '#0D9488', color: '#fff', border: 'none' } : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}
            title={s.value}>{s.letter}</button>
        ))}
      </div>
    }>
      <div className="space-y-3">
        {BUNDLES.map((b) => {
          const items = itemsOf(b.key), done = b.items.filter((i) => items[i.key]).length, sv = saved(b.key)
          return (
            <div key={b.key}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold" style={{ color: '#0F172A' }}>{b.title}{b.appliesTo ? <span className="font-normal" style={{ color: '#94A3B8' }}> · {b.appliesTo}</span> : null}</p>
                <span className="text-[11px]" style={{ color: done === b.items.length ? '#15803D' : '#94A3B8' }}>
                  {done}/{b.items.length}{sv ? ` · ${sv.checker?.full_name ?? ''} ${hm(sv.checked_at)}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {b.items.map((i) => (
                  <label key={i.key} className="flex items-center gap-1.5 text-[11px]" style={{ color: '#334155' }}>
                    <input type="checkbox" disabled={!canEdit} checked={!!items[i.key]} style={{ accentColor: '#0D9488' }}
                      onChange={(e) => setTicks((t) => ({ ...t, [`${shift}:${b.key}`]: { ...items, [i.key]: e.target.checked } }))} />
                    {i.label}
                  </label>
                ))}
              </div>
              {canEdit && <button onClick={() => save(b.key)} className="mt-1 text-[11px] font-semibold" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>Sign {b.title.split(' (')[0]}</button>}
            </div>
          )
        })}
        {msg && <p className="text-xs" style={{ color: '#DC2626' }}>{msg}</p>}
        {!canEdit && day !== today && <p className="text-[11px]" style={{ color: '#94A3B8' }}>Bundles are signed on the day itself.</p>}
      </div>
    </Card>
  )
}

function LabsCard({ data, day }: { data: IcuDay; day: string }) {
  const days = data.labs.days.filter((d) => d <= day).slice(-2)
  const rows = data.labs.rows.filter((r) => days.some((d) => r.cells[d]))
  const abg = [...data.labs.abg].filter((a) => sheetDayOf(a.at) <= day).pop()
  return (
    <Card icon={FlaskConical} title="Labs">
      {rows.length ? (
        <table className="w-full text-[11px] mb-3">
          <thead><tr style={{ color: '#475569' }}><th className="text-left font-semibold py-1">Test</th>{days.map((d) => <th key={d} className="text-right font-semibold py-1">{dayHead(d)}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td className="py-1" style={{ color: '#334155' }}>{r.label}</td>
                {days.map((d) => { const c = r.cells[d]; return <td key={d} className="py-1 text-right tabular-nums" style={{ color: c?.flag === 'high' || c?.flag === 'critical_high' ? '#B91C1C' : c?.flag === 'low' || c?.flag === 'critical_low' ? '#1D4ED8' : '#0F172A', fontWeight: c?.flag && c.flag !== 'normal' ? 700 : 400 }}>{c?.value ?? '–'}</td> })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>No results on these days.</p>}
      {abg && (
        <p className="text-[11px] mb-2" style={{ color: '#334155' }}>
          <b>Blood gas {hm(abg.at)}:</b> {ABG_COLUMNS.map((c) => { const v = abg.values[c.code] ?? (c.alt ? abg.values[c.alt] : undefined); return v ? `${c.label} ${v.value}` : null }).filter(Boolean).join(' · ')}{abg.pf != null ? ` · P/F ${abg.pf}` : ''}
        </p>
      )}
      {data.labs.cultures.length > 0 && (
        <p className="text-[11px] mb-1" style={{ color: '#334155' }}><b>Cultures:</b> {data.labs.cultures.map((c) => `${c.test.replace(/ and Sensitivity.*$/, '')} — ${c.result ? 'reported' : 'pending'}`).join('; ')}</p>
      )}
      {data.labs.upcoming.length > 0 && (
        <p className="text-[11px]" style={{ color: '#334155' }}><b>Booked:</b> {data.labs.upcoming.map((u) => `${dayHead(u.on)} ${u.tests}`).join('; ')}</p>
      )}
    </Card>
  )
}

function NotesCard({ notes }: { notes: IcuDay['notes'] }) {
  return (
    <Card icon={NotebookPen} title="Notes this day">
      {notes.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>No notes on this day.</p> : (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {notes.map((n) => (
            <div key={n.id} className="text-xs">
              <p style={{ color: '#0D9488' }}><b>{hm(n.created_at)}</b> · {noteKindLabel(n.kind)}{n.shift ? ` (${n.shift})` : ''}{n.author ? ` · ${n.author}` : ''}</p>
              <p className="whitespace-pre-wrap" style={{ color: '#0F172A' }}>{n.note}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
