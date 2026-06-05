'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Check } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Money from '@/components/ui/Money'
import { createLabOrder } from '@/app/actions/lab'
import { searchPatients } from '@/app/actions/patients'
import type { LabTestCatalog, Patient } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (orderId: string) => void
  catalog: LabTestCatalog[]
  prefill?: { patientId: string; patientName: string; visitId?: string }
}

export default function OrderLabModal({ open, onClose, onSuccess, catalog, prefill }: Props) {
  const [testSearch, setTestSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [patientQuery, setPatientQuery] = useState(prefill?.patientName ?? '')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Pick<Patient, 'id' | 'full_name' | 'uhid'> | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setPatientResults([]); return }
    const r = await searchPatients(q)
    setPatientResults(r.slice(0, 8)); setShowDropdown(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(patientQuery), 300)
    return () => clearTimeout(t)
  }, [patientQuery, doSearch])

  const filteredCatalog = catalog.filter((t) =>
    testSearch === '' || t.name.toLowerCase().includes(testSearch.toLowerCase()) || t.code?.toLowerCase().includes(testSearch.toLowerCase())
  )

  const total = catalog.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.price, 0)

  function toggleTest(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const patId = prefill?.patientId ?? patient?.id
    if (!patId) { setError('Please select a patient'); return }
    if (selected.size === 0) { setError('Select at least one test'); return }
    setLoading(true); setError(null)
    const result = await createLabOrder({
      patient_id: patId,
      visit_id: prefill?.visitId ?? null,
      test_ids: [...selected],
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setSelected(new Set()); setTestSearch('')
    onSuccess(result.orderId)
  }

  return (
    <Modal open={open} onClose={onClose} title="Order Lab Tests" maxWidth="40rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        {!prefill && (
          <FormField label="Patient" required>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
              <input type="text" value={patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setPatient(null) }}
                placeholder="Search patient…"
                style={{ width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
                onFocus={() => setShowDropdown(patientResults.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)} />
              {showDropdown && patientResults.length > 0 && (
                <ul className="mt-1 md:absolute md:z-50 md:left-0 md:right-0 md:top-full rounded-xl overflow-hidden shadow-lg"
                  style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '12rem', overflowY: 'auto' }}>
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button type="button"
                        onMouseDown={() => { setPatient(p); setPatientQuery(p.full_name); setShowDropdown(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                        <span className="font-medium">{p.full_name}</span>
                        <span className="ml-2 font-mono text-xs" style={{ color: '#94A3B8' }}>{p.uhid}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FormField>
        )}

        {prefill && (
          <div className="px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(13,148,136,0.07)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
            Patient: {prefill.patientName}{prefill.visitId ? ' · From OPD visit' : ''}
          </div>
        )}

        {/* Test selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Select Tests</p>
            {selected.size > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                {selected.size} selected · <Money amount={total} />
              </span>
            )}
          </div>
          <input type="search" value={testSearch}
            onChange={(e) => setTestSearch(e.target.value)}
            placeholder="Filter tests…"
            style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', marginBottom: '0.5rem' }} />
          <div style={{ maxHeight: '14rem', overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: '0.75rem' }}>
            {catalog.length === 0 ? (
              <div className="text-center py-6 px-4">
                <p className="text-sm font-medium" style={{ color: '#64748B' }}>Lab catalog is empty</p>
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>An admin must add tests via the Catalog button on the Lab page before ordering.</p>
              </div>
            ) : filteredCatalog.length === 0 ? (
              <p className="text-center py-4 text-sm" style={{ color: '#94A3B8' }}>No tests match your filter</p>
            ) : filteredCatalog.map((test, i) => (
              <button key={test.id} type="button" onClick={() => toggleTest(test.id)}
                className="w-full flex items-center justify-between px-4 py-2.5"
                style={{
                  borderBottom: i < filteredCatalog.length - 1 ? '1px solid #F1F5F9' : 'none',
                  background: selected.has(test.id) ? 'rgba(13,148,136,0.07)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-md flex items-center justify-center"
                    style={{ background: selected.has(test.id) ? '#0D9488' : '#F1F5F9', border: `1px solid ${selected.has(test.id) ? '#0D9488' : '#E2E8F0'}` }}>
                    {selected.has(test.id) && <Check className="w-3 h-3" style={{ color: '#fff' }} />}
                  </div>
                  <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{test.name}</span>
                  {test.code && <span className="text-xs font-mono" style={{ color: '#94A3B8' }}>{test.code}</span>}
                  {test.sample_type && <span className="text-xs px-1.5 py-0 rounded" style={{ background: '#F1F5F9', color: '#64748B' }}>{test.sample_type}</span>}
                </div>
                <span className="text-sm font-medium" style={{ color: '#0D9488' }}><Money amount={test.price} /></span>
              </button>
            ))}
          </div>
        </div>

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading || selected.size === 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (loading || selected.size === 0) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (loading || selected.size === 0) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Ordering…' : `Order ${selected.size} Test${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
