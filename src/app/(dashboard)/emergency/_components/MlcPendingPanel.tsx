'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gavel, Clock, ShieldAlert, FileText } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { startMlc, listMlcPending, type MlcPendingRow } from '@/app/actions/mlc'
import { getCasePatient } from '@/app/actions/emergency'
import PoliceIntimationModal from './PoliceIntimationModal'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

/**
 * What the hospital still owes on its medico-legal cases.
 *
 * This panel only exists when there is something outstanding, and it sits
 * above the board because the duties it tracks are time-bound in a way nothing
 * else on this screen is: BNSS 2023 section 397 says the police are to be
 * informed immediately, and a register entry that is never signed is, in
 * evidential terms, a case the hospital cannot speak to.
 *
 * The hours since arrival are shown rather than a deadline, because there is
 * no statutory grace period to count down to — "immediately" has already
 * passed. The number is there to be uncomfortable.
 */
export default function MlcPendingPanel({ initial }: { initial: MlcPendingRow[] }) {
  const router = useRouter()
  const isReadOnly = useIsReadOnly()
  const [rows, setRows] = useState(initial)
  const [intimating, setIntimating] = useState<MlcPendingRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()

  async function refresh() {
    setRows(await listMlcPending())
    start(() => router.refresh())
  }

  async function openEntry(row: MlcPendingRow) {
    if (row.mlc_id) { router.push(`/emergency/mlc/${row.mlc_id}`); return }
    setBusyId(row.emergency_case_id); setError(null)
    // The panel has the case but not the patient, so the action resolves it.
    const r = await startMlcForCase(row.emergency_case_id)
    setBusyId(null)
    if (!r.ok) { setError(r.error); return }
    router.push(`/emergency/mlc/${r.id}`)
  }

  if (rows.length === 0) return null

  const uninformed = rows.filter((r) => r.intimation_count === 0).length

  return (
    <>
      <GlassCard className="mb-5" style={{ padding: 0, overflow: 'hidden', borderColor: '#FECACA' }}>
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap"
          style={{ background: 'rgba(220,38,38,0.06)', borderBottom: '1px solid #FECACA' }}>
          <Gavel className="w-4 h-4 flex-shrink-0" style={{ color: '#DC2626' }} />
          <p className="text-sm font-bold" style={{ color: '#991B1B' }}>
            {rows.length} medico-legal case{rows.length !== 1 ? 's' : ''} outstanding
          </p>
          {uninformed > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: '#DC2626', color: '#fff' }}>
              {uninformed} with the police not yet informed
            </span>
          )}
        </div>

        {rows.map((row) => {
          const noPolice = row.intimation_count === 0
          return (
            <div key={row.emergency_case_id}
              className="flex items-center gap-3 px-4 py-3 flex-wrap"
              style={{ borderBottom: '1px solid #F1F5F9' }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>
                  {row.patient_name ?? '—'}
                  {row.ar_no && (
                    <span className="ml-2 font-mono text-xs font-normal" style={{ color: '#94A3B8' }}>
                      {row.ar_no}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-x-2 gap-y-0.5 mt-0.5 flex-wrap text-xs">
                  <span className="flex items-center gap-0.5 whitespace-nowrap"
                    style={{ color: row.hours_since_arrival >= 24 ? '#DC2626' : '#64748B' }}>
                    <Clock className="w-3 h-3" /> {formatHours(row.hours_since_arrival)} since arrival
                  </span>
                  <span className="whitespace-nowrap" style={{ color: noPolice ? '#DC2626' : '#15803D' }}>
                    {noPolice
                      ? 'police not informed'
                      : `police informed ${row.intimation_count > 1 ? `${row.intimation_count}×` : ''}`}
                  </span>
                  <span className="whitespace-nowrap" style={{ color: '#64748B' }}>
                    {row.mlc_status === 'none' ? 'no register entry' : 'entry not signed'}
                  </span>
                </div>
              </div>

              {noPolice && (
                <button onClick={() => row.mlc_id ? setIntimating(row) : openEntry(row)}
                  disabled={isReadOnly}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: '#DC2626', color: '#fff', border: 'none',
                    cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1,
                  }}>
                  <ShieldAlert className="w-3 h-3" /> Inform police
                </button>
              )}

              <button onClick={() => openEntry(row)}
                disabled={isReadOnly || busyId === row.emergency_case_id}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  background: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0',
                  cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1,
                }}>
                <FileText className="w-3 h-3" />
                {busyId === row.emergency_case_id
                  ? 'Opening…'
                  : row.mlc_status === 'none' ? 'Start entry' : 'Finish entry'}
              </button>
            </div>
          )
        })}

        {error && (
          <p className="text-xs px-4 py-2" style={{ background: '#FEE2E2', color: '#DC2626' }}>{error}</p>
        )}
      </GlassCard>

      <PoliceIntimationModal
        open={!!intimating} mlcId={intimating?.mlc_id ?? null} arNo={intimating?.ar_no}
        onClose={() => setIntimating(null)}
        onSaved={() => { setIntimating(null); refresh() }}
      />
    </>
  )
}

/**
 * Start the entry from a case id alone.
 *
 * The panel is built from get_mlc_pending, which carries the case but not the
 * patient, so the patient is resolved here rather than widening the function's
 * return for one caller.
 */
async function startMlcForCase(
  caseId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const patientId = await getCasePatient(caseId)
  if (!patientId) return { ok: false, error: 'That case no longer exists' }
  const r = await startMlc({ patient_id: patientId, emergency_case_id: caseId })
  return r.success ? { ok: true, id: r.id } : { ok: false, error: r.error }
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${Math.floor(h / 24)}d`
}
