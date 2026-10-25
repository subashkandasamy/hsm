'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Loader2, Download } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Link from 'next/link'
import { getOwnerDay } from '@/app/actions/accounts'
import { exportReport } from '@/app/actions/dashboard'
import type { OwnerDay } from '@/lib/types'

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
function Bars({ title, rows, note }: {
  title: string; rows: Array<{ label: string; amount: number }>; note?: string
}) {
  const max = Math.max(...rows.map((r) => r.amount), 1)
  return (
    <GlassCard className="p-5">
      <p className="mb-3" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8' }}>
        {title}
      </p>
      {rows.length === 0
        ? <p style={{ fontSize: '13px', color: '#94A3B8' }}>Nothing on this day.</p>
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

export default function OwnerDashboard({ today, initial }: { today: string; initial: OwnerDay }) {
  const [date, setDate] = useState(today)
  const [day, setDay]   = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  async function downloadSeries(type: 'patient_footfall' | 'bed_occupancy' | 'test_volumes') {
    setError(null)
    try {
      const from = new Date(date); from.setDate(from.getDate() - 29)
      const dateFrom = from.toISOString().slice(0, 10)
      const csv = await exportReport({ type, dateFrom, dateTo: date })
      const BOM = new Uint8Array([0xEF, 0xBB, 0xBF])
      const url = URL.createObjectURL(new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${type}_${dateFrom}_${date}.csv`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message || 'Could not build that file')
    }
  }

  const methods = Object.entries(day.collected.byMethod)
    .filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={date === today ? 'How the hospital is running today' : `How the hospital ran on ${date}`}
        actions={
          <div className="flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#94A3B8' }} />}
            <Input type="date" value={date} max={today} onChange={(e) => load(e.target.value)} />
          </div>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl text-sm"
             style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

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

      {/* ── Worth interrupting someone for ── */}
      {(day.attention.staleBills > 0 || day.attention.lowStock > 0) && (
        <div className="flex flex-wrap gap-3">
          {day.attention.staleBills > 0 && (
            <Link href="/accounts" className="flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: '13px', textDecoration: 'none' }}>
              <AlertTriangle className="w-4 h-4" />
              {day.attention.staleBills} bill{day.attention.staleBills === 1 ? '' : 's'} unpaid for over 30 days
              — <strong>{money(day.attention.staleAmount)}</strong>
            </Link>
          )}
          {day.attention.lowStock > 0 && (
            <Link href="/inventory" className="flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: '13px', textDecoration: 'none' }}>
              <AlertTriangle className="w-4 h-4" />
              {day.attention.lowStock} item{day.attention.lowStock === 1 ? '' : 's'} low on stock
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
