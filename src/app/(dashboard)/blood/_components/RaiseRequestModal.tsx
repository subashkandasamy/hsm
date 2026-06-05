'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { raiseRequest } from '@/app/actions/blood'
import { searchPatients } from '@/app/actions/patients'
import type { Patient } from '@/lib/types'

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'] as const
const COMPONENTS   = [
  { value: 'whole',     label: 'Whole Blood' },
  { value: 'prbc',      label: 'Packed RBC (PRBC)' },
  { value: 'plasma',    label: 'Plasma' },
  { value: 'platelets', label: 'Platelets' },
] as const

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function RaiseRequestModal({ open, onClose, onSuccess }: Props) {
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Pick<Patient, 'id' | 'full_name' | 'uhid'> | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [bloodGroup, setBloodGroup] = useState('')
  const [component, setComponent]   = useState('')
  const [units, setUnits]           = useState('1')
  const [notes, setNotes]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setPatientResults([]); return }
    const r = await searchPatients(q)
    setPatientResults(r.slice(0, 8)); setShowDropdown(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(patientQuery), 300)
    return () => clearTimeout(t)
  }, [patientQuery, doSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!patient) { setError('Please select a patient'); return }
    if (!bloodGroup) { setError('Select a blood group'); return }
    if (!component)  { setError('Select a component'); return }
    setLoading(true); setError(null)
    const result = await raiseRequest({
      patient_id:     patient.id,
      blood_group:    bloodGroup,
      component,
      units_required: parseInt(units, 10) || 1,
      notes:          notes.trim() || null,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setPatientQuery(''); setPatient(null); setBloodGroup(''); setComponent(''); setUnits('1'); setNotes('')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise Blood Request" maxWidth="34rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient search */}
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

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Blood Group *">
            <Select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} required>
              <option value="">— Select —</option>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </FormField>
          <FormField label="Component *">
            <Select value={component} onChange={(e) => setComponent(e.target.value)} required>
              <option value="">— Select —</option>
              {COMPONENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Units Required *">
            <Input type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Notes">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical indication, urgency…" />
        </FormField>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Submitting…' : 'Raise Request'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
