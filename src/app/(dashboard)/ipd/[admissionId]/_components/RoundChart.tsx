'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Droplet, Plus, Save, Trash2 } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { recordIcuObservation, listIcuObservations } from '@/app/actions/icu'
import { saveInsulinScale } from '@/app/actions/round'
import IntakeOutputSheet from './IntakeOutputSheet'
import { computeNews, NEWS_BAND_STYLE, type NewsResult } from '@/lib/earlyWarning'
import { AVPU, O2_DEVICES, labelOf, onOxygen, scaleDose, scaleProblem, type ScaleRow } from '@/lib/round'
import type { Admission, IcuObservation } from '@/lib/types'

function toLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const dayHm = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

function newsOf(o: Pick<IcuObservation, 'rr' | 'spo2' | 'sbp' | 'hr' | 'temp' | 'gcs_total' | 'avpu' | 'o2_device' | 'o2_lpm' | 'fio2'>, ventilated: boolean): NewsResult {
  return computeNews({ rr: o.rr, spo2: o.spo2, sbp: o.sbp, hr: o.hr, temp: o.temp, gcs_total: o.gcs_total, avpu: o.avpu, on_oxygen: onOxygen(o, ventilated) })
}

function NewsChip({ n }: { n: NewsResult }) {
  if (n.params === 0) return <span style={{ color: '#94A3B8' }}>—</span>
  const s = NEWS_BAND_STYLE[n.band]
  return <span className="px-1.5 py-0.5 rounded-md text-xs font-bold" style={{ background: s.bg, color: s.color }}>{n.score}</span>
}

/**
 * The Chart tab: the nurse's round for every patient (one save fills the
 * vitals chart, the early-warning score, the sugar chart and the ICU flow
 * sheet — the same icu_observations row), the last two days as small charts,
 * and the sugar–insulin chart with the doctor's sliding scale.
 */
export default function RoundChart({ admission: adm, canNurse, canDoctor, onRoundSaved, onScaleSaved }: {
  admission: Admission
  canNurse: boolean
  canDoctor: boolean
  onRoundSaved: () => void
  onScaleSaved: (scale: ScaleRow[] | null, type: string | null) => void
}) {
  const [obs, setObs] = useState<IcuObservation[]>([])
  // "Now" for the 48-hour window, taken when the readings load — never read during render.
  const [now, setNow] = useState(() => Date.now())
  const load = useCallback(() => { listIcuObservations(adm.id, 96).then((o) => { setObs(o); setNow(Date.now()) }) }, [adm.id])
  useEffect(() => { load() }, [load])
  const ventilated = !!adm.on_ventilator
  const open = adm.status === 'admitted'

  return (
    <div className="space-y-4">
      {canNurse && open && (
        <RoundForm admission={adm} ventilated={ventilated} onSaved={() => { load(); onRoundSaved() }} />
      )}
      <VitalsCharts obs={obs} now={now} />
      <RoundsTable obs={obs} ventilated={ventilated} />
      <SugarChart admission={adm} obs={obs} canDoctor={canDoctor && open} onScaleSaved={onScaleSaved} />
      <IntakeOutputSheet admissionId={adm.id} canWrite={canNurse} />
    </div>
  )
}

// ── The round form ────────────────────────────────────────────────────────────

const NUM_FIELDS: Array<{ key: string; label: string; step?: boolean }> = [
  { key: 'hr', label: 'Pulse' }, { key: 'sbp', label: 'BP sys' }, { key: 'dbp', label: 'BP dia' },
  { key: 'rr', label: 'Resp. rate' }, { key: 'spo2', label: 'SpO₂ %' }, { key: 'temp', label: 'Temp °C', step: true },
]

function RoundForm({ admission: adm, ventilated, onSaved }: { admission: Admission; ventilated: boolean; onSaved: () => void }) {
  const blank = () => ({ at: toLocal(new Date()), hr: '', sbp: '', dbp: '', rr: '', spo2: '', temp: '', avpu: '', o2_device: '', o2_lpm: '', glucose: '', glucose_source: 'capillary', insulin: '', insulin_type: adm.insulin_scale_type ?? '', notes: '' })
  const [f, setF] = useState<Record<string, string>>(blank)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const n = (v: string) => (v.trim() === '' ? null : Number(v))

  const preview = newsOf({
    hr: n(f.hr), sbp: n(f.sbp), rr: n(f.rr), spo2: n(f.spo2), temp: n(f.temp), gcs_total: null,
    avpu: f.avpu || null, o2_device: f.o2_device || null, o2_lpm: n(f.o2_lpm), fio2: null,
  }, ventilated)
  const suggested = scaleDose(adm.insulin_scale, n(f.glucose))

  async function save() {
    const vals = { hr: n(f.hr), sbp: n(f.sbp), dbp: n(f.dbp), rr: n(f.rr), spo2: n(f.spo2), temp: n(f.temp), o2_lpm: n(f.o2_lpm), glucose: n(f.glucose), insulin: n(f.insulin) }
    if (Object.values(vals).some((v) => v != null && Number.isNaN(v))) { setMsg({ ok: false, text: 'Enter numbers only' }); return }
    const int = (v: number | null) => (v == null ? null : Math.round(v))
    const payload = {
      recorded_at: f.at ? new Date(f.at).toISOString() : null,
      hr: int(vals.hr), sbp: int(vals.sbp), dbp: int(vals.dbp), rr: int(vals.rr), spo2: int(vals.spo2), temp: vals.temp,
      avpu: f.avpu || null, o2_device: f.o2_device || null, o2_lpm: vals.o2_lpm,
      glucose_mg_dl: int(vals.glucose), glucose_source: vals.glucose != null ? f.glucose_source : null,
      insulin_units: vals.insulin, insulin_type: vals.insulin != null ? (f.insulin_type.trim() || null) : null,
      notes: f.notes.trim() || null,
    }
    if (Object.entries(payload).every(([k, v]) => k === 'recorded_at' || k === 'glucose_source' || v == null)) {
      setMsg({ ok: false, text: 'Nothing to save — enter at least one reading' }); return
    }
    setSaving(true); setMsg(null)
    const r = await recordIcuObservation(adm.id, payload)
    setSaving(false)
    if (!r.success) { setMsg({ ok: false, text: r.error }); return }
    setF(blank()); setMsg({ ok: true, text: 'Round saved' })
    onSaved()
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <Activity className="w-4 h-4 mt-0.5" style={{ color: '#0D9488' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Record round</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>One entry fills the chart, NEWS2 and the sugar chart</p>
          </div>
        </div>
        {preview.params > 0 && (
          <span className="px-2 py-1 rounded-lg text-xs font-bold" style={{ background: NEWS_BAND_STYLE[preview.band].bg, color: NEWS_BAND_STYLE[preview.band].color }}>
            NEWS2 {preview.score} · {NEWS_BAND_STYLE[preview.band].label}
          </span>
        )}
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {NUM_FIELDS.map((x) => (
          <FormField key={x.key} label={x.label}>
            <Input inputMode={x.step ? 'decimal' : 'numeric'} value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })} />
          </FormField>
        ))}
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mt-3">
        <FormField label="AVPU">
          <Select value={f.avpu} onChange={(e) => setF({ ...f, avpu: e.target.value })}>
            <option value="">—</option>
            {AVPU.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Oxygen">
          <Select value={f.o2_device} onChange={(e) => setF({ ...f, o2_device: e.target.value })}>
            <option value="">—</option>
            {O2_DEVICES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </FormField>
        <FormField label="O₂ L/min">
          <Input inputMode="decimal" value={f.o2_lpm} onChange={(e) => setF({ ...f, o2_lpm: e.target.value })} />
        </FormField>
        <FormField label="Time">
          <Input type="datetime-local" value={f.at} max={toLocal(new Date())} onChange={(e) => setF({ ...f, at: e.target.value })} />
        </FormField>
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mt-3">
        <FormField label="Blood sugar mg/dl">
          <Input inputMode="numeric" value={f.glucose} onChange={(e) => setF({ ...f, glucose: e.target.value })} />
        </FormField>
        <FormField label="Sugar from">
          <Select value={f.glucose_source} onChange={(e) => setF({ ...f, glucose_source: e.target.value })}>
            <option value="capillary">GRBS (finger prick)</option><option value="venous">Venous</option><option value="lab">Lab</option>
          </Select>
        </FormField>
        <FormField label="Insulin given (units)">
          <Input inputMode="decimal" value={f.insulin} placeholder={suggested != null ? `Scale: ${suggested}` : ''} onChange={(e) => setF({ ...f, insulin: e.target.value })} />
        </FormField>
        <FormField label="Insulin">
          <Input value={f.insulin_type} placeholder="e.g. Actrapid" onChange={(e) => setF({ ...f, insulin_type: e.target.value })} />
        </FormField>
      </div>
      {suggested != null && f.insulin === '' && (
        <button type="button" onClick={() => setF({ ...f, insulin: String(suggested) })}
          className="mt-2 text-xs font-semibold" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
          Sliding scale gives {suggested} units for {f.glucose} mg/dl — use it
        </button>
      )}
      <FormField label="Note">
        <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional" />
      </FormField>
      <div className="flex items-center justify-end gap-3 mt-3">
        {msg && <span className="text-xs" style={{ color: msg.ok ? '#15803D' : '#DC2626' }}>{msg.text}</span>}
        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}>
          <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save round'}
        </button>
      </div>
    </GlassCard>
  )
}

// ── Small multiples: one chart per measure, its own axis ──────────────────────

const SERIES: Array<{ key: 'hr' | 'sbp' | 'spo2' | 'temp' | 'rr'; label: string; unit: string; normal: [number, number] }> = [
  // The normal band is NEWS2's zero-score range for that measure.
  { key: 'hr', label: 'Pulse', unit: '/min', normal: [51, 90] },
  { key: 'sbp', label: 'Systolic BP', unit: 'mmHg', normal: [111, 219] },
  { key: 'spo2', label: 'SpO₂', unit: '%', normal: [96, 100] },
  { key: 'rr', label: 'Resp. rate', unit: '/min', normal: [12, 20] },
  { key: 'temp', label: 'Temperature', unit: '°C', normal: [36.1, 38] },
]

function VitalsCharts({ obs, now }: { obs: IcuObservation[]; now: number }) {
  const since = now - 48 * 3600_000
  const rows = useMemo(() => [...obs].filter((o) => new Date(o.recorded_at).getTime() >= since).reverse(), [obs, since])
  if (!rows.length) {
    return <GlassCard className="p-4"><p className="text-sm" style={{ color: '#94A3B8' }}>No readings in the last 48 hours — the chart starts with the first round.</p></GlassCard>
  }
  return (
    <GlassCard className="p-4">
      <h2 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>Last 48 hours</h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {SERIES.map((s) => <Spark key={s.key} s={s} rows={rows} since={since} now={now} />)}
      </div>
    </GlassCard>
  )
}

function Spark({ s, rows, since, now }: { s: (typeof SERIES)[number]; rows: IcuObservation[]; since: number; now: number }) {
  const pts = rows.filter((o) => o[s.key] != null).map((o) => ({ t: new Date(o.recorded_at).getTime(), v: Number(o[s.key]), at: o.recorded_at }))
  const W = 300, H = 72, pad = 6
  const lo = Math.min(s.normal[0], ...pts.map((p) => p.v)), hi = Math.max(s.normal[1], ...pts.map((p) => p.v))
  const span = hi - lo || 1
  const x = (t: number) => pad + ((t - since) / (now - since)) * (W - 2 * pad)
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad)
  const last = pts[pts.length - 1]
  const out = last && (last.v < s.normal[0] || last.v > s.normal[1])
  return (
    <div className="rounded-xl p-2.5" style={{ border: '1px solid #E2E8F0', background: '#fff' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium" style={{ color: '#475569' }}>{s.label}</span>
        <span className="text-sm font-bold" style={{ color: out ? '#B91C1C' : '#0F172A' }}>{last ? `${last.v} ${s.unit}` : '—'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${s.label} over 48 hours`}>
        <rect x={pad} width={W - 2 * pad} y={y(Math.min(s.normal[1], hi))} height={Math.max(0, y(Math.max(s.normal[0], lo)) - y(Math.min(s.normal[1], hi)))} fill="#0D9488" opacity={0.07} />
        {pts.length > 1 && (
          <polyline points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke="#0D9488" strokeWidth={2} strokeLinejoin="round" />
        )}
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.v)} r={4} fill={p.v < s.normal[0] || p.v > s.normal[1] ? '#DC2626' : '#0D9488'} stroke="#fff" strokeWidth={2}>
            <title>{`${s.label} ${p.v} ${s.unit} — ${dayHm(p.at)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px]" style={{ color: '#94A3B8' }}>
        <span>48 h ago</span><span>{pts.length} reading{pts.length === 1 ? '' : 's'}</span><span>now</span>
      </div>
    </div>
  )
}

// ── Every round ──────────────────────────────────────────────────────────────

function RoundsTable({ obs, ventilated }: { obs: IcuObservation[]; ventilated: boolean }) {
  if (!obs.length) return null
  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: '52rem' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              {['Time', 'NEWS2', 'Pulse', 'BP', 'RR', 'SpO₂', 'O₂', 'Temp', 'AVPU / GCS', 'Sugar', 'Insulin', 'By'].map((h) => (
                <th key={h} className="text-left px-2.5 py-2 font-semibold" style={{ color: '#475569' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {obs.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: '#475569' }}>{dayHm(o.recorded_at)}</td>
                <td className="px-2.5 py-1.5"><NewsChip n={newsOf(o, ventilated)} /></td>
                <td className="px-2.5 py-1.5">{o.hr ?? '—'}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{o.sbp != null ? `${o.sbp}/${o.dbp ?? '—'}` : '—'}</td>
                <td className="px-2.5 py-1.5">{o.rr ?? '—'}</td>
                <td className="px-2.5 py-1.5">{o.spo2 ?? '—'}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{o.o2_device ? `${labelOf(O2_DEVICES, o.o2_device)}${o.o2_lpm ? ` ${o.o2_lpm} L` : ''}` : o.fio2 ? `FiO₂ ${o.fio2}%` : '—'}</td>
                <td className="px-2.5 py-1.5">{o.temp ?? '—'}</td>
                <td className="px-2.5 py-1.5">{o.avpu ?? (o.gcs_total != null ? `GCS ${o.gcs_total}` : '—')}</td>
                <td className="px-2.5 py-1.5">{o.glucose_mg_dl ?? '—'}</td>
                <td className="px-2.5 py-1.5 whitespace-nowrap">{o.insulin_units != null ? `${o.insulin_units} u${o.insulin_type ? ` ${o.insulin_type}` : ''}` : '—'}</td>
                <td className="px-2.5 py-1.5" style={{ color: '#94A3B8' }}>{o.recorder?.full_name ?? (o.notes?.startsWith('On arrival') ? 'Initial Evaluation' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

// ── Sugar–insulin chart and the sliding scale ─────────────────────────────────

function SugarChart({ admission: adm, obs, canDoctor, onScaleSaved }: {
  admission: Admission; obs: IcuObservation[]; canDoctor: boolean; onScaleSaved: (s: ScaleRow[] | null, t: string | null) => void
}) {
  const readings = obs.filter((o) => o.glucose_mg_dl != null || o.insulin_units != null)
  const [rows, setRows] = useState<Array<{ from: string; to: string; units: string }>>(
    (adm.insulin_scale ?? []).map((r) => ({ from: String(r.from), to: String(r.to), units: String(r.units) })),
  )
  const [type, setType] = useState(adm.insulin_scale_type ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    const parsed: ScaleRow[] = rows.filter((r) => r.from || r.to || r.units).map((r) => ({ from: Number(r.from), to: Number(r.to), units: Number(r.units) }))
    if (parsed.some((r) => [r.from, r.to, r.units].some((v) => Number.isNaN(v)))) { setMsg({ ok: false, text: 'Enter numbers only' }); return }
    const problem = scaleProblem(parsed)
    if (problem) { setMsg({ ok: false, text: problem }); return }
    setSaving(true); setMsg(null)
    const r = await saveInsulinScale(adm.id, { type: type || null, rows: parsed })
    setSaving(false)
    if (!r.success) { setMsg({ ok: false, text: r.error }); return }
    setMsg({ ok: true, text: parsed.length ? 'Scale saved' : 'Scale removed' }); setEditing(false)
    onScaleSaved(parsed.length ? [...parsed].sort((a, b) => a.from - b.from) : null, parsed.length ? type || null : null)
  }

  const scale = adm.insulin_scale ?? []
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <Droplet className="w-4 h-4 mt-0.5" style={{ color: '#0D9488' }} />
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Sugar &amp; insulin</h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Readings come from the rounds</p>
          </div>
        </div>
        {canDoctor && !editing && (
          <button onClick={() => { setEditing(true); if (!rows.length) setRows([{ from: '', to: '', units: '' }]) }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)', cursor: 'pointer' }}>
            {scale.length ? 'Edit sliding scale' : 'Set sliding scale'}
          </button>
        )}
      </div>

      {!editing && (scale.length ? (
        <div className="mb-3 rounded-xl p-2.5 text-xs" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#334155' }}>
          <span className="font-semibold">Sliding scale{adm.insulin_scale_type ? ` — ${adm.insulin_scale_type}` : ''}: </span>
          {scale.map((r) => `${r.from}–${r.to} → ${r.units} u`).join(' · ')}
        </div>
      ) : <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>No sliding scale for this patient.</p>)}

      {editing && (
        <div className="mb-3 space-y-2">
          <FormField label="Insulin">
            <Input value={type} placeholder="e.g. Actrapid (regular)" onChange={(e) => setType(e.target.value)} />
          </FormField>
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#475569' }}>
              <Input inputMode="numeric" value={r.from} placeholder="from" style={{ width: '5.5rem' }} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
              <span>to</span>
              <Input inputMode="numeric" value={r.to} placeholder="to" style={{ width: '5.5rem' }} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
              <span>mg/dl →</span>
              <Input inputMode="decimal" value={r.units} placeholder="units" style={{ width: '5rem' }} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, units: e.target.value } : x)))} />
              <span>units</span>
              <button type="button" aria-label="Remove band" onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="p-1.5 rounded-lg" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setRows([...rows, { from: '', to: '', units: '' }])}
              className="flex items-center gap-1 text-xs font-semibold" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3.5 h-3.5" /> Add band
            </button>
            <button onClick={save} disabled={saving} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {saving ? 'Saving…' : 'Save scale'}
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs mb-2" style={{ color: msg.ok ? '#15803D' : '#DC2626' }}>{msg.text}</p>}

      {readings.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr style={{ borderBottom: '1px solid #E2E8F0' }}>
              {['Time', 'Sugar mg/dl', 'From', 'Scale says', 'Insulin given'].map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {readings.map((o) => {
                const says = scaleDose(scale, o.glucose_mg_dl)
                const differs = says != null && o.insulin_units != null && Number(o.insulin_units) !== says
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{dayHm(o.recorded_at)}</td>
                    <td className="px-2 py-1.5 font-semibold" style={{ color: o.glucose_mg_dl != null && (o.glucose_mg_dl < 70 || o.glucose_mg_dl > 250) ? '#B91C1C' : '#0F172A' }}>{o.glucose_mg_dl ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: '#64748B' }}>{o.glucose_source === 'capillary' ? 'GRBS' : o.glucose_source ?? '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: '#64748B' }}>{says != null ? `${says} u` : '—'}</td>
                    <td className="px-2 py-1.5" style={{ color: differs ? '#B45309' : '#0F172A' }}>
                      {o.insulin_units != null ? `${o.insulin_units} u${o.insulin_type ? ` ${o.insulin_type}` : ''}` : '—'}{differs ? ' (differs from scale)' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs" style={{ color: '#94A3B8' }}>No sugar readings yet. Enter the blood sugar in a round.</p>}
    </GlassCard>
  )
}
