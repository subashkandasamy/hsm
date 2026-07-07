'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, CheckCircle2, XCircle, DollarSign, Loader2, MessageSquare, Phone } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import Modal from '@/components/ui/Modal'
import {
  finalizeBill, cancelBill, recordPayment, applyDiscount, setTax, getBill,
} from '@/app/actions/billing'
import { sendBillNotification } from '@/app/actions/notifications'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { Bill, BillItemSource, TenantProfile } from '@/lib/types'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function inWords(n: number): string {
  if (n === 0) return 'Zero'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function words(num: number): string {
    if (num === 0) return ''
    if (num < 20) return ones[num] + ' '
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '') + ' '
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred ' + words(num % 100)
    if (num < 100000) return words(Math.floor(num / 1000)) + 'Thousand ' + words(num % 1000)
    if (num < 10000000) return words(Math.floor(num / 100000)) + 'Lakh ' + words(num % 100000)
    return words(Math.floor(num / 10000000)) + 'Crore ' + words(num % 10000000)
  }
  return words(n).trim()
}

const SOURCE_LABELS: Record<BillItemSource | 'advance_refund' | 'appointment_refund', string> = {
  consultation: 'Consultation',
  bed: 'Bed Charges',
  lab: 'Laboratory',
  radiology: 'Radiology',
  pharmacy: 'Pharmacy',
  ipd_pharmacy: 'Pharmacy (Ward)',
  pharmacy_sale_item: 'Pharmacy Sale',
  ot: 'Operation Theatre',
  ot_consumable: 'OT Consumables',
  blood: 'Blood Bank',
  dental: 'Dental',
  manual: 'Manual',
  advance_refund: 'Advance Refund',
  appointment_refund: 'Appointment Refund',
  nursing: 'Nursing',
  nursing_morning: 'Nursing AM',
  nursing_night: 'Nursing Night',
}

const BILL_SOURCE_LABELS: Record<string, string> = {
  bed: 'Room Rent',
  lab: 'Lab Tests',
  radiology: 'Radiology',
  ipd_pharmacy: 'Pharmacy (Ward)',
  nursing: 'Nursing',
}

const STATUS_MAP: Record<string, string> = {
  draft:     'info',
  unpaid:    'danger',
  partial:   'pending',
  paid:      'success',
  cancelled: 'cancelled',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', card: 'Card', upi: 'UPI',
  bank_transfer: 'Bank Transfer', insurance: 'Insurance',
}

interface Props { bill: Bill; tenantProfile: TenantProfile | null }

export default function BillDetailClient({ bill: initialBill, tenantProfile }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite  = !!role && hasPermission(role, 'billing:write')
  const canManage = !!role && hasPermission(role, 'billing:manage')
  const router    = useRouter()

  const [bill, setBill]           = useState(initialBill)
  const [loading, setLoading]     = useState(false)
  const [showPay, setShowPay]     = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef, setPayRef]       = useState('')
  const [payError, setPayError]   = useState<string | null>(null)
  const [paying, setPaying]       = useState(false)

  const [showDiscount, setShowDiscount] = useState(false)
  const [discountVal, setDiscountVal]   = useState(String(bill.discount))
  const [taxVal, setTaxVal]             = useState(String(bill.tax))
  const [adjError, setAdjError]         = useState<string | null>(null)
  const [adjLoading, setAdjLoading]     = useState(false)

  const [notifStatus, setNotifStatus]   = useState<string | null>(null)
  const [notifSending, setNotifSending] = useState(false)
  const canNotify = !!role && hasPermission(role, 'notifications:send')

  async function handleSendNotif(channel: 'whatsapp' | 'sms') {
    setNotifSending(true); setNotifStatus(null)
    const res = await sendBillNotification(bill.id, channel)
    setNotifSending(false)
    setNotifStatus(res.success
      ? `Sent via ${res.fallback ? 'SMS (fallback)' : channel} ✓`
      : (res.error ?? 'Send failed'))
    setTimeout(() => setNotifStatus(null), 5000)
  }

  async function refresh() {
    setLoading(true)
    const fresh = await getBill(bill.id)
    if (fresh) setBill(fresh)
    setLoading(false)
  }

  async function handleFinalize() {
    setLoading(true)
    await finalizeBill(bill.id)
    await refresh()
    setLoading(false)
  }

  async function handleCancel() {
    if (!confirm('Cancel this bill? All source charges will be reverted to unbilled.')) return
    setLoading(true)
    const res = await cancelBill(bill.id)
    if (!res.success) { alert(res.error); setLoading(false); return }
    await refresh()
    setLoading(false)
  }

  async function handlePayment() {
    const amt = Math.round(parseFloat(payAmount) * 100) / 100
    if (!amt || amt <= 0) { setPayError('Enter a valid amount'); return }
    if (Math.round(amt * 100) > Math.round(balance * 100)) { setPayError(`Amount cannot exceed balance due (₹${balance.toFixed(2)})`); return }
    setPaying(true)
    setPayError(null)
    const res = await recordPayment({
      bill_id: bill.id, amount: amt, method: payMethod, reference: payRef || null,
    })
    setPaying(false)
    if (!res.success) { setPayError(res.error); return }
    setShowPay(false)
    setPayAmount('')
    setPayRef('')
    await refresh()
  }

  async function handleAdjustments() {
    setAdjLoading(true)
    setAdjError(null)
    const disc = parseFloat(discountVal) || 0
    const tax  = parseFloat(taxVal) || 0

    if (disc !== bill.discount) {
      const r = await applyDiscount({ bill_id: bill.id, discount: disc })
      if (!r.success) { setAdjError(r.error); setAdjLoading(false); return }
    }
    if (tax !== bill.tax) {
      const r = await setTax({ bill_id: bill.id, tax })
      if (!r.success) { setAdjError(r.error); setAdjLoading(false); return }
    }
    setAdjLoading(false)
    setShowDiscount(false)
    await refresh()
  }

  // Group items by source
  const grouped = (bill.items ?? []).reduce<Record<string, typeof bill.items>>(
    (acc, item) => {
      ;(acc[item!.source] ??= []).push(item)
      return acc
    },
    {}
  )

  const balance = Math.max(0, bill.total - bill.paid)
  const hasNonAdvancePayments = (bill.payments ?? []).some((p) => p.method !== 'advance')
  // Allow cancelling 'paid' bills if the only payments were advance (no cash/card collected)
  const isMutable = bill.status !== 'cancelled' && (bill.status !== 'paid' || !hasNonAdvancePayments)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/billing')}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569' }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>{bill.bill_no}</h1>
              <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
            </div>
            <p className="text-sm mt-0.5" style={{ color: '#64748B' }}>
              {bill.patient?.full_name} &middot; {bill.patient?.uhid}
            </p>
            {bill.billing_date && (
              <p className="text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                {bill.bill_source && (
                  <span className="px-2 py-0.5 rounded-lg font-medium"
                    style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                    {BILL_SOURCE_LABELS[bill.bill_source] ?? bill.bill_source}
                  </span>
                )}
                <span style={{ color: '#94A3B8' }}>
                  Charges for {new Date(bill.billing_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
            style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '40px' }}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </button>

          {canNotify && (
            <>
              <button onClick={() => handleSendNotif('whatsapp')} disabled={notifSending}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                style={{ border: '1px solid rgba(37,211,102,0.4)', color: '#15803D', background: 'rgba(37,211,102,0.06)', minHeight: '40px', cursor: notifSending ? 'not-allowed' : 'pointer' }}>
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </button>
              <button onClick={() => handleSendNotif('sms')} disabled={notifSending}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '40px', cursor: notifSending ? 'not-allowed' : 'pointer' }}>
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">SMS</span>
              </button>
            </>
          )}
          {notifStatus && (
            <span className="text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{ background: notifStatus.includes('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.08)', color: notifStatus.includes('✓') ? '#065F46' : '#DC2626' }}>
              {notifStatus}
            </span>
          )}

          {canManage && isMutable && (
            <button
              onClick={() => { setDiscountVal(String(bill.discount)); setTaxVal(String(bill.tax)); setShowDiscount(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '40px' }}
            >
              Discount / Tax
            </button>
          )}

          {canWrite && bill.status === 'draft' && (
            <button
              onClick={handleFinalize}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#0D9488', minHeight: '40px' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              Finalize
            </button>
          )}

          {canWrite && (bill.status === 'unpaid' || bill.status === 'partial') && (
            <button
              onClick={() => setShowPay(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#0D9488', minHeight: '40px' }}
            >
              <DollarSign className="w-4 h-4" />
              Record Payment
            </button>
          )}

          {canManage && isMutable && !hasNonAdvancePayments && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{ border: '1px solid #FECACA', color: '#EF4444', minHeight: '40px' }}
            >
              <XCircle className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* ── Professional print invoice ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          /* Isolate just the bill — hide everything else */
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

      {(() => {
        const p = tenantProfile
        const hospName = p?.name || 'Hospital'
        const addrParts = [p?.address_line1, p?.address_line2, [p?.city, p?.state].filter(Boolean).join(', '), p?.pincode && `- ${p.pincode}`].filter(Boolean)
        const contactParts = [p?.phone1 && `Phone: ${p.phone1}`, p?.phone2 && p.phone2, p?.email && `E-mail: ${p.email}`, p?.website && `Web: ${p.website}`].filter(Boolean)
        const legalParts = [p?.cin_no && `CIN No: ${p.cin_no}`, p?.gst_no && `GST: ${p.gst_no}`].filter(Boolean)

        const sources = Object.keys(grouped)
        const billTypeLabel = sources.length === 1
          ? (SOURCE_LABELS[sources[0] as BillItemSource] ?? 'Cash') + ' Bill'
          : 'Cash Bill'

        return (
          <div id="bill-print-area" style={{ background: '#fff', border: '1px solid #D1D5DB', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>

            {/* Hospital header */}
            <div style={{ padding: '20px 32px 16px', borderBottom: '2px solid #0D9488' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                {p?.logo_url && (
                  <img src={p.logo_url} alt="Logo" className="bill-header-logo" style={{ height: '90px', width: 'auto', maxWidth: '120px', objectFit: 'contain', flexShrink: 0, display: 'block' }} />
                )}
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.5px', margin: 0, lineHeight: 1.15 }}>{hospName.toUpperCase()}</h1>
                  {(p?.tagline || p?.tagline2) && (
                    <p style={{ fontSize: '12px', color: '#0D9488', fontWeight: 600, margin: '4px 0 0' }}>
                      {[p?.tagline, p?.tagline2].filter(Boolean).join('  ·  ')}
                    </p>
                  )}
                  {addrParts.length > 0 && <p style={{ fontSize: '11.5px', color: '#475569', margin: '5px 0 0', lineHeight: 1.5 }}>{addrParts.join(' ')}</p>}
                  {contactParts.length > 0 && <p style={{ fontSize: '11px', color: '#475569', margin: '2px 0 0' }}>{contactParts.join('  |  ')}</p>}
                  {legalParts.length > 0 && <p style={{ fontSize: '10.5px', color: '#64748B', margin: '2px 0 0' }}>{legalParts.join('  |  ')}</p>}
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', marginLeft: 'auto' }}>
                  <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Bill No</p>
                  <p className="bill-billno" style={{ fontSize: '15px', fontWeight: 800, color: '#0D9488', fontFamily: 'monospace', margin: '2px 0' }}>{bill.bill_no}</p>
                  <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>{fmtDate(bill.billing_date ?? bill.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Bill type banner */}
            <div style={{ background: '#F0FDF9', borderBottom: '1px solid #CCFBF1', padding: '7px 0', textAlign: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>{billTypeLabel}</span>
            </div>

            {/* Patient info grid */}
            <div className="bill-patient-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', borderLeft: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ gridColumn: 'span 2', padding: '10px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Patient Name</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '2px 0 0' }}>{bill.patient?.full_name}</p>
              </div>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>
                <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>UHID</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', fontFamily: 'monospace', margin: '2px 0 0' }}>{bill.patient?.uhid}</p>
              </div>
              {bill.patient?.phone && (
                <div style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Phone</p>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: '2px 0 0' }}>{bill.patient.phone}</p>
                </div>
              )}
              <div style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Bill Date</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: '2px 0 0' }}>{fmtDate(bill.billing_date ?? bill.created_at)}</p>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0' }}>
                <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Ref. No</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#0D9488', fontFamily: 'monospace', margin: '2px 0 0' }}>{bill.bill_no}</p>
              </div>
            </div>

            {/* Items table — single table across all source groups */}
            {(bill.items ?? []).length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>No line items</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed', minWidth: '440px' }}>
                {Object.entries(grouped).map(([source, items], si) => {
                  const srcLabel = SOURCE_LABELS[source as BillItemSource | 'advance_refund'] ?? source
                  const srcTotal = (items ?? []).reduce((s, i) => s + (i?.amount ?? 0), 0)
                  return (
                    <tbody key={source} style={{ breakInside: 'avoid' }}>
                      <tr style={{ background: si % 2 === 0 ? '#F8FAFC' : '#FAFBFC', borderTop: '1px solid #E2E8F0' }}>
                        <td colSpan={4} style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#475569' }}>{srcLabel}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                        {(['Description', 'Qty', 'Unit Price', 'Amount'] as const).map((h, i) => (
                          <th key={h} style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: i >= 1 ? 'right' : 'left', width: ['auto', '55px', '110px', '110px'][i] }}>{h}</th>
                        ))}
                      </tr>
                      {(items ?? []).map((item) => (
                        <tr key={item!.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '7px 12px', color: '#475569' }}>{item!.description}</td>
                          <td style={{ padding: '7px 12px', color: '#94A3B8', textAlign: 'right' }}>{item!.qty}</td>
                          <td style={{ padding: '7px 12px', color: '#64748B', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item!.unit_price)}</td>
                          <td style={{ padding: '7px 12px', color: '#1E293B', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item!.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px dashed #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                        <td colSpan={3} style={{ padding: '6px 12px', fontSize: '11px', color: '#94A3B8', textAlign: 'right', fontStyle: 'italic' }}>{srcLabel} Total</td>
                        <td style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 700, color: '#334155', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(srcTotal)}</td>
                      </tr>
                    </tbody>
                  )
                })}
              </table>
              </div>
            )}

            {/* Totals */}
            <div className="bill-totals-wrap" style={{ borderTop: '2px solid #0D9488', display: 'flex', justifyContent: 'flex-end' }}>
              <div className="bill-totals-panel" style={{ minWidth: '300px', padding: '16px 24px' }}>
                {bill.subtotal !== bill.total && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Subtotal</span>
                    <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.subtotal)}</span>
                  </div>
                )}
                {bill.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Discount</span>
                    <span style={{ fontSize: '13px', color: '#10B981', fontFamily: 'monospace' }}>- {fmt(bill.discount)}</span>
                  </div>
                )}
                {bill.tax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Tax</span>
                    <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.tax)}</span>
                  </div>
                )}
                {[
                  { label: 'Grand Total',  value: bill.total,  size: '14px', weight: 700, color: '#0F172A', sep: true },
                  { label: 'Paid',         value: bill.paid,   size: '13px', weight: 500, color: '#10B981', sep: false },
                  { label: 'Balance Due',  value: balance,     size: '16px', weight: 800, color: balance > 0 ? '#DC2626' : '#10B981', sep: true },
                ].map(({ label, value, size, weight, color, sep }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: sep ? '10px 0 5px' : '4px 0', borderTop: sep ? '1.5px solid #E2E8F0' : undefined, marginTop: sep ? '6px' : undefined }}>
                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: weight }}>{label}</span>
                    <span style={{ fontSize: size, fontWeight: weight, color, fontFamily: 'monospace' }}>{fmt(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Refund acknowledgement — for advance_refund and appointment_refund bills */}
            {(bill.bill_source === 'advance_refund' || bill.bill_source === 'appointment_refund') && (() => {
              const refundAmt = Math.abs(bill.total)
              const isApptRefund = bill.bill_source === 'appointment_refund'
              const refundDesc = isApptRefund
                ? 'as refund of consultation fee for the cancelled appointment of'
                : 'as refund of excess advance paid towards the treatment of'
              return (
                <div style={{ borderTop: '2px dashed #CBD5E1', margin: '0 0' }}>
                  <div style={{ textAlign: 'center', marginTop: '-9px' }}>
                    <span style={{ background: '#fff', padding: '0 8px', fontSize: '10px', color: '#94A3B8', letterSpacing: '1px' }}>✂ CUT HERE</span>
                  </div>

                  <div style={{ padding: '20px 32px 24px' }}>
                    <p style={{ textAlign: 'center', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', color: '#0F172A', margin: '0 0 16px' }}>
                      Refund Acknowledgement
                    </p>

                    <p style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.8, margin: '0 0 20px' }}>
                      I/We hereby acknowledge that I/We have received{' '}
                      <strong>₹{refundAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({inWords(Math.round(refundAmt))} Rupees only)</strong>{' '}
                      {refundDesc}{' '}
                      <strong>{bill.patient?.full_name}</strong>{' '}
                      (UHID: {bill.patient?.uhid}) at <strong>{p?.name ?? 'the Hospital'}</strong>.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 32px' }}>
                      {[
                        { label: 'Name of Recipient' },
                        { label: 'Relationship to Patient' },
                        { label: 'Signature' },
                        { label: 'Date' },
                      ].map(({ label }) => (
                        <div key={label}>
                          <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 20px' }}>{label}</p>
                          <div style={{ borderBottom: '1px solid #CBD5E1', marginTop: '-14px' }} />
                        </div>
                      ))}
                    </div>

                    <p style={{ fontSize: '10px', color: '#94A3B8', textAlign: 'center', margin: '16px 0 0' }}>
                      This acknowledgement must be signed and returned to the hospital cashier.
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Footer */}
            <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 24px', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
              {p?.emergency_contact && (
                <p style={{ fontSize: '11.5px', color: '#475569', margin: 0, fontWeight: 500 }}>
                  For Emergency Care: <strong>{p.emergency_contact}</strong>
                </p>
              )}
              <p style={{ fontSize: '10px', color: '#CBD5E1', margin: 0, marginLeft: 'auto' }}>System generated bill &nbsp;·&nbsp; Powered by Uyirly</p>
            </div>
          </div>
        )
      })()}

      {/* Payment log — screen only, not printed */}
      {(bill.payments ?? []).length > 0 && (
        <div className="no-print mt-4" style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#64748B' }}>Payment Log</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                {['Date', 'Method', 'Reference', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 16px', color: '#94A3B8', fontWeight: 600, fontSize: '11px', textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(bill.payments ?? []).map((pay) => (
                <tr key={pay.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '9px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}><DateText date={pay.received_at} /></td>
                  <td style={{ padding: '9px 16px', color: '#475569' }}>{PAYMENT_METHOD_LABELS[pay.method] ?? pay.method}</td>
                  <td style={{ padding: '9px 16px', color: '#94A3B8', fontSize: '12px' }}>{pay.reference ?? '—'}</td>
                  <td style={{ padding: '9px 16px', color: '#10B981', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmt(pay.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      <Modal
        open={showPay}
        onClose={() => { setShowPay(false); setPayError(null) }}
        title="Record Payment"
        maxWidth="28rem"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowPay(false)}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
            >
              Cancel
            </button>
            <button
              onClick={handlePayment}
              disabled={paying}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: paying ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
            >
              {paying && <Loader2 className="w-4 h-4 animate-spin" />}
              Record
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {payError && (
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              {payError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>
              Amount (Balance: <Money amount={balance} />)
            </label>
            <input
              type="number"
              autoFocus
              min={0.01}
              max={balance}
              step={0.01}
              placeholder="0.00"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                minHeight: '44px',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Method</label>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="insurance">Insurance</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Reference (optional)</label>
            <input
              type="text"
              placeholder="Transaction ID, cheque no…"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                minHeight: '44px',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
        </div>
      </Modal>

      {/* Discount / Tax Modal */}
      <Modal
        open={showDiscount}
        onClose={() => { setShowDiscount(false); setAdjError(null) }}
        title="Adjust Discount & Tax"
        maxWidth="26rem"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDiscount(false)}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdjustments}
              disabled={adjLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: adjLoading ? '#94A3B8' : '#0D9488', minHeight: '44px' }}
            >
              {adjLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {adjError && (
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              {adjError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Discount (₹)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={discountVal}
              onChange={(e) => setDiscountVal(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                minHeight: '44px',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Tax (₹)</label>
            <input
              type="number"
              min={0}
              step={1}
              value={taxVal}
              onChange={(e) => setTaxVal(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{
                background: 'rgba(255,255,255,0.8)',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                minHeight: '44px',
                outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          <div className="text-sm" style={{ color: '#64748B' }}>
            New total: <Money
              amount={Math.max(0, bill.subtotal - (parseFloat(discountVal) || 0) + (parseFloat(taxVal) || 0))}
              className="font-semibold"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
