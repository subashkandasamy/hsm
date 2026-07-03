'use client'

import { useRouter } from 'next/navigation'
import type { CombinedBillData } from '@/lib/types'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function CombinedBillView({ data }: { data: CombinedBillData }) {
  const router = useRouter()

  return (
    <>
      {/* Print-only styles injected via a style tag */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { padding: 24px !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="print-page" style={{ maxWidth: '820px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Action bar — hidden on print */}
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

        {/* Bill card */}
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)',
            padding: '24px 28px',
            color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <p style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '2px' }}>
                  {data.tenantName}
                </p>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Combined Bill
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#7DD3FC' }}>
                  {data.combinedBillNo}
                </p>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '2px' }}>
                  Generated: {fmtDate(data.generatedAt)}
                </p>
              </div>
            </div>
          </div>

          {/* Patient info */}
          <div style={{
            padding: '16px 28px',
            borderBottom: '1px solid #F1F5F9',
            background: '#FAFBFC',
            display: 'flex',
            gap: '32px',
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
          </div>

          {/* Sections */}
          <div style={{ padding: '0 28px' }}>
            {data.sections.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>
                No charges found
              </div>
            ) : data.sections.map((section) => (
              <div key={section.label} style={{ marginBottom: '0', borderBottom: '1px solid #F1F5F9' }}>
                {/* Section header */}
                <div style={{
                  padding: '14px 0 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#475569' }}>
                    {section.label}
                  </p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                    {fmt(section.subtotal)}
                  </p>
                </div>

                {/* Row table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Bill No</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Description</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: '11px', whiteSpace: 'nowrap' }}>Unit Price</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#94A3B8', fontWeight: 600, fontSize: '11px' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F8FAFC' }}>
                        <td style={{ padding: '7px 8px', color: '#64748B', whiteSpace: 'nowrap' }}>
                          {fmtDate(row.date)}
                        </td>
                        <td style={{ padding: '7px 8px', color: '#0D9488', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {row.billNo}
                        </td>
                        <td style={{ padding: '7px 8px', color: '#334155' }}>{row.description}</td>
                        <td style={{ padding: '7px 8px', color: '#475569', textAlign: 'right' }}>{row.qty}</td>
                        <td style={{ padding: '7px 8px', color: '#475569', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(row.unitPrice)}</td>
                        <td style={{ padding: '7px 8px', color: '#0F172A', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Totals block */}
          <div style={{
            padding: '20px 28px',
            background: '#F8FAFC',
            borderTop: '2px solid #E2E8F0',
          }}>
            {[
              { label: 'Grand Total', value: data.grandTotal, bold: true, color: '#0F172A' },
              { label: 'Advance Collected', value: data.advanceCollected, bold: false, color: '#0D9488' },
              { label: 'Total Payments Received', value: data.totalPaid, bold: false, color: '#10B981' },
              {
                label: 'Balance Due',
                value: data.balanceDue,
                bold: true,
                color: data.balanceDue > 0 ? '#DC2626' : '#10B981',
              },
            ].map(({ label, value, bold, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0' }}>
                <span style={{ fontSize: '13px', color: '#475569', fontWeight: bold ? 700 : 400 }}>{label}</span>
                <span style={{ fontSize: '14px', fontWeight: bold ? 800 : 600, color, fontFamily: 'monospace' }}>
                  {fmt(value)}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 28px',
            borderTop: '1px solid #F1F5F9',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '11px', color: '#CBD5E1' }}>
              This is a system-generated combined bill — {data.combinedBillNo}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
