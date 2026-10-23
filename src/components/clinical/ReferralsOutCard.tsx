'use client'

import { useEffect, useState } from 'react'
import { Printer, Send } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { listReferrals, type ReferralRow } from '@/app/actions/referOut'

/**
 * Letters already written for this encounter, so they can be printed again.
 *
 * A referral is reprinted more often than it is written: the first copy goes
 * with the patient, then somebody wants one for the file, or the family lost it
 * on the way, or the ambulance left without it. A letter that can only be
 * printed in the thirty seconds after it was written is a letter the hospital
 * will end up rewriting from memory.
 *
 * Renders nothing when there are none, so it costs an encounter that never
 * referred anybody precisely nothing.
 */
export default function ReferralsOutCard({
  admissionId, visitId, patientId, refreshKey,
}: {
  admissionId?: string | null
  visitId?: string | null
  patientId?: string | null
  /** Change this to re-read after writing a new letter. */
  refreshKey?: unknown
}) {
  const [rows, setRows] = useState<ReferralRow[]>([])

  useEffect(() => {
    let live = true
    listReferrals({
      admission_id: admissionId ?? null,
      visit_id: visitId ?? null,
      patient_id: patientId ?? null,
    }).then((r) => { if (live) setRows(r) })
    return () => { live = false }
  }, [admissionId, visitId, patientId, refreshKey])

  if (rows.length === 0) return null

  return (
    <GlassCard className="p-4 mb-4">
      <h3 className="text-sm font-bold flex items-center gap-1.5 mb-2" style={{ color: '#0F172A' }}>
        <Send className="w-4 h-4" style={{ color: '#0D9488' }} />
        Referral letter{rows.length !== 1 ? 's' : ''}
      </h3>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 flex-wrap rounded-lg px-3 py-2"
            style={{ background: '#F8FAFC' }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#0F172A' }}>
                {r.to_institution || r.to_doctor || '—'}
                <span className="ml-2 font-mono text-xs font-normal" style={{ color: '#94A3B8' }}>
                  {r.ref_no}
                </span>
              </p>
              <p className="text-xs truncate" style={{ color: '#64748B' }}>
                {new Date(r.referred_at).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
                })}
                {r.reason ? ` · ${r.reason}` : ''}
              </p>
            </div>
            <a href={`/print/referral/${r.id}`} target="_blank" rel="noopener"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
              style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', textDecoration: 'none' }}>
              <Printer className="w-3 h-3" /> Print
            </a>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
