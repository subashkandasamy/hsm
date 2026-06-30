'use client'

import { useState, useTransition } from 'react'
import {
  Wallet, TrendingDown, CheckCircle, AlertCircle, Plus, RefreshCw,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import {
  recordAdvance,
  recordAdvanceRefund,
  getAdmissionFinancials,
} from '@/app/actions/admissionBilling'
import type { AdmissionAdvance, AdmissionFinancials, ProcedureTariff } from '@/lib/types'

interface Props {
  admissionId: string
  initialFinancials: AdmissionFinancials
  initialAdvances: AdmissionAdvance[]
  canAdvance: boolean
  procedureTariffs: ProcedureTariff[]
  wardId: string
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const

export default function FinancialPanel({
  admissionId,
  initialFinancials,
  initialAdvances,
  canAdvance,
  procedureTariffs,
  wardId,
}: Props) {
  const [financials, setFinancials] = useState(initialFinancials)
  const [advances, setAdvances] = useState(initialAdvances)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Advance form
  const [showAdvanceForm, setShowAdvanceForm] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceMethod, setAdvanceMethod] = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash')

  // Refund form
  const [showRefundForm, setShowRefundForm] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash')

  async function refresh() {
    const f = await getAdmissionFinancials(admissionId)
    setFinancials(f)
  }

  function submitAdvance() {
    const amount = parseFloat(advanceAmount)
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount'); return }
    setError('')
    startTransition(async () => {
      const res = await recordAdvance({ admissionId, amount, method: advanceMethod })
      if (!res.success) { setError(res.error); return }
      setSuccess(`Advance of ₹${amount.toFixed(2)} recorded`)
      setShowAdvanceForm(false)
      setAdvanceAmount('')
      await refresh()
    })
  }

  function submitRefund() {
    const amount = parseFloat(refundAmount)
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount'); return }
    setError('')
    startTransition(async () => {
      const res = await recordAdvanceRefund({ admissionId, amount, method: refundMethod })
      if (!res.success) { setError(res.error); return }
      setSuccess(`Refund of ₹${amount.toFixed(2)} recorded`)
      setShowRefundForm(false)
      setRefundAmount('')
      await refresh()
    })
  }

  const { totalAdvance, totalBilled, totalPaid, balanceDue, unusedAdvance } = financials

  return (
    <GlassCard>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5" style={{ color: '#0D9488' }} />
            <h3 className="font-semibold" style={{ color: '#0F172A' }}>Financial Summary</h3>
          </div>
          <button
            onClick={refresh}
            disabled={isPending}
            className="p-1.5 rounded-lg"
            style={{ background: '#F1F5F9', color: '#64748B' }}
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Feedback */}
        {error && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs mb-3"
            style={{ background: '#FEF2F2', color: '#DC2626' }}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs mb-3"
            style={{ background: '#F0FDF4', color: '#16A34A' }}>
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> {success}
            <button onClick={() => setSuccess('')} className="ml-auto text-xs">✕</button>
          </div>
        )}

        {/* Summary grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs mb-1" style={{ color: '#64748B' }}>Advance Received</p>
            <Money amount={totalAdvance} className="font-bold text-base" style={{ color: '#0D9488' }} />
          </div>
          <div className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs mb-1" style={{ color: '#64748B' }}>Total Billed</p>
            <Money amount={totalBilled} className="font-bold text-base" style={{ color: '#0F172A' }} />
          </div>
          <div className="p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs mb-1" style={{ color: '#64748B' }}>Total Paid</p>
            <Money amount={totalPaid} className="font-bold text-base" style={{ color: '#059669' }} />
          </div>
          <div className="p-3 rounded-xl" style={{
            background: balanceDue > 0 ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${balanceDue > 0 ? '#FECACA' : '#BBF7D0'}`,
          }}>
            <p className="text-xs mb-1" style={{ color: balanceDue > 0 ? '#DC2626' : '#16A34A' }}>
              {balanceDue > 0 ? 'Balance Due' : 'Fully Paid'}
            </p>
            <Money amount={balanceDue} className="font-bold text-base"
              style={{ color: balanceDue > 0 ? '#DC2626' : '#16A34A' }} />
          </div>
        </div>

        {/* Unused advance chip */}
        {unusedAdvance > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg mb-4 text-xs"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
            <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              <Money amount={unusedAdvance} className="font-semibold" style={{ color: '#92400E' }} /> unused
              advance credit available
            </span>
          </div>
        )}

        {/* Balance due alert */}
        {balanceDue > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg mb-4 text-xs"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            Discharge is blocked until this balance is settled.
          </div>
        )}

        {/* Advance history */}
        {advances.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: '#64748B' }}>Advance History</p>
            <div className="space-y-1">
              {advances.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs py-1"
                  style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ color: '#64748B' }}>
                    {new Date(a.received_at).toLocaleDateString('en-IN')} · {a.method}
                  </span>
                  <Money amount={a.amount} className="font-medium" style={{ color: '#0D9488' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {canAdvance && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setShowAdvanceForm(!showAdvanceForm); setShowRefundForm(false) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#0D9488', color: '#fff' }}
            >
              <Plus className="w-3.5 h-3.5" /> Record Advance
            </button>
            {unusedAdvance > 0 && (
              <button
                onClick={() => { setShowRefundForm(!showRefundForm); setShowAdvanceForm(false) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#FEF9C3', color: '#92400E' }}
              >
                Refund Unused Advance
              </button>
            )}
          </div>
        )}

        {/* Advance form */}
        {showAdvanceForm && canAdvance && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#0F172A' }}>Record Advance Payment</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="number"
                min={1}
                placeholder="Amount (₹)"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
                className="px-2 py-1.5 text-sm rounded border"
                style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
              />
              <select
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value as typeof advanceMethod)}
                className="px-2 py-1.5 text-sm rounded border"
                style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitAdvance}
                disabled={isPending}
                className="px-3 py-1 rounded text-xs font-medium"
                style={{ background: '#0D9488', color: '#fff' }}
              >
                Save
              </button>
              <button
                onClick={() => setShowAdvanceForm(false)}
                className="px-3 py-1 rounded text-xs"
                style={{ background: '#F1F5F9', color: '#64748B' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Refund form */}
        {showRefundForm && canAdvance && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="text-xs font-medium mb-2" style={{ color: '#92400E' }}>
              Refund Advance (max: <Money amount={unusedAdvance} style={{ color: '#92400E' }} />)
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="number"
                min={1}
                max={unusedAdvance}
                placeholder="Amount (₹)"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="px-2 py-1.5 text-sm rounded border"
                style={{ borderColor: '#FDE68A', color: '#0F172A' }}
              />
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}
                className="px-2 py-1.5 text-sm rounded border"
                style={{ borderColor: '#FDE68A', color: '#0F172A' }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitRefund}
                disabled={isPending}
                className="px-3 py-1 rounded text-xs font-medium"
                style={{ background: '#D97706', color: '#fff' }}
              >
                Confirm Refund
              </button>
              <button
                onClick={() => setShowRefundForm(false)}
                className="px-3 py-1 rounded text-xs"
                style={{ background: '#F1F5F9', color: '#64748B' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
