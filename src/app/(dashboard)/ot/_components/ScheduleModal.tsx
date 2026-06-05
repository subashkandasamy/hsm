'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { scheduleSurgery } from '@/app/actions/ot'
import { searchPatients } from '@/app/actions/patients'
import type { OtRoom, Patient, Profile } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  rooms: OtRoom[]
  doctors: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  defaultDate: string
}

export default function ScheduleModal({ open, onClose, onSuccess, rooms, doctors, defaultDate }: Props) {
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<Patient[]>([])
  const [patient, setPatient] = useState<Pick<Patient, 'id' | 'full_name' | 'uhid'> | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const [surgeonId, setSurgeonId]           = useState('')
  const [anaesthetistId, setAnaesthetistId] = useState('')
  const [roomId, setRoomId]                 = useState('')
  const [procedureName, setProcedureName]   = useState('')
  const [startDate, setStartDate]           = useState(defaultDate)
  const [startTime, setStartTime]           = useState('08:00')
  const [endTime, setEndTime]               = useState('10:00')
  const [price, setPrice]                   = useState('0')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

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
    if (!surgeonId) { setError('Please select a surgeon'); return }
    if (!roomId) { setError('Please select an OT room'); return }
    if (!procedureName.trim()) { setError('Procedure name is required'); return }

    const start = new Date(`${startDate}T${startTime}:00`).toISOString()
    const end   = new Date(`${startDate}T${endTime}:00`).toISOString()
    if (new Date(end) <= new Date(start)) { setError('End time must be after start time'); return }

    setLoading(true); setError(null)
    const result = await scheduleSurgery({
      patient_id:      patient.id,
      surgeon_id:      surgeonId,
      anaesthetist_id: anaesthetistId || null,
      ot_room_id:      roomId,
      procedure_name:  procedureName,
      scheduled_start: start,
      scheduled_end:   end,
      price_snapshot:  parseFloat(price) || 0,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule Surgery" maxWidth="40rem">
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

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Surgeon" required>
            <Select value={surgeonId} onChange={(e) => setSurgeonId(e.target.value)} required>
              <option value="">— Select surgeon —</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </Select>
          </FormField>
          <FormField label="Anaesthetist">
            <Select value={anaesthetistId} onChange={(e) => setAnaesthetistId(e.target.value)}>
              <option value="">— None —</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="OT Room" required>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
              <option value="">— Select room —</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Procedure Fee (₹)">
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Procedure / Surgery Name" required>
          <Input value={procedureName} onChange={(e) => setProcedureName(e.target.value)}
            placeholder="e.g. Laparoscopic Appendectomy" />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Date" required>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Start Time" required>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </FormField>
          <FormField label="End Time" required>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </FormField>
        </div>

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
            {loading ? 'Scheduling…' : 'Schedule Surgery'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
