'use client'

import { useState, useEffect } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import { listPolicies, verifyCashlessEligibility } from '@/app/actions/insurance'
import type { InsurancePolicy } from '@/lib/types'

interface Props {
  patientId: string
  patientName: string
  billId: string
  billAmount: number
  onClose: () => void
  onResolved: () => void
}

export default function VerifyCashlessModal({ patientId, patientName, billId, billAmount, onClose, onResolved }: Props) {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [policyId, setPolicyId] = useState('')
  const [approvedAmount, setApprovedAmount] = useState(String(billAmount))
  const [submitting, setSubmitting] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { listPolicies(patientId).then(setPolicies) }, [patientId])

  async function resolve(decision: 'approved' | 'rejected') {
    setSubmitting(decision)
    setError(null)
    const res = await verifyCashlessEligibility({
      bill_id: billId,
      policy_id: policyId,
      estimated_amount: billAmount,
      decision,
      approved_amount: decision === 'approved' ? (parseFloat(approvedAmount) || billAmount) : null,
    })
    setSubmitting(null)
    if (!res.success) { setError(res.error); return }
    onResolved()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Verify Cashless — ${patientName}`} maxWidth="26rem">
      <div className="space-y-4">
        <p className="text-xs" style={{ color: '#64748B' }}>
          Confirm eligibility with the front desk (corporate ID / policy card / a quick portal check) before
          approving. This is meant to take a couple of minutes, not a formal TPA process.
        </p>

        {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Insurance Policy</label>
          {policies.length === 0 ? (
            <p className="text-sm" style={{ color: '#94A3B8' }}>No policies on file for this patient.</p>
          ) : (
            <Select value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
              <option value="">— Select policy —</option>
              {policies.map((p) => <option key={p.id} value={p.id}>{p.provider} · {p.policy_no}</option>)}
            </Select>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Sanctioned Amount (₹)</label>
          <input type="number" min={0} step={1} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)}
            className="w-full px-3 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }} />
          <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Bill amount: ₹{billAmount.toFixed(0)}. Any amount above the sanctioned figure is the patient&apos;s own responsibility.</p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={() => resolve('rejected')} disabled={!policyId || submitting !== null}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ border: '1px solid #FECACA', color: '#DC2626', minHeight: '44px', opacity: (!policyId || submitting !== null) ? 0.5 : 1 }}>
            {submitting === 'rejected' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Not Eligible'}
          </button>
          <button onClick={() => resolve('approved')} disabled={!policyId || submitting !== null}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: (!policyId || submitting !== null) ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
            {submitting === 'approved' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Approve Cashless
          </button>
        </div>
      </div>
    </Modal>
  )
}
