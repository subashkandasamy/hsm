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

const MODALITIES = [
  { value: 'xray',          label: 'X-Ray' },
  { value: 'ct',            label: 'CT Scan' },
  { value: 'mri',           label: 'MRI' },
  { value: 'usg',           label: 'Ultrasound' },
  { value: 'echo',          label: 'Echocardiography' },
  { value: 'mammography',   label: 'Mammography' },
  { value: 'fluoroscopy',   label: 'Fluoroscopy' },
  { value: 'nuclear',       label: 'Nuclear Medicine' },
  { value: 'pet',           label: 'PET Scan' },
  { value: 'dexa',          label: 'DEXA Scan' },
  { value: 'angiography',   label: 'Angiography' },
  { value: 'interventional', label: 'Interventional' },
  { value: 'dental',        label: 'Dental Imaging' },
  { value: 'ophthalmic',    label: 'Ophthalmic' },
  { value: 'special',       label: 'Special' },
]

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

  const activeCatalog = catalog.filter(t => t.is_active !== false)

  const filtered = activeCatalog.filter(t =>
    !modalityFilter || t.modality?.toLowerCase() === modalityFilter
  )

  // Group by body_part for display
  const groups: Record<string, RadiologyCatalog[]> = {}
  for (const t of filtered) {
    const key = t.body_part || 'General'
    ;(groups[key] ??= []).push(t)
  }

  // Sort groups: follow modality order then body_part alpha
  const groupKeys = Object.keys(groups).sort((a, b) => {
    // When a modality filter is active, just sort alpha by body_part
    return a.localeCompare(b)
  })

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

  // Get modalities that have active catalog items
  const availableModalities = MODALITIES.filter(m =>
    activeCatalog.some(t => t.modality === m.value)
  )

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

        <FormField label="Modality">
          <Select value={modalityFilter} onChange={(e) => { setModalityFilter(e.target.value); setSelectedTest(null) }}>
            <option value="">All</option>
            {availableModalities.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Procedure" required>
          {activeCatalog.length === 0 ? (
            <div className="text-center py-6 px-4 rounded-xl" style={{ border: '1px solid #E2E8F0' }}>
              <p className="text-sm font-medium" style={{ color: '#64748B' }}>Radiology catalog is empty</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>An admin must add procedures via the Catalog button before ordering.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-4 text-sm rounded-xl" style={{ border: '1px solid #E2E8F0', color: '#94A3B8' }}>
              No procedures match the selected modality.
            </div>
          ) : (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', maxHeight: '14rem', overflowY: 'auto' }}>
              {groupKeys.map((bp, gi) => (
                <div key={bp}>
                  {/* Body part group header */}
                  <div className="px-3 py-1.5 flex items-center gap-2 sticky top-0"
                    style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', borderTop: gi > 0 ? '1px solid #E2E8F0' : 'none' }}>
                    <span className="text-xs font-semibold" style={{ color: '#64748B' }}>{bp}</span>
                    <span className="text-xs" style={{ color: '#CBD5E1' }}>· {groups[bp].length}</span>
                  </div>
                  {/* Procedures in this group */}
                  {groups[bp].map((test) => (
                    <button key={test.id} type="button" onClick={() => setSelectedTest(test)}
                      className="w-full flex items-center justify-between px-4 py-2.5"
                      style={{
                        borderBottom: '1px solid #F8FAFC',
                        background: selectedTest?.id === test.id ? 'rgba(13,148,136,0.07)' : '#fff',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => { if (selectedTest?.id !== test.id) e.currentTarget.style.background = 'rgba(13,148,136,0.03)' }}
                      onMouseLeave={e => { if (selectedTest?.id !== test.id) e.currentTarget.style.background = '#fff' }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {selectedTest?.id === test.id && (
                          <span className="text-xs font-bold flex-shrink-0" style={{ color: '#0D9488' }}>✓</span>
                        )}
                        <span className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{test.name}</span>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0 ml-3" style={{ color: '#0D9488' }}>
                        <Money amount={test.price} />
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {selectedTest && (
            <div className="mt-1.5 text-xs px-3 py-1.5 rounded-lg flex items-center justify-between"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
              <span>✓ {selectedTest.name}</span>
              <span className="font-semibold"><Money amount={selectedTest.price} /></span>
            </div>
          )}
        </FormField>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

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
