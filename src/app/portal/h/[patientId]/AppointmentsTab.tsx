'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check, Clock, CalendarClock, Ticket, RefreshCw, Users } from 'lucide-react'
import {
  bookPatientAppointment, getDoctorAvailability, getQueueStatus,
  type PatientAppointment, type PatientRequest, type HospitalDoctor, type AvailableDay, type QueueStatus,
} from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 14 }
const APPT_COLOR: Record<string, string> = { booked: '#1D4ED8', checked_in: '#15803D', done: '#15803D', cancelled: '#B91C1C', no_show: '#B45309' }

function fmt(d: string): string {
  try { return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return d }
}

interface Props {
  patientId: string
  doctors: HospitalDoctor[]
  appointments: PatientAppointment[]
  requests: PatientRequest[]
}

export default function AppointmentsTab({ patientId, doctors, appointments, requests }: Props) {
  const router = useRouter()

  // Booking
  const [open, setOpen] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [avail, setAvail] = useState<AvailableDay[]>([])
  const [availLoading, setAvailLoading] = useState(false)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookedToken, setBookedToken] = useState<number | null>(null)

  // Queue
  const [queueFor, setQueueFor] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [queueBusy, setQueueBusy] = useState(false)

  async function pickDoctor(id: string) {
    setDoctorId(id); setDate(''); setStart(''); setError(null)
    if (!id) { setAvail([]); return }
    setAvailLoading(true)
    setAvail(await getDoctorAvailability(patientId, id))
    setAvailLoading(false)
  }

  const selectedDay = avail.find((a) => a.date === date)

  async function book() {
    if (!doctorId) { setError('Pick a doctor'); return }
    if (!date) { setError('Pick a day'); return }
    setBusy(true); setError(null)
    const res = await bookPatientAppointment(patientId, doctorId, date, start || undefined)
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setBookedToken(res.token); setOpen(false); setDoctorId(''); setAvail([]); setDate(''); setStart('')
    router.refresh()
  }

  async function loadQueue(appointmentId: string) {
    if (queueFor === appointmentId) { setQueueFor(null); return }
    setQueueFor(appointmentId); setQueueBusy(true)
    setQueue(await getQueueStatus(patientId, appointmentId))
    setQueueBusy(false)
  }

  const now = Date.now()
  const upcoming = appointments.filter((a) => new Date(a.date).getTime() >= now - 86400000 && ['booked', 'checked_in'].includes(a.status))
  const past = appointments.filter((a) => !upcoming.includes(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bookedToken != null && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#15803D' }}>
          <Ticket style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Booked! Your token is #{bookedToken}. Track the live queue below.</span>
        </div>
      )}

      {/* Book */}
      {!open ? (
        <button onClick={() => { setOpen(true); setBookedToken(null) }}
          style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: TEAL, fontWeight: 600, fontSize: 14, cursor: 'pointer', border: '1px dashed ' + TEAL, background: 'rgba(13,148,136,0.04)' }}>
          <Plus style={{ width: 16, height: 16 }} /> Book an appointment
        </button>
      ) : (
        <div style={card}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>Book an appointment</p>
          <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>Doctor</label>
          <select value={doctorId} onChange={(e) => pickDoctor(e.target.value)}
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 12, background: '#fff', color: '#0F172A' }}>
            <option value="">Select a doctor</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.name}</option>)}
          </select>

          {doctorId && (availLoading ? (
            <p style={{ fontSize: 13, color: '#94A3B8' }}>Loading availability…</p>
          ) : avail.length > 0 ? (
            <>
              <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 6 }}>Pick a day</label>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
                {avail.map((a) => (
                  <button key={a.date} onClick={() => { setDate(a.date); setStart(a.sessions[0]?.start ?? '') }}
                    style={{ flexShrink: 0, padding: '8px 10px', borderRadius: 10, border: '1px solid ' + (date === a.date ? TEAL : '#E2E8F0'), background: date === a.date ? TEAL : '#fff', color: date === a.date ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {fmt(a.date)}
                  </button>
                ))}
              </div>
              {selectedDay && selectedDay.sessions.length > 1 && (
                <>
                  <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 6 }}>Session</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {selectedDay.sessions.map((s, i) => (
                      <button key={i} onClick={() => setStart(s.start)}
                        style={{ padding: '7px 12px', borderRadius: 10, border: '1px solid ' + (start === s.start ? TEAL : '#E2E8F0'), background: start === s.start ? 'rgba(13,148,136,0.08)' : '#fff', color: start === s.start ? TEAL : '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {s.label || `${s.start}–${s.end}`} ({s.start}–{s.end})
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>
              This doctor&apos;s OPD hours aren&apos;t published yet. Please contact the hospital to book.
            </p>
          ))}

          {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setOpen(false); setError(null) }} style={{ padding: '9px 14px', borderRadius: 10, background: '#F1F5F9', color: '#475569', border: 'none', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={book} disabled={busy || !date} style={{ padding: '9px 16px', borderRadius: 10, background: (busy || !date) ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: (busy || !date) ? 'not-allowed' : 'pointer' }}>{busy ? 'Booking…' : 'Book & get token'}</button>
          </div>
        </div>
      )}

      {/* Doctor-recommended follow-ups / pending requests */}
      {requests.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', margin: '4px 0 8px' }}>Reminders</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {requests.map((r) => (
              <div key={r.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock style={{ width: 16, height: 16, color: '#B45309', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{r.source === 'patient' ? 'Your appointment request' : 'Follow-up recommended by your doctor'}</p>
                  <p style={{ fontSize: 12, color: '#64748B' }}>{r.suggestedDate && <>{fmt(r.suggestedDate)} · </>}{r.doctor ? `Dr ${r.doctor}` : 'Any doctor'}{r.reason ? ` · ${r.reason}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming with live queue */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', margin: '4px 0 8px' }}>Upcoming</p>
        {upcoming.length === 0 ? <div style={{ ...card, textAlign: 'center', color: '#94A3B8', fontSize: 14, padding: 24 }}>No upcoming appointments.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map((a) => (
              <div key={a.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Dr {a.doctor}</p><p style={{ fontSize: 12, color: '#64748B' }}>{a.reason ?? 'Consultation'}</p></div>
                  <div style={{ textAlign: 'right' }}><p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{fmt(a.date)}</p><p style={{ fontSize: 11, color: APPT_COLOR[a.status] ?? '#64748B' }}>{a.status}</p></div>
                </div>
                <button onClick={() => loadQueue(a.id)}
                  style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 10, background: 'rgba(13,148,136,0.06)', color: TEAL, border: '1px solid rgba(13,148,136,0.15)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Users style={{ width: 14, height: 14 }} /> {queueFor === a.id ? 'Hide queue' : 'Live queue status'}
                </button>
                {queueFor === a.id && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    {queueBusy ? <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Checking…</p> : queue ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                          <div><p style={{ fontSize: 22, fontWeight: 700, color: TEAL }}>#{queue.token}</p><p style={{ fontSize: 11, color: '#94A3B8' }}>your token</p></div>
                          <div><p style={{ fontSize: 22, fontWeight: 700, color: '#0F172A' }}>{queue.completed}</p><p style={{ fontSize: 11, color: '#94A3B8' }}>completed</p></div>
                          <div><p style={{ fontSize: 22, fontWeight: 700, color: '#B45309' }}>{queue.ahead}</p><p style={{ fontSize: 11, color: '#94A3B8' }}>ahead of you</p></div>
                        </div>
                        <p style={{ fontSize: 12, textAlign: 'center', marginTop: 8, fontWeight: queue.status === 'in_consultation' ? 700 : 400, color: queue.status === 'in_consultation' ? TEAL : '#475569' }}>
                          {queue.status === 'in_consultation'
                            ? '🩺 The doctor is seeing you now'
                            : queue.status === 'done'
                              ? '✓ Consultation complete'
                              : queue.ahead === 0 ? "You're next!" : `About ${queue.estWaitMin} min wait`}
                          {queue.status !== 'in_consultation' && queue.status !== 'done' ? ` · ${queue.total} booked today` : ''}
                        </p>
                        <button onClick={async () => { setQueueBusy(true); setQueue(await getQueueStatus(patientId, a.id)); setQueueBusy(false) }}
                          style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, margin: '8px auto 0', padding: '5px 10px', borderRadius: 8, background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 12, cursor: 'pointer' }}>
                          <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
                        </button>
                      </>
                    ) : <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Queue not available.</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', margin: '4px 0 8px' }}>Past</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {past.map((a) => (
              <div key={a.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.85 }}>
                <p style={{ fontSize: 13, color: '#475569' }}>Dr {a.doctor}</p>
                <div style={{ textAlign: 'right' }}><p style={{ fontSize: 12, color: '#64748B' }}>{fmt(a.date)}</p><p style={{ fontSize: 11, color: APPT_COLOR[a.status] ?? '#94A3B8' }}>{a.status}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
