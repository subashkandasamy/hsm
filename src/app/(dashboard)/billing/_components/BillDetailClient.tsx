'use client'

import { useState, useEffect } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getCashTakenToday } from '@/app/actions/accounts'
import { cashPosition, cashWarning } from '@/lib/billing/cashLimit'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Download, CheckCircle2, XCircle, DollarSign, Loader2, MessageSquare, Phone } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import Modal from '@/components/ui/Modal'
import {
  finalizeBill, cancelBill, recordPayment, updateBillItemGst, getBill,
} from '@/app/actions/billing'
import { applyOrRequestDiscount, approveDiscountRequest, rejectDiscountRequest } from '@/app/actions/discounts'
import { issueCreditNote } from '@/app/actions/refunds'
import { sendBillNotification } from '@/app/actions/notifications'
import { useAuth } from '@/context/AuthContext'
import { useMessagingEnabled } from '@/context/MessagingContext'
import { hasPermission } from '@/lib/rbac'
import { summarizeBillGst, rupeesInWords, billDocKind, isGstRegistered, isCompositionDealer, COMPOSITION_DECLARATION } from '@/lib/gst'
import UpiCollectPanel from './UpiCollectPanel'
import CollectionAccountPicker, { useCollectionPlan, pickAccount } from './CollectionAccountPicker'
import { isDirected } from '@/lib/billing/collectionAccounts'
import { showSuccess as showPaidOnDisplay } from '@/lib/counterDisplay'
import type { Bill, BillItemSource, TenantProfile, DiscountRequestRow, CreditNote } from '@/lib/types'
import { realPhone } from '@/lib/patientPhone'

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
  vaccine: 'Vaccination',
  icu: 'Critical Care',
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
  ot: 'Surgery (OT)',
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

interface Props {
  bill: Bill; tenantProfile: TenantProfile | null
  pendingDiscount?: DiscountRequestRow | null
  creditNotes?: CreditNote[]
  refundable?: number
}

export default function BillDetailClient({ bill: initialBill, tenantProfile, pendingDiscount, creditNotes = [], refundable = 0 }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite  = !!role && hasPermission(role, 'billing:write', profile?.granted_permissions)
  const canManage = !!role && hasPermission(role, 'billing:manage', profile?.granted_permissions)
  const router    = useRouter()

  const [bill, setBill]           = useState(initialBill)
  const [loading, setLoading]     = useState(false)
  const [showPay, setShowPay]     = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef, setPayRef]       = useState('')
  const [payError, setPayError]   = useState<string | null>(null)
  const [paying, setPaying]       = useState(false)
  // UPI / bank money goes into one account; a bill split across accounts is
  // collected one account at a time, each with its own QR (0267).
  const [payAccount, setPayAccount] = useState<string | null>(null)
  const [payNotice, setPayNotice]   = useState<string | null>(null)
  // An amount typed for one account; otherwise that account's whole due is used.
  const [acctAmount, setAcctAmount] = useState<{ key: string; value: string } | null>(null)
  const directed = isDirected(payMethod)
  const plan = useCollectionPlan([bill.id], showPay && directed)
  const payAcct = directed ? pickAccount(plan.accounts, payAccount) : null
  const amountValue = payAcct
    ? (acctAmount?.key === payAcct.key ? acctAmount.value : String(payAcct.due))
    : payAmount

  const [showDiscount, setShowDiscount] = useState(false)
  const [discMode, setDiscMode]         = useState<'percent' | 'amount'>('amount')
  const [discountVal, setDiscountVal]   = useState('')
  const [discReason, setDiscReason]     = useState('Camp')
  const [adjError, setAdjError]         = useState<string | null>(null)
  const [adjLoading, setAdjLoading]     = useState(false)
  const [adjNotice, setAdjNotice]       = useState<string | null>(null)
  const [decideBusy, setDecideBusy]     = useState(false)
  // Browser dialogs are not used in this product: they cannot be styled, they
  // block the tab, and on a ward tablet they are easy to dismiss by accident.
  const [actionError, setActionError]   = useState<string | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  // Cash already taken from this patient today, across every bill and deposit.
  // Section 269ST counts per person per day, so a single bill's history is not
  // the question — see lib/billing/cashLimit.
  const [cashToday, setCashToday] = useState<number | null>(null)

  // Refund / credit note
  const [showRefund, setShowRefund]     = useState(false)
  const [refundAmt, setRefundAmt]       = useState('')
  const [refundMethod, setRefundMethod] = useState('cash')
  const [refundReason, setRefundReason] = useState('')
  const [refundErr, setRefundErr]       = useState<string | null>(null)
  const [refundBusy, setRefundBusy]     = useState(false)
  const creditedTotal = creditNotes.reduce((s, c) => s + c.amount, 0)

  async function handleRefund() {
    setRefundBusy(true); setRefundErr(null)
    const res = await issueCreditNote({ bill_id: bill.id, amount: parseFloat(refundAmt) || 0, method: refundMethod, reason: refundReason })
    setRefundBusy(false)
    if (!res.success) { setRefundErr(res.error); return }
    setShowRefund(false); setRefundAmt(''); setRefundReason('')
    router.refresh()
    await refresh()
  }

  // Per-line GST override
  const [gstEdit, setGstEdit]           = useState<{ id: string; description: string; gst_rate: string; hsn_sac: string } | null>(null)
  const [gstEditLoading, setGstEditLoading] = useState(false)
  const [gstEditError, setGstEditError] = useState<string | null>(null)

  async function handleGstSave() {
    if (!gstEdit) return
    setGstEditLoading(true); setGstEditError(null)
    const res = await updateBillItemGst({
      item_id: gstEdit.id,
      gst_rate: parseFloat(gstEdit.gst_rate) || 0,
      hsn_sac: gstEdit.hsn_sac.trim() || null,
    })
    setGstEditLoading(false)
    if (!res.success) { setGstEditError(res.error); return }
    setGstEdit(null)
    await refresh()
  }

  const [notifStatus, setNotifStatus]   = useState<string | null>(null)
  const [notifSending, setNotifSending] = useState(false)
  const messagingEnabled = useMessagingEnabled()
  const canNotify = !!role && hasPermission(role, 'notifications:send', profile?.granted_permissions) && messagingEnabled

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
    setConfirmCancel(false)
    setActionError(null)
    setLoading(true)
    const res = await cancelBill(bill.id)
    if (!res.success) { setActionError(res.error ?? 'Could not cancel this bill'); setLoading(false); return }
    await refresh()
    setLoading(false)
  }

  // Asked when the payment box opens, not as the amount is typed: the figure
  // is about the day, not about this payment, so it does not change under the
  // cashier's hands while they are deciding.
  useEffect(() => {
    if (!showPay || !bill.patient_id) return
    let live = true
    getCashTakenToday(bill.patient_id)
      .then((r) => { if (live) setCashToday(r.alreadyToday) })
      .catch(() => { if (live) setCashToday(null) })
    return () => { live = false }
  }, [showPay, bill.patient_id])

  async function handlePayment() {
    const amt = Math.round(parseFloat(amountValue) * 100) / 100
    if (!amt || amt <= 0) { setPayError('Enter a valid amount'); return }
    if (Math.round(amt * 100) > Math.round(balance * 100)) { setPayError(`Amount cannot exceed balance due (₹${balance.toFixed(2)})`); return }
    if (directed && payAcct && Math.round(amt * 100) > Math.round(payAcct.due * 100)) {
      setPayError(`Only ₹${payAcct.due.toFixed(2)} of this bill is for ${payAcct.name}.`); return
    }
    setPaying(true)
    setPayError(null)
    setPayNotice(null)
    const res = await recordPayment({
      bill_id: bill.id, amount: amt, method: payMethod, reference: payRef || null,
      account_id: directed && payAcct && payAcct.key !== 'main' ? payAcct.key : null,
    })
    setPaying(false)
    if (!res.success) { setPayError(res.error); return }
    // Let the patient watch their own screen confirm it. Best-effort: a display
    // that is unplugged must never stop a payment that is already recorded.
    if (payMethod === 'upi') {
      void showPaidOnDisplay({ reference: payRef, billNo: bill.bill_no }).catch(() => {})
    }
    setPayRef('')
    // Split across accounts: stay open for the next account's QR.
    if (directed) {
      const paidInto = payAcct?.name ?? 'the account'
      const next = (await plan.reload())?.filter((a) => a.due > 0) ?? []
      setAcctAmount(null)
      if (next.length) {
        setPayAccount(next[0].key)
        setPayNotice(`₹${amt.toFixed(2)} recorded into ${paidInto}. Now collect ₹${next[0].due.toFixed(2)} for ${next[0].name}.`)
        await refresh()
        return
      }
    }
    setShowPay(false)
    setPayAmount('')
    setPayAccount(null)
    setAcctAmount(null)
    await refresh()
  }

  async function handleDiscount() {
    setAdjLoading(true); setAdjError(null); setAdjNotice(null)
    const res = await applyOrRequestDiscount({
      bill_id: bill.id, mode: discMode, value: parseFloat(discountVal) || 0, reason: discReason,
    })
    setAdjLoading(false)
    if (!res.success) { setAdjError(res.error); return }
    if (res.status === 'pending') {
      setShowDiscount(false)
      setAdjNotice('This discount is above your limit — sent to an administrator for approval.')
      await refresh()
    } else {
      setShowDiscount(false)
      await refresh()
    }
  }

  async function decidePending(approve: boolean) {
    if (!pendingDiscount) return
    setDecideBusy(true)
    const r = approve ? await approveDiscountRequest(pendingDiscount.id) : await rejectDiscountRequest(pendingDiscount.id)
    setDecideBusy(false)
    if (!r.success) { setActionError(r.error ?? 'Could not record that decision'); return }
    router.refresh()
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
          {/* Printing uses the generated PDF so the invoice looks the same on every browser and printer. */}
          <a
            href={`/billing/${bill.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
            style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '40px' }}
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Print</span>
          </a>
          <a
            href={`/billing/${bill.id}/pdf?download=1`}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
            style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '40px' }}
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </a>

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

          {canWrite && isMutable && !pendingDiscount && (
            <button
              onClick={() => { setDiscMode('amount'); setDiscountVal(''); setDiscReason('Camp'); setAdjError(null); setShowDiscount(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '40px' }}
            >
              Discount
            </button>
          )}

          {canManage && refundable > 0 && bill.status !== 'cancelled' && (
            <button
              onClick={() => { setRefundAmt(''); setRefundMethod('cash'); setRefundReason(''); setRefundErr(null); setShowRefund(true) }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
              style={{ border: '1px solid #FECACA', color: '#B45309', minHeight: '40px' }}
            >
              Refund
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
              onClick={() => setConfirmCancel(true)}
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

      {adjNotice && (
        <div className="no-print mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
          {adjNotice}
        </div>
      )}

      {actionError && (
        <div className="no-print mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          {actionError}
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancel}
        title="Cancel this bill?"
        description="Every charge on it goes back to unbilled and can be put on another bill. The bill itself is kept, marked cancelled."
        confirmLabel="Cancel bill"
        loading={loading}
      />

      {/* Discount pending approval */}
      {pendingDiscount && (
        <div className="no-print mb-4 px-4 py-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#92400E' }}>
                Discount pending approval — {pendingDiscount.requested_pct}% ({fmt(pendingDiscount.requested_amount)})
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>
                {pendingDiscount.reason} · requested by {pendingDiscount.requested_by_name}
              </p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button onClick={() => decidePending(true)} disabled={decideBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: '#0D9488', border: 'none', cursor: decideBusy ? 'wait' : 'pointer' }}>
                  Approve
                </button>
                <button onClick={() => decidePending(false)} disabled={decideBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'transparent', color: '#DC2626', border: '1px solid #FECACA', cursor: decideBusy ? 'wait' : 'pointer' }}>
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

        // GST tax-invoice mode: hospital is GST-registered → show HSN/GST columns,
        // CGST/SGST split and a rate-wise tax summary. All-exempt bills read as a
        // "Bill of Supply"; a plain bill (not registered) keeps the old label.
        const gstRegistered = isGstRegistered(p)
        const composition = isCompositionDealer(p)
        const hasGst = (bill.tax ?? 0) > 0
        const docLabel = { tax_invoice: 'TAX INVOICE', bill_of_supply: 'BILL OF SUPPLY', plain: billTypeLabel }[
          billDocKind(p, hasGst)
        ]
        const gstCols = gstRegistered ? 6 : 4
        const gstSummary = gstRegistered
          ? summarizeBillGst((bill.items ?? []).map((i) => ({
              amount: i?.amount ?? 0, gst_rate: i?.gst_rate ?? 0, tax_inclusive: !!i?.tax_inclusive,
            })), bill.discount ?? 0)
          : null

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
              <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '3px', color: '#0F766E', textTransform: 'uppercase' }}>{docLabel}</span>
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
              {realPhone(bill.patient?.phone) && (
                <div style={{ padding: '8px 12px', borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>Phone</p>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', margin: '2px 0 0' }}>{realPhone(bill.patient?.phone)}</p>
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
              {/* The minimum has to leave the description column something to
                  work with: with tableLayout fixed it was getting 93px, and
                  "Consultation — Dr. Arun Prakash" came out four lines deep.
                  The table scrolls, so a wider minimum costs nothing. */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed', minWidth: gstRegistered ? '46rem' : '38rem' }}>
                {/* table-layout: fixed takes its columns from the first row, and
                    the first row here is a single colSpan cell naming the
                    department. With nothing to go on the browser split the width
                    equally — six columns of 123px — so the widths on the <th>s
                    below were never applied, and Qty got as much room as the
                    description. A colgroup is what fixed layout actually reads. */}
                <colgroup>
                  <col />
                  {gstRegistered && <col style={{ width: '80px' }} />}
                  <col style={{ width: '50px' }} />
                  <col style={{ width: '105px' }} />
                  {gstRegistered && <col style={{ width: '55px' }} />}
                  <col style={{ width: '110px' }} />
                </colgroup>
                {Object.entries(grouped).map(([source, items], si) => {
                  const srcLabel = SOURCE_LABELS[source as BillItemSource | 'advance_refund'] ?? source
                  const srcTotal = (items ?? []).reduce((s, i) => s + (i?.amount ?? 0), 0)
                  return (
                    <tbody key={source} style={{ breakInside: 'avoid' }}>
                      <tr style={{ background: si % 2 === 0 ? '#F8FAFC' : '#FAFBFC', borderTop: '1px solid #E2E8F0' }}>
                        <td colSpan={gstCols} style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', color: '#475569' }}>{srcLabel}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #EAECF0' }}>
                        <th style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: 'left' }}>Description</th>
                        {gstRegistered && <th style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: 'left', width: '80px' }}>HSN/SAC</th>}
                        <th style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: 'right', width: '50px' }}>Qty</th>
                        <th style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: 'right', width: '105px' }}>Unit Price</th>
                        {gstRegistered && <th style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: 'right', width: '55px' }}>GST%</th>}
                        <th style={{ padding: '5px 12px', color: '#B0BAC9', fontWeight: 600, fontSize: '11px', textAlign: 'right', width: '110px' }}>Amount</th>
                      </tr>
                      {(items ?? []).map((item) => (
                        <tr key={item!.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '7px 12px', color: '#475569' }}>{item!.description}</td>
                          {gstRegistered && <td style={{ padding: '7px 12px', color: '#94A3B8', fontFamily: 'monospace', fontSize: '12px' }}>{item!.hsn_sac || '—'}</td>}
                          <td style={{ padding: '7px 12px', color: '#94A3B8', textAlign: 'right' }}>{item!.qty}</td>
                          <td style={{ padding: '7px 12px', color: '#64748B', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item!.unit_price)}</td>
                          {gstRegistered && (
                            <td style={{ padding: '7px 12px', color: '#64748B', textAlign: 'right' }}>
                              <span>{(item!.gst_rate ?? 0) > 0 ? `${item!.gst_rate}%` : 'Exempt'}</span>
                              {canManage && isMutable && (
                                <button className="no-print" onClick={() => setGstEdit({ id: item!.id, description: item!.description, gst_rate: String(item!.gst_rate ?? 0), hsn_sac: item!.hsn_sac ?? '' })}
                                  title="Edit GST rate / HSN" style={{ marginLeft: '6px', background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', fontSize: '12px' }}>✎</button>
                              )}
                            </td>
                          )}
                          <td style={{ padding: '7px 12px', color: '#1E293B', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(item!.amount)}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: '1px dashed #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                        <td colSpan={gstCols - 1} style={{ padding: '6px 12px', fontSize: '11px', color: '#94A3B8', textAlign: 'right', fontStyle: 'italic' }}>{srcLabel} Total</td>
                        <td style={{ padding: '6px 12px', fontSize: '13px', fontWeight: 700, color: '#334155', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(srcTotal)}</td>
                      </tr>
                    </tbody>
                  )
                })}
              </table>
              </div>
            )}

            {/* GST rate-wise tax summary */}
            {gstSummary && gstSummary.rateSummary.length > 0 && (
              <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 24px', overflowX: 'auto' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#94A3B8', margin: '0 0 6px' }}>Tax Summary</p>
                <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '360px' }}>
                  <thead>
                    <tr style={{ color: '#94A3B8' }}>
                      {['GST Rate', 'Taxable Value', 'CGST', 'SGST', 'Total Tax'].map((h, i) => (
                        <th key={h} style={{ padding: '4px 14px 4px 0', textAlign: i === 0 ? 'left' : 'right', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gstSummary.rateSummary.map((r) => (
                      <tr key={r.rate} style={{ color: '#475569' }}>
                        <td style={{ padding: '3px 14px 3px 0' }}>{r.rate}%</td>
                        <td style={{ padding: '3px 14px 3px 0', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.taxableValue)}</td>
                        <td style={{ padding: '3px 14px 3px 0', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.cgst)}</td>
                        <td style={{ padding: '3px 14px 3px 0', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(r.sgst)}</td>
                        <td style={{ padding: '3px 0', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(r.total)}</td>
                      </tr>
                    ))}
                    {gstSummary.exemptValue > 0 && (
                      <tr style={{ color: '#475569' }}>
                        <td style={{ padding: '3px 14px 3px 0' }}>Exempt</td>
                        <td style={{ padding: '3px 14px 3px 0', textAlign: 'right', fontFamily: 'monospace' }}>{fmt(gstSummary.exemptValue)}</td>
                        <td colSpan={3} style={{ padding: '3px 0', textAlign: 'right', color: '#94A3B8' }}>no GST</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* A composition dealer may not collect tax, so there is no tax
                summary to print — but the declaration is required on the
                document, so it takes that place rather than being omitted. */}
            {composition && (
              <div style={{ borderTop: '1px solid #E2E8F0', padding: '12px 24px' }}>
                <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>{COMPOSITION_DECLARATION}</p>
              </div>
            )}

            {/* Totals */}
            <div className="bill-totals-wrap" style={{ borderTop: '2px solid #0D9488', display: 'flex', justifyContent: 'flex-end' }}>
              <div className="bill-totals-panel" style={{ minWidth: '300px', padding: '16px 24px' }}>
                {(gstRegistered || bill.subtotal !== bill.total) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Subtotal</span>
                    <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.subtotal)}</span>
                  </div>
                )}
                {bill.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>
                      Discount{(bill.discount_pct ?? 0) > 0 ? ` (${bill.discount_pct}%)` : ''}{bill.discount_reason ? ` · ${bill.discount_reason}` : ''}
                    </span>
                    <span style={{ fontSize: '13px', color: '#10B981', fontFamily: 'monospace' }}>- {fmt(bill.discount)}</span>
                  </div>
                )}
                {gstRegistered ? (
                  <>
                    {(bill.cgst ?? 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '13px', color: '#64748B' }}>CGST</span>
                        <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.cgst ?? 0)}</span>
                      </div>
                    )}
                    {(bill.sgst ?? 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '13px', color: '#64748B' }}>SGST</span>
                        <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.sgst ?? 0)}</span>
                      </div>
                    )}
                    {(bill.igst ?? 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '13px', color: '#64748B' }}>IGST</span>
                        <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.igst ?? 0)}</span>
                      </div>
                    )}
                  </>
                ) : bill.tax > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Tax</span>
                    <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{fmt(bill.tax)}</span>
                  </div>
                )}
                {(bill.round_off ?? 0) !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '13px', color: '#64748B' }}>Round Off</span>
                    <span style={{ fontSize: '13px', color: '#334155', fontFamily: 'monospace' }}>{(bill.round_off ?? 0) > 0 ? '+ ' : '- '}{fmt(Math.abs(bill.round_off ?? 0))}</span>
                  </div>
                )}
                {[
                  { label: 'Grand Total',  value: bill.total,  size: '14px', weight: 700, color: '#0F172A', sep: true },
                  { label: 'Paid',         value: bill.paid,   size: '13px', weight: 500, color: '#10B981', sep: false },
                  ...(creditedTotal > 0 ? [
                    { label: 'Refunded (credit notes)', value: -creditedTotal, size: '13px', weight: 500, color: '#B45309', sep: false },
                    { label: 'Net Collected', value: bill.paid - creditedTotal, size: '13px', weight: 600, color: '#0F172A', sep: false },
                  ] : []),
                  { label: 'Balance Due',  value: balance,     size: '16px', weight: 800, color: balance > 0 ? '#DC2626' : '#10B981', sep: true },
                ].map(({ label, value, size, weight, color, sep }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: sep ? '10px 0 5px' : '4px 0', borderTop: sep ? '1.5px solid #E2E8F0' : undefined, marginTop: sep ? '6px' : undefined }}>
                    <span style={{ fontSize: '13px', color: '#475569', fontWeight: weight }}>{label}</span>
                    <span style={{ fontSize: size, fontWeight: weight, color, fontFamily: 'monospace' }}>{fmt(value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Amount in words */}
            {bill.bill_source !== 'advance_refund' && bill.bill_source !== 'appointment_refund' && (
              <div style={{ borderTop: '1px solid #E2E8F0', padding: '10px 24px' }}>
                <span style={{ fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Amount in words: </span>
                <span style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>{rupeesInWords(bill.total)}</span>
              </div>
            )}

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

      {/* Credit notes (refunds) — screen only */}
      {creditNotes.length > 0 && (
        <div className="no-print mt-4" style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
          <div style={{ padding: '10px 16px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#92400E' }}>Refunds / Credit Notes</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <tbody>
              {creditNotes.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '9px 16px', color: '#0D9488', fontFamily: 'monospace', fontSize: '12px' }}>{c.credit_no}</td>
                  <td style={{ padding: '9px 16px', color: '#475569' }}>{c.reason}</td>
                  <td style={{ padding: '9px 16px', color: '#94A3B8', fontSize: '12px' }}>{PAYMENT_METHOD_LABELS[c.method] ?? c.method}</td>
                  <td style={{ padding: '9px 16px', color: '#94A3B8', whiteSpace: 'nowrap' }}><DateText date={c.created_at} /></td>
                  <td style={{ padding: '9px 16px', color: '#B45309', fontWeight: 700, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>- {fmt(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
        onClose={() => { setShowPay(false); setPayError(null); setPayNotice(null) }}
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
          {payNotice && (
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#F0FDF4', color: '#047857', border: '1px solid #BBF7D0' }}>
              {payNotice}
            </div>
          )}

          {/* Said before the money is taken. Afterwards the penalty has already
              attached, and under 271DA it is the whole amount received. */}
          {payMethod === 'cash' && cashToday !== null && (() => {
            const pos = cashPosition(cashToday, parseFloat(payAmount) || 0)
            const msg = cashWarning(pos)
            if (!msg) return null
            return (
              <div className="px-3 py-2.5 rounded-xl text-sm" style={{
                background: pos.breaches ? '#FEF2F2' : '#FFFBEB',
                color: pos.breaches ? '#991B1B' : '#92400E',
                border: `1px solid ${pos.breaches ? '#FECACA' : '#FDE68A'}`,
                lineHeight: 1.5,
              }}>
                <strong style={{ display: 'block', marginBottom: '2px' }}>
                  {pos.breaches ? 'Too much cash for one day' : 'Close to the cash limit'}
                </strong>
                {msg}
              </div>
            )
          })()}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>
              {directed && payAcct && payAcct.due < balance - 0.001
                ? <>Amount (for {payAcct.name}: <Money amount={payAcct.due} /> of <Money amount={balance} />)</>
                : <>Amount (Balance: <Money amount={balance} />)</>}
            </label>
            <input
              type="number"
              autoFocus
              min={0.01}
              max={directed && payAcct ? payAcct.due : balance}
              step={0.01}
              placeholder="0.00"
              value={amountValue}
              onChange={(e) => payAcct ? setAcctAmount({ key: payAcct.key, value: e.target.value }) : setPayAmount(e.target.value)}
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
          {directed && plan.error && (
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{plan.error}</div>
          )}
          {directed && plan.accounts && (
            <CollectionAccountPicker accounts={plan.accounts} selected={payAcct?.key ?? null}
              onSelect={(a) => { setPayAccount(a.key); setAcctAmount(null); setPayError(null) }} />
          )}
          {payMethod === 'upi' && (payAcct ? (
            <UpiCollectPanel
              key={payAcct.key}
              vpa={payAcct.vpa}
              payeeName={payAcct.payeeName}
              amount={parseFloat(amountValue) || payAcct.due}
              billNo={bill.bill_no}
              accountName={payAcct.key === 'main' ? undefined : payAcct.name}
            />
          ) : plan.loading ? (
            <p className="text-xs" style={{ color: '#94A3B8' }}>Working out which account this bill is paid into…</p>
          ) : !plan.error && (
            <UpiCollectPanel
              vpa={tenantProfile?.upi_vpa}
              payeeName={tenantProfile?.upi_payee_name || tenantProfile?.name || 'Hospital'}
              amount={parseFloat(payAmount) || balance}
              billNo={bill.bill_no}
            />
          ))}

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Reference (optional)</label>
            <input
              type="text"
              placeholder={payMethod === 'upi' ? 'UTR / UPI transaction ID' : 'Transaction ID, cheque no…'}
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

      {/* Discount Modal */}
      <Modal
        open={showDiscount}
        onClose={() => { setShowDiscount(false); setAdjError(null) }}
        title="Apply Discount"
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
              onClick={handleDiscount}
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
          <div className="flex gap-2">
            {(['amount', 'percent'] as const).map((m) => (
              <button key={m} onClick={() => setDiscMode(m)}
                className="flex-1 px-3 py-2 rounded-xl text-sm font-medium"
                style={discMode === m
                  ? { background: 'rgba(13,148,136,0.1)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }
                  : { background: 'transparent', color: '#64748B', border: '1px solid #E2E8F0' }}>
                {m === 'amount' ? 'Amount (₹)' : 'Percent (%)'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>
              {discMode === 'amount' ? 'Discount amount (₹)' : 'Discount percent (%)'}
            </label>
            <input
              type="number" min={0} step={discMode === 'percent' ? 0.5 : 1} value={discountVal}
              onChange={(e) => setDiscountVal(e.target.value)} autoFocus
              className="w-full px-3 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Reason</label>
            <Select value={discReason} onChange={(e) => setDiscReason(e.target.value)}>
              {['Camp', 'Staff', 'Senior citizen', 'Charity', 'Management', 'Other'].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <div className="text-sm" style={{ color: '#64748B' }}>
            New total: <Money
              amount={Math.max(0, bill.subtotal - (discMode === 'amount' ? (parseFloat(discountVal) || 0) : bill.subtotal * (parseFloat(discountVal) || 0) / 100) + (bill.tax ?? 0))}
              className="font-semibold"
            />
          </div>
          <p className="text-xs" style={{ color: '#94A3B8' }}>
            If the discount is above your limit, it will be sent to an administrator for approval.
          </p>
        </div>
      </Modal>

      {/* Refund / Credit Note Modal */}
      <Modal
        open={showRefund}
        onClose={() => { setShowRefund(false); setRefundErr(null) }}
        title="Refund / Credit Note"
        maxWidth="26rem"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowRefund(false)} className="px-4 py-2.5 rounded-xl text-sm" style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>Cancel</button>
            <button onClick={handleRefund} disabled={refundBusy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: refundBusy ? '#94A3B8' : '#B45309', minHeight: '44px' }}>
              {refundBusy && <Loader2 className="w-4 h-4 animate-spin" />} Issue Refund
            </button>
          </div>
        }>
        <div className="space-y-4">
          {refundErr && <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{refundErr}</div>}
          <p className="text-sm" style={{ color: '#64748B' }}>Refundable: <span style={{ fontWeight: 700, color: '#0F172A' }}>{fmt(refundable)}</span></p>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Refund amount (₹)</label>
            <input type="number" min={0.01} max={refundable} step={0.01} value={refundAmt} autoFocus
              onChange={(e) => setRefundAmt(e.target.value)}
              className="w-full px-3 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Refund method</label>
            <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="bank_transfer">Bank Transfer</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>Reason</label>
            <input type="text" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="e.g. Cancelled test, overpayment"
              className="w-full px-3 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }} onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }} />
          </div>
          <p className="text-xs" style={{ color: '#94A3B8' }}>Records a credit note against this bill. The original bill stays unchanged; cash refunds appear in the Cash Book.</p>
        </div>
      </Modal>

      {/* Per-line GST / HSN Modal */}
      <Modal
        open={!!gstEdit}
        onClose={() => { setGstEdit(null); setGstEditError(null) }}
        title="Edit GST / HSN"
        maxWidth="26rem"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setGstEdit(null)}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px' }}>
              Cancel
            </button>
            <button onClick={handleGstSave} disabled={gstEditLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: gstEditLoading ? '#94A3B8' : '#0D9488', minHeight: '44px' }}>
              {gstEditLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        }
      >
        {gstEdit && (
          <div className="space-y-4">
            {gstEditError && (
              <div className="px-3 py-2 rounded-xl text-sm" style={{ background: '#FEF2F2', color: '#EF4444' }}>{gstEditError}</div>
            )}
            <p className="text-sm" style={{ color: '#475569' }}>{gstEdit.description}</p>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>GST Rate</label>
              <Select value={gstEdit.gst_rate} onChange={(e) => setGstEdit({ ...gstEdit, gst_rate: e.target.value })}>
                <option value="0">Exempt (0%)</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#475569' }}>HSN / SAC Code</label>
              <input
                type="text"
                value={gstEdit.hsn_sac}
                onChange={(e) => setGstEdit({ ...gstEdit, hsn_sac: e.target.value })}
                placeholder="e.g. 30049099"
                className="w-full px-3 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
              />
            </div>
            <p className="text-xs" style={{ color: '#94A3B8' }}>
              Pharmacy lines are treated as GST-inclusive (tax is within the price); other lines add GST on top.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
