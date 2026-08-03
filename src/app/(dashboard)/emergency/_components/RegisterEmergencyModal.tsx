'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import GlassCard from '@/components/ui/GlassCard'
import { registerEmergency } from '@/app/actions/emergency'
import { searchPatients } from '@/app/actions/patients'
import type { Patient, TriageLevel } from '@/lib/types'

const TRIAGE_LABELS = {
  1: 'Level 1 — Resuscitation (Immediate)',
  2: 'Level 2 — Emergent',
  3: 'Level 3 — Urgent',
  4: 'Level 4 — Less Urgent',
  5: 'Level 5 — Non-Urgent',
}

const TRIAGE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  1: { bg: '#FEE2E2', border: '#FCA5A5', text: '#DC2626' },
  2: { bg: '#FFEDD5', border: '#FDBA74', text: '#C2410C' },
  3: { bg: '#FEF3C7', border: '#FCD34D', text: '#B45309' },
  4: { bg: '#DBEAFE', border: '#93C5FD', text: '#1D4ED8' },
  5: { bg: '#DCFCE7', border: '#86EFAC', text: '#15803D' },
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function RegisterEmergencyModal({ open, onClose, onSuccess }: Props) {
  const [unknown, setUnknown] = useState(false)
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Unknown patient fields
  const [provName, setProvName] = useState('')
  const [provGender, setProvGender] = useState<'male' | 'female' | 'other' | ''>('')
  const [provAge, setProvAge] = useState('')

  // Case fields
  const [triageLevel, setTriageLevel] = useState<TriageLevel>(3)
  const [arrivalMode, setArrivalMode] = useState<'walk_in' | 'ambulance' | 'referral' | ''>('')
  const [complaint, setComplaint] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setPatientResults([]); return }
    const r = await searchPatients(q)
    setPatientResults(r.slice(0, 8))
    setShowDropdown(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(patientQuery), 300)
    return () => clearTimeout(t)
  }, [patientQuery, doSearch])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unknown && !selectedPatient) { setError('Select a patient or mark as unknown'); return }

    setLoading(true)
    setError(null)

    const result = await registerEmergency({
      patient_id:   !unknown && selectedPatient ? selectedPatient.id : null,
      prov_name:    unknown ? (provName.trim() || null) : null,
      prov_gender:  unknown && provGender ? provGender : null,
      prov_age:     unknown && provAge ? parseInt(provAge, 10) : null,
      triage_level: triageLevel,
      arrival_mode: arrivalMode || null,
      complaint:    complaint.trim() || null,
    })

    setLoading(false)
    if (!result.success) { setError(result.error); return }

    // Reset
    setUnknown(false); setPatientQuery(''); setSelectedPatient(null)
    setProvName(''); setProvGender(''); setProvAge('')
    setTriageLevel(3); setArrivalMode(''); setComplaint('')
    onSuccess()
  }

  const tc = TRIAGE_COLORS[triageLevel]

  return (
    <Modal open={open} onClose={onClose} title="Register Emergency Case" maxWidth="38rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Triage level — prominent, first thing to set */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: '#0F172A' }}>
            Triage Level <span style={{ color: '#DC2626' }}>*</span>
          </p>
          <div className="flex gap-2">
            {([1, 2, 3, 4, 5] as TriageLevel[]).map((l) => {
              const c = TRIAGE_COLORS[l]
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setTriageLevel(l)}
                  className="flex-1 py-3 rounded-xl text-lg font-bold transition-all"
                  style={{
                    background: l === triageLevel ? c.bg : 'rgba(248,250,252,0.8)',
                    border: `2px solid ${l === triageLevel ? c.border : '#E2E8F0'}`,
                    color: l === triageLevel ? c.text : '#94A3B8',
                    transform: l === triageLevel ? 'scale(1.05)' : 'scale(1)',
                    cursor: 'pointer',
                  }}
                >
                  {l}
                </button>
              )
            })}
          </div>
          <p className="text-xs mt-1.5 font-medium" style={{ color: tc.text }}>
            {TRIAGE_LABELS[triageLevel]}
          </p>
        </div>

        {/* Patient identification */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={unknown} onChange={(e) => { setUnknown(e.target.checked); setSelectedPatient(null); setPatientQuery('') }}
              className="w-4 h-4 rounded" style={{ accentColor: '#DC2626' }} />
            <span className="text-sm font-medium" style={{ color: '#0F172A' }}>Unknown patient</span>
          </label>
        </div>

        {unknown ? (
          <GlassCard className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>
              Provisional Patient Details
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FormField label="Name (if known)">
                <Input value={provName} onChange={(e) => setProvName(e.target.value)}
                  placeholder="Unknown Male" />
              </FormField>
              <FormField label="Gender">
                <Select value={provGender} onChange={(e) => setProvGender(e.target.value as typeof provGender)}>
                  <option value="">Unknown</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </Select>
              </FormField>
              <FormField label="Approx. Age">
                <Input type="number" min={0} max={120} value={provAge}
                  onChange={(e) => setProvAge(e.target.value)} placeholder="~40" />
              </FormField>
            </div>
          </GlassCard>
        ) : (
          <FormField label="Patient" required>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: '#94A3B8' }} />
              <input type="text" value={patientQuery}
                onChange={(e) => { setPatientQuery(e.target.value); setSelectedPatient(null) }}
                placeholder="Search patient by name, phone, or UHID…"
                style={{
                  width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem',
                  borderRadius: '0.75rem', fontSize: '0.875rem',
                  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0',
                  color: '#0F172A', outline: 'none',
                }}
                onFocus={() => setShowDropdown(patientResults.length > 0)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              />
              {showDropdown && patientResults.length > 0 && (
                <ul className="mt-1 md:absolute md:z-50 md:left-0 md:right-0 md:top-full rounded-xl overflow-hidden shadow-lg"
                  style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '12rem', overflowY: 'auto' }}>
                  {patientResults.map((p) => (
                    <li key={p.id}>
                      <button type="button"
                        onMouseDown={() => { setSelectedPatient(p); setPatientQuery(p.full_name); setShowDropdown(false) }}
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
            {selectedPatient && (
              <div className="mt-1.5 text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                ✓ {selectedPatient.full_name} · {selectedPatient.uhid}
              </div>
            )}
          </FormField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Arrival Mode">
            <Select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value as typeof arrivalMode)}>
              <option value="">Unknown</option>
              <option value="walk_in">Walk-in</option>
              <option value="ambulance">Ambulance</option>
              <option value="referral">Referral</option>
            </Select>
          </FormField>
          <div className="flex items-end pb-0.5">
            <div className="px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}>
              Triage Level {triageLevel}
            </div>
          </div>
        </div>

        <FormField label="Chief Complaint">
          <Textarea value={complaint} onChange={(e) => setComplaint(e.target.value)}
            placeholder="Brief description of presenting complaint…" style={{ minHeight: '3.5rem' }} />
        </FormField>

        {error && <div className="text-sm rounded-xl px-3 py-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#DC2626', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Registering…' : 'Register Case'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
