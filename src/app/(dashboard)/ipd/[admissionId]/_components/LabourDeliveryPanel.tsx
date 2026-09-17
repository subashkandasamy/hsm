'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, Baby, CheckCircle, Clock, HeartPulse, Pencil, Plus, Save, Trash2, UserPlus } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  addPartographReading, addPostpartumCheck, deletePartographReading, getLabourContext, registerNewborn, saveDelivery,
  type DeliveryBaby, type LabourContext,
} from '@/app/actions/labour'
import { formatGa } from '@/lib/obstetrics/dating'
import { pregnancyRiskFlags, type ClinicalAlert } from '@/lib/obstetrics/alerts'
import {
  DELIVERY_MODES, DESCENT_OPTIONS, LIQUOR_OPTIONS, MOULDING_OPTIONS,
  babyAlerts, deliveryAlerts, deliveryModeLabel, isCaesarean, labourProgress, nextPostpartumCheck, partographAlerts, postpartumAlerts,
  type PartographReading,
} from '@/lib/obstetrics/labour'

interface Props {
  admissionId: string
  initial: LabourContext
  canWrite: boolean
  canNurse: boolean
}

const ACCENT = '#BE185D'
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none',
  borderRadius: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', minHeight: '40px',
}
const LEVEL: Record<ClinicalAlert['level'], { bg: string; fg: string; border: string }> = {
  severe:   { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  moderate: { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' },
  watch:    { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
}

// Times are entered and shown in IST (the hospital's clock), whatever the device's zone.
const IST = 5.5 * 3600000
const toIstInput = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 16)
const fromIstInput = (v: string) => (v ? new Date(`${v}:00+05:30`).toISOString() : '')
const nowIstInput = () => toIstInput(new Date().toISOString())
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const num = (v: string) => (v.trim() === '' ? null : Number(v))
const str = (v: number | null | undefined) => (v == null ? '' : String(v))
const triBool = (v: string) => (v === 'yes' ? true : v === 'no' ? false : null)
const cap = (v: string) => v[0].toUpperCase() + v.slice(1)
const triStr = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : '')

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>{label}</span>
      {children}
    </label>
  )
}

function Alerts({ items }: { items: ClinicalAlert[] }) {
  if (!items.length) return null
  const order = { severe: 0, moderate: 1, watch: 2 }
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {[...items].sort((a, b) => order[a.level] - order[b.level]).map((a, i) => (
        <li key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl text-sm"
          style={{ background: LEVEL[a.level].bg, color: LEVEL[a.level].fg, border: `1px solid ${LEVEL[a.level].border}` }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{a.text}</span>
        </li>
      ))}
    </ul>
  )
}

function PrimaryButton({ onClick, disabled, children, color = ACCENT }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; color?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
      style={{ background: color, color: '#fff', border: 'none', cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.7 : 1 }}>
      {children}
    </button>
  )
}

export default function LabourDeliveryPanel({ admissionId, initial, canWrite, canNurse }: Props) {
  const [ctx, setCtx] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const refresh = async () => { const next = await getLabourContext(admissionId); if (next) setCtx(next) }
  const run = (fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) => {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Something went wrong'); return }
      await refresh(); after?.()
    })
  }
  const admitted = ctx.admissionStatus === 'admitted'
  const preg = ctx.pregnancy
  const risks = preg ? [...pregnancyRiskFlags({ age: ctx.mother.age, gravida: preg.gravida, previous_caesareans: preg.previous_caesareans ?? null, bloodGroup: ctx.mother.blood_group }), ...(preg.risk_factors ?? [])] : []

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
          <HeartPulse className="w-4 h-4" style={{ color: ACCENT }} /> Labour &amp; Delivery
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            ['Gestation', ctx.delivery?.gestation_days != null ? `${formatGa(ctx.delivery.gestation_days)} at birth` : ctx.gestationToday != null ? formatGa(ctx.gestationToday) : 'Not known'],
            ['EDD', preg?.edd ? new Date(`${preg.edd}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'],
            ['G P A L', preg ? `G${preg.gravida ?? '–'} P${preg.para ?? '–'} A${preg.abortions ?? '–'} L${preg.living ?? '–'}` : '—'],
            ['Blood group', ctx.mother.blood_group ?? '—'],
          ] as const).map(([l, v]) => (
            <div key={l} className="rounded-xl px-3 py-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
              <p className="text-xs" style={{ color: '#64748B' }}>{l}</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: '#0F172A' }}>{v}</p>
            </div>
          ))}
        </div>
        {risks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>High risk:</span>
            {risks.map((r) => <span key={r} className="text-xs px-2 py-0.5 rounded-md" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>{r}</span>)}
          </div>
        )}
        {!preg && (
          <p className="text-xs mt-2" style={{ color: '#64748B' }}>No antenatal record in this hospital — enter gestation with the delivery if known.</p>
        )}
      </GlassCard>
      {error && (
        <div role="alert" className="fixed left-4 right-4 bottom-4 sm:left-auto sm:max-w-md z-50 flex items-start gap-2 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{ background: '#FEE2E2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {ctx.delivery ? (
        <>
          <DeliverySection ctx={ctx} admissionId={admissionId} canWrite={canWrite && admitted} isPending={isPending} run={run} />
          <PostpartumSection ctx={ctx} canNurse={canNurse && admitted} isPending={isPending} run={run} admissionId={admissionId} />
          {ctx.partograph.length > 0 && (
            <details className="rounded-2xl" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0' }}>
              <summary className="px-4 py-3 text-sm font-semibold cursor-pointer" style={{ color: '#334155' }}>Partograph ({ctx.partograph.length} readings)</summary>
              <div className="px-4 pb-4"><PartographSection ctx={ctx} admissionId={admissionId} canNurse={false} canWrite={false} isPending={isPending} run={run} /></div>
            </details>
          )}
        </>
      ) : (
        <>
          <PartographSection ctx={ctx} admissionId={admissionId} canNurse={canNurse && admitted} canWrite={canWrite && admitted} isPending={isPending} run={run} />
          <DeliverySection ctx={ctx} admissionId={admissionId} canWrite={canWrite && admitted} isPending={isPending} run={run} />
        </>
      )}
    </div>
  )
}

type Run = (fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) => void

// ── Partograph ─────────────────────────────────────────────────────────────────

function PartographSection({ ctx, admissionId, canNurse, canWrite, isPending, run }: {
  ctx: LabourContext; admissionId: string; canNurse: boolean; canWrite: boolean; isPending: boolean; run: Run
}) {
  const blank = { recorded_at: '', cervix_cm: '', descent: '', contractions_per10: '', contraction_duration: '', fetal_heart_rate: '', liquor: '', moulding: '', bp: '', pulse: '', temp: '', urine_protein: '', oxytocin: '', notes: '' }
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const readings = ctx.partograph
  const progress = labourProgress(readings)
  const alerts = partographAlerts(readings, { parity: ctx.parity, delivered: !!ctx.delivery })

  function save() {
    run(() => addPartographReading(admissionId, {
      recorded_at: f.recorded_at ? fromIstInput(f.recorded_at) : null,
      cervix_cm: num(f.cervix_cm), descent: f.descent || null, contractions_per10: num(f.contractions_per10),
      contraction_duration: f.contraction_duration || null, fetal_heart_rate: num(f.fetal_heart_rate),
      liquor: f.liquor || null, moulding: f.moulding || null, bp: f.bp || null, pulse: num(f.pulse), temp: num(f.temp),
      urine_protein: f.urine_protein || null, oxytocin: f.oxytocin || null, notes: f.notes || null,
    }), () => { setF(blank); setOpen(false) })
  }

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Partograph</p>
        {progress.phase === 'active' && !ctx.delivery && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{
            background: progress.line === 'on_track' ? '#DCFCE7' : progress.line === 'alert' ? '#FEF3C7' : '#FEE2E2',
            color: progress.line === 'on_track' ? '#15803D' : progress.line === 'alert' ? '#92400E' : '#B91C1C',
          }}>
            {progress.fullAt ? `Fully dilated since ${fmtClock(progress.fullAt)}` : progress.line === 'on_track' ? `Active labour · ${progress.latestCm} cm · on track` : progress.line === 'alert' ? 'Right of alert line' : 'Past action line'}
          </span>
        )}
        {progress.phase === 'latent' && !ctx.delivery && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: '#F1F5F9', color: '#475569' }}>Latent phase · {Math.floor(progress.hours)} h</span>
        )}
        {canNurse && (
          <button onClick={() => { setOpen((o) => !o); setF((s) => ({ ...s, recorded_at: s.recorded_at || nowIstInput() })) }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-3 h-3" /> Reading
          </button>
        )}
      </div>

      {open && canNurse && (
        <div className="rounded-xl p-3 mb-3 space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Time (IST)" className="col-span-2 sm:col-span-1"><input type="datetime-local" max={nowIstInput()} value={f.recorded_at} onChange={set('recorded_at')} style={inputStyle} /></Field>
            <Field label="Cervix (cm)"><input type="number" inputMode="numeric" min={0} max={10} value={f.cervix_cm} onChange={set('cervix_cm')} style={inputStyle} /></Field>
            <Field label="Head (fifths palpable)">
              <select value={f.descent} onChange={set('descent')} style={inputStyle}><option value="">—</option>{DESCENT_OPTIONS.map((d) => <option key={d}>{d}</option>)}</select>
            </Field>
            <Field label="Fetal heart (/min)"><input type="number" inputMode="numeric" value={f.fetal_heart_rate} onChange={set('fetal_heart_rate')} style={inputStyle} /></Field>
            <Field label="Contractions / 10 min"><input type="number" inputMode="numeric" min={0} max={10} value={f.contractions_per10} onChange={set('contractions_per10')} style={inputStyle} /></Field>
            <Field label="Lasting (seconds)">
              <select value={f.contraction_duration} onChange={set('contraction_duration')} style={inputStyle}><option value="">—</option><option value="<20">Under 20</option><option value="20-40">20–40</option><option value=">40">Over 40</option></select>
            </Field>
            <Field label="Liquor">
              <select value={f.liquor} onChange={set('liquor')} style={inputStyle}><option value="">—</option>{LIQUOR_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
            </Field>
            <Field label="Moulding">
              <select value={f.moulding} onChange={set('moulding')} style={inputStyle}><option value="">—</option>{MOULDING_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select>
            </Field>
            <Field label="BP"><input inputMode="numeric" placeholder="120/80" value={f.bp} onChange={set('bp')} style={inputStyle} /></Field>
            <Field label="Pulse"><input type="number" inputMode="numeric" value={f.pulse} onChange={set('pulse')} style={inputStyle} /></Field>
            <Field label="Temp (°C)"><input type="number" inputMode="decimal" step="0.1" value={f.temp} onChange={set('temp')} style={inputStyle} /></Field>
            <Field label="Urine protein">
              <select value={f.urine_protein} onChange={set('urine_protein')} style={inputStyle}><option value="">—</option>{['Nil', 'Trace', '1+', '2+', '3+'].map((o) => <option key={o}>{o}</option>)}</select>
            </Field>
            <Field label="Oxytocin (U/L, drops/min)" className="col-span-2"><input value={f.oxytocin} onChange={set('oxytocin')} placeholder="e.g. 5 U/L, 20 drops/min" style={inputStyle} /></Field>
            <Field label="Notes" className="col-span-2"><input value={f.notes} onChange={set('notes')} style={inputStyle} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
            <PrimaryButton onClick={save} disabled={isPending} color="#7C3AED"><Save className="w-3.5 h-3.5" /> Save reading</PrimaryButton>
          </div>
        </div>
      )}

      {readings.some((r) => r.cervix_cm != null) && <PartographChart readings={readings} deliveredAt={ctx.delivery?.delivered_at ?? null} />}
      <div className="mt-3"><Alerts items={alerts} /></div>

      {readings.length === 0 ? (
        <p className="text-xs" style={{ color: '#94A3B8' }}>No labour readings yet. Plot cervix, fetal heart and contractions every 30 minutes to 4 hours as labour progresses.</p>
      ) : (
        <div className="mt-3" style={{ overflowX: 'auto' }}>
          <table className="w-full text-xs tabular-nums" style={{ borderCollapse: 'collapse', minWidth: 640 }}>
            <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>
              {['Time', 'Cervix', 'Head', 'FHR', 'Contr.', 'Liquor', 'Mould.', 'BP', 'Pulse', 'Temp', ''].map((h, i) => <th key={i} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}
            </tr></thead>
            <tbody>{readings.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: '#64748B' }}>{fmtTime(r.recorded_at)}</td>
                <td className="px-2 py-1.5">{r.cervix_cm ?? '—'}</td><td className="px-2 py-1.5">{r.descent ?? '—'}</td>
                <td className="px-2 py-1.5" style={{ color: r.fetal_heart_rate != null && (r.fetal_heart_rate < 110 || r.fetal_heart_rate > 160) ? '#B91C1C' : undefined }}>{r.fetal_heart_rate ?? '—'}</td>
                <td className="px-2 py-1.5">{r.contractions_per10 != null ? `${r.contractions_per10}${r.contraction_duration ? ` · ${r.contraction_duration}s` : ''}` : '—'}</td>
                <td className="px-2 py-1.5">{r.liquor ?? '—'}</td><td className="px-2 py-1.5">{r.moulding ?? '—'}</td>
                <td className="px-2 py-1.5">{r.bp ?? '—'}</td><td className="px-2 py-1.5">{r.pulse ?? '—'}</td><td className="px-2 py-1.5">{r.temp ?? '—'}</td>
                <td className="px-2 py-1.5 text-right">
                  {canWrite && (
                    <button aria-label="Delete reading" title="Delete a wrong reading" disabled={isPending}
                      onClick={() => setDeleteId(r.id)}
                      style={{ color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { const id = deleteId; setDeleteId(null); if (id) run(() => deletePartographReading(id)) }}
        loading={isPending}
        title="Delete this reading?"
        description="Use this only for a reading entered by mistake (wrong patient or wrong values). It is removed from the partograph."
        confirmLabel="Delete"
      />
    </GlassCard>
  )
}

const CW = 640, CH = 240, PAD = { l: 34, r: 12, t: 12, b: 26 }

/** Cervicograph: dilatation (×) and head descent (○) against hours, with WHO alert and action lines. */
function PartographChart({ readings, deliveredAt }: { readings: PartographReading[]; deliveredAt: string | null }) {
  const sorted = useMemo(() => [...readings].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)), [readings])
  const t0 = Date.parse(sorted[0].recorded_at)
  const lastT = Math.max(Date.parse(sorted[sorted.length - 1].recorded_at), deliveredAt ? Date.parse(deliveredAt) : 0)
  const hours = Math.max(12, Math.ceil((lastT - t0) / 3600000) + 1)
  const x = (t: number) => PAD.l + ((t - t0) / 3600000 / hours) * (CW - PAD.l - PAD.r)
  const xh = (h: number) => PAD.l + (h / hours) * (CW - PAD.l - PAD.r)
  const y = (cm: number) => PAD.t + (1 - cm / 10) * (CH - PAD.t - PAD.b)
  const first = sorted.find((r) => r.cervix_cm != null && r.cervix_cm >= 4)
  const fh = first ? (Date.parse(first.recorded_at) - t0) / 3600000 : 0
  const c0 = first?.cervix_cm ?? 4
  const cx = sorted.filter((r) => r.cervix_cm != null)
  const dx = sorted.filter((r) => r.descent)

  return (
    <figure className="mt-1" style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Partograph: cervical dilatation and head descent over time" style={{ width: '100%', minWidth: 480, height: 'auto' }}>
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={y(i)} y2={y(i)} stroke="#F1F5F9" />
            <text x={PAD.l - 6} y={y(i) + 3} textAnchor="end" fontSize="9" fill="#94A3B8">{i}</text>
          </g>
        ))}
        {Array.from({ length: hours + 1 }, (_, h) => (
          <g key={h}>
            <line x1={xh(h)} x2={xh(h)} y1={PAD.t} y2={CH - PAD.b} stroke="#F8FAFC" />
            {h % 2 === 0 && <text x={xh(h)} y={CH - PAD.b + 12} textAnchor="middle" fontSize="9" fill="#94A3B8">{h}h</text>}
          </g>
        ))}
        {first && (
          <>
            <line x1={xh(fh)} y1={y(c0)} x2={xh(fh + (10 - c0))} y2={y(10)} stroke="#D97706" strokeWidth="1.5" strokeDasharray="5 3" />
            <text x={xh(fh + (10 - c0)) + 3} y={y(10) + 10} fontSize="9" fill="#B45309">Alert</text>
            <line x1={xh(fh + 4)} y1={y(c0)} x2={xh(fh + 4 + (10 - c0))} y2={y(10)} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="5 3" />
            <text x={Math.min(xh(fh + 4 + (10 - c0)) + 3, CW - 40)} y={y(10) + 22} fontSize="9" fill="#B91C1C">Action</text>
          </>
        )}
        <polyline fill="none" stroke="#7C3AED" strokeWidth="1.5" points={cx.map((r) => `${x(Date.parse(r.recorded_at))},${y(r.cervix_cm!)}`).join(' ')} />
        {cx.map((r) => {
          const px = x(Date.parse(r.recorded_at)), py = y(r.cervix_cm!)
          return <g key={r.id} stroke="#7C3AED" strokeWidth="2"><line x1={px - 4} y1={py - 4} x2={px + 4} y2={py + 4} /><line x1={px - 4} y1={py + 4} x2={px + 4} y2={py - 4} /></g>
        })}
        {dx.map((r) => <circle key={r.id} cx={x(Date.parse(r.recorded_at))} cy={y(2 * Number(r.descent!.split('/')[0]))} r="4" fill="#fff" stroke="#0D9488" strokeWidth="2" />)}
        {deliveredAt && <line x1={x(Date.parse(deliveredAt))} x2={x(Date.parse(deliveredAt))} y1={PAD.t} y2={CH - PAD.b} stroke={ACCENT} strokeWidth="1.5" />}
      </svg>
      <figcaption className="text-[11px] mt-1 flex flex-wrap gap-x-4" style={{ color: '#64748B' }}>
        <span><span style={{ color: '#7C3AED', fontWeight: 700 }}>×</span> cervix (cm)</span>
        <span><span style={{ color: '#0D9488', fontWeight: 700 }}>○</span> head, fifths palpable (5 = top)</span>
        <span style={{ color: '#B45309' }}>- - alert line</span><span style={{ color: '#B91C1C' }}>- - action line (4 h)</span>
        <span>Hours from first reading</span>
      </figcaption>
    </figure>
  )
}

// ── Delivery ───────────────────────────────────────────────────────────────────

type BabyForm = {
  birth_order: number; born_at: string; sex: string; outcome: string; birth_weight_kg: string; length_cm: string; head_circ_cm: string
  apgar_1: string; apgar_5: string; resuscitation: boolean; breastfed_within_1h: string; vitamin_k: string; nicu: boolean; anomalies: string
  registered: boolean
}
const blankBaby = (order: number, bornAt: string): BabyForm => ({
  birth_order: order, born_at: bornAt, sex: '', outcome: 'live_birth', birth_weight_kg: '', length_cm: '', head_circ_cm: '',
  apgar_1: '', apgar_5: '', resuscitation: false, breastfed_within_1h: '', vitamin_k: '', nicu: false, anomalies: '', registered: false,
})

function DeliverySection({ ctx, admissionId, canWrite, isPending, run }: { ctx: LabourContext; admissionId: string; canWrite: boolean; isPending: boolean; run: Run }) {
  const d = ctx.delivery
  const [editing, setEditing] = useState(false)
  if (!d && !editing) {
    return canWrite ? (
      <GlassCard className="p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: '#475569' }}>When the baby is born, record the delivery and the baby&apos;s details.</p>
        <PrimaryButton onClick={() => setEditing(true)}><Baby className="w-3.5 h-3.5" /> Record delivery</PrimaryButton>
      </GlassCard>
    ) : null
  }
  if (editing) return <DeliveryForm ctx={ctx} admissionId={admissionId} isPending={isPending} run={run} onDone={() => setEditing(false)} />

  const alerts = deliveryAlerts(d!)
  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Delivery</p>
        {canWrite && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
        {([
          ['Delivered', fmtTime(d!.delivered_at)],
          ['Mode', deliveryModeLabel(d!.mode)],
          ['Gestation', d!.gestation_days != null ? formatGa(d!.gestation_days) : '—'],
          ['Blood loss', d!.blood_loss_ml != null ? `${d!.blood_loss_ml} mL` : '—'],
          ['Anaesthesia', d!.anaesthesia ? cap(d!.anaesthesia) : '—'],
          ['Perineum', isCaesarean(d!.mode) ? 'N/A' : `${d!.episiotomy ? 'Episiotomy · ' : ''}${d!.perineal_tear === 'none' ? 'No tear' : `${cap(d!.perineal_tear)}-degree tear`}`],
          ['Placenta', d!.placenta ? cap(d!.placenta.replace('_', ' ')) : '—'],
          ['Oxytocin 3rd stage', d!.amtsl_oxytocin == null ? '—' : d!.amtsl_oxytocin ? 'Given' : 'Not given'],
        ] as const).map(([l, v]) => (
          <div key={l}><p className="text-xs" style={{ color: '#64748B' }}>{l}</p><p className="font-medium" style={{ color: '#0F172A' }}>{v}</p></div>
        ))}
      </div>
      {d!.indication && <p className="text-sm mt-2" style={{ color: '#334155' }}><span className="font-semibold">Indication:</span> {d!.indication}</p>}
      {d!.conducted_by && <p className="text-xs mt-1" style={{ color: '#64748B' }}>Conducted by {d!.conducted_by}</p>}
      {d!.notes && <p className="text-sm mt-1" style={{ color: '#334155' }}>{d!.notes}</p>}
      <div className="mt-3"><Alerts items={alerts} /></div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
        {ctx.babies.map((b) => <BabyCard key={b.id} baby={b} count={ctx.babies.length} canWrite={canWrite} isPending={isPending} run={run} />)}
      </div>
    </GlassCard>
  )
}

function BabyCard({ baby: b, count, canWrite, isPending, run }: { baby: DeliveryBaby; count: number; canWrite: boolean; isPending: boolean; run: Run }) {
  const [registering, setRegistering] = useState(false)
  const [doses, setDoses] = useState(false)
  const alerts = babyAlerts(b)
  const live = b.outcome === 'live_birth'
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#0F172A' }}>
          <Baby className="w-4 h-4" style={{ color: '#0D9488' }} />
          {count > 1 ? `Baby ${b.birth_order} · ` : ''}{b.sex === 'male' ? 'Boy' : b.sex === 'female' ? 'Girl' : 'Sex indeterminate'}
          {!live && <span className="text-xs font-medium" style={{ color: '#B91C1C' }}>· {b.outcome === 'fresh_stillbirth' ? 'Fresh stillbirth' : 'Macerated stillbirth'}</span>}
        </p>
        <span className="text-xs" style={{ color: '#64748B' }}>{fmtTime(b.born_at)}</span>
      </div>
      <p className="text-sm mt-1 tabular-nums" style={{ color: '#334155' }}>
        {[b.birth_weight_kg != null ? `${b.birth_weight_kg} kg` : null, b.length_cm != null ? `${b.length_cm} cm` : null, b.head_circ_cm != null ? `HC ${b.head_circ_cm} cm` : null,
          live && b.apgar_1 != null ? `APGAR ${b.apgar_1}/${b.apgar_5 ?? '–'}` : null, b.resuscitation ? 'Resuscitated' : null, b.nicu ? 'NICU' : null].filter(Boolean).join(' · ') || 'No measurements'}
      </p>
      {b.anomalies && <p className="text-xs mt-1" style={{ color: '#B45309' }}>Anomalies: {b.anomalies}</p>}
      <div className="mt-2"><Alerts items={alerts} /></div>
      {live && (
        <div className="mt-2">
          {b.baby_patient ? (
            <Link href={`/patients/${b.baby_patient.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#0D9488' }}>
              <CheckCircle className="w-3.5 h-3.5" /> Registered · {b.baby_patient.full_name} · {b.baby_patient.uhid}
            </Link>
          ) : canWrite ? (
            registering ? (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs" style={{ color: '#334155' }}>
                  <input type="checkbox" checked={doses} onChange={(e) => setDoses(e.target.checked)} /> Birth-dose vaccines given today (BCG, OPV-0, Hepatitis B)
                </label>
                <div className="flex gap-2">
                  <PrimaryButton color="#0D9488" disabled={isPending} onClick={() => run(() => registerNewborn(b.id, { birthDosesGiven: doses }), () => setRegistering(false))}>
                    <UserPlus className="w-3.5 h-3.5" /> Register baby
                  </PrimaryButton>
                  <button onClick={() => setRegistering(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
                </div>
                <p className="text-[11px]" style={{ color: '#94A3B8' }}>Creates a patient with a UHID, the mother&apos;s phone and address, and starts the child&apos;s birth history and growth chart.</p>
              </div>
            ) : (
              <button onClick={() => setRegistering(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#fff', color: '#0D9488', border: '1px solid #99F6E4', cursor: 'pointer' }}>
                <UserPlus className="w-3.5 h-3.5" /> Register as patient
              </button>
            )
          ) : null}
        </div>
      )}
    </div>
  )
}

function DeliveryForm({ ctx, admissionId, isPending, run, onDone }: { ctx: LabourContext; admissionId: string; isPending: boolean; run: Run; onDone: () => void }) {
  const d = ctx.delivery
  const [formError, setFormError] = useState('')
  const now = nowIstInput()
  const [f, setF] = useState({
    delivered_at: d ? toIstInput(d.delivered_at) : now, mode: d?.mode ?? '', indication: d?.indication ?? '',
    gestation_weeks: d?.gestation_days != null ? String(Math.floor(d.gestation_days / 7)) : '', gestation_extra: d?.gestation_days != null ? String(d.gestation_days % 7) : '',
    anaesthesia: d?.anaesthesia ?? '', episiotomy: d?.episiotomy ?? false, perineal_tear: d?.perineal_tear ?? 'none', placenta: d?.placenta ?? '',
    amtsl_oxytocin: triStr(d?.amtsl_oxytocin), blood_loss_ml: str(d?.blood_loss_ml), conducted_by: d?.conducted_by ?? '', notes: d?.notes ?? '',
  })
  const [babies, setBabies] = useState<BabyForm[]>(() => ctx.babies.length
    ? ctx.babies.map((b) => ({
        birth_order: b.birth_order, born_at: toIstInput(b.born_at), sex: b.sex, outcome: b.outcome,
        birth_weight_kg: str(b.birth_weight_kg), length_cm: str(b.length_cm), head_circ_cm: str(b.head_circ_cm),
        apgar_1: str(b.apgar_1), apgar_5: str(b.apgar_5), resuscitation: b.resuscitation, breastfed_within_1h: triStr(b.breastfed_within_1h),
        vitamin_k: triStr(b.vitamin_k), nicu: b.nicu, anomalies: b.anomalies ?? '', registered: !!b.baby_patient_id,
      }))
    : [blankBaby(1, now)])
  const cs = isCaesarean(f.mode)
  const knownGa = !d && ctx.gestationToday != null
  const setB = (i: number, patch: Partial<BabyForm>) => setBabies((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  function submit() {
    if (!f.mode) { setFormError('Choose the mode of delivery'); return }
    if (babies.some((b) => !b.sex)) { setFormError('Choose the sex of each baby'); return }
    setFormError('')
    const gaDays = f.gestation_weeks !== '' ? Number(f.gestation_weeks) * 7 + Number(f.gestation_extra || 0) : null
    const payload = {
      delivered_at: fromIstInput(f.delivered_at), mode: f.mode, indication: f.indication || null, gestation_days: gaDays,
      anaesthesia: f.anaesthesia || null, episiotomy: cs ? false : f.episiotomy, perineal_tear: cs ? 'none' : f.perineal_tear,
      placenta: f.placenta || null, amtsl_oxytocin: triBool(f.amtsl_oxytocin), blood_loss_ml: num(f.blood_loss_ml),
      conducted_by: f.conducted_by || null, notes: f.notes || null,
      babies: babies.map((b) => ({
        birth_order: b.birth_order, born_at: fromIstInput(b.born_at), sex: b.sex, outcome: b.outcome,
        birth_weight_kg: num(b.birth_weight_kg), length_cm: num(b.length_cm), head_circ_cm: num(b.head_circ_cm),
        apgar_1: b.outcome === 'live_birth' ? num(b.apgar_1) : null, apgar_5: b.outcome === 'live_birth' ? num(b.apgar_5) : null,
        resuscitation: b.resuscitation, breastfed_within_1h: triBool(b.breastfed_within_1h), vitamin_k: triBool(b.vitamin_k),
        nicu: b.nicu, anomalies: b.anomalies || null,
      })),
    }
    run(() => saveDelivery(admissionId, payload), onDone)
  }

  const bloodLoss = num(f.blood_loss_ml)
  return (
    <GlassCard className="p-4 sm:p-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>{d ? 'Edit delivery' : 'Record delivery'}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Delivered at (IST)" className="col-span-2 sm:col-span-1"><input type="datetime-local" max={now} value={f.delivered_at} onChange={(e) => { const v = e.target.value; setF((s) => ({ ...s, delivered_at: v })); if (!d && babies.length === 1) setB(0, { born_at: v }) }} style={inputStyle} /></Field>
        <Field label="Mode" className="col-span-2 sm:col-span-1">
          <select value={f.mode} onChange={set('mode')} style={inputStyle}><option value="">Choose…</option>{DELIVERY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </Field>
        <Field label={knownGa ? `Gestation (weeks) — ${formatGa(ctx.gestationToday)} by EDD` : 'Gestation (weeks)'}><input type="number" inputMode="numeric" min={20} max={45} placeholder={knownGa ? 'From EDD' : ''} value={f.gestation_weeks} onChange={set('gestation_weeks')} style={inputStyle} /></Field>
        <Field label="+ days"><input type="number" inputMode="numeric" min={0} max={6} value={f.gestation_extra} onChange={set('gestation_extra')} style={inputStyle} /></Field>
        {(cs || f.mode === 'vacuum' || f.mode === 'forceps') && (
          <Field label="Indication" className="col-span-2 sm:col-span-4"><input value={f.indication} onChange={set('indication')} placeholder={cs ? 'e.g. Fetal distress, previous LSCS, obstructed labour' : 'e.g. Prolonged second stage, maternal exhaustion'} style={inputStyle} /></Field>
        )}
        <Field label="Anaesthesia">
          <select value={f.anaesthesia} onChange={set('anaesthesia')} style={inputStyle}>
            <option value="">—</option>
            {(cs ? ['spinal', 'epidural', 'general'] : ['none', 'local', 'pudendal', 'epidural', 'spinal']).map((a) => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}
          </select>
        </Field>
        {!cs && (
          <>
            <Field label="Perineal tear">
              <select value={f.perineal_tear} onChange={set('perineal_tear')} style={inputStyle}>
                <option value="none">None</option><option value="first">1st degree</option><option value="second">2nd degree</option><option value="third">3rd degree</option><option value="fourth">4th degree</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm self-end pb-2" style={{ color: '#334155' }}>
              <input type="checkbox" checked={f.episiotomy} onChange={(e) => setF((s) => ({ ...s, episiotomy: e.target.checked }))} /> Episiotomy
            </label>
          </>
        )}
        <Field label="Placenta">
          <select value={f.placenta} onChange={set('placenta')} style={inputStyle}><option value="">—</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="manual_removal">Manual removal</option></select>
        </Field>
        <Field label="Oxytocin within 1 min">
          <select value={f.amtsl_oxytocin} onChange={set('amtsl_oxytocin')} style={inputStyle}><option value="">—</option><option value="yes">Given</option><option value="no">Not given</option></select>
        </Field>
        <Field label="Blood loss (mL)"><input type="number" inputMode="numeric" min={0} value={f.blood_loss_ml} onChange={set('blood_loss_ml')} style={inputStyle} /></Field>
        <Field label="Conducted by" className="col-span-2"><input value={f.conducted_by} onChange={set('conducted_by')} placeholder="Doctor / nurse names" style={inputStyle} /></Field>
        <Field label="Notes" className="col-span-2 sm:col-span-4"><textarea rows={2} value={f.notes} onChange={set('notes')} style={{ ...inputStyle, minHeight: '56px', resize: 'vertical' }} /></Field>
      </div>
      {bloodLoss != null && <Alerts items={deliveryAlerts({ mode: f.mode, gestation_days: null, blood_loss_ml: bloodLoss, perineal_tear: 'none', placenta: null, amtsl_oxytocin: null })} />}

      {babies.map((b, i) => {
        const live = b.outcome === 'live_birth'
        return (
          <div key={b.birth_order} className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#0F172A' }}><Baby className="w-4 h-4" style={{ color: '#0D9488' }} /> Baby {babies.length > 1 ? b.birth_order : ''}</p>
              {babies.length > 1 && !b.registered && (
                <button onClick={() => setBabies((bs) => bs.filter((_, j) => j !== i))} className="text-xs" style={{ color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Born at (IST)" className="col-span-2 sm:col-span-1"><input type="datetime-local" max={now} value={b.born_at} onChange={(e) => setB(i, { born_at: e.target.value })} style={inputStyle} /></Field>
              <Field label="Sex">
                <select value={b.sex} disabled={b.registered} onChange={(e) => setB(i, { sex: e.target.value })} style={inputStyle}><option value="">Choose…</option><option value="female">Girl</option><option value="male">Boy</option><option value="indeterminate">Indeterminate</option></select>
              </Field>
              <Field label="Outcome">
                <select value={b.outcome} disabled={b.registered} onChange={(e) => setB(i, { outcome: e.target.value })} style={inputStyle}><option value="live_birth">Live birth</option><option value="fresh_stillbirth">Fresh stillbirth</option><option value="macerated_stillbirth">Macerated stillbirth</option></select>
              </Field>
              <Field label="Weight (kg)"><input type="number" inputMode="decimal" step="0.01" min={0} value={b.birth_weight_kg} onChange={(e) => setB(i, { birth_weight_kg: e.target.value })} style={inputStyle} /></Field>
              <Field label="Length (cm)"><input type="number" inputMode="decimal" step="0.1" value={b.length_cm} onChange={(e) => setB(i, { length_cm: e.target.value })} style={inputStyle} /></Field>
              <Field label="Head circ. (cm)"><input type="number" inputMode="decimal" step="0.1" value={b.head_circ_cm} onChange={(e) => setB(i, { head_circ_cm: e.target.value })} style={inputStyle} /></Field>
              {live && (
                <>
                  <Field label="APGAR 1 min"><input type="number" inputMode="numeric" min={0} max={10} value={b.apgar_1} onChange={(e) => setB(i, { apgar_1: e.target.value })} style={inputStyle} /></Field>
                  <Field label="APGAR 5 min"><input type="number" inputMode="numeric" min={0} max={10} value={b.apgar_5} onChange={(e) => setB(i, { apgar_5: e.target.value })} style={inputStyle} /></Field>
                  <Field label="Breastfed in 1st hour">
                    <select value={b.breastfed_within_1h} onChange={(e) => setB(i, { breastfed_within_1h: e.target.value })} style={inputStyle}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>
                  </Field>
                  <Field label="Vitamin K">
                    <select value={b.vitamin_k} onChange={(e) => setB(i, { vitamin_k: e.target.value })} style={inputStyle}><option value="">—</option><option value="yes">Given</option><option value="no">Not given</option></select>
                  </Field>
                </>
              )}
              <Field label="Anomalies" className="col-span-2"><input value={b.anomalies} onChange={(e) => setB(i, { anomalies: e.target.value })} placeholder="None seen" style={inputStyle} /></Field>
              {live && (
                <div className="col-span-2 flex items-end gap-5 pb-2 text-sm" style={{ color: '#334155' }}>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={b.resuscitation} onChange={(e) => setB(i, { resuscitation: e.target.checked })} /> Needed resuscitation</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={b.nicu} onChange={(e) => setB(i, { nicu: e.target.checked })} /> Sent to NICU</label>
                </div>
              )}
            </div>
            <Alerts items={babyAlerts({ outcome: b.outcome, birth_weight_kg: num(b.birth_weight_kg), apgar_1: num(b.apgar_1), apgar_5: num(b.apgar_5), breastfed_within_1h: null, vitamin_k: null, resuscitation: b.resuscitation })} />
          </div>
        )
      })}
      {babies.length < 6 && (
        <button onClick={() => setBabies((bs) => [...bs, blankBaby(Math.max(...bs.map((x) => x.birth_order)) + 1, bs[bs.length - 1].born_at)])}
          className="flex items-center gap-1 text-xs font-medium" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-3.5 h-3.5" /> Add another baby (twins)
        </button>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
        {formError && <span className="text-xs self-center" style={{ color: '#B91C1C' }}>{formError}</span>}
        <PrimaryButton onClick={submit} disabled={isPending}><Save className="w-3.5 h-3.5" /> {d ? 'Save changes' : 'Save delivery'}</PrimaryButton>
      </div>
    </GlassCard>
  )
}

// ── Postpartum ─────────────────────────────────────────────────────────────────

function PostpartumSection({ ctx, admissionId, canNurse, isPending, run }: { ctx: LabourContext; admissionId: string; canNurse: boolean; isPending: boolean; run: Run }) {
  const blank = { recorded_at: '', bp: '', pulse: '', temp: '', uterus: '', bleeding: '', bladder: '', wound: '', notes: '' }
  const [f, setF] = useState(blank)
  const [open, setOpen] = useState(false)
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const obs = ctx.postpartum
  const last = obs[0] ?? null
  const next = ctx.admissionStatus === 'admitted' ? nextPostpartumCheck(ctx.delivery!.delivered_at, last?.recorded_at ?? null) : null
  const cs = isCaesarean(ctx.delivery!.mode)
  const alerts = postpartumAlerts(last)

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>{cs ? 'Post-caesarean checks' : 'Postpartum checks'}</p>
        {next && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: next.overdue ? '#FEE2E2' : '#E0F2FE', color: next.overdue ? '#B91C1C' : '#0369A1' }}>
            <Clock className="w-3 h-3" /> {next.overdue ? 'Check overdue since' : 'Next check'} {fmtClock(next.dueAt)} · every {next.intervalMin < 60 ? `${next.intervalMin} min` : `${next.intervalMin / 60} h`}
          </span>
        )}
        {canNurse && (
          <button onClick={() => { setOpen((o) => !o); setF((s) => ({ ...s, recorded_at: s.recorded_at || nowIstInput() })) }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-3 h-3" /> Check
          </button>
        )}
      </div>

      {open && canNurse && (
        <div className="rounded-xl p-3 mb-3 space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Time (IST)" className="col-span-2 sm:col-span-1"><input type="datetime-local" max={nowIstInput()} value={f.recorded_at} onChange={set('recorded_at')} style={inputStyle} /></Field>
            <Field label="BP"><input inputMode="numeric" placeholder="120/80" value={f.bp} onChange={set('bp')} style={inputStyle} /></Field>
            <Field label="Pulse"><input type="number" inputMode="numeric" value={f.pulse} onChange={set('pulse')} style={inputStyle} /></Field>
            <Field label="Temp (°C)"><input type="number" inputMode="decimal" step="0.1" value={f.temp} onChange={set('temp')} style={inputStyle} /></Field>
            <Field label="Uterus">
              <select value={f.uterus} onChange={set('uterus')} style={inputStyle}><option value="">—</option><option value="contracted">Well contracted</option><option value="boggy">Soft / boggy</option></select>
            </Field>
            <Field label="Bleeding">
              <select value={f.bleeding} onChange={set('bleeding')} style={inputStyle}><option value="">—</option><option value="normal">Normal</option><option value="heavy">Heavy</option></select>
            </Field>
            <Field label="Bladder">
              <select value={f.bladder} onChange={set('bladder')} style={inputStyle}><option value="">—</option><option value="passed_urine">Passed urine</option><option value="catheter">Catheter</option><option value="distended">Distended</option></select>
            </Field>
            <Field label={cs ? 'Wound / drain' : 'Perineum'}><input value={f.wound} onChange={set('wound')} placeholder={cs ? 'Dry, no soakage' : 'Sutures intact'} style={inputStyle} /></Field>
            <Field label="Notes" className="col-span-2 sm:col-span-4"><input value={f.notes} onChange={set('notes')} style={inputStyle} /></Field>
          </div>
          <Alerts items={postpartumAlerts({ id: '', recorded_at: '', bp: f.bp || null, pulse: num(f.pulse), temp: num(f.temp), uterus: f.uterus || null, bleeding: f.bleeding || null, bladder: f.bladder || null, wound: null, notes: null })} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
            <PrimaryButton color="#0D9488" disabled={isPending} onClick={() => run(() => addPostpartumCheck(admissionId, {
              recorded_at: f.recorded_at ? fromIstInput(f.recorded_at) : null, bp: f.bp || null, pulse: num(f.pulse), temp: num(f.temp),
              uterus: f.uterus || null, bleeding: f.bleeding || null, bladder: f.bladder || null, wound: f.wound || null, notes: f.notes || null,
            }), () => { setF(blank); setOpen(false) })}>
              <Save className="w-3.5 h-3.5" /> Save check
            </PrimaryButton>
          </div>
        </div>
      )}

      {!open && <Alerts items={alerts} />}
      {obs.length === 0 ? (
        <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>No checks yet. Check BP, pulse, uterus and bleeding every 15 minutes in the first hour, every 30 minutes in the second, then 4-hourly.</p>
      ) : (
        <div className="mt-3" style={{ overflowX: 'auto' }}>
          <table className="w-full text-xs tabular-nums" style={{ borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>
              {['Time', 'After birth', 'BP', 'Pulse', 'Temp', 'Uterus', 'Bleeding', 'Bladder', cs ? 'Wound' : 'Perineum'].map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}
            </tr></thead>
            <tbody>{obs.map((o) => {
              const mins = Math.round((Date.parse(o.recorded_at) - Date.parse(ctx.delivery!.delivered_at)) / 60000)
              return (
                <tr key={o.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: '#64748B' }}>{fmtTime(o.recorded_at)}</td>
                  <td className="px-2 py-1.5">{mins < 120 ? `${mins} min` : `${Math.floor(mins / 60)} h`}</td>
                  <td className="px-2 py-1.5">{o.bp ?? '—'}</td><td className="px-2 py-1.5">{o.pulse ?? '—'}</td><td className="px-2 py-1.5">{o.temp ?? '—'}</td>
                  <td className="px-2 py-1.5" style={{ color: o.uterus === 'boggy' ? '#B91C1C' : undefined }}>{o.uterus ?? '—'}</td>
                  <td className="px-2 py-1.5" style={{ color: o.bleeding === 'heavy' ? '#B91C1C' : undefined }}>{o.bleeding ?? '—'}</td>
                  <td className="px-2 py-1.5">{o.bladder?.replace('_', ' ') ?? '—'}</td><td className="px-2 py-1.5">{o.wound ?? '—'}</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </GlassCard>
  )
}
