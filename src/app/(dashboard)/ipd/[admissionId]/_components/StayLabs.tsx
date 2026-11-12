'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, Wind, Microscope, CalendarClock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { getStayLabs, type StayLabs as Data } from '@/app/actions/stayLabs'
import { ABG_COLUMNS } from '@/lib/abg'

const FLAG_STYLE: Record<string, { color: string; weight: number }> = {
  high: { color: '#B91C1C', weight: 700 }, low: { color: '#1D4ED8', weight: 700 },
  critical_high: { color: '#fff', weight: 700 }, critical_low: { color: '#fff', weight: 700 },
  abnormal: { color: '#B45309', weight: 700 },
}
const isCritical = (f: string | null) => !!f && f.startsWith('critical')
const dayHead = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
const hm = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

function Head({ icon: Icon, title, hint }: { icon: typeof FlaskConical; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2 mb-3">
      <Icon className="w-4 h-4 mt-0.5" style={{ color: '#0D9488' }} />
      <div>
        <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</h2>
        {hint && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{hint}</p>}
      </div>
    </div>
  )
}

/**
 * The Labs tab: KMCH's Investigation Master Chart (every released result with
 * the days of the stay across), the blood gas table with P/F, cultures, and
 * the labs booked for tomorrow. Read from the lab; nothing is typed here.
 */
export default function StayLabs({ admissionId }: { admissionId: string }) {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    let alive = true
    getStayLabs(admissionId).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [admissionId])

  if (!data) return <GlassCard className="p-4"><p className="text-sm" style={{ color: '#94A3B8' }}>Loading results…</p></GlassCard>

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <Head icon={FlaskConical} title="Results by day" hint="Released results only. Red high, blue low, filled = critical. ×2 = done twice that day (latest shown)." />
        {data.rows.length === 0 ? (
          <p className="text-sm" style={{ color: '#94A3B8' }}>No released results on this stay yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
            <table className="text-xs" style={{ minWidth: `${16 + data.days.length * 6}rem`, width: '100%' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th className="text-left px-2.5 py-2 font-semibold sticky left-0" style={{ background: '#F8FAFC', minWidth: '12rem' }}>Test</th>
                  {data.days.map((d) => <th key={d} className="px-2.5 py-2 font-semibold text-center whitespace-nowrap">{dayHead(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, idx) => {
                  const groupRow = idx === 0 || data.rows[idx - 1].group !== r.group
                  return [
                    groupRow ? (
                      <tr key={`g:${r.group}`}><td colSpan={data.days.length + 1} className="px-2.5 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide sticky left-0" style={{ color: '#94A3B8', background: '#fff' }}>{r.group}</td></tr>
                    ) : null,
                    <tr key={r.key} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td className="px-2.5 py-1.5 sticky left-0" style={{ background: '#fff', color: '#334155' }}>
                        {r.label}{r.unit ? <span style={{ color: '#94A3B8' }}> {r.unit}</span> : null}
                      </td>
                      {data.days.map((d) => {
                        const c = r.cells[d]
                        if (!c) return <td key={d} className="px-2.5 py-1.5 text-center" style={{ color: '#E2E8F0' }}>·</td>
                        const st = c.flag ? FLAG_STYLE[c.flag] : null
                        return (
                          <td key={d} className="px-2.5 py-1.5 text-center tabular-nums whitespace-nowrap" title={c.flag ?? undefined}
                            style={{ color: st?.color ?? '#0F172A', fontWeight: st?.weight ?? 400, background: isCritical(c.flag) ? '#DC2626' : undefined }}>
                            {c.value}{c.count > 1 ? <sup style={{ color: isCritical(c.flag) ? '#fff' : '#94A3B8' }}> ×{c.count}</sup> : null}
                          </td>
                        )
                      })}
                    </tr>,
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <Head icon={Wind} title="Blood gas" hint="From the analyzer. FiO₂ and the ventilator settings are the round nearest the sample (within two hours)." />
        {data.abg.length === 0 ? <p className="text-sm" style={{ color: '#94A3B8' }}>No blood gas on this stay.</p> : (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
            <table className="text-xs w-full" style={{ minWidth: '64rem' }}>
              <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>
                <th className="text-left px-2.5 py-2 font-semibold">Time</th>
                {ABG_COLUMNS.map((c) => <th key={c.code} className="px-2 py-2 font-semibold text-center">{c.label}</th>)}
                <th className="px-2 py-2 font-semibold text-center">FiO₂</th><th className="px-2 py-2 font-semibold text-center">P/F</th>
                <th className="px-2 py-2 font-semibold text-center">Mode</th><th className="px-2 py-2 font-semibold text-center">VT</th>
                <th className="px-2 py-2 font-semibold text-center">RR</th><th className="px-2 py-2 font-semibold text-center">PS / PEEP</th>
              </tr></thead>
              <tbody>
                {data.abg.map((r) => (
                  <tr key={r.orderId} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: '#475569' }}>{hm(r.at)}</td>
                    {ABG_COLUMNS.map((c) => {
                      const v = r.values[c.code] ?? (c.alt ? r.values[c.alt] : undefined)
                      const st = v?.flag ? FLAG_STYLE[v.flag] : null
                      return <td key={c.code} className="px-2 py-1.5 text-center tabular-nums" style={{ color: st?.color ?? '#0F172A', fontWeight: st?.weight ?? 400, background: isCritical(v?.flag ?? null) ? '#DC2626' : undefined }}>{v?.value ?? '—'}</td>
                    })}
                    <td className="px-2 py-1.5 text-center">{r.fio2 != null ? `${r.fio2}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-center font-semibold" style={{ color: r.pf != null && r.pf < 300 ? '#B91C1C' : '#0F172A' }}>{r.pf ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.vent?.mode ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center">{r.vent?.vt ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center">{r.vent?.rr ?? '—'}</td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">{r.vent && (r.vent.ps != null || r.vent.peep != null) ? `${r.vent.ps ?? '–'}/${r.vent.peep ?? '–'}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <GlassCard className="p-4">
          <Head icon={Microscope} title="Cultures & Gram stains" hint="From the lab — the report as the lab wrote it" />
          {data.cultures.length === 0 ? <p className="text-sm" style={{ color: '#94A3B8' }}>No cultures or Gram stains sent on this stay.</p> : (
            <div className="space-y-2">
              {data.cultures.map((c) => (
                <div key={`${c.orderId}:${c.test}`} className="rounded-xl p-2.5 text-xs" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold" style={{ color: '#0F172A' }}>{c.test}</span>
                    <span className="px-1.5 py-0.5 rounded-md" style={{ background: c.result ? '#DCFCE7' : '#FEF3C7', color: c.result ? '#15803D' : '#92400E' }}>
                      {c.result ? 'Reported' : c.status === 'ordered' ? 'Not collected' : 'Awaiting growth'}
                    </span>
                  </div>
                  <p className="mt-0.5" style={{ color: '#64748B' }}>{c.sample ? `${c.sample} · ` : ''}sent {hm(c.orderedAt)}</p>
                  {c.result && <p className="mt-1 whitespace-pre-wrap" style={{ color: '#0F172A' }}>{c.result}</p>}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
        <GlassCard className="p-4">
          <Head icon={CalendarClock} title="Booked for later" hint="Ordered for a coming day, not yet collected" />
          {data.upcoming.length === 0 ? <p className="text-sm" style={{ color: '#94A3B8' }}>Nothing booked for tomorrow.</p> : (
            <div className="space-y-1.5">
              {data.upcoming.map((u) => (
                <p key={u.orderId} className="text-xs" style={{ color: '#334155' }}>
                  <b>{dayHead(u.on)}</b> — {u.tests}
                </p>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
