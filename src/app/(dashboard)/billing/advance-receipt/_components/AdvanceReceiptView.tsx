'use client'

import { useRouter } from 'next/navigation'
import type { AdvanceReceiptData, TenantProfile } from '@/lib/types'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI', bank_transfer: 'Bank Transfer',
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  )
}

function HospitalHeader({ profile, tenantName }: { profile: TenantProfile | null; tenantName: string }) {
  const name = profile?.name || tenantName
  const addressParts = [
    profile?.address_line1,
    profile?.address_line2,
    profile?.city,
    profile?.state && profile?.pincode
      ? `${profile.state} - ${profile.pincode}`
      : (profile?.state ?? profile?.pincode),
  ].filter(Boolean)
  const contactParts = [
    profile?.phone1 && `Ph: ${profile.phone1}`,
    profile?.phone2 && profile.phone2,
    profile?.email && `Email: ${profile.email}`,
    profile?.website && `Web: ${profile.website}`,
  ].filter(Boolean)
  const legalParts = [
    profile?.cin_no && `CIN: ${profile.cin_no}`,
    profile?.gst_no && `GST: ${profile.gst_no}`,
  ].filter(Boolean)

  return (
    <div style={{ padding: '20px 28px', borderBottom: '2px solid #E2E8F0', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {profile?.logo_url && (
          <img
            src={profile.logo_url}
            alt="Hospital Logo"
            style={{ height: '64px', width: 'auto', maxWidth: '100px', objectFit: 'contain', flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <p style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.4px', lineHeight: 1.2 }}>
            {name}
          </p>
          {profile?.tagline && (
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#0D9488', marginTop: '2px' }}>
              {profile.tagline}
              {profile.tagline2 && <span style={{ color: '#475569', fontWeight: 400 }}> &nbsp;·&nbsp; {profile.tagline2}</span>}
            </p>
          )}
          {addressParts.length > 0 && (
            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>{addressParts.join(', ')}</p>
          )}
          {contactParts.length > 0 && (
            <p style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{contactParts.join('  |  ')}</p>
          )}
          {legalParts.length > 0 && (
            <p style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{legalParts.join('  |  ')}</p>
          )}
        </div>
      </div>
      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#475569', textTransform: 'uppercase' }}>
          Advance Payment Receipt
        </span>
      </div>
    </div>
  )
}

export default function AdvanceReceiptView({ data, profile }: { data: AdvanceReceiptData; profile: TenantProfile | null }) {
  const router = useRouter()

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { padding: 24px !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="print-page" style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Action bar */}
        <div className="no-print flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', cursor: 'pointer' }}>
            ← Back
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>

        {/* Receipt card */}
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          {/* Hospital header */}
          <HospitalHeader profile={profile} tenantName={data.tenantName} />

          {/* Patient + admission info */}
          <div style={{
            padding: '14px 28px',
            borderBottom: '1px solid #F1F5F9',
            background: '#FAFBFC',
            display: 'flex',
            gap: '28px',
            flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Patient</p>
              <p style={{ fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>{data.patient.full_name}</p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>UHID</p>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#0D9488', fontFamily: 'monospace' }}>{data.patient.uhid}</p>
            </div>
            {data.patient.phone && (
              <div>
                <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Phone</p>
                <p style={{ fontSize: '14px', color: '#334155' }}>{data.patient.phone}</p>
              </div>
            )}
            {(data.admission.ward || data.admission.bed) && (
              <div>
                <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Ward / Bed</p>
                <p style={{ fontSize: '14px', color: '#334155' }}>
                  {[data.admission.ward, data.admission.bed ? `Bed ${data.admission.bed}` : null].filter(Boolean).join(' — ')}
                </p>
              </div>
            )}
            <div>
              <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Admitted</p>
              <p style={{ fontSize: '14px', color: '#334155' }}>{fmtDate(data.admission.admitted_at)}</p>
            </div>
            {data.admission.combined_bill_no && (
              <div>
                <p style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>Bill No</p>
                <p style={{ fontSize: '14px', fontFamily: 'monospace', color: '#0D9488' }}>{data.admission.combined_bill_no}</p>
              </div>
            )}
          </div>

          {/* Payments table */}
          <div style={{ padding: '20px 28px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#475569', marginBottom: '12px' }}>
              Advance Payments
            </p>

            {data.payments.length === 0 ? (
              <p style={{ color: '#94A3B8', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
                No advance payments found
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Date & Time</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Method</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Received By</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((pmt, i) => (
                    <tr key={pmt.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '9px 10px', color: '#94A3B8' }}>{i + 1}</td>
                      <td style={{ padding: '9px 10px', color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDateTime(pmt.received_at)}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{
                          fontSize: '12px', padding: '2px 8px', borderRadius: '6px',
                          background: pmt.method === 'cash' ? '#F0FDF4' : pmt.method === 'upi' ? '#EFF6FF' : '#F8FAFC',
                          color: pmt.method === 'cash' ? '#16A34A' : pmt.method === 'upi' ? '#2563EB' : '#475569',
                          fontWeight: 600,
                        }}>
                          {METHOD_LABELS[pmt.method] ?? pmt.method}
                        </span>
                      </td>
                      <td style={{ padding: '9px 10px', color: '#475569' }}>{pmt.receiverName ?? '—'}</td>
                      <td style={{ padding: '9px 10px', color: '#0F172A', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {fmt(pmt.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Total */}
          <div style={{ padding: '16px 28px', background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>Total Advance Collected</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#0D9488', fontFamily: 'monospace' }}>
                {fmt(data.totalCollected)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 28px', borderTop: '1px solid #F1F5F9', textAlign: 'center' }}>
            {profile?.emergency_contact && (
              <p style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                For Emergency Care: {profile.emergency_contact}
              </p>
            )}
            <p style={{ fontSize: '10px', color: '#CBD5E1' }}>
              System-generated receipt. Amount subject to final settlement at discharge.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
