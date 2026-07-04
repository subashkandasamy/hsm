'use client'

import { useRouter } from 'next/navigation'
import type { CombinedBillData, TenantProfile } from '@/lib/types'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function InfoCell({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null
  return (
    <div style={{ padding: '6px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
      <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>{label}</p>
      <p style={{ fontSize: '13px', fontWeight: 600, color: mono ? '#0D9488' : '#0F172A', fontFamily: mono ? 'monospace' : undefined }}>
        {value}
      </p>
    </div>
  )
}

export default function CombinedBillView({ data, profile }: { data: CombinedBillData; profile: TenantProfile | null }) {
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
        @media screen and (max-width: 600px) {
          .bill-patient-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .bill-totals-wrap  { justify-content: stretch !important; }
          .bill-totals-panel { min-width: 0 !important; width: 100% !important; }
          .bill-header-logo  { height: 60px !important; max-width: 80px !important; }
          .bill-billno       { font-size: 13px !important; word-break: break-all; }
        }
      `}</style>

      <div className="print-page" style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Action bar */}
        <div className="no-print flex items-center gap-3 mb-5">
          <button onClick={() => router.back()}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', cursor: 'pointer' }}>
            ← Back
          </button>
          <button onClick={() => window.print()}
            className="text-sm px-4 py-2 rounded-lg font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            🖨 Print
          </button>
        </div>

        {/* Bill card */}
        <div id="bill-print-area" style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>

          {/* ── Hospital Header ── */}
          <div style={{ padding: '20px 32px 16px', borderBottom: '2px solid #0D9488' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>

              {/* Logo */}
              {profile?.logo_url && (
                <div style={{ flexShrink: 0 }}>
                  <img src={profile.logo_url} alt="Logo" className="bill-header-logo"
                    style={{ height: '90px', width: 'auto', maxWidth: '120px', objectFit: 'contain', display: 'block' }} />
                </div>
              )}

              {/* Hospital info — centered */}
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

              {/* Bill number block — right */}
              <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 'auto' }}>
                <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Bill No</p>
                <p className="bill-billno" style={{ fontSize: '16px', fontWeight: 800, color: '#0D9488', fontFamily: 'monospace', margin: '2px 0' }}>
                  {data.combinedBillNo}
                </p>
                <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
                  {fmtDate(data.generatedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* ── "COMBINED BILL" banner ── */}
          <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '7px 0', textAlign: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>
              Combined Bill
            </span>
          </div>

          {/* ── Patient info grid ── */}
          <div className="bill-patient-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', borderLeft: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
            <div style={{ gridColumn: 'span 2', padding: '10px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Patient Name</p>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0' }}>{data.patient.full_name}</p>
            </div>
            <InfoCell label="UHID" value={data.patient.uhid} mono />
            <InfoCell label="Phone" value={data.patient.phone} />
            <InfoCell label="Bill Date" value={fmtDate(data.generatedAt)} />
            <InfoCell label="Ref. No" value={data.combinedBillNo} mono />
          </div>

          {/* ── Charge sections — single table so columns stay aligned across all sections ── */}
          {data.sections.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
              No charges found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed', minWidth: '540px' }}>
              {data.sections.map((section, si) => (
                <tbody key={section.label} style={{ breakInside: 'avoid' }}>
                  {/* Section label — no amount here */}
                  <tr style={{ background: si % 2 === 0 ? '#F8FAFC' : '#FAFBFC', borderTop: '1px solid #E2E8F0' }}>
                    <td colSpan={5} style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#475569' }}>
                      {section.label}
                    </td>
                  </tr>
                  {/* Column headers — widths set here instead of colgroup */}
                  <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                    {(['Date', 'Description', 'Qty', 'Unit Price', 'Amount'] as const).map((h, i) => (
                      <th key={h} style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: i >= 2 ? 'right' : 'left', whiteSpace: 'nowrap', width: ['100px', 'auto', '50px', '110px', '110px'][i] }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                  {/* Data rows */}
                  {section.rows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '7px 12px', color: '#94A3B8', whiteSpace: 'nowrap', fontSize: '12.5px' }}>{fmtDate(row.date)}</td>
                      <td style={{ padding: '7px 12px', color: '#475569', fontSize: '13px' }}>{row.description}</td>
                      <td style={{ padding: '7px 12px', color: '#94A3B8', textAlign: 'right', fontSize: '13px' }}>{row.qty}</td>
                      <td style={{ padding: '7px 12px', color: '#64748B', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '13px' }}>{fmt(row.unitPrice)}</td>
                      <td style={{ padding: '7px 12px', color: '#1E293B', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap', fontSize: '13px' }}>{fmt(row.amount)}</td>
                    </tr>
                  ))}
                  {/* Section subtotal — bottom of section */}
                  <tr style={{ borderTop: '1px dashed #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                    <td colSpan={4} style={{ padding: '6px 12px', fontSize: '11px', color: '#94A3B8', textAlign: 'right', fontStyle: 'italic' }}>
                      {section.label} Total
                    </td>
                    <td style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 700, color: '#334155', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {fmt(section.subtotal)}
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
            </div>
          )}

          {/* ── Totals ── */}
          <div className="bill-totals-wrap" style={{ borderTop: '2px solid #0D9488', display: 'flex', justifyContent: 'flex-end' }}>
            <div className="bill-totals-panel" style={{ minWidth: '320px', padding: '16px 24px' }}>
              {([
                { label: 'Grand Total',            value: data.grandTotal,       size: '14px', weight: 700, color: '#0F172A', border: false, show: true },
                { label: 'Advance Collected',       value: data.advanceCollected, size: '13px', weight: 500, color: '#0D9488', border: false, show: data.advanceCollected > 0 },
                { label: 'Advance Refunded',        value: -data.advanceRefunded, size: '13px', weight: 500, color: '#F59E0B', border: false, show: data.advanceRefunded > 0 },
                { label: 'Total Payments Received', value: data.totalPaid,        size: '13px', weight: 500, color: '#10B981', border: false, show: true },
                { label: 'Balance Due',             value: data.balanceDue,       size: '16px', weight: 800, color: data.balanceDue > 0 ? '#DC2626' : '#10B981', border: true, show: true },
              ] as const).filter(r => r.show).map(({ label, value, size, weight, color, border }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '5px 0',
                  borderTop: border ? '1.5px solid #E2E8F0' : undefined,
                  marginTop: border ? '8px' : undefined,
                  paddingTop: border ? '12px' : undefined,
                }}>
                  <span style={{ fontSize: '13px', color: '#475569', fontWeight: weight }}>{label}</span>
                  <span style={{ fontSize: size, fontWeight: weight, color, fontFamily: 'monospace' }}>{fmt(value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Footer ── */}
          {(profile?.emergency_contact || true) && (
            <div style={{
              borderTop: '1px solid #E2E8F0',
              padding: '10px 24px',
              background: '#F8FAFC',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '4px',
            }}>
              {profile?.emergency_contact && (
                <p style={{ fontSize: '11.5px', color: '#475569', margin: 0, fontWeight: 500 }}>
                  For Emergency Care: <strong>{profile.emergency_contact}</strong>
                </p>
              )}
              <p style={{ fontSize: '10px', color: '#CBD5E1', margin: 0, marginLeft: 'auto' }}>
                System generated bill &nbsp;·&nbsp; Powered by Uyirly
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
