'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { addPolicy } from '@/app/actions/insurance'
import { searchPatients } from '@/app/actions/patients'
import type { Patient } from '@/lib/types'

interface Props { onClose: () => void; onAdded: () => void }

export default function AddPolicyModal({ onClose, onAdded }: Props) {
  const [step, setStep] = useState<'patient' | 'form'>('patient')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)

  const [provider, setProvider]           = useState('')
  const [policyNo, setPolicyNo]           = useState('')
  const [validTill, setValidTill]         = useState('')
  const [coverage, setCoverage]           = useState('')
  const [submitting, setSubmitting]       = useState(false)
  const [error, setError]                 = useState<string | null>(null)

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

  async function handleSubmit() {
    if (!patient) return
    setSubmitting(true)
    setError(null)
    const res = await addPolicy({
      patient_id:      patient.id,
      provider,
      policy_no:       policyNo,
      valid_till:      validTill || null,
      coverage_amount: coverage ? parseFloat(coverage) : null,
    })
    setSubmitting(false)
    if (!res.success) { setError(res.error); return }
    onAdded()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={step === 'patient' ? 'Add Policy — Select Patient' : `Add Policy — ${patient?.full_name}`}
      maxWidth="30rem"
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
              disabled={submitting || !provider || !policyNo}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: submitting || !provider || !policyNo ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Policy
            </button>
          </div>
        ) : null
      }
    >
      {step === 'patient' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input
              autoFocus
              type="search"
              placeholder="Search patient…"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
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
                <button key={p.id} onClick={() => { setPatient(p); setStep('form') }}
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
          {[
            { label: 'Insurance Provider', value: provider, setter: setProvider, required: true },
            { label: 'Policy Number', value: policyNo, setter: setPolicyNo, required: true },
          ].map(({ label, value, setter, required }) => (
            <div key={label}>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>{label} {required && <span style={{ color: '#EF4444' }}>*</span>}</label>
              <input
                type="text"
                value={value}
                onChange={(e) => setter(e.target.value)}
                className="w-full px-3 py-3 rounded-xl text-sm"
                style={{
                  background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0',
                  color: '#0F172A', minHeight: '44px', outline: 'none',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Valid Till</label>
            <input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0',
                color: '#0F172A', minHeight: '44px', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Coverage Amount (₹)</label>
            <input type="number" min={0} value={coverage} onChange={(e) => setCoverage(e.target.value)}
              placeholder="Optional"
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
