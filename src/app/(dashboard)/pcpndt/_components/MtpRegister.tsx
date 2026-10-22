'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, FileText, Pill } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import DateText from '@/components/ui/DateText'
import { listMtp, getMtpDrugStatus, type MtpListRow, type MtpDrugStatusRow } from '@/app/actions/pcpndt'

/**
 * Terminations, with the drug stock immediately below them.
 *
 * Put together on one screen deliberately. The two reports are read against
 * each other by the authority — a hospital reporting four terminations and
 * thirty used combipacks has said something whether it meant to or not — so
 * the hospital should see the same comparison before it files, not afterwards.
 */
export default function MtpRegister({ initialRows, initialDrugs, initialMonth }: {
  initialRows: MtpListRow[]
  initialDrugs: MtpDrugStatusRow[]
  initialMonth: string
}) {
  const [month, setMonth] = useState(initialMonth)
  const [rows, setRows] = useState(initialRows)
  const [drugs, setDrugs] = useState(initialDrugs)
  const [isPending, startTransition] = useTransition()

  function changeMonth(next: string) {
    setMonth(next)
    startTransition(async () => {
      const [r, d] = await Promise.all([listMtp(next), getMtpDrugStatus(next)])
      setRows(r); setDrugs(d)
    })
  }

  const complete = rows.filter((r) => r.status === 'complete').length
  const drafts = rows.filter((r) => r.status === 'draft').length
  const medical = rows.filter((r) => r.method === 'medical' && r.status === 'complete').length
  const drugsUsed = drugs.reduce((n, d) => n + d.used_qty, 0)

  // The comparison the authority will make, shown before they file rather than
  // after. Not an accusation — a prompt to check the register is complete.
  const looksOff = complete > 0 && drugsUsed > complete * 3

  return (
    <div className="space-y-4">
      {drafts > 0 && (
        <GlassCard className="p-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
            <p className="text-xs" style={{ color: '#92400E' }}>
              <span className="font-semibold text-sm block">
                {drafts} record{drafts === 1 ? '' : 's'} not finished
              </span>
              The monthly statement to the Chief Medical Officer is built from completed records only.
            </p>
          </div>
        </GlassCard>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input type="month" value={month} onChange={(e) => changeMonth(e.target.value)}
          className="px-3 py-2 rounded-xl text-sm"
          style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A' }} />
        <span className="text-xs font-semibold" style={{ color: '#047857' }}>{complete} completed</span>
        {drafts > 0 && <span className="text-xs font-semibold" style={{ color: '#B45309' }}>{drafts} unfinished</span>}
        <Link href="/pcpndt" className="ml-auto text-xs font-semibold" style={{ color: '#0D9488' }}>
          Form F register →
        </Link>
      </div>

      {isPending ? (
        <GlassCard className="p-8 text-center"><p className="text-sm" style={{ color: '#94A3B8' }}>Loading…</p></GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<FileText className="w-6 h-6" style={{ color: '#94A3B8' }} />}
            title="No terminations recorded this month"
            description="A record is started from the patient's file. Nothing is reported to the CMO until it is completed."
          />
        </GlassCard>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <GlassCard key={r.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-mono font-semibold" style={{ color: '#0F766E', minWidth: '8.5rem' }}>
                  {r.serial_no}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>
                    {r.patient_name ?? '—'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    {r.procedure_date ? <DateText date={r.procedure_date} /> : 'No procedure date yet'}
                    {r.gestation_weeks != null ? ` · ${r.gestation_weeks} weeks` : ''}
                    {r.method ? ` · ${r.method}` : ''}
                    {r.performed_by_name ? ` · ${r.performed_by_name}` : ''}
                  </p>
                </div>
                {/* Beyond twenty weeks the Act needs two practitioners, so the
                    gestation is worth seeing without opening the record. */}
                {r.gestation_weeks != null && r.gestation_weeks > 20 && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{ background: '#FEF3C7', color: '#B45309' }}>
                    Beyond 20 weeks
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                  style={r.status === 'complete'
                    ? { background: '#ECFDF5', color: '#047857' }
                    : { background: '#FEF3C7', color: '#B45309' }}>
                  {r.status === 'complete' ? 'Complete' : 'Unfinished'}
                </span>
                <Link href={`/pcpndt/mtp/${r.id}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                  {r.status === 'draft' ? 'Finish' : 'View'}
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Report V, as the authority will see it. */}
      <GlassCard className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>
          <Pill className="w-4 h-4" style={{ color: '#0D9488' }} /> Drug stock this month
        </h3>
        <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>
          Counted from the pharmacy — purchases from the invoices received, usage from both counter
          sales and ward issues. Nothing here is typed in.
        </p>

        {drugs.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            No drugs are on the return yet. <Link href="/pcpndt/setup" style={{ color: '#0D9488' }}>Set them up →</Link>
          </p>
        ) : (
          <>
            {looksOff && (
              <div className="mb-3 p-2.5 rounded-lg" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <p className="text-xs" style={{ color: '#92400E' }}>
                  {drugsUsed} units used against {complete} completed record{complete === 1 ? '' : 's'}.
                  Worth checking nothing is missing from the register — this is the comparison the
                  Appropriate Authority makes, and it is better found here than there.
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#94A3B8' }}>
                    <th style={th}>Drug</th>
                    <th style={{ ...th, textAlign: 'right' }}>Opening</th>
                    <th style={{ ...th, textAlign: 'right' }}>Purchased</th>
                    <th style={th}>Invoice / supplier</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total</th>
                    <th style={{ ...th, textAlign: 'right' }}>Used</th>
                    <th style={{ ...th, textAlign: 'right' }}>Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {drugs.map((d) => (
                    <tr key={d.tracked_id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ ...td, fontWeight: 600, color: '#0F172A' }}>{d.report_label}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{d.opening_qty}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{d.purchased_qty}</td>
                      <td style={{ ...td, color: '#64748B' }}>{d.invoice_refs} · {d.suppliers}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{d.total_qty}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{d.used_qty}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{d.closing_qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
              {medical} of the completed records were medical terminations.
            </p>
          </>
        )}
      </GlassCard>
    </div>
  )
}

const th: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px',
  textTransform: 'uppercase', textAlign: 'left', padding: '6px 8px',
}
const td: React.CSSProperties = { padding: '7px 8px', color: '#475569' }
