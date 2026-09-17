'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { scheduleSurgery, listRooms } from '@/app/actions/ot'
import type { OtRoom, Profile, ProcedureTariff, Admission } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  doctors: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  tariffs: ProcedureTariff[]
  defaultDate: string
  admission?: Pick<Admission, 'id' | 'patient_id'> & {
    patient?: { id: string; full_name: string; uhid: string }
  }
}

export default function ScheduleModal({ open, onClose, onSuccess, doctors, tariffs, defaultDate, admission }: Props) {
  const [rooms, setRooms] = useState<OtRoom[]>([])
  const [surgeonId, setSurgeonId]           = useState('')
  const [anaesthetistId, setAnaesthetistId] = useState('')
  const [roomId, setRoomId]                 = useState('')
  const [tariffId, setTariffId]             = useState('')
  const [startDate, setStartDate]           = useState(defaultDate)
  const [startTime, setStartTime]           = useState('08:00')
  const [endTime, setEndTime]               = useState('10:00')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const activeTariffs  = tariffs.filter(t => t.is_active)
  const selectedTariff = activeTariffs.find(t => t.id === tariffId) ?? null

  useEffect(() => {
    if (open) {
      listRooms().then(setRooms)
    } else {
      setSurgeonId(''); setAnaesthetistId(''); setRoomId('')
      setTariffId(''); setStartDate(defaultDate)
      setStartTime('08:00'); setEndTime('10:00'); setError(null)
    }
  }, [open, defaultDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!surgeonId) { setError('Please select a surgeon'); return }
    if (!roomId)    { setError('Please select an OT room'); return }
    if (!tariffId)  { setError('Please select a procedure'); return }

    const start = new Date(`${startDate}T${startTime}:00`).toISOString()
    const end   = new Date(`${startDate}T${endTime}:00`).toISOString()
    if (new Date(end) <= new Date(start)) { setError('End time must be after start time'); return }

    setLoading(true); setError(null)
    const result = await scheduleSurgery({
      patient_id:      admission ? admission.patient_id : '',
      admission_id:    admission?.id ?? null,
      surgeon_id:      surgeonId,
      anaesthetist_id: anaesthetistId || null,
      ot_room_id:      roomId,
      procedure_name:  selectedTariff!.name,
      scheduled_start: start,
      scheduled_end:   end,
      price_snapshot:  selectedTariff!.default_price,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Schedule Surgery" maxWidth="40rem">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Patient — locked to IPD admission, not editable */}
        {admission?.patient && (
          <div className="px-3.5 py-3 rounded-xl flex items-center gap-2"
            style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.2)' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#0D9488' }}>Patient (from IPD)</p>
              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{admission.patient.full_name}</p>
              <p className="font-mono text-xs" style={{ color: '#64748B' }}>{admission.patient.uhid}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Surgeon" required>
            <Select value={surgeonId} onChange={e => setSurgeonId(e.target.value)} required>
              <option value="">— Select surgeon —</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </Select>
          </FormField>
          <FormField label="Anaesthetist">
            <Select value={anaesthetistId} onChange={e => setAnaesthetistId(e.target.value)}>
              <option value="">— None —</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="OT Room" required>
          <Select value={roomId} onChange={e => setRoomId(e.target.value)} required>
            <option value="">— Select room —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </FormField>

        <FormField label="Procedure / Surgery Name" required>
          {activeTariffs.length === 0 ? (
            <div className="px-3 py-2.5 rounded-xl text-sm" style={{ border: '1px solid #E2E8F0', color: '#94A3B8' }}>
              No procedures configured — add them in Settings → Tariffs &amp; Charges.
            </div>
          ) : (
            <Select value={tariffId} onChange={e => setTariffId(e.target.value)}>
              <option value="">Select procedure…</option>
              {activeTariffs.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — ₹{t.default_price.toLocaleString('en-IN')}
                  {t.category ? ` (${t.category})` : ''}
                </option>
              ))}
            </Select>
          )}
        </FormField>

        {selectedTariff && (
          <div className="px-3.5 py-3 rounded-xl" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p className="text-xs font-medium" style={{ color: '#92400E' }}>
              Procedure fee: <strong>₹{selectedTariff.default_price.toLocaleString('en-IN')}</strong>
            </p>
            <p className="text-xs mt-1" style={{ color: '#B45309' }}>
              The surgery is added to the patient&apos;s bill when it is marked completed.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <FormField label="Date" required>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Start Time" required>
            <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
          </FormField>
          <FormField label="End Time" required>
            <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
          </FormField>
        </div>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
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
