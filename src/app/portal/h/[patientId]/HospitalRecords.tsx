'use client'

import { useState } from 'react'
import Link from 'next/link'
import { doctorName } from '@/lib/doctors'
import { ArrowLeft, Stethoscope, Pill, FlaskConical, Scan, CalendarClock, Printer, ImageIcon, Loader2 } from 'lucide-react'
import { type PatientRecords, type PatientAppointment, type PatientRequest, type HospitalDoctor, getPortalScanImageUrl } from '@/app/actions/patientPortal'
import AppointmentsTab from './AppointmentsTab'

const TEAL = '#0D9488'
type Tab = 'appointments' | 'visits' | 'prescriptions' | 'lab' | 'radiology'

function fmt(d: string): string {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return d }
}
const FLAG_COLOR: Record<string, string> = { high: '#DC2626', low: '#B45309', normal: '#15803D', pending: '#94A3B8' }
const FLAG_PILL: Record<string, { bg: string; color: string; label: string }> = {
  high: { bg: '#FEE2E2', color: '#DC2626', label: 'HIGH' },
  low: { bg: '#DBEAFE', color: '#1D4ED8', label: 'LOW' },
  normal: { bg: '#DCFCE7', color: '#15803D', label: 'NORMAL' },
  pending: { bg: '#F1F5F9', color: '#64748B', label: 'PENDING' },
}

function printBtn(href: string) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: TEAL, color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
      <Printer style={{ width: 13, height: 13 }} /> Print / Download
    </a>
  )
}

interface Props {
  patientId: string
  records: PatientRecords
  appointments: PatientAppointment[]
  requests: PatientRequest[]
  doctors: HospitalDoctor[]
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 14 }

export default function HospitalRecords({ patientId, records, appointments, requests, doctors }: Props) {
  const [tab, setTab] = useState<Tab>('appointments')
  const rxCount = records.visits.reduce((n, v) => n + v.prescriptions.length, 0)
  const upcomingCount = appointments.filter((a) => ['booked', 'checked_in'].includes(a.status)).length

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'appointments', label: 'Appointments', icon: <CalendarClock style={{ width: 15, height: 15 }} />, count: upcomingCount + requests.length },
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
          <AppointmentsTab patientId={patientId} doctors={doctors} appointments={appointments} requests={requests} />
        )}

        {/* Visits */}
        {tab === 'visits' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.visits.length === 0 ? empty('No visits recorded.') : records.visits.map((v) => (
              <div key={v.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{doctorName(v.doctor)}</span>
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
                <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>{fmt(v.date)} · {doctorName(v.doctor)}</p>
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
            {records.labs.length === 0 ? empty('No lab reports.') : records.labs.map((l) => {
              const hasResults = l.items.some((it) => it.result != null)
              return (
                <div key={l.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{fmt(l.date)} · {l.status}</span>
                    {hasResults && printBtn(`/portal/print/lab/${l.id}/pdf`)}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: '#94A3B8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          <th style={{ padding: '4px 8px 6px 0', fontWeight: 700 }}>Investigation</th>
                          <th style={{ padding: '4px 8px 6px', fontWeight: 700, textAlign: 'right' }}>Result</th>
                          <th style={{ padding: '4px 8px 6px', fontWeight: 700 }}>Reference</th>
                          <th style={{ padding: '4px 0 6px 8px', fontWeight: 700, textAlign: 'center' }}>Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.items.map((it, i) => {
                          const pill = FLAG_PILL[it.flag] ?? FLAG_PILL.pending
                          const abnormal = it.flag === 'high' || it.flag === 'low'
                          return (
                            <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '7px 8px 7px 0', color: '#0F172A', fontWeight: 600 }}>{it.test}</td>
                              <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: abnormal ? 800 : 600, color: abnormal ? (FLAG_COLOR[it.flag] ?? '#0F172A') : '#0F172A' }}>
                                {it.result ?? '—'}{it.unit ? ` ${it.unit}` : ''}
                              </td>
                              <td style={{ padding: '7px 8px', color: '#64748B' }}>{it.reference ?? '—'}</td>
                              <td style={{ padding: '7px 0 7px 8px', textAlign: 'center' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: pill.bg, color: pill.color }}>{pill.label}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Radiology */}
        {tab === 'radiology' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.radiology.length === 0 ? empty('No scans.') : records.radiology.map((r) => (
              <ScanCard key={r.id} scan={r} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ScanCard({ scan: r }: { scan: PatientRecords['radiology'][number] }) {
  const [img, setImg] = useState<{ url: string; isPdf: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const hasContent = !!r.report || r.hasImage

  async function loadImage() {
    setLoading(true)
    try {
      const res = await getPortalScanImageUrl(r.id)
      if (res.url) setImg({ url: res.url, isPdf: res.isPdf })
    } finally { setLoading(false) }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{r.test}</span>
        <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>{fmt(r.date)} · {r.status}</span>
      </div>
      {r.report ? <p style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{r.report}</p> : <p style={{ fontSize: 13, color: '#94A3B8' }}>Report pending.</p>}

      {img && !img.isPdf && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.url} alt={`${r.test} scan`} style={{ marginTop: 10, maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 8, border: '1px solid #E2E8F0' }} />
      )}
      {img && img.isPdf && (
        <a href={img.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 10, fontSize: 13, color: TEAL, fontWeight: 600 }}>Open PDF scan ↗</a>
      )}

      {hasContent && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {r.hasImage && !img && (
            <button onClick={loadImage} disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <ImageIcon style={{ width: 13, height: 13 }} />}
              {loading ? 'Loading…' : 'View scan image'}
            </button>
          )}
          {printBtn(`/portal/print/radiology/${r.id}/pdf`)}
        </div>
      )}
    </div>
  )
}
