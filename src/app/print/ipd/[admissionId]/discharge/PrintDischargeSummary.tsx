'use client'

import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Admission, TenantProfile } from '@/lib/types'

interface Props {
  admission: Admission
  tenantProfile: TenantProfile | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default function PrintDischargeSummary({ admission: adm, tenantProfile: p }: Props) {
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

  const label = (text: string) => (
    <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0 0 2px' }}>{text}</p>
  )

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: #fff; }
          .screen-only { display: none !important; }
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
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', border: 'none', background: '#15803D', color: '#fff', cursor: 'pointer', fontSize: '14px', fontFamily: 'system-ui', fontWeight: 600 }}
        >
          <Printer size={15} /> Print
        </button>
      </div>

      {/* ── Print document ── */}
      <div
        className="print-doc"
        style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#0F172A' }}
      >
        {/* ── Hospital header ── */}
        <div style={{ padding: '14px 24px 10px', borderBottom: '2.5px solid #15803D' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {p?.logo_url && (
              <img src={p.logo_url} alt="Logo" style={{ height: '60px', width: 'auto', maxWidth: '90px', objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0, lineHeight: 1.2 }}>
                {hospName.toUpperCase()}
              </h1>
              {(p?.tagline || p?.tagline2) && (
                <p style={{ fontSize: '10px', color: '#15803D', fontWeight: 600, margin: '2px 0 0' }}>
                  {[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}
                </p>
              )}
              {addrParts.length > 0 && (
                <p style={{ fontSize: '9.5px', color: '#475569', margin: '2px 0 0', lineHeight: 1.5 }}>{addrParts.join(', ')}</p>
              )}
              {contactParts.length > 0 && (
                <p style={{ fontSize: '9.5px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>
              )}
              {legalParts.length > 0 && (
                <p style={{ fontSize: '9px', color: '#94A3B8', margin: '2px 0 0', letterSpacing: '0.3px' }}>{legalParts.join('  |  ')}</p>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '90px' }}>
              <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Admitted</p>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#0D9488', margin: '2px 0 0' }}>{fmtDate(adm.admitted_at)}</p>
              {adm.discharged_at && (
                <>
                  <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '4px 0 0' }}>Discharged</p>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', margin: '2px 0 0' }}>{fmtDate(adm.discharged_at)}</p>
                </>
              )}
              <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: '4px 0 0' }}>UHID</p>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', margin: '2px 0 0' }}>{patient?.uhid ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* ── Banner ── */}
        <div style={{ background: '#F0FDF4', borderBottom: '1px solid #BBF7D0', padding: '5px 0', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', color: '#15803D', textTransform: 'uppercase' }}>
            Discharge Summary
          </span>
        </div>

        {/* ── Patient info grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ padding: '10px 14px', borderRight: '1px solid #E2E8F0', gridColumn: 'span 2' }}>
            {label('Patient Name')}
            <p style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>{patient?.full_name ?? '—'}</p>
          </div>
          <div style={{ padding: '10px 14px' }}>
            {label('Attending Doctor')}
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{adm.doctor?.full_name ?? '—'}</p>
          </div>

          <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            {label('Ward / Bed')}
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{`${adm.ward?.name ?? '—'} — ${adm.bed?.bed_no ?? '—'}`}</p>
          </div>
          <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            {label('Admitted')}
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488', margin: 0 }}>{fmtDate(adm.admitted_at)}</p>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0' }}>
            {label('Discharged')}
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#15803D', margin: 0 }}>
              {adm.discharged_at ? fmtDate(adm.discharged_at) : '—'}
            </p>
          </div>

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

          {adm.reason && (
            <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0', gridColumn: 'span 3' }}>
              {label('Reason for Admission / Diagnosis')}
              <p style={{ fontSize: '12px', color: '#0F172A', margin: 0, lineHeight: 1.5 }}>{adm.reason}</p>
            </div>
          )}
        </div>

        {/* ── Discharge summary text ── */}
        <div style={{ padding: '20px 24px', minHeight: '260px' }}>
          {adm.discharge_summary ? (
            <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
              {adm.discharge_summary}
            </p>
          ) : (
            <p style={{ fontSize: '13px', color: '#94A3B8', fontStyle: 'italic', margin: 0 }}>
              No discharge summary has been recorded for this admission.
            </p>
          )}
        </div>

        {/* ── Signature row ── */}
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #E2E8F0', marginTop: '16px' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#94A3B8', margin: '0 0 4px' }}>Patient / Relative Signature</p>
            <div style={{ width: '200px', borderBottom: '1px dashed #CBD5E1', marginBottom: '4px' }}>&nbsp;</div>
            <p style={{ fontSize: '10px', color: '#CBD5E1', margin: 0 }}>Name &amp; Relationship</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ width: '180px', borderBottom: '2px solid #0F172A', marginBottom: '6px', marginLeft: 'auto' }}>&nbsp;</div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', margin: 0 }}>{adm.doctor?.full_name ?? ''}</p>
            <p style={{ fontSize: '10px', color: '#64748B', margin: '2px 0 0' }}>Attending Doctor</p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '5px 24px', display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>Printed: {printedAt}</p>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>This is a computer-generated discharge summary.</p>
        </div>
      </div>
    </>
  )
}
