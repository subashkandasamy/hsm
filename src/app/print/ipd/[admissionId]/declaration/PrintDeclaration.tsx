'use client'

import { useEffect } from 'react'
import { ArrowLeft, Printer } from 'lucide-react'
import type { Admission, IpdDeclaration, TenantProfile } from '@/lib/types'

interface Props {
  admission: Admission
  declaration: IpdDeclaration | null
  declarationText: string
  tenantProfile: TenantProfile | null
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PrintDeclaration({ admission: adm, declaration, declarationText, tenantProfile: p }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  const patient = adm.patient
  const hospName = p?.name || 'Hospital'
  const addrParts = [
    p?.address_line1, p?.address_line2,
    [p?.city, p?.state].filter(Boolean).join(', '),
    p?.pincode && `- ${p.pincode}`,
  ].filter(Boolean)
  const contactParts = [
    p?.phone1 && `Phone: ${p.phone1}`,
    p?.email && `Email: ${p.email}`,
  ].filter(Boolean)

  const alreadySigned = declaration?.status === 'signed'

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

      <div
        className="print-doc"
        style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: '#fff', color: '#0F172A' }}
      >
        {/* Hospital header */}
        <div style={{ padding: '14px 24px 10px', borderBottom: '2.5px solid #0D9488' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            {p?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.logo_url} alt="Logo" style={{ height: '56px', width: 'auto', maxWidth: '90px', objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0 }}>
                {hospName.toUpperCase()}
              </h1>
              {addrParts.length > 0 && (
                <p style={{ fontSize: '9.5px', color: '#475569', margin: '2px 0 0' }}>{addrParts.join(', ')}</p>
              )}
              {contactParts.length > 0 && (
                <p style={{ fontSize: '9.5px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '5px 0', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>
            Treatment Declaration &amp; Consent
          </span>
        </div>

        {/* Patient / admission info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ padding: '10px 14px', borderRight: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>Patient Name</p>
            <p style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>{patient?.full_name ?? '—'}</p>
          </div>
          <div style={{ padding: '10px 14px' }}>
            <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>UHID</p>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', margin: 0 }}>{patient?.uhid ?? '—'}</p>
          </div>
          <div style={{ padding: '8px 14px', borderRight: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>Admitted</p>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{fmtDate(adm.admitted_at)}</p>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>Attending Doctor</p>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{adm.doctor?.full_name ?? '—'}</p>
          </div>
        </div>

        {/* Declaration text */}
        <div style={{ padding: '18px 24px', fontSize: '11.5px', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#0F172A' }}>
          {declarationText}
        </div>

        {alreadySigned ? (
          <div style={{ padding: '10px 24px 18px', borderTop: '1px solid #E2E8F0', marginTop: '6px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', margin: '0 0 8px' }}>
              This declaration has already been signed.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>Signed By</p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{declaration?.signer_name ?? '—'}</p>
                <p style={{ fontSize: '10px', color: '#64748B', margin: '2px 0 0', textTransform: 'capitalize' }}>{declaration?.signer_relationship ?? ''}</p>
              </div>
              <div>
                <p style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 2px' }}>Signed On</p>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', margin: 0 }}>{declaration?.signed_at ? fmtDate(declaration.signed_at) : '—'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px 24px 28px', borderTop: '1px solid #E2E8F0', marginTop: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div>
                <div style={{ borderBottom: '1.5px solid #0F172A', height: '40px' }}>&nbsp;</div>
                <p style={{ fontSize: '10px', color: '#64748B', margin: '6px 0 0' }}>
                  Signature of Patient / Relative
                </p>
                <p style={{ fontSize: '9px', color: '#CBD5E1', margin: '2px 0 0' }}>Name, relationship &amp; date</p>
              </div>
              <div>
                <div style={{ borderBottom: '1.5px solid #0F172A', height: '40px' }}>&nbsp;</div>
                <p style={{ fontSize: '10px', color: '#64748B', margin: '6px 0 0' }}>
                  Witness (Hospital Staff)
                </p>
                <p style={{ fontSize: '9px', color: '#CBD5E1', margin: '2px 0 0' }}>Name &amp; designation</p>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '6px 24px' }}>
          <p style={{ fontSize: '9px', color: '#94A3B8', margin: 0 }}>This is a computer-generated document.</p>
        </div>
      </div>
    </>
  )
}
