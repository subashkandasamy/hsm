'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import { createClaim, listPolicies } from '@/app/actions/insurance'
import { listBills } from '@/app/actions/billing'
import { searchPatients } from '@/app/actions/patients'
import type { Patient, Bill, InsurancePolicy } from '@/lib/types'

interface Props { onClose: () => void; onCreated: () => void }

export default function NewClaimModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<'patient' | 'form'>('patient')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)

  const [bills, setBills]           = useState<Bill[]>([])
  const [policies, setPolicies]     = useState<InsurancePolicy[]>([])
  const [selectedBill, setSelectedBill]     = useState('')
  const [selectedPolicy, setSelectedPolicy] = useState('')
  const [claimAmount, setClaimAmount]       = useState('')
  const [submitting, setSubmitting]         = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    if (!patientSearch.trim()) { setPatients([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const data = await searchPatients(patientSearch)
      setPatients(data)
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [patientSearch])

  async function selectPatient(p: Patient) {
    setPatient(p)
    setStep('form')
    const [b, pol] = await Promise.all([
      listBills({ patientId: p.id }),
      listPolicies(p.id),
    ])
    setBills(b.filter((bi) => bi.status !== 'cancelled'))
    setPolicies(pol)
  }

  // Auto-fill claim amount = bill balance when bill selected
  useEffect(() => {
    if (!selectedBill) return
    const bill = bills.find((b) => b.id === selectedBill)
    if (bill) setClaimAmount(String(Math.max(0, bill.total - bill.paid)))
  }, [selectedBill, bills])

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const res = await createClaim({
      bill_id:      selectedBill,
      policy_id:    selectedPolicy,
      claim_amount: parseFloat(claimAmount) || 0,
    })
    setSubmitting(false)
    if (!res.success) { setError(res.error); return }
    onCreated()
    onClose()
  }

  const canSubmit = selectedBill && selectedPolicy && parseFloat(claimAmount) > 0

  return (
    <Modal
      open
      onClose={onClose}
      title={step === 'patient' ? 'New Claim — Select Patient' : `New Claim — ${patient?.full_name}`}
      maxWidth="32rem"
      footer={
        step === 'form' ? (
          <div className="flex gap-2 justify-end">
            <button onClick={() => setStep('patient')}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: submitting || !canSubmit ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Raise Claim
            </button>
          </div>
        ) : null
      }
    >
      {step === 'patient' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input autoFocus type="search" placeholder="Search patient…"
              value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0',
                color: '#0F172A', minHeight: '44px', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          {searching && <div className="flex gap-2 items-center text-sm px-2" style={{ color: '#94A3B8' }}><Loader2 className="w-4 h-4 animate-spin" />Searching…</div>}
          {patients.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              {patients.map((p, i) => (
                <button key={p.id} onClick={() => selectPatient(p)}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{ borderBottom: i < patients.length - 1 ? '1px solid #F1F5F9' : 'none', minHeight: '44px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{p.full_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{p.uhid} · {p.phone}</p>
                </button>
              ))}
            </div>
          )}
          {patientSearch && !searching && patients.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No patients found</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {error && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{error}</div>}

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Bill <span style={{ color: '#EF4444' }}>*</span></label>
            {bills.length === 0 ? (
              <p className="text-sm" style={{ color: '#94A3B8' }}>No bills for this patient</p>
            ) : (
              <Select value={selectedBill} onChange={(e) => setSelectedBill(e.target.value)}>
                <option value="">— Select bill —</option>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bill_no} · Balance: ₹{Math.max(0, b.total - b.paid).toFixed(0)} · {b.status}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Insurance Policy <span style={{ color: '#EF4444' }}>*</span></label>
            {policies.length === 0 ? (
              <p className="text-sm" style={{ color: '#94A3B8' }}>No policies for this patient. Add a policy first.</p>
            ) : (
              <Select value={selectedPolicy} onChange={(e) => setSelectedPolicy(e.target.value)}>
                <option value="">— Select policy —</option>
                {policies.map((pol) => (
                  <option key={pol.id} value={pol.id}>
                    {pol.provider} · {pol.policy_no}
                    {pol.coverage_amount ? ` · Coverage ₹${pol.coverage_amount}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Claim Amount (₹) <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="number" min={0} step={1}
              value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0',
                color: '#0F172A', minHeight: '44px', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}
