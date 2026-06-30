'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import { advanceClaim } from '@/app/actions/insurance'
import type { InsuranceClaim, InsuranceClaimStatus } from '@/lib/types'

const VALID_TRANSITIONS: Record<InsuranceClaimStatus, InsuranceClaimStatus[]> = {
  draft:     ['preauth', 'submitted'],
  preauth:   ['submitted'],
  submitted: ['approved', 'rejected'],
  approved:  ['settled'],
  rejected:  [],
  settled:   [],
}

const STATUS_MAP: Record<InsuranceClaimStatus, string> = {
  draft:     'info',
  preauth:   'info',
  submitted: 'pending',
  approved:  'success',
  rejected:  'danger',
  settled:   'cancelled',
}

const NEXT_LABELS: Record<InsuranceClaimStatus, string> = {
  preauth:   'Send for Pre-Auth',
  submitted: 'Submit Claim',
  approved:  'Mark Approved',
  rejected:  'Mark Rejected',
  settled:   'Settle Claim',
  draft:     '',
}

interface Props {
  claim: InsuranceClaim
  onClose: () => void
  onAdvanced: () => void
}

export default function AdvanceClaimModal({ claim, onClose, onAdvanced }: Props) {
  const nextOptions = VALID_TRANSITIONS[claim.status]
  const [nextStatus, setNextStatus] = useState<InsuranceClaimStatus>(nextOptions[0] ?? 'submitted')
  const [approvedAmount, setApprovedAmount] = useState(
    claim.approved_amount ? String(claim.approved_amount) : String(claim.claim_amount)
  )
  const [remarks, setRemarks] = useState(claim.remarks ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsApproved = nextStatus === 'approved' || nextStatus === 'settled'

  async function handleAdvance() {
    setSubmitting(true)
    setError(null)
    const res = await advanceClaim(claim.id, {
      next_status:     nextStatus,
      approved_amount: needsApproved && approvedAmount ? parseFloat(approvedAmount) : null,
      remarks:         remarks || null,
    })
    setSubmitting(false)
    if (!res.success) { setError(res.error); return }
    onAdvanced()
  }

  if (nextOptions.length === 0) {
    return (
      <Modal open onClose={onClose} title="Advance Claim">
        <p className="text-sm" style={{ color: '#64748B' }}>
          This claim is in a terminal state ({claim.status}) and cannot be advanced.
        </p>
      </Modal>
    )
  }

  const patient = (claim.policy as { patient?: { full_name?: string } } | null)?.patient
  const patientName = patient?.full_name ?? claim.patient?.full_name ?? '—'

  return (
    <Modal
      open
      onClose={onClose}
      title="Advance Claim"
      maxWidth="28rem"
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm"
            style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>
            Cancel
          </button>
          <button
            onClick={handleAdvance}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: submitting ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {NEXT_LABELS[nextStatus] || 'Advance'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Claim summary */}
        <div className="px-4 py-3 rounded-xl space-y-1" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{patientName}</p>
          <p className="text-xs" style={{ color: '#64748B' }}>
            {claim.bill?.bill_no} · Claim: <Money amount={claim.claim_amount} />
          </p>
          <div className="flex items-center gap-2">
            <StatusBadge status={STATUS_MAP[claim.status]} label={claim.status} />
            <span className="text-xs" style={{ color: '#94A3B8' }}>→</span>
            <StatusBadge status={STATUS_MAP[nextStatus]} label={nextStatus} />
          </div>
        </div>

        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        {/* Next status selector if multiple options */}
        {nextOptions.length > 1 && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Next Status</label>
            <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as InsuranceClaimStatus)}>
              {nextOptions.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </Select>
          </div>
        )}

        {/* Approved amount — required for approved/settled */}
        {needsApproved && (
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>
              Approved Amount (₹) <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <input type="number" min={0} step={1}
              value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0',
                color: '#0F172A', minHeight: '44px', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
            {nextStatus === 'settled' && (
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                Settling will post an insurance payment of this amount to the bill.
              </p>
            )}
          </div>
        )}

        {/* Remarks */}
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Remarks (optional)</label>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Any notes about this transition…"
            className="w-full px-3 py-3 rounded-xl text-sm resize-none"
            style={{
              background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0',
              color: '#0F172A', outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
          />
        </div>
      </div>
    </Modal>
  )
}
