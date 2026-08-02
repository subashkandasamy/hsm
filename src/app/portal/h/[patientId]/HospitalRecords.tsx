'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Stethoscope, Pill, FlaskConical, Scan, CalendarClock, Plus, Check, Clock } from 'lucide-react'
import {
  type PatientRecords, type PatientAppointment, type PatientRequest, type HospitalDoctor,
  requestPatientAppointment,
} from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
type Tab = 'appointments' | 'visits' | 'prescriptions' | 'lab' | 'radiology'

function fmt(d: string): string {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return d }
}
function today(): string { return new Date().toISOString().split('T')[0] }
const FLAG_COLOR: Record<string, string> = { high: '#DC2626', low: '#B45309', normal: '#15803D', pending: '#94A3B8' }
const APPT_COLOR: Record<string, string> = { booked: '#1D4ED8', checked_in: '#15803D', done: '#15803D', cancelled: '#B91C1C', no_show: '#B45309' }

interface Props {
  patientId: string
  records: PatientRecords
  appointments: PatientAppointment[]
  requests: PatientRequest[]
  doctors: HospitalDoctor[]
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 14 }

export default function HospitalRecords({ patientId, records, appointments, requests, doctors }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('appointments')
  const rxCount = records.visits.reduce((n, v) => n + v.prescriptions.length, 0)

  // Request form
  const [showForm, setShowForm] = useState(false)
  const [doctorId, setDoctorId] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const now = Date.now()
  const upcoming = appointments.filter((a) => new Date(a.date).getTime() >= now && ['booked', 'checked_in'].includes(a.status))
  const past = appointments.filter((a) => !upcoming.includes(a))

  async function submitRequest() {
    if (!date) { setError('Pick a preferred date'); return }
    setBusy(true); setError(null)
    const res = await requestPatientAppointment(patientId, { doctorId: doctorId || null, date, reason: reason.trim() || null })
    setBusy(false)
    if (!res.success) { setError(res.error); return }
    setShowForm(false); setDoctorId(''); setDate(''); setReason(''); setDone(true)
    router.refresh()
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'appointments', label: 'Appointments', icon: <CalendarClock style={{ width: 15, height: 15 }} />, count: upcoming.length + requests.length },
    { key: 'visits', label: 'Visits', icon: <Stethoscope style={{ width: 15, height: 15 }} />, count: records.visits.length },
    { key: 'prescriptions', label: 'Rx', icon: <Pill style={{ width: 15, height: 15 }} />, count: rxCount },
    { key: 'lab', label: 'Lab', icon: <FlaskConical style={{ width: 15, height: 15 }} />, count: records.labs.length },
    { key: 'radiology', label: 'Scans', icon: <Scan style={{ width: 15, height: 15 }} />, count: records.radiology.length },
  ]
  const empty = (t: string) => <div style={{ ...card, textAlign: 'center', color: '#94A3B8', fontSize: 14, padding: 28 }}>{t}</div>

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '14px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ color: '#64748B', display: 'flex' }}><ArrowLeft style={{ width: 20, height: 20 }} /></Link>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{records.hospital}</p>
            <p style={{ fontSize: 12, color: '#94A3B8' }}>{records.patientName} · UHID {records.uhid}</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '16px' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
          {TABS.map(({ key, label, icon, count }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid ' + (tab === key ? TEAL : '#E2E8F0'), background: tab === key ? TEAL : '#fff', color: tab === key ? '#fff' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {icon}{label} {count > 0 && <span style={{ opacity: 0.8 }}>({count})</span>}
            </button>
          ))}
        </div>

        {/* Appointments */}
        {tab === 'appointments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Request */}
            {done && !showForm && (
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#15803D', fontSize: 13 }}>
                <Check style={{ width: 16, height: 16 }} /> Request sent — the hospital will confirm and book your appointment.
              </div>
            )}
            {!showForm ? (
              <button onClick={() => { setShowForm(true); setDone(false) }}
                style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: TEAL, fontWeight: 600, fontSize: 14, cursor: 'pointer', border: '1px dashed ' + TEAL, background: 'rgba(13,148,136,0.04)' }}>
                <Plus style={{ width: 16, height: 16 }} /> Request an appointment
              </button>
            ) : (
              <div style={card}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', marginBottom: 10 }}>Request an appointment</p>
                <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>Doctor (optional)</label>
                <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 10, background: '#fff', color: '#0F172A' }}>
                  <option value="">Any doctor</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.name}</option>)}
                </select>
                <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>Preferred date</label>
                <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)}
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 10, color: '#0F172A' }} />
                <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. review, fever, follow-up"
                  style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14, marginBottom: 12, color: '#0F172A' }} />
                {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 8 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowForm(false); setError(null) }} style={{ padding: '9px 14px', borderRadius: 10, background: '#F1F5F9', color: '#475569', border: 'none', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submitRequest} disabled={busy} style={{ padding: '9px 16px', borderRadius: 10, background: busy ? '#94A3B8' : TEAL, color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{busy ? 'Sending…' : 'Send request'}</button>
                </div>
              </div>
            )}

            {/* Pending requests / recommended follow-ups */}
            {requests.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', margin: '4px 0 8px' }}>Awaiting confirmation</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {requests.map((r) => (
                    <div key={r.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Clock style={{ width: 16, height: 16, color: '#B45309', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                          {r.source === 'patient' ? 'Your appointment request' : 'Follow-up recommended by your doctor'}
                        </p>
                        <p style={{ fontSize: 12, color: '#64748B' }}>
                          {r.suggestedDate && <>{fmt(r.suggestedDate)} · </>}{r.doctor ? `Dr ${r.doctor}` : 'Any doctor'}{r.reason ? ` · ${r.reason}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94A3B8', margin: '4px 0 8px' }}>Upcoming</p>
              {upcoming.length === 0 ? empty('No upcoming appointments.') : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcoming.map((a) => (
                    <div key={a.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>Dr {a.doctor}</p><p style={{ fontSize: 12, color: '#64748B' }}>{a.reason ?? 'Consultation'}</p></div>
                      <div style={{ textAlign: 'right' }}><p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{fmt(a.date)}</p><p style={{ fontSize: 11, color: APPT_COLOR[a.status] ?? '#64748B' }}>{a.status}</p></div>
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
        )}

        {/* Visits */}
        {tab === 'visits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.visits.length === 0 ? empty('No visits recorded.') : records.visits.map((v) => (
              <div key={v.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Dr {v.doctor}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{fmt(v.date)} · {v.type.toUpperCase()}</span>
                </div>
                {v.diagnosis && <p style={{ fontSize: 14, color: '#0F172A', marginBottom: 3 }}><strong>Diagnosis:</strong> {v.diagnosis}</p>}
                {v.complaint && <p style={{ fontSize: 13, color: '#475569', marginBottom: 3 }}><strong>Complaint:</strong> {v.complaint}</p>}
                {v.notes && <p style={{ fontSize: 13, color: '#64748B' }}>{v.notes}</p>}
                {v.prescriptions.length > 0 && <p style={{ fontSize: 12, color: TEAL, marginTop: 6 }}>{v.prescriptions.length} medicine{v.prescriptions.length !== 1 ? 's' : ''} prescribed</p>}
              </div>
            ))}
          </div>
        )}

        {/* Prescriptions */}
        {tab === 'prescriptions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rxCount === 0 ? empty('No prescriptions.') : records.visits.filter((v) => v.prescriptions.length).map((v) => (
              <div key={v.id} style={card}>
                <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>{fmt(v.date)} · Dr {v.doctor}</p>
                {v.prescriptions.map((rx, i) => (
                  <div key={i} style={{ paddingBottom: 8, marginBottom: 8, borderBottom: i < v.prescriptions.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{rx.drug}</p>
                    <p style={{ fontSize: 13, color: '#475569' }}>{[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ')}</p>
                    {rx.instructions && <p style={{ fontSize: 12, color: '#94A3B8' }}>{rx.instructions}</p>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Lab */}
        {tab === 'lab' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.labs.length === 0 ? empty('No lab reports.') : records.labs.map((l) => (
              <div key={l.id} style={card}>
                <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>{fmt(l.date)} · {l.status}</p>
                {l.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: 13, color: '#0F172A' }}>{it.test}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: FLAG_COLOR[it.flag] ?? '#0F172A' }}>{it.result ?? '—'}{it.unit ? ` ${it.unit}` : ''}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Radiology */}
        {tab === 'radiology' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.radiology.length === 0 ? empty('No scans.') : records.radiology.map((r) => (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{r.test}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{fmt(r.date)} · {r.status}</span>
                </div>
                {r.report ? <p style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{r.report}</p> : <p style={{ fontSize: 13, color: '#94A3B8' }}>Report pending.</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
