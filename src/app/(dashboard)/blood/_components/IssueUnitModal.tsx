'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import DateText from '@/components/ui/DateText'
import { issueUnit, listCrossMatchedUnits, listComponentCharges } from '@/app/actions/blood'
import type { BloodRequest, BloodUnit } from '@/lib/types'

const COMPONENT_LABELS: Record<string, string> = {
  whole: 'Whole Blood', prbc: 'PRBC', plasma: 'Plasma', platelets: 'Platelets',
}

interface Props {
  open: boolean
  request: BloodRequest
  onClose: () => void
  onSuccess: () => void
}

export default function IssueUnitModal({ open, request, onClose, onSuccess }: Props) {
  const [units, setUnits] = useState<BloodUnit[]>([])
  const [selectedUnit, setSelectedUnit] = useState<BloodUnit | null>(null)
  const [charge, setCharge] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFetching(true)
    Promise.all([
      listCrossMatchedUnits(request.id),
      listComponentCharges(),
    ]).then(([u, charges]) => {
      setUnits(u); setSelectedUnit(null); setFetching(false)
      setCharge(charges.find((c) => c.component === request.component)?.price ?? null)
    })
  }, [open, request.id, request.component])

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUnit) { setError('Select a blood unit to issue'); return }
    setLoading(true); setError(null)
    const result = await issueUnit({
      requestId:   request.id,
      bloodUnitId: selectedUnit.id,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <Modal open={open} onClose={onClose}
      title={`Issue Blood — ${request.blood_group} ${COMPONENT_LABELS[request.component] ?? request.component}`}
      maxWidth="36rem">
      <form onSubmit={handleIssue} className="space-y-4">
        {/* Request summary */}
        <div className="p-3 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>Request</p>
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            {request.patient?.full_name}
            <span className="ml-2 font-mono text-xs font-normal" style={{ color: '#94A3B8' }}>{request.patient?.uhid}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            {request.blood_group} · {COMPONENT_LABELS[request.component] ?? request.component} · {request.units_required} unit(s) required
          </p>
        </div>

        {/* Unit selector */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: '#0F172A' }}>
            Select Cross-matched Unit
            <span className="ml-1 text-xs font-normal" style={{ color: '#94A3B8' }}>
              (only compatible, cross-matched, screened units shown)
            </span>
          </p>
          {fetching ? (
            <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
          ) : units.length === 0 ? (
            <div className="py-6 text-center rounded-xl" style={{ border: '1px solid #E2E8F0', background: 'rgba(248,250,252,0.6)' }}>
              <p className="text-sm font-medium" style={{ color: '#64748B' }}>No cross-matched units ready</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Record a compatible cross-match for this request first.</p>
            </div>
          ) : (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', maxHeight: '14rem', overflowY: 'auto' }}>
              {units.map((u, i) => {
                const nearExpiry = u.expiry <= new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
                return (
                  <button key={u.id} type="button" onClick={() => setSelectedUnit(u)}
                    className="w-full flex items-center justify-between px-4 py-3"
                    style={{
                      borderBottom: i < units.length - 1 ? '1px solid #F1F5F9' : 'none',
                      background: selectedUnit?.id === u.id ? 'rgba(13,148,136,0.07)' : 'transparent',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs px-2 py-0.5 rounded"
                          style={{ background: '#FEE2E2', color: '#DC2626' }}>{u.blood_group}</span>
                        <span className="text-sm font-medium" style={{ color: '#0F172A' }}>
                          {COMPONENT_LABELS[u.component]}
                        </span>
                        {u.donor?.name && (
                          <span className="text-xs" style={{ color: '#64748B' }}>Donor: {u.donor.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#64748B' }}>
                        <span>Expires: <DateText date={u.expiry} /></span>
                        {nearExpiry && (
                          <span className="px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: '#FEF3C7', color: '#B45309' }}>Near Expiry</span>
                        )}
                      </div>
                    </div>
                    {selectedUnit?.id === u.id && (
                      <span className="text-xs px-2 py-1 rounded-lg font-semibold"
                        style={{ background: '#0D9488', color: '#fff' }}>Selected</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Processing charge — from per-component configuration (read-only) */}
        <div className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
          style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <span className="text-sm" style={{ color: '#64748B' }}>Processing charge (per unit)</span>
          {charge == null ? (
            <span className="text-xs font-medium" style={{ color: '#B45309' }}>Not configured — set it in Charges</span>
          ) : (
            <span className="text-sm font-bold" style={{ color: '#0F172A' }}>₹{charge.toFixed(2)}</span>
          )}
        </div>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading || !selectedUnit || units.length === 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: (loading || !selectedUnit || units.length === 0) ? '#94A3B8' : '#DC2626',
              color: '#fff', border: 'none',
              cursor: (loading || !selectedUnit || units.length === 0) ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Issuing…' : 'Issue Unit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
