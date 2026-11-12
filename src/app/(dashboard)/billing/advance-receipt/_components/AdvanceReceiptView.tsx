'use client'

import { useRouter } from 'next/navigation'
import type { AdvanceReceiptData, TenantProfile } from '@/lib/types'
import { realPhone } from '@/lib/patientPhone'

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI', bank_transfer: 'Bank Transfer',
}
const METHOD_COLORS: Record<string, { bg: string; color: string }> = {
  cash:          { bg: '#F0FDF4', color: '#16A34A' },
  upi:           { bg: '#EFF6FF', color: '#2563EB' },
  card:          { bg: '#FDF4FF', color: '#7C3AED' },
  bank_transfer: { bg: '#FFF7ED', color: '#C2410C' },
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  )
}

function InfoCell({ label, value, mono, span2 }: { label: string; value: string | null | undefined; mono?: boolean; span2?: boolean }) {
  if (!value) return null
  return (
    <div style={{ gridColumn: span2 ? 'span 2' : undefined, padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
      <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '13px', fontWeight: 600, color: mono ? '#0D9488' : '#0F172A', fontFamily: mono ? 'monospace' : undefined, margin: '2px 0 0' }}>
        {value}
      </p>
    </div>
  )
}

export default function AdvanceReceiptView({ data, profile }: { data: AdvanceReceiptData; profile: TenantProfile | null }) {
  const router = useRouter()

  const name = profile?.name || data.tenantName
  const addrParts = [
    profile?.address_line1,
    profile?.address_line2,
    [profile?.city, profile?.state].filter(Boolean).join(', '),
    profile?.pincode && `- ${profile.pincode}`,
  ].filter(Boolean)
  const contactParts = [
    profile?.phone1 && `Phone: ${profile.phone1}`,
    profile?.phone2 && profile.phone2,
    profile?.email && `E-mail: ${profile.email}`,
    profile?.website && `Web: ${profile.website}`,
  ].filter(Boolean)
  const legalParts = [
    profile?.cin_no && `CIN No: ${profile.cin_no}`,
    profile?.gst_no && `GST: ${profile.gst_no}`,
  ].filter(Boolean)

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #bill-print-area, #bill-print-area * { visibility: visible; }
          #bill-print-area {
            position: absolute;
            top: 0; left: 0;
            width: 100%;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      <div className="print-page" style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Action bar */}
        <div className="no-print flex items-center gap-3 mb-5">
          <button onClick={() => router.back()}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', cursor: 'pointer' }}>
            ← Back
          </button>
          <a href={`/billing/advance-receipt/${data.admission.id}/pdf`} target="_blank" rel="noopener"
            className="text-sm px-4 py-2 rounded-lg font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            🖨 Print receipt
          </a>
          <a href={`/billing/advance-receipt/${data.admission.id}/pdf?download=1`}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569' }}>
            ⬇ Download PDF
          </a>
        </div>

        {/* Receipt card */}
        <div id="bill-print-area" style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>

          {/* ── Hospital Header ── */}
          <div style={{ padding: '20px 32px 16px', borderBottom: '2px solid #0D9488' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {profile?.logo_url && (
                <img src={profile.logo_url} alt="Logo"
                  style={{ height: '90px', width: 'auto', maxWidth: '120px', objectFit: 'contain', flexShrink: 0, display: 'block' }} />
              )}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0, lineHeight: 1.15 }}>
                  {name.toUpperCase()}
                </h1>
                {(profile?.tagline || profile?.tagline2) && (
                  <p style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, margin: '4px 0 0' }}>
                    {[profile?.tagline, profile?.tagline2].filter(Boolean).join('  ·  ')}
                  </p>
                )}
                {addrParts.length > 0 && (
                  <p style={{ fontSize: '11.5px', color: '#475569', margin: '5px 0 0', lineHeight: 1.5 }}>
                    {addrParts.join(' ')}
                  </p>
                )}
                {contactParts.length > 0 && (
                  <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0' }}>
                    {contactParts.join('  |  ')}
                  </p>
                )}
                {legalParts.length > 0 && (
                  <p style={{ fontSize: '10.5px', color: '#64748B', margin: '2px 0 0' }}>
                    {legalParts.join('  |  ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── "ADVANCE PAYMENT RECEIPT" banner ── */}
          <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '7px 0', textAlign: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>
              Advance Payment Receipt
            </span>
          </div>

          {/* ── Patient info grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderLeft: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            <div style={{ gridColumn: 'span 2', padding: '10px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Patient Name</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0' }}>{data.patient.full_name}</p>
            </div>
            <InfoCell label="UHID" value={data.patient.uhid} mono />
            <InfoCell label="Phone" value={realPhone(data.patient.phone)} />
            <InfoCell label="Admitted" value={fmtDate(data.admission.admitted_at)} />
            {data.admission.ward || data.admission.bed
              ? <InfoCell label="Ward / Bed"
                  value={[data.admission.ward, data.admission.bed ? `Bed ${data.admission.bed}` : null].filter(Boolean).join(' — ')} />
              : null}
            {data.admission.combined_bill_no && (
              <InfoCell label="Bill Ref" value={data.admission.combined_bill_no} mono />
            )}
          </div>

          {/* ── Payments table ── */}
          <div style={{ padding: '0' }}>
            <div style={{ padding: '10px 20px 6px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: '#334155' }}>
                Advance Payments
              </span>
            </div>

            {data.payments.length === 0 ? (
              <p style={{ color: '#94A3B8', fontSize: '14px', textAlign: 'center', padding: '32px 0' }}>
                No advance payments found
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '480px' }}>
                <thead>
                  <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0' }}>
                    {['#', 'Date & Time', 'Method', 'Received By', 'Amount'].map((h, i) => (
                      <th key={h} style={{
                        padding: '7px 10px', color: '#94A3B8', fontWeight: 600, fontSize: '11px',
                        textAlign: i === 4 ? 'right' : 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((pmt, i) => {
                    const mc = METHOD_COLORS[pmt.method] ?? { bg: '#F8FAFC', color: '#475569' }
                    return (
                      <tr key={pmt.id} style={{ borderBottom: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '9px 10px', color: '#94A3B8', fontSize: '12px' }}>{i + 1}</td>
                        <td style={{ padding: '9px 10px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDateTime(pmt.received_at)}</td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', fontWeight: 700, background: mc.bg, color: mc.color }}>
                            {METHOD_LABELS[pmt.method] ?? pmt.method}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#475569' }}>{pmt.receiverName ?? '—'}</td>
                        <td style={{ padding: '9px 10px', color: '#0F172A', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {fmt(pmt.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* ── Total ── */}
          <div style={{ borderTop: '2px solid #0D9488', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: '280px', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Total Advance Collected</span>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#0D9488', fontFamily: 'monospace' }}>
                {fmt(data.totalCollected)}
              </span>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 24px', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
            {profile?.emergency_contact && (
              <p style={{ fontSize: '11.5px', color: '#475569', margin: 0, fontWeight: 500 }}>
                For Emergency Care: <strong>{profile.emergency_contact}</strong>
              </p>
            )}
            <p style={{ fontSize: '10px', color: '#CBD5E1', margin: 0, marginLeft: 'auto' }}>
              System generated bill &nbsp;·&nbsp; Powered by Uyirly
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
