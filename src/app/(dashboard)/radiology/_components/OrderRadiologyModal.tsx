'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import { createRadiologyOrder } from '@/app/actions/radiology'
import { searchPatients } from '@/app/actions/patients'
import type { RadiologyCatalog, Patient } from '@/lib/types'

const MODALITIES = ['xray', 'ct', 'mri', 'usg']

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (orderId: string) => void
  catalog: RadiologyCatalog[]
  prefill?: { patientId: string; patientName: string; visitId?: string }
}

export default function OrderRadiologyModal({ open, onClose, onSuccess, catalog, prefill }: Props) {
  const [modalityFilter, setModalityFilter] = useState('')
  const [selectedTest, setSelectedTest] = useState<RadiologyCatalog | null>(null)
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

  const filtered = catalog.filter((t) =>
    !modalityFilter || t.modality?.toLowerCase() === modalityFilter
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const patId = prefill?.patientId ?? patient?.id
    if (!patId) { setError('Please select a patient'); return }
    if (!selectedTest) { setError('Please select a procedure'); return }
    setLoading(true); setError(null)
    const result = await createRadiologyOrder({
      patient_id: patId,
      visit_id: prefill?.visitId ?? null,
      test_id: selectedTest.id,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setSelectedTest(null); setModalityFilter('')
    onSuccess(result.orderId)
  }

  return (
    <Modal open={open} onClose={onClose} title="Order Imaging" maxWidth="34rem">
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
                  style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '10rem', overflowY: 'auto' }}>
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
            Patient: {prefill.patientName}
          </div>
        )}

        <FormField label="Modality Filter">
          <Select value={modalityFilter} onChange={(e) => setModalityFilter(e.target.value)}>
            <option value="">All</option>
            {MODALITIES.map((m) => <option key={m} value={m} className="uppercase">{m.toUpperCase()}</option>)}
          </Select>
        </FormField>

        <FormField label="Procedure" required>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', maxHeight: '12rem', overflowY: 'auto' }}>
            {catalog.length === 0 ? (
              <div className="text-center py-6 px-4">
                <p className="text-sm font-medium" style={{ color: '#64748B' }}>Radiology catalog is empty</p>
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>An admin must add procedures via the Catalog button on the Radiology page before ordering.</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center py-4 text-sm" style={{ color: '#94A3B8' }}>No procedures match the selected modality</p>
            ) : filtered.map((test, i) => (
              <button key={test.id} type="button" onClick={() => setSelectedTest(test)}
                className="w-full flex items-center justify-between px-4 py-3"
                style={{
                  borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none',
                  background: selectedTest?.id === test.id ? 'rgba(13,148,136,0.07)' : 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                <div>
                  <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{test.name}</span>
                  {test.modality && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded uppercase font-semibold"
                      style={{ background: '#F1F5F9', color: '#64748B' }}>{test.modality}</span>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: '#0D9488' }}><Money amount={test.price} /></span>
              </button>
            ))}
          </div>
          {selectedTest && (
            <div className="mt-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
              ✓ {selectedTest.name} · <Money amount={selectedTest.price} />
            </div>
          )}
        </FormField>

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading || !selectedTest}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (loading || !selectedTest) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (loading || !selectedTest) ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Ordering…' : 'Order Imaging'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
