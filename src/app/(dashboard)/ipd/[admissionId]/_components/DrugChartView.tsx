'use client'

import { Printer } from 'lucide-react'
import { buildDrugChart, dayMonth, istTime, type DrugChart } from '@/lib/drugChart'
import type { IpdAdminSchedule, IpdMedicationOrder } from '@/lib/types'

const MARK_COLOR: Record<string, string> = { given: '#15803D', missed: '#B91C1C', held: '#7C3AED', pending: '#94A3B8' }
const th = 'px-2 py-1.5 text-left font-semibold whitespace-nowrap'
const td = 'px-2 py-1.5 align-top'
const dm = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })

function Table({ title, head, children, empty }: { title: string; head: string[]; children: React.ReactNode; empty: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color: '#0F172A' }}>{title}</p>
      {empty ? <p className="text-xs" style={{ color: '#94A3B8' }}>None.</p> : (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
          <table className="text-[11px] w-full">
            <thead><tr style={{ background: '#F8FAFC', color: '#475569' }}>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/**
 * KMCH's Drug & Fluid Chart on screen: regular prescriptions with the date ×
 * time grid, the STAT / SOS doses, IV bags and drug infusions — the same view
 * the printed chart gives (src/lib/drugChart.ts).
 */
export default function DrugChartView({ admissionId, orders, schedule, today }: {
  admissionId: string; orders: IpdMedicationOrder[]; schedule: IpdAdminSchedule[]; today: string
}) {
  const c: DrugChart = buildDrugChart(orders, schedule, today)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs" style={{ color: '#94A3B8' }}>G given · X missed · H held · • due. Hover a time for who gave it.</p>
        <a href={`/print/ipd/${admissionId}/drug-chart/pdf`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }}>
          <Printer className="w-3.5 h-3.5" /> Print drug chart
        </a>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1.5" style={{ color: '#0F172A' }}>Regular prescriptions</p>
        {c.regular.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>None.</p> : (
          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
            <table className="text-[11px]" style={{ minWidth: `${22 + c.days.length * 5}rem`, width: '100%' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#475569' }}>
                  <th className={`${th} sticky left-0`} style={{ background: '#F8FAFC', minWidth: '18rem' }}>Drug</th>
                  {c.days.map((d) => <th key={d} className={`${th} text-center`}>{dayMonth(d)}</th>)}
                </tr>
              </thead>
              <tbody>
                {c.regular.map((r, i) => (
                  <tr key={r.orderId} style={{ borderTop: '1px solid #F1F5F9', opacity: r.stopped ? 0.6 : 1 }}>
                    <td className={`${td} sticky left-0`} style={{ background: '#fff' }}>
                      <p className="font-semibold" style={{ color: '#0F172A' }}>{i + 1}. {r.drug}{r.stopped ? ' (stopped)' : ''}</p>
                      <p style={{ color: '#64748B' }}>
                        {[r.dose, r.route, r.frequency, `from ${dm(r.start)}`, `${r.duration} d`].filter(Boolean).join(' · ')}
                        {r.instructions ? ` · ${r.instructions}` : ''}{r.doctor ? ` · ${r.doctor}` : ''}
                      </p>
                    </td>
                    {c.days.map((d) => (
                      <td key={d} className={`${td} text-center tabular-nums`}>
                        {(r.cells[d] ?? []).map((x, j) => (
                          <span key={j} className="block whitespace-nowrap" title={x.title} style={{ color: MARK_COLOR[x.status] ?? '#334155' }}>
                            {x.time} <b>{x.mark}</b>
                          </span>
                        ))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Table title="STAT (PRN / SOS) — one only and premedication" empty={!c.sos.length}
        head={['Date', 'Time', 'Drug', 'Dose', 'Route', 'Order', "Doctor", 'Given by', 'Checked by', 'Reason not given']}>
        {c.sos.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
            <td className={td}>{dm(r.at)}</td><td className={td}>{istTime(r.at)}</td>
            <td className={td} style={{ color: '#0F172A', fontWeight: 600 }}>{r.drug}</td><td className={td}>{r.status === 'given' ? r.dose ?? '—' : '—'}</td>
            <td className={td}>{r.route ?? '—'}</td><td className={td}>{r.kind}</td><td className={td}>{r.doctor ?? '—'}</td>
            <td className={td}>{r.status === 'given' ? r.givenBy ?? '—' : '—'}</td><td className={td}>{r.checkedBy ?? '—'}</td>
            <td className={td} style={{ color: r.status !== 'given' ? '#B91C1C' : undefined }}>{r.status !== 'given' ? `${r.status}${r.note ? ` — ${r.note}` : ''}` : ''}</td>
          </tr>
        ))}
      </Table>

      <Table title="Intravenous infusion therapy" empty={!c.iv.length}
        head={['Date', 'IV fluid', 'Volume', 'Drugs added', 'Rate ml/h', 'Doctor', 'Start', 'Finish', 'Given by', 'Checked by', 'Bag no.']}>
        {c.iv.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
            <td className={td}>{dm(r.at)}</td><td className={td} style={{ color: '#0F172A', fontWeight: 600 }}>{r.fluid}</td>
            <td className={td}>{r.volume != null ? `${r.volume} ml` : '—'}</td><td className={td}>{r.added ?? '—'}</td><td className={td}>{r.rate ?? '—'}</td>
            <td className={td}>{r.doctor ?? '—'}</td><td className={td}>{r.start ? istTime(r.start) : r.status}</td><td className={td}>{r.finish ? istTime(r.finish) : '—'}</td>
            <td className={td}>{r.givenBy ?? '—'}</td><td className={td}>{r.checkedBy ?? '—'}</td><td className={td}>{r.bagNo ?? '—'}</td>
          </tr>
        ))}
      </Table>

      <Table title="Drug infusion" empty={!c.infusions.length}
        head={['Date', 'Drug', 'Concentration', 'Route', 'Rate ml/h', 'Doctor', 'Nurse']}>
        {c.infusions.map((r, i) => (
          <tr key={i} style={{ borderTop: '1px solid #F1F5F9', opacity: r.stopped ? 0.6 : 1 }}>
            <td className={td}>{dm(r.at)}</td><td className={td} style={{ color: '#0F172A', fontWeight: 600 }}>{r.drug}{r.stopped ? ' (stopped)' : ''}</td>
            <td className={td}>{r.concentration ?? '—'}</td><td className={td}>{r.route ?? '—'}</td><td className={td}>{r.rate ?? '—'}</td>
            <td className={td}>{r.doctor ?? '—'}</td><td className={td}>{r.nurse ?? '—'}</td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
