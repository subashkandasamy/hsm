'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, CheckCircle2, Trash2, Loader2 } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import { rupeesInWords } from '@/lib/gst'
import { finalizeEstimate, deleteEstimate } from '@/app/actions/costEstimates'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { CostEstimate, TenantProfile, CostEstimateCategory } from '@/lib/types'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CAT_LABELS: Record<CostEstimateCategory, string> = {
  room: 'Room / Bed', surgery: 'Surgery / Package', consultation: 'Consultation',
  lab: 'Laboratory', radiology: 'Radiology', pharmacy: 'Pharmacy / Medicines',
  consumables: 'Consumables', other: 'Other',
}

export default function EstimateView({ estimate, profile }: { estimate: CostEstimate; profile: TenantProfile | null }) {
  const router = useRouter()
  const { profile: me } = useAuth()
  const canWrite = !!me?.role && hasPermission(me.role, 'billing:write')
  const [busy, setBusy] = useState(false)

  const p = profile
  const addrParts = [p?.address_line1, p?.address_line2, [p?.city, p?.state].filter(Boolean).join(', '), p?.pincode && `- ${p.pincode}`].filter(Boolean)
  const contactParts = [p?.phone1 && `Phone: ${p.phone1}`, p?.phone2 && p.phone2, p?.email && `E-mail: ${p.email}`].filter(Boolean)
  const legalParts = [p?.cin_no && `CIN No: ${p.cin_no}`, p?.gst_no && `GST: ${p.gst_no}`].filter(Boolean)

  const items = estimate.items ?? []
  const patientName = estimate.patient?.full_name ?? estimate.patient_name ?? 'Walk-in enquiry'
  const patientPhone = estimate.patient?.phone ?? estimate.patient_phone

  async function handleFinalize() {
    setBusy(true)
    await finalizeEstimate(estimate.id)
    setBusy(false)
    router.refresh()
  }
  async function handleDelete() {
    if (!confirm('Delete this estimate?')) return
    setBusy(true)
    const res = await deleteEstimate(estimate.id)
    if (!res.success) { alert(res.error); setBusy(false); return }
    router.push('/billing/estimates')
  }

  return (
    <div className="max-w-4xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body * { visibility: hidden; }
          #est-print, #est-print * { visibility: visible; }
          #est-print { position: absolute; top: 0; left: 0; width: 100%; border: none !important; border-radius: 0 !important; box-shadow: none !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      {/* Action bar */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/billing/estimates')} className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569' }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold" style={{ color: '#0F172A' }}>{estimate.estimate_no}</h1>
            <StatusBadge status={estimate.status === 'final' ? 'success' : 'info'} label={estimate.status === 'final' ? 'Final' : 'Draft'} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid #E2E8F0', color: '#475569' }}>
            <Printer className="w-4 h-4" /> Print
          </button>
          {canWrite && estimate.status === 'draft' && (
            <button onClick={handleFinalize} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#0D9488' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Finalize
            </button>
          )}
          {canWrite && (
            <button onClick={handleDelete} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid #FECACA', color: '#EF4444' }}>
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Printable card */}
      <div id="est-print" style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
        {/* Header */}
        <div style={{ padding: '20px 32px 16px', borderBottom: '2px solid #0D9488' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            {p?.logo_url && <img src={p.logo_url} alt="Logo" style={{ height: '80px', width: 'auto', maxWidth: '120px', objectFit: 'contain', flexShrink: 0 }} />}
            <div style={{ flex: 1, textAlign: 'center' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{(p?.name || 'Hospital').toUpperCase()}</h1>
              {(p?.tagline || p?.tagline2) && <p style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, margin: '4px 0 0' }}>{[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}</p>}
              {addrParts.length > 0 && <p style={{ fontSize: '11.5px', color: '#475569', margin: '5px 0 0' }}>{addrParts.join(' ')}</p>}
              {contactParts.length > 0 && <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>}
              {legalParts.length > 0 && <p style={{ fontSize: '10.5px', color: '#64748B', margin: '2px 0 0' }}>{legalParts.join('  |  ')}</p>}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 'auto' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Estimate No</p>
              <p style={{ fontSize: '15px', fontWeight: 800, color: '#0D9488', fontFamily: 'monospace', margin: '2px 0' }}>{estimate.estimate_no}</p>
              <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>{fmtDate(estimate.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Banner */}
        <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '7px 0', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>Cost Estimate</span>
        </div>

        {/* Patient */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', borderLeft: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
          <div style={{ gridColumn: 'span 2', padding: '10px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Prepared For</p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0' }}>{patientName}</p>
          </div>
          {estimate.patient?.uhid && (
            <div style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', margin: 0 }}>UHID</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', fontFamily: 'monospace', margin: '2px 0 0' }}>{estimate.patient.uhid}</p>
            </div>
          )}
          {patientPhone && (
            <div style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', margin: 0 }}>Phone</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: '2px 0 0' }}>{patientPhone}</p>
            </div>
          )}
          {estimate.validity_date && (
            <div style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', margin: 0 }}>Valid Until</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: '2px 0 0' }}>{fmtDate(estimate.validity_date)}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '460px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                {['Category', 'Description', 'Qty', 'Unit Price', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '8px 12px', color: '#94A3B8', fontSize: '12px' }}>{CAT_LABELS[it.category] ?? it.category}</td>
                  <td style={{ padding: '8px 12px', color: '#475569' }}>{it.description}</td>
                  <td style={{ padding: '8px 12px', color: '#64748B', textAlign: 'right' }}>{it.qty}</td>
                  <td style={{ padding: '8px 12px', color: '#64748B', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(it.unit_price)}</td>
                  <td style={{ padding: '8px 12px', color: '#1E293B', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div style={{ borderTop: '2px solid #0D9488', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: '300px', padding: '16px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>Estimated Total</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>{fmt(estimate.total)}</span>
            </div>
          </div>
        </div>

        {/* Words */}
        <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 24px' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Amount in words: </span>
          <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>{rupeesInWords(estimate.total)}</span>
        </div>

        {/* Notes + disclaimer */}
        <div style={{ padding: '14px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
          {estimate.notes && <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 8px' }}><strong>Notes:</strong> {estimate.notes}</p>}
          <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0, lineHeight: 1.6 }}>
            This is an <strong>approximate estimate</strong> based on standard tariffs. Actual charges may vary depending on the
            patient&apos;s condition, length of stay, medicines, investigations and consumables actually used. This estimate is
            not a bill and does not constitute a demand for payment.
          </p>
          <p style={{ fontSize: '10px', color: '#CBD5E1', margin: '8px 0 0', textAlign: 'right' }}>System generated · Powered by Uyirly</p>
        </div>
      </div>
    </div>
  )
}
