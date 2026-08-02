'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Stethoscope, Pill, FlaskConical, Scan } from 'lucide-react'
import type { PatientRecords } from '@/app/actions/patientPortal'

const TEAL = '#0D9488'
type Tab = 'visits' | 'prescriptions' | 'lab' | 'radiology'

function fmt(d: string): string {
  try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return d }
}

const FLAG_COLOR: Record<string, string> = { high: '#DC2626', low: '#B45309', normal: '#15803D', pending: '#94A3B8' }

export default function HospitalRecords({ records }: { records: PatientRecords }) {
  const [tab, setTab] = useState<Tab>('visits')
  const rxCount = records.visits.reduce((n, v) => n + v.prescriptions.length, 0)

  const TABS: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'visits', label: 'Visits', icon: <Stethoscope style={{ width: 15, height: 15 }} />, count: records.visits.length },
    { key: 'prescriptions', label: 'Prescriptions', icon: <Pill style={{ width: 15, height: 15 }} />, count: rxCount },
    { key: 'lab', label: 'Lab', icon: <FlaskConical style={{ width: 15, height: 15 }} />, count: records.labs.length },
    { key: 'radiology', label: 'Scans', icon: <Scan style={{ width: 15, height: 15 }} />, count: records.radiology.length },
  ]

  const card: React.CSSProperties = { background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0', padding: 14 }
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
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
          {TABS.map(({ key, label, icon, count }) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid ' + (tab === key ? TEAL : '#E2E8F0'), background: tab === key ? TEAL : '#fff', color: tab === key ? '#fff' : '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {icon}{label} {count > 0 && <span style={{ opacity: 0.8 }}>({count})</span>}
            </button>
          ))}
        </div>

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
                {v.prescriptions.length > 0 && (
                  <p style={{ fontSize: 12, color: TEAL, marginTop: 6 }}>{v.prescriptions.length} medicine{v.prescriptions.length !== 1 ? 's' : ''} prescribed</p>
                )}
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
                    <p style={{ fontSize: 13, color: '#475569' }}>
                      {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ')}
                    </p>
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
                    <span style={{ fontSize: 13, fontWeight: 600, color: FLAG_COLOR[it.flag] ?? '#0F172A' }}>
                      {it.result ?? '—'}{it.unit ? ` ${it.unit}` : ''}
                    </span>
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
                {r.report ? <p style={{ fontSize: 13, color: '#475569', whiteSpace: 'pre-wrap' }}>{r.report}</p>
                  : <p style={{ fontSize: 13, color: '#94A3B8' }}>Report pending.</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
