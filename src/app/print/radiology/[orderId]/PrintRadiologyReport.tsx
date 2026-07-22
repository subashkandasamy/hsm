'use client'

import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { RadiologyOrder, Patient, TenantProfile } from '@/lib/types'

interface Props {
  order: RadiologyOrder
  patient: Patient | null
  tenantProfile: TenantProfile | null
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

export default function PrintRadiologyReport({ order, patient, tenantProfile: p }: Props) {
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

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: #fff; }
          .screen-only { display: none !important; }
        }
        @media screen {
          body { background: #F1F5F9; display: flex; flex-direction: column; align-items: center; padding: 24px; gap: 12px; min-height: 100vh; }
          .print-doc { max-width: 210mm; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
        }
      `}</style>

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
            Radiology / Imaging Report
          </span>
        </div>

        {/* Patient / order meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', padding: '12px 24px', borderBottom: '1px solid #E2E8F0' }}>
          <MetaRow label="Patient" value={patient?.full_name ?? order.patient?.full_name ?? '—'} strong />
          <MetaRow label="UHID" value={patient?.uhid ?? order.patient?.uhid ?? '—'} mono />
          <MetaRow label="Age / Sex" value={genderAge || '—'} />
          <MetaRow label="Ordered By" value={order.orderer?.full_name ?? '—'} />
          <MetaRow label="Study" value={`${order.test?.name ?? '—'}${order.test?.modality ? ` (${order.test.modality.toUpperCase()})` : ''}`} />
          <MetaRow label="Reported" value={fmtDateTime(order.reported_at)} />
        </div>

        {/* Report body */}
        <div style={{ padding: '14px 24px 8px' }}>
          <p style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.6px', color: '#0F766E', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Findings / Impression
          </p>
          <div style={{ fontSize: '12px', lineHeight: 1.65, color: '#334155', whiteSpace: 'pre-wrap', minHeight: '120px' }}>
            {order.report?.trim() ? order.report : <span style={{ color: '#94A3B8' }}>No report text recorded.</span>}
          </div>
          {order.image_url && (
            <p style={{ fontSize: '10px', color: '#475569', margin: '12px 0 0' }}>
              Attached image: <span style={{ wordBreak: 'break-all' }}>{order.image_url}</span>
            </p>
          )}
        </div>

        {/* Signature strip */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '28px 24px 14px' }}>
          <div style={{ textAlign: 'center', minWidth: '200px', borderTop: '1px solid #94A3B8', paddingTop: '4px' }}>
            <p style={{ fontSize: '10px', color: '#64748B', margin: 0 }}>Radiologist Signature</p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '5px 24px', display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>Printed: {printedAt}</p>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>This is a computer-generated radiology report.</p>
        </div>
      </div>
    </>
  )
}

function MetaRow({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
      <span style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '78px' }}>{label}</span>
      <span style={{ fontSize: '12px', fontWeight: strong ? 700 : 600, color: '#0F172A', fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}
