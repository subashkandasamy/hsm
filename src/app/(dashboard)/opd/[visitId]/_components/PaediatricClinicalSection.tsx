'use client'

import { useMemo, useState, useTransition } from 'react'
import { Baby, CheckCircle, LineChart, Save, Syringe, Pencil } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { saveClinicalData } from '@/app/actions/opd'
import {
  getPaediatricAssessment, recordImmunizations, savePediatricProfile, saveVisitGrowth,
  type GrowthPoint, type PaediatricAssessment,
} from '@/app/actions/pediatrics'
import { MILESTONE_SOURCE, milestonesForAge } from '@/lib/growth/milestones'
import type { PaediatricVisitData, PediatricProfile } from '@/lib/types'

interface Props {
  visitId: string
  patientId: string
  initialAssessment: PaediatricAssessment
  initialData: PaediatricVisitData | null
  disabled?: boolean
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none',
  borderRadius: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem', width: '100%', minHeight: '40px',
}

const SEVERITY: Record<string, { bg: string; fg: string; border: string }> = {
  normal:   { bg: '#F0FDF4', fg: '#15803D', border: '#BBF7D0' },
  watch:    { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
  moderate: { bg: '#FFF7ED', fg: '#C2410C', border: '#FED7AA' },
  severe:   { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
}

export function formatAge(days: number | null): string {
  if (days == null || days < 0) return 'Age unknown'
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30.4375)
  if (months < 24) return `${months} month${months === 1 ? '' : 's'}`
  const y = Math.floor(months / 12), mo = months % 12
  return `${y} y${mo ? ` ${mo} m` : ''}`
}

/** Immunisation-schedule wording: "At birth", "6 weeks", "9 months", "16 months", "5 years". */
function scheduleAgeLabel(days: number): string {
  if (days <= 0) return 'At birth'
  if (days < 120 && days % 7 === 0) return `${days / 7} weeks`
  const months = Math.round(days / 30.4375)
  if (months < 24) return `${months} months`
  return `${Math.round(days / 365.25)} years`
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))
const str = (v: number | null | undefined) => (v == null ? '' : String(v))

export default function PaediatricClinicalSection({ visitId, patientId, initialAssessment, initialData, disabled }: Props) {
  const [a, setA] = useState(initialAssessment)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const refresh = async () => setA(await getPaediatricAssessment(patientId, visitId))

  const ageMonths = a.ageDays != null ? a.ageDays / 30.4375 : null
  const under2 = a.ageDays != null && a.ageDays < 731

  // ── Measurements ────────────────────────────────────────────────────────────
  const vm = a.visitMeasurement
  const [meas, setMeas] = useState({ weight: str(vm?.weight_kg), height: str(vm?.height_cm), head: str(vm?.head_circ_cm), muac: str(vm?.muac_cm) })
  const [measSaved, setMeasSaved] = useState(false)
  function saveMeasurements() {
    setError(''); setMeasSaved(false)
    startTransition(async () => {
      const res = await saveVisitGrowth(visitId, { weight_kg: num(meas.weight), height_cm: num(meas.height), head_circ_cm: num(meas.head), muac_cm: num(meas.muac) })
      if (!res.success) { setError(res.error); return }
      await refresh()
      setMeasSaved(true); setTimeout(() => setMeasSaved(false), 2500)
    })
  }

  // ── Visit notes (milestones, feeding, development) ──────────────────────────
  const [notes, setNotes] = useState<PaediatricVisitData>(initialData ?? { template: 'paediatrics', milestones: {}, development_notes: '', feeding_notes: '' })
  const [notesSaved, setNotesSaved] = useState(false)
  function saveNotes() {
    setError(''); setNotesSaved(false)
    startTransition(async () => {
      const res = await saveClinicalData(visitId, notes as unknown as Record<string, unknown>)
      if (!res.success) { setError(res.error); return }
      setNotesSaved(true); setTimeout(() => setNotesSaved(false), 2500)
    })
  }
  const { current, next } = milestonesForAge(ageMonths ?? -1)
  const notYetDue = current ? current.items.filter((i) => notes.milestones[i.key] === 'not_yet').length : 0

  // ── Vaccinations ────────────────────────────────────────────────────────────
  const pendingVaccines = a.immunizations.filter((v) => v.status === 'overdue' || v.status === 'due')
  const upcoming = a.immunizations.filter((v) => v.status === 'upcoming').slice(0, 3)
  const [givingKey, setGivingKey] = useState<string | null>(null)
  const [showAllVaccines, setShowAllVaccines] = useState(false)
  // Doses due on the same date are given together (e.g. the 6-week visit) — group them.
  const vaccineGroups = useMemo(() => {
    const groups = new Map<string, typeof pendingVaccines>()
    for (const v of pendingVaccines) groups.set(v.due_date, [...(groups.get(v.due_date) ?? []), v])
    return [...groups.entries()].map(([due, items]) => ({ due, items, overdue: items[0].status === 'overdue' }))
  }, [pendingVaccines])
  function recordDoses(key: string, doses: Array<{ vaccine: string; dose_label: string }>, mode: 'today' | 'earlier') {
    setError(''); setGivingKey(key)
    startTransition(async () => {
      const res = await recordImmunizations(patientId, doses, mode)
      setGivingKey(null)
      if (!res.success) { setError(res.error); return }
      await refresh()
    })
  }

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
          <Baby className="w-4 h-4" style={{ color: '#0D9488' }} />
          Paediatric Assessment
        </h3>
        <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: '#F1F5F9', color: '#334155' }}>
          {formatAge(a.ageDays)}{a.sex ? ` · ${a.sex === 'male' ? 'Boy' : 'Girl'}` : ''}
        </span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
      )}
      {(!a.dob || !a.sex) && (
        <div className="mb-4 px-3 py-2 rounded-xl text-sm" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          Add the child&apos;s date of birth and sex on the patient profile to calculate WHO growth z-scores and vaccination due dates.
        </div>
      )}

      {/* Measurements + WHO assessment */}
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Measurements today</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ['weight', 'Weight (kg)', '0.01'],
            ['height', under2 ? 'Length (cm, lying)' : 'Height (cm, standing)', '0.1'],
            ['head', 'Head circ. (cm)', '0.1'],
            ['muac', 'MUAC (cm)', '0.1'],
          ] as const).map(([k, label, step]) => (
            <label key={k} className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>{label}</span>
              <input type="number" inputMode="decimal" min={0} step={step} value={meas[k]} disabled={disabled}
                onChange={(e) => setMeas((m) => ({ ...m, [k]: e.target.value }))}
                style={{ ...inputStyle, ...(disabled ? { opacity: 0.7 } : {}) }} />
            </label>
          ))}
        </div>
        {!disabled && (
          <div className="flex justify-end">
            <button onClick={saveMeasurements} disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: measSaved ? '#DCFCE7' : '#0D9488', color: measSaved ? '#15803D' : '#fff', border: 'none', cursor: isPending ? 'wait' : 'pointer' }}>
              {measSaved ? <><CheckCircle className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save &amp; assess</>}
            </button>
          </div>
        )}

        {vm && (vm.assessments.length > 0 || vm.muac) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {vm.assessments.map((x) => {
              const s = SEVERITY[x.severity]
              return (
                <div key={x.indicator} className="px-3 py-2 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <p className="text-xs" style={{ color: '#475569' }}>{x.label}</p>
                  <p className="text-sm font-semibold" style={{ color: s.fg }}>{x.status}</p>
                  <p className="text-xs tabular-nums" style={{ color: '#64748B' }}>
                    z {x.z >= 0 ? '+' : ''}{x.z.toFixed(1)} · {x.percentile < 0.1 ? '<0.1' : x.percentile > 99.9 ? '>99.9' : x.percentile.toFixed(1)}th percentile
                  </p>
                </div>
              )
            })}
            {vm.muac && (
              <div className="px-3 py-2 rounded-xl" style={{ background: SEVERITY[vm.muac.severity].bg, border: `1px solid ${SEVERITY[vm.muac.severity].border}` }}>
                <p className="text-xs" style={{ color: '#475569' }}>Mid-upper arm circumference</p>
                <p className="text-sm font-semibold" style={{ color: SEVERITY[vm.muac.severity].fg }}>{vm.muac.status}</p>
              </div>
            )}
          </div>
        )}
        {a.dob && a.sex && !a.inWhoRange && (
          <p className="text-xs" style={{ color: '#64748B' }}>WHO growth standards (z-scores and charts) cover birth to 5 years.</p>
        )}
      </section>

      {/* Growth chart */}
      {a.curves && a.inWhoRange && (
        <section className="mt-5">
          <GrowthChart assessment={a} />
        </section>
      )}

      {/* Birth history */}
      <section className="mt-5">
        <BirthHistory patientId={patientId} profile={a.profile} disabled={disabled} onSaved={refresh} />
      </section>

      {/* Vaccinations */}
      {a.dob && (
        <section className="mt-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>
            <Syringe className="w-3.5 h-3.5" /> Vaccinations
          </p>
          {pendingVaccines.length === 0 ? (
            <p className="text-sm" style={{ color: '#15803D' }}>No vaccines due or overdue.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {(showAllVaccines ? vaccineGroups : vaccineGroups.slice(0, 3)).map((g) => {
                  const ageLabel = a.dob ? scheduleAgeLabel(Math.round((new Date(g.due).getTime() - new Date(a.dob).getTime()) / 86400000)) : ''
                  const doses = g.items.map((v) => ({ vaccine: v.vaccine, dose_label: v.dose_label }))
                  return (
                    <li key={g.due} className="px-3 py-2.5 rounded-xl"
                      style={{ background: g.overdue ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${g.overdue ? '#FECACA' : '#FDE68A'}` }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{ageLabel}</span>
                        <span className="text-xs" style={{ color: g.overdue ? '#B91C1C' : '#B45309' }}>
                          {g.overdue ? 'Overdue since' : 'Due'} {new Date(g.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {!disabled && (
                          <span className="ml-auto flex gap-1.5">
                            <button onClick={() => recordDoses(`${g.due}|earlier`, doses, 'earlier')} disabled={isPending}
                              title="Already given elsewhere — records them without today's date"
                              className="px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                              {givingKey === `${g.due}|earlier` ? 'Saving…' : 'Given earlier'}
                            </button>
                            <button onClick={() => recordDoses(`${g.due}|today`, doses, 'today')} disabled={isPending}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                              {givingKey === `${g.due}|today` ? 'Saving…' : g.items.length > 1 ? 'All given today' : 'Given today'}
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {g.items.map((v) => {
                          const k = `${v.vaccine}|${v.dose_label}`
                          return (
                            <span key={k} className="inline-flex items-center gap-1 text-xs pl-2 pr-1 py-0.5 rounded-md" style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#334155' }}>
                              {v.vaccine} {v.dose_label}
                              {!disabled && g.items.length > 1 && (
                                <button onClick={() => recordDoses(k, [{ vaccine: v.vaccine, dose_label: v.dose_label }], 'today')} disabled={isPending}
                                  title={`Only ${v.vaccine} ${v.dose_label} given today`} aria-label={`Only ${v.vaccine} ${v.dose_label} given today`}
                                  className="px-1 rounded text-[11px] font-semibold" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
                                  {givingKey === k ? '…' : '✓ today'}
                                </button>
                              )}
                            </span>
                          )
                        })}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {vaccineGroups.length > 3 && (
                <button onClick={() => setShowAllVaccines((s) => !s)} className="text-xs font-medium mt-2"
                  style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {showAllVaccines ? 'Show fewer' : `Show ${vaccineGroups.length - 3} more due date${vaccineGroups.length - 3 > 1 ? 's' : ''}`}
                </button>
              )}
            </>
          )}
          {upcoming.length > 0 && (
            <p className="text-xs mt-2" style={{ color: '#64748B' }}>
              Next: {upcoming.map((v) => `${v.vaccine} ${v.dose_label} (${new Date(v.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})`).join(' · ')}
            </p>
          )}
        </section>
      )}

      {/* Milestones + notes */}
      <section className="mt-5 space-y-3">
        {current || next ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Developmental milestones</p>
            {[current, next].filter(Boolean).map((cp) => (
              <div key={cp!.months}>
                <p className="text-xs font-medium mb-1.5" style={{ color: '#334155' }}>
                  By {cp!.label}{cp === next ? ' (coming up)' : ''}
                </p>
                <ul className="space-y-1">
                  {cp!.items.map((item) => {
                    const v = notes.milestones[item.key]
                    return (
                      <li key={item.key} className="flex items-center gap-2 text-sm">
                        <span className="flex-1" style={{ color: '#0F172A' }}>{item.text}</span>
                        {(['yes', 'not_yet'] as const).map((opt) => (
                          <button key={opt} disabled={disabled}
                            onClick={() => setNotes((n) => ({ ...n, milestones: { ...n.milestones, [item.key]: n.milestones[item.key] === opt ? undefined! : opt } }))}
                            aria-pressed={v === opt}
                            className="px-2 py-0.5 rounded-md text-xs font-medium"
                            style={{
                              border: '1px solid', cursor: disabled ? 'default' : 'pointer',
                              borderColor: v === opt ? (opt === 'yes' ? '#15803D' : '#B45309') : '#E2E8F0',
                              background: v === opt ? (opt === 'yes' ? '#DCFCE7' : '#FEF3C7') : '#fff',
                              color: v === opt ? (opt === 'yes' ? '#15803D' : '#92400E') : '#64748B',
                            }}>
                            {opt === 'yes' ? 'Yes' : 'Not yet'}
                          </button>
                        ))}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
            {notYetDue > 0 && (
              <p className="text-xs px-3 py-2 rounded-xl" style={{ background: '#FFFBEB', color: '#92400E' }}>
                {notYetDue} milestone{notYetDue > 1 ? 's' : ''} for {current!.label} not yet seen — consider developmental screening and review at the next visit.
              </p>
            )}
            <p className="text-[11px]" style={{ color: '#94A3B8' }}>Source: {MILESTONE_SOURCE}. Most children (about 75%) reach these by the age shown.</p>
          </>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Feeding / diet</span>
            <textarea rows={2} value={notes.feeding_notes} disabled={disabled}
              onChange={(e) => setNotes((n) => ({ ...n, feeding_notes: e.target.value }))}
              placeholder="Breastfeeding, complementary feeds, appetite…"
              style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>Development notes</span>
            <textarea rows={2} value={notes.development_notes} disabled={disabled}
              onChange={(e) => setNotes((n) => ({ ...n, development_notes: e.target.value }))}
              placeholder="Concerns raised by parents, observations…"
              style={{ ...inputStyle, minHeight: '64px', resize: 'vertical' }} />
          </label>
        </div>
        {!disabled && (
          <div className="flex justify-end">
            <button onClick={saveNotes} disabled={isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: notesSaved ? '#DCFCE7' : '#0D9488', color: notesSaved ? '#15803D' : '#fff', border: 'none', cursor: 'pointer' }}>
              {notesSaved ? <><CheckCircle className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save milestones &amp; notes</>}
            </button>
          </div>
        )}
      </section>
    </GlassCard>
  )
}

// ── Growth chart ──────────────────────────────────────────────────────────────

const CHART_TABS = [
  { key: 'wfa', label: 'Weight', unit: 'kg', field: 'weight_kg' },
  { key: 'lhfa', label: 'Length / height', unit: 'cm', field: 'height_cm' },
  { key: 'hcfa', label: 'Head', unit: 'cm', field: 'head_circ_cm' },
] as const

const W = 560, H = 240, PAD = { l: 36, r: 12, t: 10, b: 26 }

function GrowthChart({ assessment: a }: { assessment: PaediatricAssessment }) {
  const [tab, setTab] = useState<(typeof CHART_TABS)[number]['key']>('wfa')
  const conf = CHART_TABS.find((t) => t.key === tab)!

  const chart = useMemo(() => {
    const curve = a.curves![tab]
    // Window: birth to a little past the child's current age (whole months, max 60).
    const maxDay = Math.min(1856, Math.max(184, Math.ceil(((a.ageDays ?? 0) + 92) / 30.4375) * 30.4375))
    const pts = curve.filter((p) => p.day <= maxDay)
    const obs = a.history
      .filter((h): h is GrowthPoint => h.ageDays >= 0 && h.ageDays <= maxDay && h[conf.field] != null)
      .map((h) => ({ day: h.ageDays, v: Number(h[conf.field]) }))
    const all = [...pts.flatMap((p) => [p.sd['-3'], p.sd['3']]), ...obs.map((o) => o.v)]
    const yMin = Math.floor(Math.min(...all)), yMax = Math.ceil(Math.max(...all))
    const x = (d: number) => PAD.l + (d / maxDay) * (W - PAD.l - PAD.r)
    const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b)
    const line = (k: string) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.sd[k]).toFixed(1)}`).join('')
    const months = Math.round(maxDay / 30.4375)
    const xTicks = Array.from({ length: Math.floor(months / (months > 24 ? 6 : 3)) + 1 }, (_, i) => i * (months > 24 ? 6 : 3))
    const yStep = Math.max(1, Math.round((yMax - yMin) / 5))
    const yTicks: number[] = []
    for (let v = yMin; v <= yMax; v += yStep) yTicks.push(v)
    return { x, y, line, obs, xTicks, yTicks }
  }, [a, tab, conf.field])

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>
          <LineChart className="w-3.5 h-3.5" /> WHO growth chart
        </p>
        <div className="flex gap-1 p-0.5 rounded-lg" role="tablist" style={{ background: '#F1F5F9' }}>
          {CHART_TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className="px-2.5 py-1 rounded-md text-xs font-medium"
              style={{ background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? '#0F172A' : '#64748B', border: 'none', cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }} role="img"
          aria-label={`${conf.label}-for-age chart with WHO standard deviation lines and ${chart.obs.length} measurements`}>
          {chart.yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={chart.y(v)} y2={chart.y(v)} stroke="#F1F5F9" />
              <text x={PAD.l - 6} y={chart.y(v) + 3} fontSize="9" textAnchor="end" fill="#94A3B8">{v}</text>
            </g>
          ))}
          {chart.xTicks.map((mo) => (
            <text key={mo} x={chart.x(mo * 30.4375)} y={H - 8} fontSize="9" textAnchor="middle" fill="#94A3B8">{mo}m</text>
          ))}
          <path d={chart.line('3')} fill="none" stroke="#DC2626" strokeWidth="1" strokeDasharray="3 3" />
          <path d={chart.line('2')} fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="5 3" />
          <path d={chart.line('0')} fill="none" stroke="#16A34A" strokeWidth="1.5" />
          <path d={chart.line('-2')} fill="none" stroke="#F59E0B" strokeWidth="1" strokeDasharray="5 3" />
          <path d={chart.line('-3')} fill="none" stroke="#DC2626" strokeWidth="1" strokeDasharray="3 3" />
          {chart.obs.length > 1 && (
            <path d={chart.obs.map((o, i) => `${i ? 'L' : 'M'}${chart.x(o.day).toFixed(1)},${chart.y(o.v).toFixed(1)}`).join('')} fill="none" stroke="#0F172A" strokeWidth="1.5" />
          )}
          {chart.obs.map((o, i) => <circle key={i} cx={chart.x(o.day)} cy={chart.y(o.v)} r="3.5" fill="#0D9488" stroke="#fff" strokeWidth="1" />)}
        </svg>
      </div>
      <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>
        Green: median · amber: ±2 SD · red: ±3 SD ({conf.unit}). WHO Child Growth Standards.
      </p>
    </div>
  )
}

// ── Birth history ─────────────────────────────────────────────────────────────

const DELIVERY = { normal: 'Normal delivery', assisted: 'Assisted (forceps / vacuum)', caesarean: 'Caesarean section' } as const
const FEEDING = {
  exclusive_breastfeeding: 'Exclusive breastfeeding', mixed: 'Breast + formula', formula: 'Formula',
  complementary: 'Complementary feeding started', family_diet: 'Family diet',
} as const

function BirthHistory({ patientId, profile, disabled, onSaved }: { patientId: string; profile: PediatricProfile | null; disabled?: boolean; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({
    ga: str(profile?.gestational_age_weeks), bw: str(profile?.birth_weight_kg),
    mode: profile?.delivery_mode ?? '', nicu: profile?.nicu_admission == null ? '' : profile.nicu_admission ? 'yes' : 'no',
    feeding: profile?.feeding ?? '', notes: profile?.neonatal_notes ?? '',
  })
  const [err, setErr] = useState('')
  const [isPending, startTransition] = useTransition()

  const summary = profile
    ? [
        profile.gestational_age_weeks != null ? `${profile.gestational_age_weeks} wk${Number(profile.gestational_age_weeks) < 37 ? ' (preterm)' : ''}` : null,
        profile.birth_weight_kg != null ? `${profile.birth_weight_kg} kg${Number(profile.birth_weight_kg) < 2.5 ? ' (low birth weight)' : ''}` : null,
        profile.delivery_mode ? DELIVERY[profile.delivery_mode] : null,
        profile.nicu_admission ? 'NICU stay' : null,
        profile.feeding ? FEEDING[profile.feeding] : null,
      ].filter(Boolean).join(' · ')
    : ''

  function save() {
    setErr('')
    startTransition(async () => {
      const res = await savePediatricProfile(patientId, {
        gestational_age_weeks: num(f.ga), birth_weight_kg: num(f.bw),
        delivery_mode: (f.mode || null) as PediatricProfile['delivery_mode'],
        nicu_admission: f.nicu === '' ? null : f.nicu === 'yes',
        feeding: (f.feeding || null) as PediatricProfile['feeding'],
        neonatal_notes: f.notes,
      })
      if (!res.success) { setErr(res.error); return }
      await onSaved()
      setEditing(false)
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Birth history</p>
        {!disabled && !editing && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-xs font-medium" style={{ color: '#0D9488', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Pencil className="w-3 h-3" /> {profile ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      {!editing ? (
        <p className="text-sm" style={{ color: summary ? '#0F172A' : '#94A3B8' }}>{summary || 'Not recorded'}{profile?.neonatal_notes ? ` — ${profile.neonatal_notes}` : ''}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="block"><span className="block text-xs mb-1" style={{ color: '#475569' }}>Gestation (weeks)</span>
              <input type="number" inputMode="decimal" step="0.1" value={f.ga} onChange={(e) => setF({ ...f, ga: e.target.value })} style={inputStyle} /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: '#475569' }}>Birth weight (kg)</span>
              <input type="number" inputMode="decimal" step="0.01" value={f.bw} onChange={(e) => setF({ ...f, bw: e.target.value })} style={inputStyle} /></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: '#475569' }}>Delivery</span>
              <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as typeof f.mode })} style={inputStyle}>
                <option value="">—</option>{Object.entries(DELIVERY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label className="block"><span className="block text-xs mb-1" style={{ color: '#475569' }}>NICU stay</span>
              <select value={f.nicu} onChange={(e) => setF({ ...f, nicu: e.target.value })} style={inputStyle}>
                <option value="">—</option><option value="no">No</option><option value="yes">Yes</option>
              </select></label>
            <label className="block col-span-2"><span className="block text-xs mb-1" style={{ color: '#475569' }}>Feeding</span>
              <select value={f.feeding} onChange={(e) => setF({ ...f, feeding: e.target.value as typeof f.feeding })} style={inputStyle}>
                <option value="">—</option>{Object.entries(FEEDING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
          </div>
          <label className="block"><span className="block text-xs mb-1" style={{ color: '#475569' }}>Neonatal notes</span>
            <input type="text" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Jaundice, phototherapy, resuscitation…" style={inputStyle} /></label>
          {err && <p className="text-sm" style={{ color: '#DC2626' }}>{err}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={isPending} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {isPending ? 'Saving…' : 'Save birth history'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
