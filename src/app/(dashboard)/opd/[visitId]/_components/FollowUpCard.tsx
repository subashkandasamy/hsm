'use client'

import { useState } from 'react'
import { CalendarClock, Check } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { bookAppointment } from '@/app/actions/appointments'

function addDays(n: number): string {
  return new Date(Date.now() + n * 86400000).toISOString().split('T')[0]
}
const QUICK = [
  { label: '1 week', days: 7 }, { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 }, { label: '3 months', days: 90 },
]

interface Props {
  patientId: string
  doctorId: string
  reason?: string
}

export default function FollowUpCard({ patientId, doctorId, reason }: Props) {
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<string | null>(null)

  async function book() {
    if (!date) { setError('Pick a follow-up date'); return }
    setSaving(true); setError(null)
    const res = await bookAppointment({
      patient_id: patientId, doctor_id: doctorId,
      scheduled_at: `${date}T10:00:00`,
      reason: `Follow-up${note.trim() ? `: ${note.trim()}` : reason ? `: ${reason}` : ''}`,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setBooked(date); setDate(''); setNote('')
  }

  return (
    <GlassCard className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
        <CalendarClock className="w-4 h-4" style={{ color: '#0D9488' }} /> Follow-up
      </h3>

      {booked ? (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium"
          style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
          <Check className="w-4 h-4" /> Follow-up appointment booked for {booked}.
          <button onClick={() => setBooked(null)} className="ml-auto text-xs font-semibold" style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer' }}>Book another</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {QUICK.map((q) => (
              <button key={q.label} onClick={() => setDate(addDays(q.days))}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={date === addDays(q.days)
                  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }
                  : { background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div style={{ width: '10rem' }}>
              <label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>Date</label>
              <Input type="date" value={date} min={addDays(1)} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[10rem]">
              <label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>Reason (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review reports, BP check…" />
            </div>
            <button onClick={book} disabled={saving || !date}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: (saving || !date) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (saving || !date) ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Booking…' : 'Book Follow-up'}
            </button>
          </div>
          {error && <p className="text-xs mt-2 font-medium" style={{ color: '#DC2626' }}>{error}</p>}
        </>
      )}
    </GlassCard>
  )
}
