'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronRight, Download, Eye } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import { getActivity, type ActivityReport, type ActivityRow } from '@/app/actions/audit'
import { ACTIVITY_AREAS, type ActivityArea } from '@/lib/activity'
import { downloadCsv } from '@/lib/csv'

interface Props {
  initialReport: ActivityReport
  initialDate: string
  actors: { id: string; full_name: string }[]
}

const AREA_LABEL = Object.fromEntries(ACTIVITY_AREAS.map((a) => [a.key, a.label])) as Record<ActivityArea, string>
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

const field: React.CSSProperties = { background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '44px' }

/**
 * Who did what, and when — in plain words. The data is the audit log every
 * action already writes; this only reads it. Admin only.
 */
export default function AuditClient({ initialReport, initialDate, actors }: Props) {
  const [report, setReport] = useState(initialReport)
  const [from, setFrom] = useState(initialDate)
  const [to, setTo] = useState(initialDate)
  const [actorId, setActorId] = useState('')
  const [area, setArea] = useState<ActivityArea | 'sensitive' | ''>('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function load(next: { actorId?: string; area?: ActivityArea | 'sensitive' | '' } = {}) {
    const a = next.actorId ?? actorId, ar = next.area ?? area
    if (from > to) { setError('The start date is after the end date.'); return }
    setError('')
    startTransition(async () => {
      try { setReport(await getActivity({ from, to, actorId: a || null, area: ar || null })) }
      catch (e) { setError((e as Error).message) }
    })
  }

  function download() {
    downloadCsv(`activity_${from}_to_${to}.csv`, ['Date', 'Time', 'Person', 'Area', 'What happened'],
      report.rows.map((r) => [dayKey(r.at), timeLabel(r.at), r.actorName, AREA_LABEL[r.area], r.text]))
  }

  // Grouped by IST day, newest first (the rows already arrive in that order).
  const days: Array<{ key: string; label: string; rows: ActivityRow[] }> = []
  for (const r of report.rows) {
    const k = dayKey(r.at)
    if (days[days.length - 1]?.key !== k) days.push({ key: k, label: dayLabel(r.at), rows: [] })
    days[days.length - 1].rows.push(r)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Activity log" subtitle="Who did what, and when — every change made in Uyirly at your hospital." />

      <GlassCard className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1 block">
            <span className="text-xs font-medium" style={{ color: '#475569' }}>From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={field} />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs font-medium" style={{ color: '#475569' }}>To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm" style={field} />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium" style={{ color: '#475569' }}>Person</span>
            <Select value={actorId} onChange={(e) => setActorId(e.target.value)}>
              <option value="">Everyone</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium" style={{ color: '#475569' }}>Area</span>
            <Select value={area} onChange={(e) => setArea(e.target.value as ActivityArea | 'sensitive' | '')}>
              <option value="">Everything</option>
              {ACTIVITY_AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              <option value="sensitive">Legal registers viewed</option>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" onClick={() => load()} disabled={isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: isPending ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none' }}>
            {isPending ? 'Loading…' : 'Show'}
          </button>
          <button type="button" onClick={download} disabled={!report.rows.length}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium" style={{ background: '#F1F5F9', color: '#334155', border: 'none' }}>
            <Download className="w-4 h-4" /> Download CSV
          </button>
        </div>
        {error && <p className="mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{error}</p>}
      </GlassCard>

      {report.byPerson.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {report.byPerson.map((p) => {
            const on = !!p.actorId && p.actorId === actorId
            return (
              <button key={p.actorId ?? 'system'} type="button" disabled={!p.actorId || isPending}
                onClick={() => { const next = on ? '' : p.actorId!; setActorId(next); load({ actorId: next }) }}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: on ? '#0D9488' : '#fff', color: on ? '#fff' : '#334155', border: `1px solid ${on ? '#0D9488' : '#E2E8F0'}` }}>
                {p.name} · {p.count}
              </button>
            )
          })}
        </div>
      )}

      {report.truncated && (
        <p className="text-sm px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
          Showing the latest 3,000 entries only. Pick fewer days, or one person, to see the rest.
        </p>
      )}

      {days.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <p className="text-sm" style={{ color: '#64748B' }}>Nothing was recorded for these dates and filters.</p>
        </GlassCard>
      ) : days.map((d) => (
        <GlassCard key={d.key} className="p-0 overflow-hidden">
          <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ background: '#F8FAFC', color: '#64748B', borderBottom: '1px solid #F1F5F9' }}>
            {d.label} · {d.rows.length} {d.rows.length === 1 ? 'entry' : 'entries'}
          </div>
          <ul>
            {d.rows.map((r, i) => {
              const body = (
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-xs tabular-nums pt-0.5 w-16 flex-shrink-0 whitespace-nowrap" style={{ color: '#94A3B8' }}>{timeLabel(r.at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm" style={{ color: '#0F172A' }}>
                      <span className="font-semibold">{r.actorName}</span> <span>{r.text.charAt(0).toLowerCase() + r.text.slice(1)}</span>
                    </p>
                    <p className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: '#94A3B8' }}>
                      {AREA_LABEL[r.area]}
                      {r.sensitive && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 rounded font-semibold" style={{ background: '#FEF3C7', color: '#92400E' }}>
                          <Eye className="w-3 h-3" /> register viewed
                        </span>
                      )}
                    </p>
                  </div>
                  {r.href && <ChevronRight className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#CBD5E1' }} />}
                </div>
              )
              return (
                <li key={r.id} style={i ? { borderTop: '1px solid #F1F5F9' } : undefined}>
                  {r.href ? <Link href={r.href} className="block hover:bg-slate-50">{body}</Link> : body}
                </li>
              )
            })}
          </ul>
        </GlassCard>
      ))}
    </div>
  )
}
