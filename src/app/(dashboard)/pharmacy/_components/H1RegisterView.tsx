'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import DateText from '@/components/ui/DateText'
import { listH1Register, type H1Entry } from '@/app/actions/pharmacy'
import { istToday } from '@/lib/istDate'
import { downloadCsv } from '@/lib/csv'

const inp: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: '0.5rem', padding: '0.4rem 0.6rem',
  fontSize: '0.875rem', color: '#0F172A', background: '#fff', minHeight: '38px',
}

/** First day of the current month, in IST. */
function monthStart(): string {
  return `${istToday().slice(0, 8)}01`
}

/**
 * The register a drug inspector asks for. It is written by the database as
 * medicines are dispensed, so this screen only reads and exports it — there is
 * nothing to fill in by hand, and nothing here can edit it.
 */
/** The two registers differ in what the law asks of them, so each says so. */
const COPY: Record<'H1' | 'X', { title: string; about: string; empty: string; file: string }> = {
  H1: {
    title: 'Schedule H1 register',
    about: 'Written as each medicine is handed over, and kept for three years. Rule 65(11A) requires the patient, the prescriber, the drug and the quantity for every H1 supply.',
    empty: 'No Schedule H1 medicine was supplied between these dates.',
    file: 'schedule-h1-register',
  },
  X: {
    title: 'Schedule X register',
    about: 'Kept separately from the H1 register. The prescription itself must also be retained by the pharmacy — this register does not replace it.',
    empty: 'No Schedule X medicine was supplied between these dates.',
    file: 'schedule-x-register',
  },
}

export default function H1RegisterView({ schedule = 'H1' }: { schedule?: 'H1' | 'X' }) {
  const copy = COPY[schedule]
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(istToday())
  // null until the first read returns — which is also what "loading" means here,
  // so there is no separate flag to set from inside the effect.
  const [rows, setRows] = useState<H1Entry[] | null>(null)
  const loading = rows === null

  useEffect(() => {
    let live = true
    listH1Register(from, to, schedule)
      .then((r) => { if (live) setRows(r) })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [from, to, schedule])

  // Schedule X records why each supply was made (0269); older entries say so rather than show a blank.
  const showReason = schedule === 'X'
  const reasonText = (r: H1Entry) => r.reason ?? 'not recorded'

  function download() {
    downloadCsv(`${copy.file}_${from}_to_${to}.csv`,
      ['Entry', 'Date', 'Schedule', 'Patient', 'UHID', 'Address', 'Prescriber', 'Drug', 'Brand', 'Batch', 'Qty', 'Supplied to', ...(showReason ? ['Reason'] : []), 'Supplied by'],
      (rows ?? []).map((r) => [
        r.entry_no, r.supplied_on, r.schedule, r.patient_name, r.patient_uhid, r.patient_address,
        r.prescriber_name, r.drug_name, r.brand_name, r.batch_no, r.qty, r.ward ? 'Ward' : 'Counter',
        ...(showReason ? [reasonText(r)] : []), r.supplied_by_name,
      ]))
  }

  return (
    <div className="space-y-3">
      <GlassCard className="p-3">
        <div className="flex items-start gap-3 flex-wrap">
          <ShieldCheck className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: '#0D9488' }} />
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{copy.title}</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{copy.about}</p>
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>From</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={inp} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>To</span>
              <input type="date" value={to} min={from} max={istToday()} onChange={(e) => setTo(e.target.value)} style={inp} />
            </label>
            <button onClick={download} disabled={!rows?.length}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ background: rows?.length ? '#0D9488' : '#94A3B8', color: '#fff', border: 'none', cursor: rows?.length ? 'pointer' : 'not-allowed' }}>
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <GlassCard className="p-6">
          <p className="flex items-center justify-center gap-2 text-sm" style={{ color: '#94A3B8' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Reading the register…
          </p>
        </GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title="Nothing in this period"
            description={copy.empty} />
        </GlassCard>
      ) : (
        <GlassCard className="p-0 overflow-x-auto">
          <table className="w-full text-xs" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#F8FAFC', color: '#64748B' }}>
                {['Entry', 'Date', 'Patient', 'Prescriber', 'Medicine', 'Batch', 'Qty', ...(showReason ? ['Reason'] : []), 'Supplied by'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entry_no} style={{ borderTop: '1px solid #F1F5F9', color: '#0F172A' }}>
                  <td className="px-3 py-2 font-mono">{r.entry_no}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><DateText date={r.supplied_on} /></td>
                  <td className="px-3 py-2">
                    {r.patient_name}
                    {r.patient_uhid && <span className="block" style={{ color: '#94A3B8' }}>{r.patient_uhid}</span>}
                    {r.ward && <span className="inline-block mt-0.5 px-1.5 rounded text-[10px] font-semibold" style={{ background: '#EEF2FF', color: '#4338CA' }}>Ward</span>}
                  </td>
                  <td className="px-3 py-2">{r.prescriber_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.brand_name ?? r.drug_name}</span>
                    {r.brand_name && <span className="block" style={{ color: '#94A3B8' }}>{r.drug_name}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.batch_no ?? '—'}</td>
                  <td className="px-3 py-2 font-semibold">{r.qty}</td>
                  {showReason && (
                    <td className="px-3 py-2" style={{ color: r.reason ? '#0F172A' : '#B45309' }}>{reasonText(r)}</td>
                  )}
                  <td className="px-3 py-2">{r.supplied_by_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  )
}
