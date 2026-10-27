'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Gavel, ShieldAlert, Printer } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import type { MlcListRow, MlcOption } from '@/app/actions/mlc'

/**
 * The register itself — every medico-legal entry the hospital has made.
 *
 * Listed newest first, by arrival rather than by serial, because the question
 * asked of this screen is almost always "what came in last night" and only
 * rarely "what was AR 142". The serial is there to be read out over the
 * telephone to a police station.
 */
export default function MlcRegister({ rows, options }: {
  rows: MlcListRow[]
  options: MlcOption[]
}) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'complete'>('all')

  const label = (code: string) =>
    options.find((o) => o.kind === 'mlc_type' && o.code === code)?.label ?? code

  const shown = rows.filter((r) =>
    filter === 'all' ? true
    : filter === 'draft' ? r.status === 'draft'
    : r.status === 'complete')

  const drafts = rows.filter((r) => r.status === 'draft').length

  return (
    <div>
      <div className="flex gap-1 mb-4 p-1 rounded-xl" role="tablist"
        style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid #E2E8F0', width: 'fit-content' }}>
        {([['all', `All (${rows.length})`],
           ['draft', `Unsigned (${drafts})`],
           ['complete', `Signed (${rows.filter((r) => r.status === 'complete').length})`]] as const)
          .map(([k, text]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                background: filter === k ? '#fff' : 'transparent',
                color: filter === k ? '#0F172A' : '#64748B',
                border: 'none', cursor: 'pointer',
                boxShadow: filter === k ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>
              {text}
            </button>
          ))}
      </div>

      {shown.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState
            title="Nothing in the register"
            description="Mark a casualty case medico-legal when you register it, and the entry starts from the emergency board."
          />
        </GlassCard>
      ) : (
        <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
          {shown.map((r) => (
            <div key={r.id}
              className="px-4 py-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
              style={{ borderBottom: '1px solid #F1F5F9' }}>
              {/* On a phone the chips and buttons below would otherwise squeeze
                  this column to a couple of pixels — the patient's name and the
                  AR number, which are the two things this register is for. */}
              <div className="flex items-start gap-3 min-w-0 sm:flex-1">
              <Gavel className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: r.status === 'complete' ? '#94A3B8' : '#DC2626' }} />

              <div className="min-w-0">
                <p className="text-sm font-semibold break-words" style={{ color: '#0F172A' }}>
                  {r.patient_name ?? '—'}
                  <span className="ml-2 font-mono text-xs font-normal" style={{ color: '#94A3B8' }}>
                    {r.ar_no}
                  </span>
                </p>
                <p className="text-xs" style={{ color: '#64748B' }}>
                  {r.arrived_at
                    ? new Date(r.arrived_at).toLocaleString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                      })
                    : '—'}
                  {(r.mlc_types ?? []).length > 0 && ` · ${(r.mlc_types ?? []).map(label).join(', ')}`}
                  {r.injury_grade && r.injury_grade !== 'deferred' && ` · ${r.injury_grade}`}
                </p>
              </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
              {/* Shown on every row, because an entry with no intimation against
                  it is the one thing on this screen that is a problem. */}
              {r.intimation_count === 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: 'rgba(220,38,38,0.08)', color: '#B91C1C', border: '1px solid #FECACA' }}>
                  <ShieldAlert className="w-3 h-3" /> police not informed
                </span>
              ) : (
                <span className="text-xs whitespace-nowrap" style={{ color: '#15803D' }}>
                  police informed{r.intimation_count > 1 ? ` ${r.intimation_count}×` : ''}
                </span>
              )}

              <StatusBadge
                status={r.status === 'complete' ? 'success' : r.status === 'amended' ? 'info' : 'pending'}
                label={r.status === 'complete' ? 'signed' : r.status === 'amended' ? 'superseded' : 'draft'} />

              {r.status === 'complete' && (
                <a href={`/print/mlc/${r.id}/ar`} target="_blank" rel="noopener"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0' }}>
                  <Printer className="w-3 h-3" /> Print
                </a>
              )}

              <Link href={`/emergency/mlc/${r.id}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#F1F5F9', color: '#475569', textDecoration: 'none' }}>
                {r.status === 'draft' ? 'Finish' : 'Open'}
              </Link>
              </div>
            </div>
          ))}
        </GlassCard>
      )}
    </div>
  )
}
