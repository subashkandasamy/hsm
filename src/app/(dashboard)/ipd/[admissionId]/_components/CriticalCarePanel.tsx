'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, Droplet, HeartPulse } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import {
  setCriticalCare, recordIcuObservation, listIcuObservations, recordFluidBalance, listFluidBalance, admissionBedIsIcu,
} from '@/app/actions/icu'
import { computeNews, NEWS_BAND_STYLE } from '@/lib/earlyWarning'
import { onOxygen } from '@/lib/round'
import type { Admission, IcuObservation, IcuFluidEntry } from '@/lib/types'

const OBS_FIELDS: { key: string; label: string; step?: string }[] = [
  { key: 'hr', label: 'HR' }, { key: 'sbp', label: 'SBP' }, { key: 'dbp', label: 'DBP' }, { key: 'map', label: 'MAP' },
  { key: 'cvp', label: 'CVP' }, { key: 'spo2', label: 'SpO₂' }, { key: 'rr', label: 'RR' }, { key: 'temp', label: 'Temp', step: '0.1' },
  { key: 'gcs_e', label: 'GCS E' }, { key: 'gcs_v', label: 'GCS V' }, { key: 'gcs_m', label: 'GCS M' },
  { key: 'rass', label: 'RASS' }, { key: 'pain_score', label: 'Pain' },
  { key: 'fio2', label: 'FiO₂ %' }, { key: 'peep', label: 'PEEP' }, { key: 'tidal_volume', label: 'TV' }, { key: 'vent_rate', label: 'Vent RR' },
  // ICU sheet detail (0287): ventilator pressures, pupils, limb power
  { key: 'pip', label: 'PIP' }, { key: 'pplat', label: 'Pplat' }, { key: 'pressure_support', label: 'PS' }, { key: 'mve', label: 'MVe L', step: '0.1' },
  { key: 'pupil_r_mm', label: 'Pupil R mm', step: '0.5' }, { key: 'pupil_l_mm', label: 'Pupil L mm', step: '0.5' },
  { key: 'power_rul', label: 'Power RUL' }, { key: 'power_lul', label: 'Power LUL' }, { key: 'power_rll', label: 'Power RLL' }, { key: 'power_lll', label: 'Power LLL' },
]
const IN_CATS = ['iv', 'oral', 'ng', 'blood', 'other']
const OUT_CATS = ['urine', 'drain', 'vomit', 'stool', 'other']

interface Props {
  admission: Admission
  canWrite: boolean
  canNurse: boolean
}

export default function CriticalCarePanel({ admission, canWrite, canNurse }: Props) {
  const [flags, setFlags] = useState({
    is_critical_care: !!admission.is_critical_care, on_ventilator: !!admission.on_ventilator,
    code_status: admission.code_status ?? '', isolation: admission.isolation ?? '',
  })
  const [obs, setObs] = useState<IcuObservation[]>([])
  const [fluids, setFluids] = useState<{ entries: IcuFluidEntry[]; totals: { intake: number; output: number; net: number; todayIntake: number; todayOutput: number } } | null>(null)
  const [obsForm, setObsForm] = useState<Record<string, string>>({})
  const [ventMode, setVentMode] = useState('')
  const [react, setReact] = useState<{ r: string; l: string }>({ r: '', l: '' })
  const [obsError, setObsError] = useState<string | null>(null)
  const [showObs, setShowObs] = useState(false)
  const [fluidDir, setFluidDir] = useState<'intake' | 'output'>('intake')
  const [fluidCat, setFluidCat] = useState('iv'); const [fluidVol, setFluidVol] = useState('')
  const [busy, setBusy] = useState(false)
  const [inIcuBed, setInIcuBed] = useState<boolean | null>(null)

  const load = useCallback(() => {
    Promise.all([listIcuObservations(admission.id), listFluidBalance(admission.id)]).then(([o, f]) => { setObs(o); setFluids(f) })
  }, [admission.id])
  useEffect(() => { load(); admissionBedIsIcu(admission.id).then(setInIcuBed) }, [load, admission.id])

  async function saveFlags(patch: Partial<typeof flags>) {
    const next = { ...flags, ...patch }
    setFlags(next)
    await setCriticalCare(admission.id, {
      is_critical_care: next.is_critical_care, on_ventilator: next.on_ventilator,
      code_status: next.code_status || null, isolation: next.isolation || null,
    })
  }

  async function saveObs() {
    setBusy(true)
    const payload: Record<string, number | string | null> = {}
    for (const f of OBS_FIELDS) {
      const v = obsForm[f.key]
      if (v !== undefined && v !== '') payload[f.key] = f.step ? parseFloat(v) : parseInt(v, 10)
    }
    if (ventMode) payload.vent_mode = ventMode
    if (react.r) payload.pupil_r_react = react.r
    if (react.l) payload.pupil_l_react = react.l
    if (obsForm.notes) payload.notes = obsForm.notes
    setObsError(null)
    const res = await recordIcuObservation(admission.id, payload)
    setBusy(false)
    if (!res.success) { setObsError(res.error); return }
    setObsForm({}); setVentMode(''); setReact({ r: '', l: '' }); setShowObs(false); load()
  }

  async function saveFluid() {
    if (!fluidVol) return
    setBusy(true)
    const res = await recordFluidBalance(admission.id, { direction: fluidDir, category: fluidCat, volume_ml: parseInt(fluidVol, 10) })
    setBusy(false)
    if (res.success) { setFluidVol(''); load() }
  }

  const t = fluids?.totals
  // Same score as the Chart tab and the strip: AVPU from ward rounds, oxygen by device / flow / FiO₂.
  const newsFor = (o: IcuObservation) => computeNews({
    rr: o.rr, spo2: o.spo2, sbp: o.sbp, hr: o.hr, temp: o.temp, gcs_total: o.gcs_total, avpu: o.avpu,
    on_oxygen: onOxygen(o, flags.on_ventilator),
  })
  const latestNews = obs.length ? newsFor(obs[0]) : null

  return (
    <div className="space-y-4">
      {/* Deterioration alert (NEWS2) */}
      {latestNews && latestNews.band !== 'low' && (
        <div className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: NEWS_BAND_STYLE[latestNews.band].bg, border: `1px solid ${latestNews.band === 'high' ? '#FECACA' : '#FDE68A'}` }}>
          <span className="text-2xl font-bold" style={{ color: NEWS_BAND_STYLE[latestNews.band].color }}>{latestNews.score}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: NEWS_BAND_STYLE[latestNews.band].color }}>
              {latestNews.band === 'high' ? '⚠ High NEWS — urgent clinical review' : 'Elevated NEWS — increase monitoring / review'}
            </p>
            <p className="text-xs" style={{ color: '#64748B' }}>Latest early-warning score from the most recent observation.</p>
          </div>
        </div>
      )}
      {/* Critical-care flags */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <HeartPulse className="w-4 h-4" style={{ color: '#DC2626' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Critical Care Status</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Toggle label="Critical Care (ICU)" on={flags.is_critical_care} disabled={!canWrite} onClick={() => saveFlags({ is_critical_care: !flags.is_critical_care })} />
          <Toggle label="On Ventilator" on={flags.on_ventilator} disabled={!canWrite} onClick={() => saveFlags({ on_ventilator: !flags.on_ventilator })} />
          <Field label="Code Status">
            <Select value={flags.code_status} disabled={!canWrite} onChange={(e) => saveFlags({ code_status: e.target.value })}>
              <option value="">—</option><option value="full">Full Code</option><option value="dnr">DNR</option><option value="dni">DNI</option><option value="comfort">Comfort</option>
            </Select>
          </Field>
          <Field label="Isolation">
            <Select value={flags.isolation} disabled={!canWrite} onChange={(e) => saveFlags({ isolation: e.target.value })}>
              <option value="">—</option><option value="none">None</option><option value="contact">Contact</option><option value="droplet">Droplet</option><option value="airborne">Airborne</option>
            </Select>
          </Field>
        </div>
        {flags.is_critical_care && inIcuBed === false && (
          <div className="mt-2 flex items-start gap-2 rounded-xl px-3 py-2" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <span style={{ color: '#B45309' }}>⚠</span>
            <p className="text-xs" style={{ color: '#92400E' }}>
              This patient isn’t in an ICU bed. Critical-care charting still works, but the
              <strong> ICU monitoring charge won’t bill</strong> until they’re in an ICU room
              (the ventilator charge still applies). Consider transferring to an ICU bed.
            </p>
          </div>
        )}
        {flags.is_critical_care && inIcuBed && <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>ICU monitoring + ventilator daily charges apply per the IPD Billing settings.</p>}
      </GlassCard>

      {/* Fluid balance */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Droplet className="w-4 h-4" style={{ color: '#1D4ED8' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Intake / Output (Fluid Balance)</h3>
        </div>
        {t && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <Stat label="Today Intake" value={`${t.todayIntake} ml`} color="#15803D" />
            <Stat label="Today Output" value={`${t.todayOutput} ml`} color="#B45309" />
            <Stat label="Net (today)" value={`${t.todayIntake - t.todayOutput} ml`} color={t.todayIntake - t.todayOutput >= 0 ? '#0D9488' : '#DC2626'} />
          </div>
        )}
        {canNurse && (
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <Select value={fluidDir} onChange={(e) => { const d = e.target.value as 'intake' | 'output'; setFluidDir(d); setFluidCat(d === 'intake' ? 'iv' : 'urine') }}>
              <option value="intake">Intake</option><option value="output">Output</option>
            </Select>
            <Select value={fluidCat} onChange={(e) => setFluidCat(e.target.value)}>
              {(fluidDir === 'intake' ? IN_CATS : OUT_CATS).map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </Select>
            <div style={{ width: '7rem' }}><Input type="number" min={0} value={fluidVol} onChange={(e) => setFluidVol(e.target.value)} placeholder="ml" /></div>
            <button onClick={saveFluid} disabled={busy || !fluidVol} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Add</button>
          </div>
        )}
        {fluids && fluids.entries.length > 0 && (
          <div className="space-y-1">
            {fluids.entries.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg" style={{ background: '#F8FAFC' }}>
                <span className="font-semibold capitalize" style={{ color: e.direction === 'intake' ? '#15803D' : '#B45309' }}>{e.direction === 'intake' ? '↓' : '↑'} {e.category}</span>
                <span style={{ color: '#0F172A' }}>{e.volume_ml} ml</span>
                <span className="ml-auto" style={{ color: '#94A3B8' }}>{new Date(e.recorded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* ICU flow sheet */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" style={{ color: '#7C3AED' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>ICU Flow Sheet</h3>
          </div>
          {canNurse && (
            <button onClick={() => setShowObs((s) => !s)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {showObs ? 'Close' : '+ Record Observation'}
            </button>
          )}
        </div>

        {showObs && (
          <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {OBS_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="text-xs" style={{ color: '#94A3B8' }}>{f.label}</label>
                  <Input type="number" step={f.step} value={obsForm[f.key] ?? ''} onChange={(e) => setObsForm((o) => ({ ...o, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="text-xs" style={{ color: '#94A3B8' }}>Vent Mode</label>
                <Input value={ventMode} onChange={(e) => setVentMode(e.target.value)} placeholder="AC/VC…" />
              </div>
              {(['r', 'l'] as const).map((side) => (
                <div key={side}>
                  <label className="text-xs" style={{ color: '#94A3B8' }}>Pupil {side.toUpperCase()} reacts</label>
                  <Select value={react[side]} onChange={(e) => setReact((x) => ({ ...x, [side]: e.target.value }))}>
                    <option value="">—</option><option value="brisk">Brisk</option><option value="sluggish">Sluggish</option><option value="fixed">Fixed</option>
                  </Select>
                </div>
              ))}
            </div>
            {obsError && <p className="text-xs" style={{ color: '#DC2626' }}>{obsError}</p>}
            <Input value={obsForm.notes ?? ''} onChange={(e) => setObsForm((o) => ({ ...o, notes: e.target.value }))} placeholder="Notes (optional)" />
            <div className="flex justify-end">
              <button onClick={saveObs} disabled={busy} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ background: busy ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Save Observation</button>
            </div>
          </div>
        )}

        {obs.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No observations recorded.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.9)' }}>
                  {['Time', 'NEWS', 'HR', 'BP', 'MAP', 'SpO₂', 'RR', 'Temp', 'GCS', 'RASS', 'Pain', 'FiO₂', 'PEEP'].map((h) => (
                    <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {obs.map((o) => {
                  const n = newsFor(o)
                  return (
                  <tr key={o.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: '#94A3B8' }}>{new Date(o.recorded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-2 py-1.5">
                      {n.params > 0
                        ? <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: NEWS_BAND_STYLE[n.band].bg, color: NEWS_BAND_STYLE[n.band].color }}>{n.score}</span>
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5">{o.hr ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.sbp != null && o.dbp != null ? `${o.sbp}/${o.dbp}` : '—'}</td>
                    <td className="px-2 py-1.5">{o.map ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.spo2 ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.rr ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.temp ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.gcs_total ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.rass ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.pain_score ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.fio2 ?? '—'}</td>
                    <td className="px-2 py-1.5">{o.peep ?? '—'}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

function Toggle({ label, on, disabled, onClick }: { label: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
      style={{ background: on ? (label.includes('Ventilator') ? '#EEF2FF' : '#FEF2F2') : 'rgba(248,250,252,0.8)', border: `1px solid ${on ? (label.includes('Ventilator') ? '#C7D2FE' : '#FECACA') : '#E2E8F0'}`, cursor: disabled ? 'default' : 'pointer' }}>
      <span className="text-xs font-medium" style={{ color: '#0F172A' }}>{label}</span>
      <span className="text-xs font-bold" style={{ color: on ? (label.includes('Ventilator') ? '#4338CA' : '#DC2626') : '#94A3B8' }}>{on ? 'ON' : 'OFF'}</span>
    </button>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{label}</label>{children}</div>
}
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-xs" style={{ color: '#64748B' }}>{label}</p>
    </div>
  )
}
