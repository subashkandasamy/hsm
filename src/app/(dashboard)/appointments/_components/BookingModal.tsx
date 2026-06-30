'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { bookAppointment } from '@/app/actions/appointments'
import { searchPatients, checkPatientLocation } from '@/app/actions/patients'
import { BedDouble, AlertTriangle } from 'lucide-react'
import type { Appointment, Patient } from '@/lib/types'

interface Doctor { id: string; full_name: string }
interface Department { id: string; name: string }

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (appointment: Appointment) => void
  doctors: Doctor[]
  departments: Department[]
}

export default function BookingModal({ open, onClose, onSuccess, doctors, departments }: Props) {
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [form, setForm] = useState({
    doctor_id: '', department_id: '', scheduled_date: '', scheduled_time: '', reason: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [locationWarning, setLocationWarning] = useState<{ loc: 'ipd' | 'emergency'; message: string } | null>(null)

  const searchDebounced = useCallback(async (q: string) => {
    if (!q.trim()) { setPatientResults([]); return }
    const results = await searchPatients(q)
    setPatientResults(results.slice(0, 8))
    setShowDropdown(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchDebounced(patientQuery), 300)
    return () => clearTimeout(t)
  }, [patientQuery, searchDebounced])

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => { const n = { ...e }; delete n[field]; return n })
    setApiError(null)
  }

  async function selectPatient(p: Patient) {
    setSelectedPatient(p)
    setPatientQuery(p.full_name)
    setShowDropdown(false)
    setPatientResults([])
    setLocationWarning(null)
    setErrors((e) => { const n = { ...e }; delete n['patient_id']; return n })
    const { location, message } = await checkPatientLocation(p.id)
    if (location) setLocationWarning({ loc: location, message })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedPatient) {
      setErrors((e) => ({ ...e, patient_id: 'Please select a patient' }))
      return
    }

    setLoading(true)
    setApiError(null)

    if (!form.scheduled_date || !form.scheduled_time) {
      setErrors((e) => ({ ...e, scheduled_date: 'Date and time are required' }))
      setLoading(false)
      return
    }

    const scheduled_at = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`).toISOString()

    const result = await bookAppointment({
      patient_id: selectedPatient.id,
      doctor_id: form.doctor_id,
      department_id: form.department_id || null,
      scheduled_at,
      reason: form.reason || null,
    })

    setLoading(false)

    if (!result.success) {
      setApiError(result.error)
      return
    }

    onSuccess(result.appointment)
    // reset
    setPatientQuery('')
    setSelectedPatient(null)
    setForm({ doctor_id: '', department_id: '', scheduled_date: '', scheduled_time: '', reason: '' })
  }

  return (
    <Modal open={open} onClose={onClose} title="Book Appointment" maxWidth="36rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Patient search */}
        <FormField label="Patient" htmlFor="patient-search" required error={errors.patient_id}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: '#94A3B8', zIndex: 1 }} />
            <input
              id="patient-search"
              type="text"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value)
                setSelectedPatient(null)
                setLocationWarning(null)
              }}
              placeholder="Search patient by name or phone…"
              style={{
                width: '100%', padding: '0.625rem 0.875rem 0.625rem 2.25rem',
                borderRadius: '0.75rem', fontSize: '0.875rem',
                background: 'rgba(255,255,255,0.85)',
                border: `1px solid ${errors.patient_id ? '#DC2626' : '#E2E8F0'}`,
                color: '#0F172A', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488'; setShowDropdown(patientResults.length > 0) }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {showDropdown && patientResults.length > 0 && (
              <ul className="mt-1 md:absolute md:z-50 md:left-0 md:right-0 md:top-full rounded-xl overflow-hidden shadow-lg"
                style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E2E8F0', maxHeight: '14rem', overflowY: 'auto' }}>
                {patientResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={() => selectPatient(p)}
                      className="w-full text-left px-4 py-2.5 text-sm"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span className="font-medium" style={{ color: '#0F172A' }}>{p.full_name}</span>
                      <span className="ml-2 font-mono text-xs" style={{ color: '#94A3B8' }}>{p.uhid}</span>
                      <span className="ml-2 text-xs" style={{ color: '#64748B' }}>{p.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {selectedPatient && !locationWarning && (
            <div className="mt-1.5 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.15)' }}>
              ✓ {selectedPatient.full_name} · {selectedPatient.uhid}
            </div>
          )}
          {locationWarning && (
            <div className="mt-2 px-3 py-3 rounded-xl text-sm flex items-start gap-2.5"
              style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
              <BedDouble className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#D97706' }} />
              <div>
                <p className="font-semibold text-xs" style={{ color: '#92400E' }}>
                  Patient is currently{' '}
                  {locationWarning.loc === 'ipd' ? 'admitted to IPD' : 'in Emergency'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>{locationWarning.message}</p>
              </div>
            </div>
          )}
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Doctor" htmlFor="doctor" required error={errors.doctor_id}>
            <Select id="doctor" value={form.doctor_id}
              onChange={(e) => set('doctor_id', e.target.value)}
              hasError={!!errors.doctor_id} required>
              <option value="">Select doctor…</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </Select>
          </FormField>
          <FormField label="Department" htmlFor="dept">
            <Select id="dept" value={form.department_id}
              onChange={(e) => set('department_id', e.target.value)}>
              <option value="">Select dept…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date" required error={errors.scheduled_date}>
            <Input type="date" value={form.scheduled_date}
              onChange={(e) => { set('scheduled_date', e.target.value); setErrors((er) => { const n = { ...er }; delete n.scheduled_date; return n }) }}
              hasError={!!errors.scheduled_date} required />
          </FormField>
          <FormField label="Time" required>
            <Input type="time" value={form.scheduled_time}
              onChange={(e) => set('scheduled_time', e.target.value)}
              required />
          </FormField>
        </div>

        <FormField label="Reason for Visit" htmlFor="reason">
          <Textarea id="reason" value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="Brief description of the patient's complaint…"
            style={{ minHeight: '4rem' }} />
        </FormField>

        {apiError && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {apiError}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading || !!locationWarning}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: (loading || locationWarning) ? '#94A3B8' : '#0D9488', color: '#fff',
              cursor: (loading || locationWarning) ? 'not-allowed' : 'pointer', border: 'none',
            }}>
            {loading ? 'Booking…' : 'Book Appointment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
