'use client'

import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { LabOrder, LabOrderItem, LabFlag, Patient, TenantProfile } from '@/lib/types'

interface Props {
  order: LabOrder
  patient: Patient | null
  tenantProfile: TenantProfile | null
}

const FLAG_COLORS: Record<LabFlag, { bg: string; color: string; label: string }> = {
  pending: { bg: '#F1F5F9', color: '#64748B', label: 'PENDING' },
  normal:  { bg: '#DCFCE7', color: '#15803D', label: 'NORMAL' },
  high:    { bg: '#FEE2E2', color: '#DC2626', label: 'HIGH' },
  low:     { bg: '#DBEAFE', color: '#1D4ED8', label: 'LOW' },
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function computeAge(dob: string | null | undefined): string {
  if (!dob) return '—'
  const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000)
  return `${age} yrs`
}

function refRange(item: LabOrderItem): string {
  const t = item.test
  if (t?.reference_range) return t.reference_range
  if (t?.ref_low != null && t?.ref_high != null) return `${t.ref_low} – ${t.ref_high}`
  if (t?.ref_high != null) return `< ${t.ref_high}`
  if (t?.ref_low != null) return `> ${t.ref_low}`
  return '—'
}

export default function PrintLabReport({ order, patient, tenantProfile: p }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  const hospName = p?.name || 'Hospital'
  const addrParts = [
    p?.address_line1, p?.address_line2,
    [p?.city, p?.state].filter(Boolean).join(', '),
    p?.pincode && `- ${p.pincode}`,
  ].filter(Boolean)
  const contactParts = [
    p?.phone1 && `Phone: ${p.phone1}`,
    p?.email && `Email: ${p.email}`,
    p?.website && `Web: ${p.website}`,
  ].filter(Boolean)

  const printedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  const genderAge = [patient?.gender, computeAge(patient?.dob)].filter((x) => x && x !== '—').join(' · ')

  const items = order.items ?? []

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: #fff; }
          .screen-only { display: none !important; }
          .no-break { page-break-inside: avoid; }
          thead { display: table-header-group; }
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

      <div className="print-doc" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#0F172A' }}>
        {/* Hospital header */}
        <div style={{ padding: '14px 24px 10px', borderBottom: '2.5px solid #0D9488' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {p?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo_url} alt="Logo" style={{ height: '60px', width: 'auto', maxWidth: '90px', objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0, lineHeight: 1.2 }}>
                {hospName.toUpperCase()}
              </h1>
              {(p?.tagline || p?.tagline2) && (
                <p style={{ fontSize: '10px', color: '#0D9488', fontWeight: 600, margin: '2px 0 0' }}>
                  {[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}
                </p>
              )}
              {addrParts.length > 0 && (
                <p style={{ fontSize: '9.5px', color: '#475569', margin: '2px 0 0', lineHeight: 1.5 }}>{addrParts.join(', ')}</p>
              )}
              {contactParts.length > 0 && (
                <p style={{ fontSize: '9.5px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>
              )}
            </div>
          </div>
        </div>

        {/* Type banner */}
        <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '4px 0', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>
            Laboratory Report
          </span>
        </div>

        {/* Patient / order meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', padding: '12px 24px', borderBottom: '1px solid #E2E8F0' }}>
          <MetaRow label="Patient" value={patient?.full_name ?? order.patient?.full_name ?? '—'} strong />
          <MetaRow label="UHID" value={patient?.uhid ?? order.patient?.uhid ?? '—'} mono />
          <MetaRow label="Age / Sex" value={genderAge || '—'} />
          <MetaRow label="Ordered By" value={order.orderer?.full_name ?? '—'} />
          <MetaRow label="Collected" value={fmtDateTime(order.ordered_at)} />
          <MetaRow label="Reported" value={fmtDateTime(order.reported_at)} />
        </div>

        {/* Results table */}
        <div style={{ padding: '4px 24px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th style={thStyle}>Investigation</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Result</th>
                <th style={thStyle}>Unit</th>
                <th style={thStyle}>Reference Range</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const fc = FLAG_COLORS[item.flag] ?? FLAG_COLORS.pending
                const resultDisplay = item.result_value != null
                  ? String(item.result_value)
                  : (item.result_text || '—')
                const abnormal = item.flag === 'high' || item.flag === 'low'
                return (
                  <tr key={item.id} className="no-break" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{item.test?.name ?? 'Test'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: abnormal ? 800 : 600, color: abnormal ? fc.color : '#0F172A' }}>
                      {resultDisplay}
                    </td>
                    <td style={{ ...tdStyle, color: '#64748B' }}>{item.unit ?? item.test?.unit ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#64748B' }}>{refRange(item)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: fc.bg, color: fc.color }}>
                        {fc.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94A3B8' }}>No tests on this order.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signature strip */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '28px 24px 14px' }}>
          <div style={{ textAlign: 'center', minWidth: '180px', borderTop: '1px solid #94A3B8', paddingTop: '4px' }}>
            <p style={{ fontSize: '10px', color: '#64748B', margin: 0 }}>Authorised Signatory</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '5px 24px', display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>Printed: {printedAt}</p>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>This is a computer-generated laboratory report.</p>
        </div>
      </div>
    </>
  )
}

const thStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 800, letterSpacing: '0.6px', color: '#0F766E',
  textTransform: 'uppercase', textAlign: 'left', padding: '7px 8px', borderBottom: '1.5px solid #CCFBF1',
}
const tdStyle: React.CSSProperties = { padding: '7px 8px', verticalAlign: 'top' }

function MetaRow({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '78px' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: strong ? 700 : 600, color: '#0F172A', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}
