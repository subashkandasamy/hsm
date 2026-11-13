'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Loader2, Download } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Link from 'next/link'
import { getOwnerDay, getOwnerPeriod } from '@/app/actions/accounts'
import { exportReport } from '@/app/actions/dashboard'
import type { OwnerDay, OwnerPeriod } from '@/lib/types'

/**
 * How the hospital ran today, for the person who owns it.
 *
 * ── Why this is not the register with fewer rows ───────────────────────────
 *
 * The Accounts page answers *what exactly happened* and is read sitting down.
 * This answers *is today normal*, and is read standing up on the way past. So
 * almost every figure carries a comparison: ₹48,200 alone is a digit, and
 * ₹48,200 against an average Saturday of ₹51,000 is something to act on.
 *
 * ── Why collected and billed are never in the same column ──────────────────
 *
 * A payment belongs to a bill, not to a bill line, so money cannot be split
 * by department the way revenue can — and an advance has no department at all.
 * The three headline figures are separate facts, each true on its own, rather
 * than one blended number that would be wrong in a way nobody could see.
 *
 * ── Why the department bars are one colour ─────────────────────────────────
 *
 * They are one measure compared across categories, and the labels already
 * carry identity. Ten hues would add nothing a reader uses and cost the only
 * thing that matters here — being legible at a glance, in both themes, to
 * somebody who may not distinguish red from green.
 */

const SOURCE_LABEL: Record<string, string> = {
  consultation: 'Consultation', lab: 'Laboratory', radiology: 'Radiology',
  pharmacy: 'Pharmacy (OP)', ipd_pharmacy: 'Pharmacy (IP)', bed: 'Room & bed',
  nursing: 'Nursing', icu: 'Intensive care', ot: 'Operation theatre',
  blood: 'Blood bank', dental: 'Dental', manual: 'Other charges',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  bank_transfer: 'Bank', insurance: 'Insurance', cheque: 'Cheque',
}
const ACTIVITY_LABEL: Record<string, string> = {
  consultations: 'Consultations', emergency: 'Emergency', admissions: 'Admitted',
  discharges: 'Discharged', labTests: 'Lab tests', scans: 'Scans', surgeries: 'Surgeries',
}

function money(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

/** How today sits against an ordinary one of the same weekday. */
function Delta({ now, usual, isMoney }: { now: number; usual: number; isMoney?: boolean }) {
  if (!usual) return <span style={{ fontSize: '11px', color: '#CBD5E1' }}>no history yet</span>
  const diff = now - usual
  const pct = Math.round((diff / usual) * 100)
  // Under a tenth either way is noise, not news.
  const flat = Math.abs(pct) < 10
  const Icon = flat ? Minus : diff > 0 ? TrendingUp : TrendingDown
  const colour = flat ? '#94A3B8' : diff > 0 ? '#047857' : '#B45309'
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: '11px', color: colour }}>
      <Icon className="w-3 h-3" />
      {flat ? 'about usual' : `${pct > 0 ? '+' : ''}${pct}%`}
      <span style={{ color: '#CBD5E1' }}>
        · usually {isMoney ? money(usual) : usual}
      </span>
    </span>
  )
}

function Headline({ label, value, tint, children }: {
  label: string; value: string; tint: string; children?: React.ReactNode
}) {
  return (
    <GlassCard className="p-5">
      <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>{label}</p>
      <p className="tabular-nums" style={{ fontSize: '30px', fontWeight: 700, color: tint, lineHeight: 1.2 }}>
        {value}
      </p>
      {children}
    </GlassCard>
  )
}

/** Thirty days of cash in. A single series, so the title names it and there is no legend. */
function Trend({ points }: { points: Array<{ day: string; amount: number }> }) {
  const max = Math.max(...points.map((p) => p.amount), 1)
  const W = 100, H = 30
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - (p.amount / max) * H] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const last = xy[xy.length - 1]
  return (
    <GlassCard className="p-5">
      <div className="flex items-baseline justify-between mb-1">
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>
          COLLECTED — LAST 30 DAYS
        </p>
        <span className="tabular-nums" style={{ fontSize: '11px', color: '#94A3B8' }}>
          peak {money(max)}
        </span>
      </div>
      {/* The marker is positioned, not drawn.
          `preserveAspectRatio="none"` is what lets the line fill any width,
          and it stretches the x axis by roughly fifteen times — which turns a
          circle inside the same viewBox into a flat ellipse. `vector-effect`
          rescues a stroke width but not a shape, so the dot sits outside the
          scaled coordinate system and is placed with percentages instead. */}
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: '100%', height: '90px', display: 'block' }} role="img"
             aria-label={`Collections over the last thirty days, peaking at ${money(max)}`}>
          <path d={area} fill="#0D9488" fillOpacity="0.10" />
          <path d={line} fill="none" stroke="#0D9488" strokeWidth="0.6"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        <span style={{
          position: 'absolute', right: 0, top: `${(last[1] / H) * 100}%`,
          width: '8px', height: '8px', marginTop: '-4px', marginRight: '-4px',
          borderRadius: '50%', background: '#0D9488', border: '2px solid #fff',
          boxSizing: 'border-box',
        }} />
      </div>
      <div className="flex justify-between" style={{ fontSize: '10px', color: '#CBD5E1' }}>
        <span>{points[0]?.day}</span><span>{points[points.length - 1]?.day}</span>
      </div>
    </GlassCard>
  )
}

/** Sorted bars, one hue — the labels carry identity, so colour needn't. */
function Bars({ title, rows, note, empty = 'Nothing on this day.' }: {
  title: string; rows: Array<{ label: string; amount: number }>; note?: string; empty?: string
}) {
  const max = Math.max(...rows.map((r) => r.amount), 1)
  return (
    <GlassCard className="p-5">
      <p className="mb-3" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>
        {title}
      </p>
      {rows.length === 0
        ? <p style={{ fontSize: '13px', color: '#94A3B8' }}>{empty}</p>
        : rows.map((r) => (
            <div key={r.label} className="mb-2">
              <div className="flex items-baseline justify-between" style={{ fontSize: '12px' }}>
                <span style={{ color: '#475569' }}>{r.label}</span>
                <span className="tabular-nums" style={{ color: '#0F172A', fontWeight: 600 }}>{money(r.amount)}</span>
              </div>
              <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '3px', marginTop: '3px' }}>
                <div style={{
                  width: `${Math.max(2, (r.amount / max) * 100)}%`, height: '100%',
                  background: '#0D9488', borderRadius: '3px',
                }} />
              </div>
            </div>
          ))}
      {note && <p className="mt-2" style={{ fontSize: '11px', color: '#CBD5E1', lineHeight: 1.5 }}>{note}</p>}
    </GlassCard>
  )
}


// ── Month and Year ─────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayMon = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`
/** "1–13 Oct 2026", "1 Jan–13 Nov 2025". */
function rangeLabel(from: string, to: string): string {
  const y = to.slice(0, 4)
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return from === to ? `${dayMon(from)} ${y}` : `${Number(from.slice(8, 10))}–${dayMon(to)} ${y}`
  }
  return `${dayMon(from)}–${dayMon(to)} ${y}`
}
function monthName(ym: string): string {
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
}

/** This period against the same stretch before it — the same number of days. */
function VsPrevious({ now, prev, label, isMoney }: { now: number; prev: number; label: string; isMoney?: boolean }) {
  if (!prev) return <span style={{ fontSize: '11px', color: '#94A3B8' }}>{label}: {isMoney ? money(0) : 0}</span>
  const pct = Math.round(((now - prev) / prev) * 100)
  const flat = Math.abs(pct) < 10
  const Icon = flat ? Minus : now > prev ? TrendingUp : TrendingDown
  const colour = flat ? '#94A3B8' : now > prev ? '#047857' : '#B45309'
  return (
    <span className="inline-flex items-center gap-1 flex-wrap" style={{ fontSize: '11px', color: colour }}>
      <Icon className="w-3 h-3" />
      {flat ? 'about the same' : `${pct > 0 ? '+' : ''}${pct}%`}
      <span style={{ color: '#94A3B8' }}>· {label}: {isMoney ? money(prev) : prev}</span>
    </span>
  )
}

/** Collections per day (a month) or per month (a year). One series: the title names it. */
function PeriodBars({ title, points, label, tip }: {
  title: string; points: Array<{ key: string; amount: number }>
  label: (key: string, i: number) => string; tip: (key: string) => string
}) {
  const max = Math.max(...points.map((p) => p.amount), 1)
  const total = points.reduce((t, p) => t + p.amount, 0)
  const every = points.length > 16 ? 5 : 1   // a label on every fifth day of a month
  return (
    <GlassCard className="p-5">
      <div className="flex items-baseline justify-between mb-2">
        <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>{title}</p>
        <span className="tabular-nums" style={{ fontSize: '11px', color: '#94A3B8' }}>peak {money(max)}</span>
      </div>
      <div role="img" aria-label={`${title}: ${money(total)} in all, highest ${money(max)}`}
           className="flex items-end" style={{ gap: '2px', height: '110px', borderBottom: '1px solid #E2E8F0' }}>
        {points.map((p) => (
          <div key={p.key} title={`${tip(p.key)}: ${money(p.amount)}`}
               className="flex-1 flex items-end" style={{ height: '100%', cursor: 'default' }}>
            <div style={{
              width: '100%', height: p.amount > 0 ? `${Math.max(2, (p.amount / max) * 100)}%` : '0',
              background: '#0D9488', borderRadius: '4px 4px 0 0',
            }} />
          </div>
        ))}
      </div>
      <div className="flex" style={{ gap: '2px', fontSize: '10px', color: '#94A3B8', marginTop: '4px' }}>
        {points.map((p, i) => (
          <span key={p.key} className="flex-1 text-center tabular-nums" style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {i % every === 0 || i === points.length - 1 ? label(p.key, i) : ''}
          </span>
        ))}
      </div>
    </GlassCard>
  )
}

/** A calendar month or year — to today while it is still running. */
function PeriodView({ p, onDownload }: { p: OwnerPeriod; onDownload: (type: 'patient_footfall' | 'bed_occupancy' | 'test_volumes', from: string, to: string) => void }) {
  const cmp = rangeLabel(p.compare.from, p.compare.to)
  const methods = Object.entries(p.collected.byMethod).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])
  const empty = p.kind === 'month' ? 'Nothing in this month.' : 'Nothing in this year.'
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Headline label="COLLECTED" value={money(p.collected.total)} tint="#0D9488">
          <VsPrevious now={p.collected.total} prev={p.collected.previous} label={cmp} isMoney />
        </Headline>
        <Headline label="BILLED" value={money(p.billed.total)} tint="#2563EB">
          <span className="block" style={{ fontSize: '11px', color: '#94A3B8' }}>
            on {p.billed.bills} bill{p.billed.bills === 1 ? '' : 's'}
          </span>
          <VsPrevious now={p.billed.total} prev={p.billed.previous} label={cmp} isMoney />
        </Headline>
        <Headline label="YET TO COLLECT" value={money(p.outstanding.fromPeriod)} tint="#B45309">
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>
            on bills raised in this {p.kind} · {money(p.outstanding.allNow)} owed in all today
          </span>
        </Headline>
      </div>

      <div className="mb-4">
        {p.kind === 'month'
          ? <PeriodBars title="COLLECTED — EACH DAY" points={p.trend}
              label={(k) => String(Number(k.slice(8, 10)))} tip={(k) => dayMon(k)} />
          : <PeriodBars title="COLLECTED — EACH MONTH" points={p.trend}
              label={(k) => MON[Number(k.slice(5, 7)) - 1]} tip={(k) => monthName(k)} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Bars title="BILLED BY TYPE" empty={empty}
              rows={p.billed.sources.map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, amount: s.amount }))}
              note="What was raised, split by department. Not the same as what was collected." />
        <Bars title="HOW IT WAS PAID" empty={empty}
              rows={methods.map(([m, v]) => ({ label: METHOD_LABEL[m] ?? m, amount: v }))}
              note="Money that arrived, whichever bill it was for." />
      </div>

      <GlassCard className="p-5 mb-4">
        <p className="mb-3" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>
          ACTIVITY
        </p>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {p.activity.map((a) => (
            <div key={a.key}>
              <p style={{ fontSize: '12px', color: '#64748B' }}>{ACTIVITY_LABEL[a.key] ?? a.key}</p>
              <p className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                {a.count}
              </p>
              <VsPrevious now={a.count} prev={a.previous} label={cmp} />
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span style={{ fontSize: '11px', color: '#94A3B8' }}>{rangeLabel(p.from, p.to)} as a file:</span>
        {([['patient_footfall', 'Footfall'], ['bed_occupancy', 'Bed occupancy'], ['test_volumes', 'Test volumes']] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => onDownload(k, p.from, p.to)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ fontSize: '12px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <Download className="w-3 h-3" /> {label}
            </button>
          ))}
      </div>
    </>
  )
}

/** The date / month / year box: a fixed width beside the switch, its height. */
const PICKER: React.CSSProperties = { width: '11.5rem', height: '44px', minHeight: '44px', flexShrink: 0 }

export default function OwnerDashboard({ today, initial }: { today: string; initial: OwnerDay }) {
  const [date, setDate] = useState(today)
  const [day, setDay]   = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Day, Month and Year are separate views, each with its own picker.
  const [view, setView] = useState<'day' | 'month' | 'year'>('day')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [year, setYear] = useState(today.slice(0, 4))
  const [period, setPeriod] = useState<OwnerPeriod | null>(null)
  const [firstYear, setFirstYear] = useState(Number(today.slice(0, 4)))

  async function loadPeriod(kind: 'month' | 'year', value: string) {
    setBusy(true); setError(null)
    try { const p = await getOwnerPeriod(kind, value); setPeriod(p); setFirstYear(p.firstYear) }
    catch (e) { setPeriod(null); setError((e as Error).message || `Could not load that ${kind}`) }
    finally { setBusy(false) }
  }
  function switchView(v: 'day' | 'month' | 'year') {
    setView(v); setError(null)
    if (v === 'month') { setPeriod(null); void loadPeriod('month', month) }
    if (v === 'year') { setPeriod(null); void loadPeriod('year', year) }
  }

  async function load(d: string) {
    setDate(d); setBusy(true); setError(null)
    try { setDay(await getOwnerDay(d)) }
    catch (e) { setError((e as Error).message || 'Could not load that day') }
    finally { setBusy(false) }
  }

  /**
   * The operational series, as a file.
   *
   * Footfall, bed occupancy and test volumes are counts rather than money, so
   * they belong beside the activity figures and not in the accountant's
   * register. They live here rather than nowhere: all three were returning
   * empty files until the column names were fixed, and throwing the working
   * exports away in the same week they started working would be a waste.
   */
  async function downloadSeries(type: 'patient_footfall' | 'bed_occupancy' | 'test_volumes', rangeFrom?: string, rangeTo?: string) {
    setError(null)
    try {
      const from = new Date(date); from.setDate(from.getDate() - 29)
      const dateFrom = rangeFrom ?? from.toISOString().slice(0, 10)
      const dateTo = rangeTo ?? date
      const csv = await exportReport({ type, dateFrom, dateTo })
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF])
      const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${type}_${dateFrom}_${dateTo}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message || 'Could not build that file')
    }
  }

  const attention = view !== 'day' && period ? period.attention : day.attention
  const methods = Object.entries(day.collected.byMethod)
    .filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={view === 'day'
          ? (date === today ? 'How the hospital is running today' : `How the hospital ran on ${date}`)
          : period
            ? `${view === 'month' ? monthName(period.value) : period.value} — ${rangeLabel(period.from, period.to)}${period.to === today ? ' (so far)' : ''}`
            : view === 'month' ? monthName(month) : year}
        actions={
          // One row: the switch and its picker side by side, the same height.
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {busy && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#94A3B8' }} />}
            <div role="tablist" aria-label="Period" className="flex flex-shrink-0 rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', background: '#fff' }}>
              {(['day', 'month', 'year'] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => switchView(v)}
                  className="px-4 text-sm font-medium"
                  style={view === v
                    ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', height: '42px' }
                    : { background: '#fff', color: '#475569', border: 'none', cursor: 'pointer', height: '42px' }}>
                  {v === 'day' ? 'Day' : v === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
            {view === 'day' && <Input type="date" aria-label="Day" value={date} max={today} onChange={(e) => load(e.target.value)} style={PICKER} />}
            {view === 'month' && (
              <Input type="month" aria-label="Month" value={month} max={today.slice(0, 7)} style={PICKER}
                onChange={(e) => { if (!e.target.value) return; setMonth(e.target.value); void loadPeriod('month', e.target.value) }} />
            )}
            {view === 'year' && (
              <select aria-label="Year" value={year}
                onChange={(e) => { setYear(e.target.value); void loadPeriod('year', e.target.value) }}
                className="px-3 rounded-xl text-sm" style={{ ...PICKER, width: '7rem', border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A', cursor: 'pointer' }}>
                {Array.from({ length: Number(today.slice(0, 4)) - firstYear + 1 }, (_, i) => String(Number(today.slice(0, 4)) - i))
                  .map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
             style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {view === 'day' ? (
        <>
      {/* ── The three facts, never added together ── */}
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Headline label="COLLECTED" value={money(day.collected.total)} tint="#0D9488">
          <Delta now={day.collected.total} usual={day.collected.usualForThisWeekday} isMoney />
        </Headline>
        <Headline label="BILLED" value={money(day.billed.total)} tint="#2563EB">
          <span style={{ fontSize: '11px', color: '#CBD5E1' }}>
            on {day.billed.bills} bill{day.billed.bills === 1 ? '' : 's'}
          </span>
        </Headline>
        <Headline label="YET TO COLLECT" value={money(day.outstanding.total)} tint="#B45309">
          <span style={{ fontSize: '11px', color: '#CBD5E1' }}>
            across {day.outstanding.bills} unpaid bill{day.outstanding.bills === 1 ? '' : 's'} — all time
          </span>
        </Headline>
      </div>

      <div className="mb-4"><Trend points={day.trend} /></div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Bars title="BILLED BY TYPE"
              rows={day.billed.sources.map((s) => ({ label: SOURCE_LABEL[s.source] ?? s.source, amount: s.amount }))}
              note="What was raised, split by department. Not the same as what was collected." />
        <Bars title="HOW IT WAS PAID"
              rows={methods.map(([m, v]) => ({ label: METHOD_LABEL[m] ?? m, amount: v }))}
              note="Money that arrived, whichever bill it was for." />
        <GlassCard className="p-5">
          <p className="mb-3" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>
            BEDS
          </p>
          <p className="tabular-nums" style={{ fontSize: '30px', fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
            {day.beds.percent}%
          </p>
          <p className="mb-3" style={{ fontSize: '12px', color: '#64748B' }}>
            {day.beds.occupied} of {day.beds.total} occupied
          </p>
          <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px' }}>
            <div style={{
              width: `${Math.min(100, day.beds.percent)}%`, height: '100%',
              background: day.beds.percent >= 90 ? '#B45309' : '#0D9488', borderRadius: '4px',
            }} />
          </div>
        </GlassCard>
      </div>

      {/* ── Activity: available, not competing ── */}
      <GlassCard className="p-5 mb-4">
        <p className="mb-3" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>
          ACTIVITY
        </p>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {day.activity.map((a) => (
            <div key={a.key}>
              <p style={{ fontSize: '12px', color: '#64748B' }}>{ACTIVITY_LABEL[a.key] ?? a.key}</p>
              <p className="tabular-nums" style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                {a.count}
              </p>
              <Delta now={a.count} usual={a.usualForThisWeekday} />
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span style={{ fontSize: '11px', color: '#94A3B8' }}>Last 30 days as a file:</span>
        {([['patient_footfall', 'Footfall'], ['bed_occupancy', 'Bed occupancy'], ['test_volumes', 'Test volumes']] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => downloadSeries(k)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{ fontSize: '12px', background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <Download className="w-3 h-3" /> {label}
            </button>
          ))}
      </div>

        </>
      ) : period ? (
        <PeriodView p={period} onDownload={(t, f, to) => downloadSeries(t, f, to)} />
      ) : null}

      {/* ── Worth interrupting someone for ── */}
      {(attention.staleBills > 0 || attention.lowStock > 0) && (
        <div className="flex flex-wrap gap-3">
          {attention.staleBills > 0 && (
            <Link href="/accounts" className="flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: '13px', textDecoration: 'none' }}>
              <AlertTriangle className="w-4 h-4" />
              {attention.staleBills} bill{attention.staleBills === 1 ? '' : 's'} unpaid for over 30 days
              — <strong>{money(attention.staleAmount)}</strong>
            </Link>
          )}
          {attention.lowStock > 0 && (
            <Link href="/inventory" className="flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: '13px', textDecoration: 'none' }}>
              <AlertTriangle className="w-4 h-4" />
              {attention.lowStock} item{attention.lowStock === 1 ? '' : 's'} low on stock
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
