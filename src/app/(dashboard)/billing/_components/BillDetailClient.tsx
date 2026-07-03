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
import type { Bill, BillItemSource } from '@/lib/types'

const SOURCE_LABELS: Record<BillItemSource, string> = {
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

interface Props { bill: Bill }

export default function BillDetailClient({ bill: initialBill }: Props) {
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
    const amt = parseFloat(payAmount)
    if (!amt || amt <= 0) { setPayError('Enter a valid amount'); return }
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

      {/* Invoice card — print-friendly */}
      <GlassCard className="p-6 print:shadow-none print:border-none">
        {/* Patient info block */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>Patient</p>
            <p className="font-semibold" style={{ color: '#0F172A' }}>{bill.patient?.full_name}</p>
            <p className="text-sm" style={{ color: '#64748B' }}>UHID: {bill.patient?.uhid}</p>
            {bill.patient?.phone && (
              <p className="text-sm" style={{ color: '#64748B' }}>{bill.patient.phone}</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#94A3B8' }}>Bill Info</p>
            <p className="font-mono font-semibold" style={{ color: '#0D9488' }}>{bill.bill_no}</p>
            <p className="text-sm" style={{ color: '#64748B' }}><DateText date={bill.created_at} /></p>
          </div>
        </div>

        {/* Line items grouped by source */}
        <div className="space-y-4 mb-6">
          {Object.entries(grouped).map(([source, items]) => (
            <div key={source}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#94A3B8' }}>
                {SOURCE_LABELS[source as BillItemSource] ?? source}
              </p>
              <div className="space-y-0">
                {(items ?? []).map((item) => (
                  <div
                    key={item!.id}
                    className="flex items-start justify-between gap-4 py-2"
                    style={{ borderBottom: '1px solid #F8FAFC' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: '#0F172A' }}>{item!.description}</p>
                      {item!.qty !== 1 && (
                        <p className="text-xs" style={{ color: '#94A3B8' }}>
                          {item!.qty} × <Money amount={item!.unit_price} />
                        </p>
                      )}
                    </div>
                    <Money amount={item!.amount} className="text-sm font-semibold flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {(bill.items ?? []).length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No line items</p>
          )}
        </div>

        {/* Totals */}
        <div className="space-y-2 pt-4" style={{ borderTop: '2px solid #E2E8F0' }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#64748B' }}>Subtotal</span>
            <Money amount={bill.subtotal} />
          </div>
          {bill.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: '#64748B' }}>Discount</span>
              <span style={{ color: '#10B981' }}>- <Money amount={bill.discount} /></span>
            </div>
          )}
          {bill.tax > 0 && (
            <div className="flex justify-between text-sm">
              <span style={{ color: '#64748B' }}>Tax</span>
              <Money amount={bill.tax} />
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-2" style={{ borderTop: '1px solid #E2E8F0' }}>
            <span style={{ color: '#0F172A' }}>Total</span>
            <Money amount={bill.total} />
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: '#64748B' }}>Paid</span>
            <span style={{ color: '#10B981' }}><Money amount={bill.paid} /></span>
          </div>
          <div className="flex justify-between font-bold" style={{ color: balance > 0 ? '#EF4444' : '#10B981' }}>
            <span>Balance Due</span>
            <Money amount={balance} />
          </div>
        </div>
      </GlassCard>

      {/* Payments history */}
      {(bill.payments ?? []).length > 0 && (
        <GlassCard className="mt-4 p-6">
          <h2 className="text-base font-semibold mb-4" style={{ color: '#0F172A' }}>Payment History</h2>
          <div className="space-y-2">
            {(bill.payments ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium" style={{ color: '#0F172A' }}>
                    {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                  </span>
                  {p.reference && (
                    <span className="ml-2 text-xs" style={{ color: '#94A3B8' }}>#{p.reference}</span>
                  )}
                  <span className="ml-2 text-xs" style={{ color: '#94A3B8' }}>
                    <DateText date={p.received_at} />
                  </span>
                </div>
                <Money amount={p.amount} className="font-semibold" style={{ color: '#10B981' }} />
              </div>
            ))}
          </div>
        </GlassCard>
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
