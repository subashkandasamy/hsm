'use client'

import { useState, useEffect } from 'react'
import { Search, Loader2, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import { createClaim, listPolicies, getClaimContext, getPolicyCoverage } from '@/app/actions/insurance'
import { listAdmissions } from '@/app/actions/ipd'
import { getPatientVisits } from '@/app/actions/opd'
import { searchPatients } from '@/app/actions/patients'
import type { Patient, InsurancePolicy, Admission, Visit, PolicyCoverage } from '@/lib/types'

interface Props { onClose: () => void; onCreated: () => void }

interface EncounterOpt { key: string; type: 'admission' | 'visit'; id: string; label: string }

export default function NewClaimModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<'patient' | 'form'>('patient')
  const [patientSearch, setPatientSearch] = useState('')
  const [patients, setPatients] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)

  const [encounters, setEncounters] = useState<EncounterOpt[]>([])
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [selectedEnc, setSelectedEnc] = useState('')
  const [selectedPolicy, setSelectedPolicy] = useState('')
  const [claimType, setClaimType] = useState<'cashless' | 'reimbursement'>('cashless')
  const [claimAmount, setClaimAmount] = useState('')
  const [coverage, setCoverage] = useState<PolicyCoverage | null>(null)
  const [encBalance, setEncBalance] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!patientSearch.trim()) { setPatients([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      setPatients(await searchPatients(patientSearch))
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [patientSearch])

  async function selectPatient(p: Patient) {
    setPatient(p)
    setStep('form')
    const [adms, visits, pol] = await Promise.all([
      listAdmissions({ patientId: p.id }),
      getPatientVisits(p.id),
      listPolicies(p.id),
    ])
    const opts: EncounterOpt[] = [
      ...(adms as Admission[]).map((a) => ({
        key: `admission:${a.id}`, type: 'admission' as const, id: a.id,
        label: `IPD · ${a.admitted_at ? new Date(a.admitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}${a.ward?.name ? ` · ${a.ward.name}` : ''}${a.status === 'admitted' ? ' · admitted' : ''}`,
      })),
      ...(visits as Visit[]).map((v) => ({
        key: `visit:${v.id}`, type: 'visit' as const, id: v.id,
        label: `OPD · ${v.visit_date ? new Date(v.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`,
      })),
    ]
    setEncounters(opts)
    setPolicies(pol)
  }

  // When encounter changes, fetch its claimable balance
  useEffect(() => {
    if (!selectedEnc) { setEncBalance(null); return }
    const enc = encounters.find((e) => e.key === selectedEnc)
    if (!enc) return
    const scope = enc.type === 'admission' ? { admission_id: enc.id } : { visit_id: enc.id }
    getClaimContext(scope).then((ctx) => {
      setEncBalance(ctx.balance)
      setClaimAmount(String(ctx.balance || ctx.total || 0))
    })
  }, [selectedEnc, encounters])

  // When policy changes, fetch coverage/validity
  useEffect(() => {
    if (!selectedPolicy) { setCoverage(null); return }
    getPolicyCoverage(selectedPolicy).then(setCoverage)
  }, [selectedPolicy])

  async function handleSubmit() {
    const enc = encounters.find((e) => e.key === selectedEnc)
    if (!enc) return
    setSubmitting(true)
    setError(null)
    const scope = enc.type === 'admission' ? { admission_id: enc.id } : { visit_id: enc.id }
    const res = await createClaim({
      ...scope,
      policy_id: selectedPolicy,
      claim_amount: parseFloat(claimAmount) || 0,
      claim_type: claimType,
    })
    setSubmitting(false)
    if (!res.success) { setError(res.error); return }
    onCreated(); onClose()
  }

  const amt = parseFloat(claimAmount) || 0
  const overCoverage = coverage?.remaining != null && amt > coverage.remaining
  const canSubmit = selectedEnc && selectedPolicy && amt > 0 && !coverage?.expired && !overCoverage

  return (
    <Modal
      open onClose={onClose}
      title={step === 'patient' ? 'New Claim — Select Patient' : `New Claim — ${patient?.full_name}`}
      maxWidth="32rem"
      footer={step === 'form' ? (
        <div className="flex gap-2 justify-end">
          <button onClick={() => setStep('patient')} className="px-4 py-2.5 rounded-xl text-sm"
            style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>Back</button>
          <button onClick={handleSubmit} disabled={submitting || !canSubmit}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: submitting || !canSubmit ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}Raise Claim
          </button>
        </div>
      ) : null}
    >
      {step === 'patient' ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input autoFocus type="search" placeholder="Search patient…"
              value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }} />
          </div>
          {searching && <div className="flex gap-2 items-center text-sm px-2" style={{ color: '#94A3B8' }}><Loader2 className="w-4 h-4 animate-spin" />Searching…</div>}
          {patients.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
              {patients.map((p, i) => (
                <button key={p.id} onClick={() => selectPatient(p)}
                  className="w-full text-left px-4 py-3" style={{ borderBottom: i < patients.length - 1 ? '1px solid #F1F5F9' : 'none', minHeight: '44px' }}>
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

          {/* Encounter */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Encounter <span style={{ color: '#EF4444' }}>*</span></label>
            {encounters.length === 0 ? (
              <p className="text-sm" style={{ color: '#94A3B8' }}>No admissions or visits for this patient</p>
            ) : (
              <Select value={selectedEnc} onChange={(e) => setSelectedEnc(e.target.value)}>
                <option value="">— Select admission or visit —</option>
                {encounters.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </Select>
            )}
            {encBalance != null && (
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                Outstanding on this encounter: <Money amount={encBalance} className="font-semibold" style={{ color: '#0D9488' }} />
              </p>
            )}
          </div>

          {/* Policy */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Insurance Policy <span style={{ color: '#EF4444' }}>*</span></label>
            {policies.length === 0 ? (
              <p className="text-sm" style={{ color: '#94A3B8' }}>No policies for this patient. Add a policy first.</p>
            ) : (
              <Select value={selectedPolicy} onChange={(e) => setSelectedPolicy(e.target.value)}>
                <option value="">— Select policy —</option>
                {policies.map((pol) => (
                  <option key={pol.id} value={pol.id}>
                    {pol.provider} · {pol.policy_no}{pol.coverage_amount ? ` · Cover ₹${pol.coverage_amount}` : ''}
                  </option>
                ))}
              </Select>
            )}
            {coverage?.expired && (
              <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#DC2626' }}>
                <AlertTriangle className="w-3.5 h-3.5" /> Policy expired on {coverage.valid_till} — cannot claim
              </p>
            )}
            {coverage && !coverage.expired && coverage.remaining != null && (
              <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                Coverage remaining: <Money amount={coverage.remaining} className="font-semibold" style={{ color: overCoverage ? '#DC2626' : '#0D9488' }} />
              </p>
            )}
          </div>

          {/* Claim type */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Type</label>
            <Select value={claimType} onChange={(e) => setClaimType(e.target.value as 'cashless' | 'reimbursement')}>
              <option value="cashless">Cashless</option>
              <option value="reimbursement">Reimbursement</option>
            </Select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Claim Amount (₹) <span style={{ color: '#EF4444' }}>*</span></label>
            <input type="number" min={0} step={1} value={claimAmount} onChange={(e) => setClaimAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.8)', border: `1px solid ${overCoverage ? '#DC2626' : '#E2E8F0'}`, color: '#0F172A', minHeight: '44px', outline: 'none' }} />
            {overCoverage && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>Exceeds remaining coverage</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}
