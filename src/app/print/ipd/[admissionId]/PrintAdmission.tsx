'use client'

import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type {
  Admission, IpdProgressNote, IpdMedicationOrder, IpdAdminSchedule,
  LabOrder, RadiologyOrder, TenantProfile,
} from '@/lib/types'

interface Props {
  admission: Admission
  notes: IpdProgressNote[]
  orders: IpdMedicationOrder[]
  schedule: IpdAdminSchedule[]
  labOrders: LabOrder[]
  radOrders: RadiologyOrder[]
  tenantProfile: TenantProfile | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function computeAge(dob: string | null | undefined): string {
  if (!dob) return '—'
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000)
  return `${age} yrs`
}

function orderLabel(o: IpdMedicationOrder): string {
  if (o.type === 'medication')
    return `${o.drug_name ?? '—'} ${o.dose ?? ''}${o.dose_unit ?? ''} ${o.route ?? ''}`.trim()
  if (o.type === 'iv_infusion')
    return `${o.fluid_name ?? 'IV Fluid'} ${o.volume_ml ?? ''}ml @ ${o.rate_ml_per_hr ?? '?'} ml/hr`
  return `O₂ ${o.flow_rate_lpm ?? '?'} L/min — ${o.delivery_method ?? ''}`
}

const FREQ_LABELS: Record<string, string> = {
  stat: 'Stat (once)', daily: 'Once daily', twice_daily: 'Twice daily',
  thrice_daily: 'Three times daily', every_x_hours: 'Every X hrs',
  sos: 'SOS', continuous: 'Continuous',
}

const TYPE_LABEL: Record<string, string> = {
  medication: 'Medication', iv_infusion: 'IV Infusion', oxygen: 'Oxygen',
}

// ─── Section heading ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '14px', pageBreakInside: 'avoid' }}>
      <div style={{
        background: '#F0FDF9', borderBottom: '1px solid #CCFBF1',
        padding: '5px 14px',
      }}>
        <p style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '2px', color: '#0F766E', textTransform: 'uppercase', margin: 0 }}>
          {title}
        </p>
      </div>
      {children}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PrintAdmission({ admission: adm, notes, orders, schedule, labOrders, radOrders, tenantProfile: p }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  const patient = adm.patient
  const printedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const hospName = p?.name || 'Hospital'
  const addrParts = [
    p?.address_line1, p?.address_line2,
    [p?.city, p?.state].filter(Boolean).join(', '),
    p?.pincode && `- ${p.pincode}`,
  ].filter(Boolean)
  const contactParts = [
    p?.phone1 && `Phone: ${p.phone1}`,
    p?.phone2 && p.phone2,
    p?.email && `Email: ${p.email}`,
    p?.website && `Web: ${p.website}`,
  ].filter(Boolean)
  const legalParts = [
    p?.cin_no && `CIN No: ${p.cin_no}`,
    p?.gst_no && `GST: ${p.gst_no}`,
  ].filter(Boolean)

  // Group notes by calendar day (chronological order — oldest first)
  const notesByDay = notes
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .reduce<Record<string, IpdProgressNote[]>>((acc, note) => {
      const day = note.created_at.split('T')[0]
      ;(acc[day] ??= []).push(note)
      return acc
    }, {})
  const sortedDays = Object.keys(notesByDay).sort()

  const activeOrders  = orders.filter((o) => o.status === 'active')
  const stoppedOrders = orders.filter((o) => o.status === 'stopped')

  function slotSummary(orderId: string) {
    const slots = schedule.filter((s) => s.order_id === orderId)
    const given   = slots.filter((s) => s.status === 'given').length
    const missed  = slots.filter((s) => s.status === 'missed').length
    const pending = slots.filter((s) => s.status === 'pending').length
    return { given, missed, pending, total: slots.length }
  }

  const label = (text: string) => (
    <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0 0 2px' }}>{text}</p>
  )
  const value = (text: string | null | undefined, fallback = '—') => (
    <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{text || fallback}</p>
  )

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: #fff; }
          .screen-only { display: none !important; }
          .no-break { page-break-inside: avoid; }
        }
        @media screen {
          body { background: #F1F5F9; display: flex; flex-direction: column; align-items: center; padding: 24px; gap: 12px; min-height: 100vh; }
          .print-doc { max-width: 210mm; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
        }
      `}</style>

      {/* Screen controls */}
      <div className="screen-only" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button
          onClick={() => window.history.back()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: '1px solid #E2E8F0', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui' }}
        >
          <ArrowLeft size={15} /> Back
        </button>
        <button
          onClick={() => window.print()}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#0D9488', color: '#fff', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui', fontWeight: 600 }}
        >
          <Printer size={15} /> Print
        </button>
      </div>

      {/* ── Print document ─────────────────────────────────────────────────────── */}
      <div className="print-doc" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#0F172A' }}>

        {/* ── Hospital header ── */}
        <div style={{ padding: '16px 24px 12px', borderBottom: '2.5px solid #0D9488' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {p?.logo_url && (
              <img src={p.logo_url} alt="Logo" style={{ height: '70px', width: 'auto', maxWidth: '100px', objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0, lineHeight: 1.2 }}>
                {hospName.toUpperCase()}
              </h1>
              {(p?.tagline || p?.tagline2) && (
                <p style={{ fontSize: '11px', color: '#0D9488', fontWeight: 600, margin: '3px 0 0' }}>
                  {[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}
                </p>
              )}
              {addrParts.length > 0 && (
                <p style={{ fontSize: '10px', color: '#475569', margin: '3px 0 0', lineHeight: 1.5 }}>{addrParts.join(', ')}</p>
              )}
              {contactParts.length > 0 && (
                <p style={{ fontSize: '10px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>
              )}
              {legalParts.length > 0 && (
                <p style={{ fontSize: '9px', color: '#94A3B8', margin: '2px 0 0', letterSpacing: '0.3px' }}>{legalParts.join('  |  ')}</p>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '90px' }}>
              <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Admitted</p>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#0D9488', margin: '2px 0 0' }}>{fmtDate(adm.admitted_at)}</p>
              {adm.discharged_at && (
                <>
                  <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '5px 0 0' }}>Discharged</p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#15803D', margin: '2px 0 0' }}>{fmtDate(adm.discharged_at)}</p>
                </>
              )}
              <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '5px 0 0' }}>UHID</p>
              <p style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', margin: '2px 0 0' }}>{patient?.uhid ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* ── Type banner ── */}
        <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '5px 0', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>
            Inpatient Admission Record
          </span>
        </div>

        {/* ── Patient / admission info grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
          {/* Row 1: Name + Doctor */}
          <div style={{ padding: '10px 14px', borderRight: '1px solid #E2E8F0', gridColumn: 'span 2' }}>
            {label('Patient Name')}
            <p style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>{patient?.full_name ?? '—'}</p>
          </div>
          <div style={{ padding: '10px 14px' }}>
            {label('Attending Doctor')}
            {value(adm.doctor?.full_name)}
          </div>

          {/* Row 2: Ward/Bed | Status | Phone */}
          <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            {label('Ward / Bed')}
            {value(`${adm.ward?.name ?? '—'} — ${adm.bed?.bed_no ?? '—'}`)}
          </div>
          <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            {label('Status')}
            <p style={{ fontSize: '12px', fontWeight: 700, color: adm.status === 'admitted' ? '#0D9488' : '#15803D', margin: 0, textTransform: 'capitalize' }}>{adm.status}</p>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0' }}>
            {label('Phone')}
            {value(patient?.phone ?? null)}
          </div>

          {/* Row 3: Blood group + Allergies */}
          {(patient?.blood_group || patient?.allergies) && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0', gridColumn: 'span 3', display: 'flex', gap: '24px', alignItems: 'center' }}>
              {patient?.blood_group && (
                <div>
                  {label('Blood Group')}
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626', margin: 0 }}>{patient.blood_group}</p>
                </div>
              )}
              {patient?.allergies && (
                <div>
                  {label('Allergies')}
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400E', margin: 0, background: '#FFFBEB', padding: '2px 8px', borderRadius: '6px', display: 'inline-block' }}>
                    ⚠ {patient.allergies}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Row 4: Reason for admission */}
          {adm.reason && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0', gridColumn: 'span 3' }}>
              {label('Reason for Admission')}
              <p style={{ fontSize: '12px', color: '#0F172A', margin: 0, lineHeight: 1.5 }}>{adm.reason}</p>
            </div>
          )}
        </div>

        {/* ── Discharge summary ── */}
        {adm.discharge_summary && (
          <div style={{ margin: '12px 14px', padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px' }}>
            <p style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', color: '#15803D', textTransform: 'uppercase', margin: '0 0 6px' }}>
              Discharge Summary
            </p>
            <p style={{ fontSize: '12px', color: '#15803D', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{adm.discharge_summary}</p>
          </div>
        )}

        {/* ── Progress Notes ── */}
        {sortedDays.length > 0 && (
          <Section title="Progress Notes">
            {sortedDays.map((day) => (
              <div key={day} className="no-break" style={{ borderBottom: '1px solid #F1F5F9' }}>
                {/* Day header */}
                <div style={{ padding: '5px 14px', background: '#F8FAFC' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {new Date(day + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>

                {notesByDay[day].map((note, idx) => (
                  <div key={note.id} style={{
                    padding: '8px 14px',
                    borderTop: idx > 0 ? '1px solid #F8FAFC' : undefined,
                  }}>
                    {/* Author + time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <p style={{ fontSize: '10px', fontWeight: 700, color: '#0D9488', margin: 0 }}>
                        {note.author?.full_name ?? 'Unknown'}
                        {note.author?.role && (
                          <span style={{ fontWeight: 400, color: '#64748B' }}> · {note.author.role}</span>
                        )}
                      </p>
                      <p style={{ fontSize: '10px', color: '#94A3B8', margin: 0 }}>{fmtTime(note.created_at)}</p>
                    </div>

                    {/* Vitals row */}
                    {note.vitals && Object.values(note.vitals).some(Boolean) && (
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '4px', padding: '4px 8px', background: 'rgba(13,148,136,0.04)', borderRadius: '4px', border: '1px solid rgba(13,148,136,0.1)' }}>
                        {Object.entries(note.vitals as Record<string, string>)
                          .filter(([, v]) => v)
                          .map(([key, val]) => (
                            <span key={key} style={{ fontSize: '10px', color: '#0F172A' }}>
                              <span style={{ color: '#64748B', textTransform: 'uppercase', fontSize: '9px' }}>{key} </span>
                              <strong>{val}</strong>
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Note text */}
                    <p style={{ fontSize: '12px', color: '#0F172A', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{note.note}</p>
                  </div>
                ))}
              </div>
            ))}
            {sortedDays.length === 0 && (
              <p style={{ fontSize: '11px', color: '#94A3B8', padding: '10px 14px', margin: 0 }}>No progress notes recorded.</p>
            )}
          </Section>
        )}

        {/* ── Medications / IV / O₂ ── */}
        {orders.length > 0 && (
          <Section title="Medications / IV / O₂">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Type', 'Description', 'Frequency', 'Duration', 'Status', 'Given / Total'].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#475569', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...activeOrders, ...stoppedOrders].map((o, i) => {
                  const { given, missed, total } = slotSummary(o.id)
                  const isStopped = o.status === 'stopped'
                  return (
                    <tr key={o.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA', opacity: isStopped ? 0.7 : 1 }}>
                      <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#64748B', fontWeight: 600, fontSize: '10px' }}>
                        {TYPE_LABEL[o.type]}
                      </td>
                      <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 600 }}>
                        <span style={isStopped ? { textDecoration: 'line-through', color: '#94A3B8' } : {}}>
                          {orderLabel(o)}
                        </span>
                        {o.notes && <span style={{ display: 'block', fontSize: '10px', color: '#64748B', fontWeight: 400 }}>{o.notes}</span>}
                      </td>
                      <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>
                        {FREQ_LABELS[o.frequency_type] ?? o.frequency_type}
                      </td>
                      <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>
                        {o.duration_days}d
                        {isStopped && o.stop_at && (
                          <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8' }}>Stopped {fmtDate(o.stop_at)}</span>
                        )}
                      </td>
                      <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                          background: isStopped ? '#F3F4F6' : '#DCFCE7',
                          color: isStopped ? '#6B7280' : '#15803D',
                        }}>
                          {isStopped ? 'Stopped' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                        {total > 0 ? (
                          <>
                            <span style={{ color: '#15803D', fontWeight: 600 }}>{given}</span>
                            <span style={{ color: '#94A3B8' }}> / {total}</span>
                            {missed > 0 && <span style={{ color: '#DC2626', fontSize: '10px', marginLeft: '4px' }}>{missed} missed</span>}
                          </>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Lab Orders ── */}
        {labOrders.filter((o) => o.status !== 'cancelled').length > 0 && (
          <Section title="Lab Tests Ordered">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Date', 'Tests', 'Priority', 'Status', 'Ordered By'].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#475569', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labOrders.filter((o) => o.status !== 'cancelled').map((order, i) => (
                  <tr key={order.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569', whiteSpace: 'nowrap' }}>
                      {fmtDate(order.ordered_at)}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#0F172A' }}>
                      {order.items?.map((item) => item.test?.name ?? item.test_id).join(', ') || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0' }}>
                      {order.priority === 'stat' ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>STAT</span>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#64748B' }}>Routine</span>
                      )}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', textTransform: 'capitalize',
                        background: order.status === 'reported' ? '#DCFCE7' : order.status === 'ordered' ? '#FEF3C7' : '#DBEAFE',
                        color:      order.status === 'reported' ? '#15803D' : order.status === 'ordered' ? '#92400E' : '#1E40AF',
                      }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>
                      {order.orderer?.full_name ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── Radiology Orders ── */}
        {radOrders.filter((o) => o.status !== 'cancelled').length > 0 && (
          <Section title="Radiology / Imaging">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Date', 'Scan', 'Modality', 'Priority', 'Status', 'Ordered By'].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #E2E8F0', color: '#475569', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {radOrders.filter((o) => o.status !== 'cancelled').map((order, i) => (
                  <tr key={order.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569', whiteSpace: 'nowrap' }}>
                      {fmtDate(order.ordered_at)}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 600 }}>
                      {order.test?.name ?? '—'}
                      {order.report && (
                        <p style={{ fontSize: '10px', color: '#64748B', margin: '2px 0 0', fontWeight: 400, lineHeight: 1.4 }}>{order.report}</p>
                      )}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#64748B' }}>
                      {order.test?.modality ?? '—'}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0' }}>
                      {order.priority === 'stat' ? (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>STAT</span>
                      ) : (
                        <span style={{ fontSize: '10px', color: '#64748B' }}>Routine</span>
                      )}
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0' }}>
                      <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px', textTransform: 'capitalize',
                        background: order.status === 'reported' ? '#DCFCE7' : order.status === 'ordered' ? '#FEF3C7' : '#DBEAFE',
                        color:      order.status === 'reported' ? '#15803D' : order.status === 'ordered' ? '#92400E' : '#1E40AF',
                      }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', border: '1px solid #E2E8F0', color: '#475569' }}>
                      {order.orderer?.full_name ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {/* ── No treatment data placeholder ── */}
        {orders.length === 0 && labOrders.filter(o => o.status !== 'cancelled').length === 0 && radOrders.filter(o => o.status !== 'cancelled').length === 0 && (
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0 }}>No treatment orders recorded for this admission.</p>
          </div>
        )}

        {/* ── Signature row ── */}
        <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #E2E8F0', marginTop: '12px' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#94A3B8', margin: '0 0 4px' }}>Next Review / Follow-up</p>
            <div style={{ width: '180px', borderBottom: '1px dashed #CBD5E1', marginBottom: '4px' }}>&nbsp;</div>
            <p style={{ fontSize: '10px', color: '#CBD5E1', margin: 0 }}>Date / Instructions</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ width: '160px', borderBottom: '2px solid #0F172A', marginBottom: '6px', marginLeft: 'auto' }}>&nbsp;</div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', margin: 0 }}>{adm.doctor?.full_name ?? ''}</p>
            <p style={{ fontSize: '10px', color: '#64748B', margin: '2px 0 0' }}>Attending Doctor</p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '6px 24px', display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>Printed: {printedAt}</p>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>This is a computer-generated inpatient record.</p>
        </div>

      </div>
    </>
  )
}
