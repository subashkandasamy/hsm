'use client'

import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, Receipt, LayoutList, Users,
  Wallet, AlertCircle, ChevronDown, ChevronRight, BedDouble, FileText,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import Link from 'next/link'
import { listBills, getBillingStats, cancelBill } from '@/app/actions/billing'
import { collectAdvanceDeposit, listAllAdvanceDeposits, applyAdvanceToBill, recordAdvance, listAdvanceSummariesBatch, issueAdvanceRefundBill } from '@/app/actions/admissionBilling'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { Bill, AdvanceDepositRequest } from '@/lib/types'
import BillBuilderModal from './BillBuilderModal'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

const STATUS_MAP: Record<string, string> = {
  draft:     'info',
  unpaid:    'danger',
  partial:   'pending',
  paid:      'success',
  cancelled: 'cancelled',
}

function fmtCompact(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  if (amount >= 1000) return `₹${Math.round(amount / 1000)}K`
  return `₹${Math.round(amount)}`
}

// Labels for auto-generated IPD bills (bill_source column)
const BILL_SOURCE_LABELS: Record<string, string> = {
  bed:                'Room Rent',
  lab:                'Lab',
  radiology:          'Radiology',
  ipd_pharmacy:       'Pharmacy (Ward)',
  nursing:            'Nursing',
  nursing_morning:    'Nursing AM',
  nursing_night:      'Nursing Night',
  consolidated:       'Consolidated',
  ot:                 'Surgery (OT)',
  advance_refund:     'Advance Refund',
  appointment_refund: 'Appt. Refund',
}

// Labels for individual bill_items sources (used to derive content of OPD bills)
const ITEM_SOURCE_LABELS: Record<string, string> = {
  consultation:      'Consultation',
  bed:               'Room Rent',
  lab:               'Lab',
  radiology:         'Radiology',
  pharmacy:          'Pharmacy',
  ipd_pharmacy:      'Pharmacy (Ward)',
  pharmacy_sale_item:'Pharmacy',
  ot:                'OT',
  ot_consumable:     'OT',
  blood:             'Blood Bank',
  dental:            'Dental',
  nursing:           'Nursing',
  nursing_morning:   'Nursing AM',
  nursing_night:     'Nursing Night',
  manual:            'Manual',
}

const BILL_SOURCE_COLORS: Record<string, { background: string; color: string }> = {
  bed:               { background: '#F0FDF4', color: '#16A34A' },
  lab:               { background: '#EFF6FF', color: '#2563EB' },
  radiology:         { background: '#FDF4FF', color: '#9333EA' },
  ipd_pharmacy:      { background: '#FFF7ED', color: '#C2410C' },
  nursing:           { background: '#FFF1F2', color: '#BE123C' },
  nursing_morning:   { background: '#F0FDF4', color: '#0D9488' },
  nursing_night:     { background: '#EEF2FF', color: '#4338CA' },
  consolidated:      { background: '#FAF5FF', color: '#7C3AED' },
  consultation:      { background: '#F0FDF4', color: '#0D9488' },
  pharmacy:          { background: '#FFF7ED', color: '#C2410C' },
  ot:                { background: '#FEF9C3', color: '#A16207' },
  blood:             { background: '#FFF1F2', color: '#BE123C' },
  dental:            { background: '#F0F9FF', color: '#0369A1' },
  manual:             { background: '#F8FAFC', color: '#475569' },
  mixed:              { background: '#F1F5F9', color: '#475569' },
  advance_refund:     { background: '#F0FDF4', color: '#16A34A' },
  appointment_refund: { background: '#F0FDF4', color: '#16A34A' },
}

// Derive a display label + color key from bill_source (IPD auto-bills)
// or from bill_items sources (OPD / manual bills)
function getBillLabel(bill: Bill): { label: string; colorKey: string } | null {
  // IPD auto-generated bills have a known bill_source
  if (bill.bill_source && BILL_SOURCE_LABELS[bill.bill_source]) {
    return { label: BILL_SOURCE_LABELS[bill.bill_source], colorKey: bill.bill_source }
  }
  // For OPD / manual bills, derive from item sources
  const items = (bill as unknown as { items?: Array<{ source: string }> }).items
  if (!items?.length) return null
  const unique = [...new Set(items.map((i) => i.source))]
    .filter((s) => s !== 'ot_consumable' && s !== 'pharmacy_sale_item')  // dedupe sub-sources
  const deduped = [...new Set(unique.map((s) => ITEM_SOURCE_LABELS[s] ?? s))]
  if (deduped.length === 0) return null
  if (deduped.length === 1) return { label: deduped[0], colorKey: unique[0] }
  return { label: deduped.join(' · '), colorKey: 'mixed' }
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const

interface BillingStats {
  todayBilled: number
  todayCollected: number
  collectedPayments?: number
  collectedAdvances?: number
  collectedRefunds?: number
  todayOutstanding: number
  pastOutstanding: number
}

interface AdvanceSummary { totalCollected: number; totalApplied: number; netBalance: number; admissionStatus: string | null; hasRefundBill: boolean }

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function getMonthLabel(key: string): string {
  const [yr, mo] = key.split('-')
  return new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

interface OpdVisitSection {
  visitKey: string          // visit_id | appointment_id | date — dedup key
  visitId: string | null
  appointmentId: string | null
  visitDate: string         // YYYY-MM-DD for display
  isEmergency: boolean
  bills: Bill[]
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
}
interface IpdSection {
  admissionId: string
  bills: Bill[]
  deposits: AdvanceDepositRequest[]
  advanceSummary: AdvanceSummary | null
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
}
interface MonthSection {
  monthKey: string
  monthLabel: string
  opdVisits: OpdVisitSection[]
  ipd: IpdSection[]
}
interface PatientGroup {
  patientId: string
  patientName: string
  uhid: string
  months: MonthSection[]
  deposits: AdvanceDepositRequest[]
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
  pendingAdvance: number
  admissionId: string | null
  advanceSummary: AdvanceSummary | null
}

interface Props {
  initialBills: Bill[]
  initialStats: BillingStats
  initialDeposits: AdvanceDepositRequest[]
  initialAdvanceSummaries: Record<string, AdvanceSummary>
}

type ViewMode = 'list' | 'patient'

export default function BillingClient({ initialBills, initialStats, initialDeposits, initialAdvanceSummaries }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite   = !!role && hasPermission(role, 'billing:write')
  const canAdvance = !!role && hasPermission(role, 'billing:advance')
  const canManage  = !!role && hasPermission(role, 'billing:manage')
  const isReadOnly = useIsReadOnly()
  const router = useRouter()

  const [bills, setBills]       = useState(initialBills)
  const [stats, setStats]       = useState(initialStats)
  const [deposits, setDeposits] = useState(initialDeposits)
  const [advanceSummaries, setAdvanceSummaries] = useState(initialAdvanceSummaries)
  const [loading, setLoading]   = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]     = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('patient')
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())
  const [expandedMonths,   setExpandedMonths]   = useState<Set<string>>(new Set())
  const [expandedOPD,      setExpandedOPD]      = useState<Set<string>>(new Set())
  const [expandedIPD,      setExpandedIPD]      = useState<Set<string>>(new Set())
  const [historyOpen,      setHistoryOpen]      = useState(false)
  // Advance collection state
  const [collectingId, setCollectingId]     = useState<string | null>(null)
  // Top-up advance state
  const [topUpAdmissionId, setTopUpAdmissionId]   = useState<string | null>(null)
  const [topUpAmount, setTopUpAmount]             = useState('')
  const [topUpMethod, setTopUpMethod]             = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash')
  const [topUpPending, setTopUpPending]           = useState(false)
  const [topUpError, setTopUpError]               = useState('')
  const [collectMethod, setCollectMethod]   = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash')
  const [collectError, setCollectError]     = useState('')
  const [collectPending, setCollectPending] = useState(false)
  // Apply advance state
  const [applyingBillId, setApplyingBillId] = useState<string | null>(null)
  // Inline cancel state: null | billId being cancelled | `${billId}:confirm` awaiting confirm
  const [cancelState, setCancelState] = useState<string | null>(null)
  // Refund state
  const [refundAdmissionId, setRefundAdmissionId] = useState<string | null>(null)
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash')
  const [refundRef, setRefundRef]       = useState('')
  const [refundPending, setRefundPending] = useState(false)
  const [refundError, setRefundError]   = useState('')

  async function handleRefund(admissionId: string) {
    setRefundPending(true); setRefundError('')
    const res = await issueAdvanceRefundBill({ admissionId, method: refundMethod, reference: refundRef || undefined })
    setRefundPending(false)
    if (!res.success) { setRefundError(res.error); return }
    setRefundAdmissionId(null); setRefundRef('')
    await refresh()
    // Open the refund bill print page
    window.open(`/billing/${res.billId}`, '_blank')
  }

  async function refresh() {
    setLoading(true)
    const [data, newStats, newDeposits] = await Promise.all([
      listBills(), getBillingStats(), listAllAdvanceDeposits(),
    ])
    setBills(data)
    setStats(newStats)
    setDeposits(newDeposits)
    const admissionIds = [...new Set([
      ...data.filter((b) => b.admission_id).map((b) => b.admission_id!),
      ...newDeposits.filter((d) => d.admission_id).map((d) => d.admission_id!),
    ])]
    if (admissionIds.length > 0) {
      const summaries = await listAdvanceSummariesBatch(admissionIds)
      setAdvanceSummaries(summaries)
    }
    setLoading(false)
  }

  async function handleTopUp(admissionId: string) {
    const amount = parseFloat(topUpAmount)
    if (!amount || amount <= 0) { setTopUpError('Enter a valid amount'); return }
    setTopUpPending(true)
    setTopUpError('')
    const res = await recordAdvance({ admissionId, amount, method: topUpMethod })
    setTopUpPending(false)
    if (!res.success) { setTopUpError(res.error); return }
    setTopUpAdmissionId(null)
    setTopUpAmount('')
    refresh()
  }

  async function handleCollect(requestId: string) {
    setCollectPending(true)
    setCollectError('')
    const res = await collectAdvanceDeposit(requestId, collectMethod)
    setCollectPending(false)
    if (!res.success) { setCollectError(res.error); return }
    // Mark it collected in local state
    setDeposits((prev) =>
      prev.map((d) => d.id === requestId ? { ...d, status: 'collected', method: collectMethod } : d)
    )
    setCollectingId(null)
    const [newStats] = await Promise.all([getBillingStats()])
    setStats(newStats)
  }

  async function handleApplyAdvance(e: React.MouseEvent, billId: string, admissionId: string) {
    e.stopPropagation()
    setApplyingBillId(billId)
    const res = await applyAdvanceToBill(billId, admissionId)
    setApplyingBillId(null)
    if (!res.success) alert(res.error ?? 'Failed to apply advance')
    else refresh()
  }

  async function handleCancelBill(e: React.MouseEvent, billId: string) {
    e.stopPropagation()
    if (cancelState === `${billId}:confirm`) {
      // Second click — actually cancel
      setCancelState(billId)
      const res = await cancelBill(billId)
      setCancelState(null)
      if (!res.success) alert(res.error)
      else refresh()
    } else {
      // First click — ask for confirmation inline
      setCancelState(`${billId}:confirm`)
      // Auto-dismiss after 3 s if no second click
      setTimeout(() => setCancelState((s) => s === `${billId}:confirm` ? null : s), 3000)
    }
  }

  function toggle(set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) {
    set((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function togglePatient(id: string) { toggle(setExpandedPatients, id) }
  function toggleMonth(key: string)   { toggle(setExpandedMonths,   key) }
  function toggleOPD(key: string)     { toggle(setExpandedOPD,      key) }
  function toggleIPD(key: string)     { toggle(setExpandedIPD,      key) }

  // ── Patient groups: Patient → Month → OPD / IPD ─────────────────────────────
  const patientGroups = useMemo<PatientGroup[]>(() => {
    const patMap = new Map<string, PatientGroup>()

    function getPat(pid: string, name: string, uhid: string): PatientGroup {
      if (!patMap.has(pid)) {
        patMap.set(pid, {
          patientId: pid, patientName: name, uhid,
          months: [], deposits: [],
          totalBilled: 0, totalPaid: 0, totalOutstanding: 0,
          pendingAdvance: 0, admissionId: null, advanceSummary: null,
        })
      }
      return patMap.get(pid)!
    }

    function getMonth(pat: PatientGroup, dateStr: string): MonthSection {
      const key = getMonthKey(dateStr)
      let m = pat.months.find((x) => x.monthKey === key)
      if (!m) {
        m = { monthKey: key, monthLabel: getMonthLabel(key), opdVisits: [], ipd: [] }
        pat.months.push(m)
      }
      return m
    }

    function getOpdVisit(month: MonthSection, visitId: string | null, appointmentId: string | null, dateStr: string, isEmergency = false): OpdVisitSection {
      const visitKey = visitId ?? appointmentId ?? dateStr.slice(0, 10)
      let v = month.opdVisits.find((x) => x.visitKey === visitKey)
      if (!v) {
        v = { visitKey, visitId, appointmentId, visitDate: dateStr.slice(0, 10), isEmergency, bills: [], totalBilled: 0, totalPaid: 0, totalOutstanding: 0 }
        month.opdVisits.push(v)
      }
      return v
    }

    function getIpd(month: MonthSection, admissionId: string): IpdSection {
      let ipd = month.ipd.find((x) => x.admissionId === admissionId)
      if (!ipd) {
        ipd = { admissionId, bills: [], deposits: [], advanceSummary: null,
          totalBilled: 0, totalPaid: 0, totalOutstanding: 0 }
        month.ipd.push(ipd)
      }
      return ipd
    }

    // Place bills
    for (const bill of bills) {
      const pid = (bill as unknown as { patient_id: string }).patient_id
      if (!pid) continue
      const isCancelled = bill.status === 'cancelled'
      // Refund bills are accounting reversals — exclude from all summary totals
      const isRefundBill = bill.bill_source === 'appointment_refund' || bill.bill_source === 'advance_refund'
      const pat = getPat(pid, bill.patient?.full_name ?? 'Unknown', bill.patient?.uhid ?? '')
      const month = getMonth(pat, bill.created_at)

      if (!isCancelled && !isRefundBill) {
        pat.totalBilled      += bill.total
        pat.totalPaid        += bill.paid
        pat.totalOutstanding += Math.max(0, bill.total - bill.paid)
      }
      if (bill.admission_id && !pat.admissionId) pat.admissionId = bill.admission_id

      if (bill.admission_id) {
        const ipd = getIpd(month, bill.admission_id)
        ipd.bills.push(bill)
        if (!isCancelled && !isRefundBill) {
          ipd.totalBilled      += bill.total
          ipd.totalPaid        += bill.paid
          ipd.totalOutstanding += Math.max(0, bill.total - bill.paid)
        }
      } else {
        const bVisitId = bill.visit_id as string | null
        const bApptId  = (bill as unknown as { appointment_id: string | null }).appointment_id
        const isEmergencyVisit = (bill as any).visit?.type === 'emergency'
        const opdVisit = getOpdVisit(month, bVisitId, bApptId, bill.created_at, isEmergencyVisit)
        opdVisit.bills.push(bill)
        if (!isCancelled && !isRefundBill) {
          opdVisit.totalBilled      += bill.total
          opdVisit.totalPaid        += bill.paid
          opdVisit.totalOutstanding += Math.max(0, bill.total - bill.paid)
        }
      }
    }

    // Place deposits
    for (const dep of deposits) {
      const pid = dep.patient_id
      if (!pid) continue
      const pat = patMap.has(pid)
        ? patMap.get(pid)!
        : getPat(pid, dep.patient?.full_name ?? 'Unknown', dep.patient?.uhid ?? '')

      pat.deposits.push(dep)
      if (dep.status === 'pending') pat.pendingAdvance += dep.amount
      if (!pat.admissionId && dep.admission_id) pat.admissionId = dep.admission_id

      if (dep.admission_id) {
        // Find existing IPD section for this admission across all months
        let ipdSection: IpdSection | null = null
        for (const m of pat.months) {
          const found = m.ipd.find((x) => x.admissionId === dep.admission_id)
          if (found) { ipdSection = found; break }
        }
        if (!ipdSection) {
          // No bills for this admission yet — create month+section from deposit date
          const month = getMonth(pat, dep.created_at)
          ipdSection = getIpd(month, dep.admission_id)
        }
        ipdSection.deposits.push(dep)
      }
    }

    // Attach advance summaries, sort bills, sort months desc
    for (const pat of patMap.values()) {
      if (pat.admissionId && advanceSummaries[pat.admissionId]) {
        pat.advanceSummary = advanceSummaries[pat.admissionId]
      }
      for (const month of pat.months) {
        for (const ov of month.opdVisits) {
          ov.bills.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        }
        // Sort visits newest first (by visitDate)
        month.opdVisits.sort((a, b) => b.visitDate.localeCompare(a.visitDate))
        for (const ipd of month.ipd) {
          ipd.bills.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          if (advanceSummaries[ipd.admissionId]) {
            ipd.advanceSummary = advanceSummaries[ipd.admissionId]
          }
        }
      }
      pat.months.sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    }

    return Array.from(patMap.values()).sort((a, b) => {
      const aUrgent = (a.pendingAdvance > 0 ? 2 : 0) + (a.totalOutstanding > 0 ? 1 : 0)
      const bUrgent = (b.pendingAdvance > 0 ? 2 : 0) + (b.totalOutstanding > 0 ? 1 : 0)
      return bUrgent - aUrgent || b.totalOutstanding - a.totalOutstanding
    })
  }, [bills, deposits, advanceSummaries])

  // The combined-bill builders skip `consolidated` bills, so a group holding
  // nothing else has no summary to render and its link would 404. Cancelled bills
  // DO render (struck through), so they still count as renderable here.
  function hasRenderableBills(bills: Bill[]): boolean {
    return bills.some((b) => b.bill_source !== 'consolidated')
  }

  function allGroupBills(g: PatientGroup): Bill[] {
    return g.months.flatMap((m) => [
      ...m.opdVisits.flatMap((v) => v.bills),
      ...m.ipd.flatMap((x) => x.bills),
    ])
  }

  const filteredGroups = useMemo(() => {
    const byStatus = statusFilter === 'all'
      ? patientGroups
      : patientGroups.filter((g) => allGroupBills(g).some((b) => b.status === statusFilter))
    if (!search) return byStatus
    const q = search.toLowerCase()
    return byStatus.filter(
      (g) => g.patientName.toLowerCase().includes(q) || g.uhid.toLowerCase().includes(q)
    )
  }, [patientGroups, statusFilter, search])

  const filtered = useMemo(() =>
    bills.filter((b) => {
      const matchStatus = statusFilter === 'all' || b.status === statusFilter
      const q = search.toLowerCase()
      const matchSearch = !q ||
        b.bill_no.toLowerCase().includes(q) ||
        (b.patient?.full_name ?? '').toLowerCase().includes(q) ||
        (b.patient?.uhid ?? '').toLowerCase().includes(q)
      return matchStatus && matchSearch
    }),
  [bills, statusFilter, search])

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Generate bills, record payments, manage invoices"
        actions={
          canWrite ? (
            <button
              onClick={() => !isReadOnly && setShowBuilder(true)}
              disabled={isReadOnly}
              title={isReadOnly ? 'Renew subscription to create bills' : undefined}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', minHeight: '44px', border: 'none', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
              onMouseEnter={(e) => { if (!isReadOnly) e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
              <Plus className="w-4 h-4" /> New Bill
            </button>
          ) : undefined
        }
      />

      {/* ── Stat cards ── */}
      {(() => {
        const totalOutstanding = (stats.todayOutstanding ?? 0) + (stats.pastOutstanding ?? 0)
        const fmt = (v: number) => `₹${(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 mb-5">
            <StatCard label="Billed Today" value={stats.todayBilled ?? 0}
              sub="Value of new bills raised today"
              icon={<Receipt className="w-4 h-4 sm:w-5 sm:h-5" />} color="#0D9488" />
            <StatCard label="Collected Today" value={stats.todayCollected ?? 0}
              sub={`Payments ${fmt(stats.collectedPayments ?? 0)} · Advances ${fmt(stats.collectedAdvances ?? 0)}${(stats.collectedRefunds ?? 0) > 0 ? ` · Refunds -${fmt(stats.collectedRefunds ?? 0)}` : ''}`}
              icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />} color="#10B981" />
            <StatCard
              label="Outstanding"
              value={totalOutstanding}
              sub={`Today ${fmt(stats.todayOutstanding)} · Past ${fmt(stats.pastOutstanding)}`}
              icon={<AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
              color={totalOutstanding > 0 ? '#EF4444' : '#10B981'}
            />
          </div>
        )
      })()}

      {/* ── Controls ── */}
      <div className="flex flex-col gap-2 mb-4">
        <input
          type="search"
          placeholder="Search patient name or UHID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </Select>

          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1px solid #E2E8F0' }}>
            {([
              { key: 'patient', label: 'By Patient', Icon: Users },
              { key: 'list',    label: 'All Bills',  Icon: LayoutList },
            ] as const).map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setViewMode(key)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium"
                style={viewMode === key
                  ? { background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer', minHeight: '44px' }
                  : { background: 'rgba(255,255,255,0.8)', color: '#64748B', border: 'none', cursor: 'pointer', minHeight: '44px' }}>
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button onClick={refresh} disabled={loading}
            className="flex items-center justify-center px-3 rounded-xl flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px', minWidth: '44px', cursor: 'pointer' }}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── By Patient (grouped) — DEFAULT ── */}
      {viewMode === 'patient' && (() => {
        const todayStr = new Date().toISOString().split('T')[0]
        const isActiveToday = (g: PatientGroup) =>
          g.totalOutstanding > 0 ||
          g.pendingAdvance > 0 ||
          g.advanceSummary?.admissionStatus === 'admitted' ||
          allGroupBills(g).some(b => b.created_at.startsWith(todayStr)) ||
          g.deposits.some(d => d.created_at.startsWith(todayStr))
        const todayGroups   = filteredGroups.filter(isActiveToday)
        const historyGroups = filteredGroups.filter(g => !isActiveToday(g))
        const sorted = [...todayGroups, ...historyGroups]
        const historyStart = todayGroups.length
        return (
        <div className="space-y-3">
          {sorted.length === 0
            ? <GlassCard className="p-8"><EmptyBills /></GlassCard>
            : sorted.map((group, idx) => {
                const expanded           = expandedPatients.has(group.patientId)
                const hasOutstanding    = group.totalOutstanding > 0
                const hasPendingAdv     = group.pendingAdvance > 0
                const adv               = group.advanceSummary
                const advNetBalance     = adv?.netBalance ?? 0
                const advCollected      = adv?.totalCollected ?? 0
                const advExhausted      = advCollected > 0 && advNetBalance <= 0
                const billCount  = allGroupBills(group).length
                const depCount   = group.deposits.length
                const itemLabel  = billCount + depCount === 1 ? 'item' : 'items'

                const isHistoryItem = idx >= historyStart
                if (isHistoryItem && !historyOpen) return [
                  idx === historyStart && historyGroups.length > 0 && (
                    <button key="__sec_history__"
                      onClick={() => setHistoryOpen(true)}
                      className="w-full flex items-center justify-between px-1 py-1 mt-2"
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94A3B8' }}>
                        History ({historyGroups.length})
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                    </button>
                  ),
                ]

                return [
                  idx === 0 && todayGroups.length > 0 && (
                    <div key="__sec_today__" className="flex items-center justify-between px-1">
                      <span className="text-xs font-semibold uppercase tracking-widest"
                        style={{ color: '#0D9488' }}>Active ({todayGroups.length})</span>
                    </div>
                  ),
                  idx === historyStart && historyGroups.length > 0 && (
                    <button key="__sec_history__"
                      onClick={() => setHistoryOpen(false)}
                      className="w-full flex items-center justify-between px-1 py-1 mt-2"
                      style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94A3B8' }}>
                        History ({historyGroups.length})
                      </span>
                      <ChevronDown className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                    </button>
                  ),
                  <GlassCard key={group.patientId} className="overflow-hidden">
                    {/* Patient header row */}
                    <button
                      onClick={() => togglePatient(group.patientId)}
                      className="w-full px-4 py-3 text-left"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>

                      <div className="flex items-start gap-2">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5"
                          style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                          {group.patientName.charAt(0).toUpperCase()}
                        </div>

                        {/* Content — expands to fill, all rows stack here */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: name · uhid · count */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>{group.patientName}</span>
                            <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{group.uhid}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-lg" style={{ background: '#F1F5F9', color: '#64748B' }}>
                              {billCount + depCount} {itemLabel}
                            </span>
                          </div>

                          {/* Row 2: billed · paid */}
                          {billCount > 0 && (
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs" style={{ color: '#64748B' }}>
                                Billed <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={group.totalBilled} /></span>
                              </span>
                              <span style={{ color: '#CBD5E1', fontSize: '10px' }}>·</span>
                              <span className="text-xs" style={{ color: '#64748B' }}>
                                Paid <span className="font-semibold" style={{ color: '#10B981' }}><Money amount={group.totalPaid} /></span>
                              </span>
                            </div>
                          )}

                          {/* Row 3: status chips — compact, all inline */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {hasPendingAdv && (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-semibold"
                                style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
                                Adv {fmtCompact(group.pendingAdvance)} due
                              </span>
                            )}
                            {advExhausted && hasOutstanding && (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }}>
                                Adv overdue
                              </span>
                            )}
                            {hasOutstanding ? (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-bold"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                                {fmtCompact(group.totalOutstanding)} due
                              </span>
                            ) : billCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-bold"
                                style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981', border: '1px solid rgba(16,185,129,0.15)' }}>
                                Cleared
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Lifetime summary + chevron */}
                        <div className="flex-shrink-0 mt-1 flex items-center gap-2" style={{ color: '#94A3B8' }}>
                          {billCount > 0 && hasRenderableBills(allGroupBills(group)) && (
                            <Link href={`/billing/combined/patient/${group.patientId}`}
                              className="flex items-center gap-1 text-xs font-semibold"
                              style={{ color: '#7C3AED', textDecoration: 'none' }}
                              onClick={(e) => e.stopPropagation()}>
                              <FileText className="w-3 h-3" /> Full Summary →
                            </Link>
                          )}
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </button>

                    {/* Expanded: Month → OPD / IPD */}
                    {expanded && (billCount > 0 || depCount > 0) && (
                      <div style={{ borderTop: '1px solid #F1F5F9' }}>
                        {group.months.map((month) => {
                          const monthKey     = `${group.patientId}-${month.monthKey}`
                          const monthOpen    = expandedMonths.has(monthKey)
                          const opdKey       = `${monthKey}-opd`
                          const opdOpen      = expandedOPD.has(opdKey)
                          return (
                          <div key={month.monthKey}>
                            {/* Month header — clickable */}
                            <button
                              onClick={() => toggleMonth(monthKey)}
                              className="w-full px-4 py-3 flex items-center justify-between text-left"
                              style={{ background: 'rgba(248,250,252,0.95)', border: 'none', borderBottom: '1px solid #E2E8F0', cursor: 'pointer' }}>
                              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B', letterSpacing: '0.06em' }}>
                                {month.monthLabel}
                              </span>
                              <div className="flex items-center gap-2">
                                {/* Month-level summary chips */}
                                {(() => {
                                  const mo = month.opdVisits.reduce((s, v) => s + v.totalOutstanding, 0) + month.ipd.reduce((s, x) => s + x.totalOutstanding, 0)
                                  const mb = month.opdVisits.reduce((s, v) => s + v.totalBilled, 0) + month.ipd.reduce((s, x) => s + x.totalBilled, 0)
                                  if (mo > 0) return <span className="text-xs font-semibold" style={{ color: '#EF4444' }}><Money amount={mo} /> due</span>
                                  if (mb > 0) return <span className="text-xs font-semibold" style={{ color: '#10B981' }}>Cleared</span>
                                  return null
                                })()}
                                {monthOpen
                                  ? <ChevronDown className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                                  : <ChevronRight className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />}
                              </div>
                            </button>

                            {monthOpen && (
                            <>
                            {/* ── OPD visits (one sub-section per visit) ── */}
                            {month.opdVisits.map((opdVisit) => {
                              const ovKey  = `${monthKey}-opd-${opdVisit.visitKey}`
                              const ovOpen = expandedOPD.has(ovKey)
                              const ovDate = new Date(opdVisit.visitDate + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                              return (
                              <div key={opdVisit.visitKey}>
                                {/* OPD visit sub-header */}
                                <button
                                  onClick={() => toggleOPD(ovKey)}
                                  className="w-full px-4 py-3 flex items-center justify-between"
                                  style={{ background: 'rgba(240,253,250,0.5)', borderBottom: '1px solid #F1F5F9', border: 'none', cursor: 'pointer' }}>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {opdVisit.isEmergency ? (
                                      <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                                        style={{ background: 'rgba(220,38,38,0.1)', color: '#DC2626' }}>ER</span>
                                    ) : (
                                      <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                                        style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>OPD</span>
                                    )}
                                    <span className="text-xs font-medium" style={{ color: '#475569' }}>{ovDate}</span>
                                    <span className="text-xs" style={{ color: '#94A3B8' }}>{opdVisit.bills.length} bill{opdVisit.bills.length !== 1 ? 's' : ''}</span>
                                    {opdVisit.totalBilled !== 0 && (
                                      <span className="text-xs" style={{ color: '#64748B' }}>
                                        Billed <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={opdVisit.totalBilled} /></span>
                                      </span>
                                    )}
                                    {opdVisit.totalPaid !== 0 && (
                                      <span className="text-xs" style={{ color: '#64748B' }}>
                                        Paid <span className="font-semibold" style={{ color: '#10B981' }}><Money amount={opdVisit.totalPaid} /></span>
                                      </span>
                                    )}
                                    {opdVisit.totalOutstanding > 0 ? (
                                      <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>
                                        <Money amount={opdVisit.totalOutstanding} /> due
                                      </span>
                                    ) : opdVisit.totalBilled > 0 ? (
                                      <span className="text-xs font-semibold" style={{ color: '#10B981' }}>Cleared</span>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {(opdVisit.visitId || opdVisit.appointmentId) && hasRenderableBills(opdVisit.bills) && (
                                      <Link
                                        href={`/billing/combined/visit/${opdVisit.visitId ?? opdVisit.appointmentId}`}
                                        className="flex items-center gap-1 text-xs font-semibold"
                                        style={{ color: '#7C3AED', textDecoration: 'none' }}
                                        onClick={(e) => e.stopPropagation()}>
                                        <FileText className="w-3 h-3" /> Summary →
                                      </Link>
                                    )}
                                    {ovOpen
                                      ? <ChevronDown className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                                      : <ChevronRight className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />}
                                  </div>
                                </button>
                                {ovOpen && (() => {
                                  const refundedApptIds = new Set(
                                    opdVisit.bills
                                      .filter(b => b.bill_source === 'appointment_refund')
                                      .map(b => (b as unknown as { appointment_id: string | null }).appointment_id)
                                      .filter(Boolean) as string[]
                                  )
                                  return opdVisit.bills.map((bill, i) => {
                                  const balance = Math.max(0, bill.total - bill.paid)
                                  const apptId = (bill as unknown as { appointment_id: string | null }).appointment_id
                                  const isApptRefunded = bill.status === 'cancelled'
                                    && bill.paid > 0
                                    && bill.bill_source !== 'appointment_refund'
                                    && !!apptId && refundedApptIds.has(apptId)
                                  return (
                                    <div key={bill.id} className="px-4 py-3 cursor-pointer"
                                      style={{
                                        borderBottom: i < opdVisit.bills.length - 1 ? '1px solid #F8FAFC' : '1px solid #F1F5F9',
                                        background: bill.status === 'cancelled' ? 'rgba(241,245,249,0.4)' : 'rgba(248,250,252,0.5)',
                                        opacity: bill.status === 'cancelled' ? 0.65 : 1,
                                      }}
                                      onClick={() => router.push(`/billing/${bill.id}`)}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.9)' }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = bill.status === 'cancelled' ? 'rgba(241,245,249,0.4)' : 'rgba(248,250,252,0.5)' }}>
                                      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                                        <span className="font-mono text-xs font-semibold"
                                          style={{ color: '#0D9488', textDecoration: bill.status === 'cancelled' ? 'line-through' : 'none' }}>
                                          {bill.bill_no}
                                        </span>
                                        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                          {isApptRefunded
                                            ? <StatusBadge status="success" label="Refunded" />
                                            : <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />}
                                          {canManage && bill.status !== 'cancelled' && bill.status !== 'paid' && bill.paid === 0 && (
                                            <button onClick={(e) => handleCancelBill(e, bill.id)} disabled={cancelState === bill.id}
                                              className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                                              style={cancelState === `${bill.id}:confirm`
                                                ? { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }
                                                : { background: 'transparent', color: '#94A3B8', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                                              {cancelState === bill.id ? '…' : cancelState === `${bill.id}:confirm` ? 'Confirm?' : '✕ Cancel'}
                                            </button>
                                          )}
                                          <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>View</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 text-xs flex-wrap">
                                        <span style={{ color: '#94A3B8' }}><DateText date={bill.created_at} /></span>
                                        {(() => { const bl = getBillLabel(bill); return bl ? (
                                          <span className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                                            style={BILL_SOURCE_COLORS[bl.colorKey] ?? { background: '#F1F5F9', color: '#475569' }}>
                                            {bl.label}
                                          </span>
                                        ) : null })()}
                                        <span style={{ color: '#64748B' }}>Total: <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={bill.total} /></span></span>
                                        {balance > 0
                                          ? <span className="font-semibold" style={{ color: '#EF4444' }}><Money amount={balance} /> due</span>
                                          : <span style={{ color: '#10B981', fontWeight: 600 }}>Cleared</span>}
                                      </div>
                                    </div>
                                  )
                                  })
                                  })()}
                              </div>
                              )
                            })}

                            {/* ── IPD section(s) ── */}
                            {month.ipd.map((ipd) => {
                              const ipdKey  = `${monthKey}-${ipd.admissionId}`
                              const ipdOpen = expandedIPD.has(ipdKey)
                              const ipdAdv = ipd.advanceSummary
                              const ipdAdvNet = ipdAdv?.netBalance ?? 0
                              const ipdAdvCollected = ipdAdv?.totalCollected ?? 0
                              const ipdAdvExhausted = ipdAdvCollected > 0 && ipdAdvNet <= 0
                              const ipdAdvHasBalance = ipdAdvNet > 0
                              const hasCollectedAdv = ipd.deposits.some((d) => d.status === 'collected') || ipdAdvCollected > 0
                              return (
                                <div key={ipd.admissionId}>
                                  {/* IPD sub-header — clickable button */}
                                  <button
                                    onClick={() => toggleIPD(ipdKey)}
                                    className="w-full px-4 py-3 flex items-center justify-between flex-wrap gap-2 text-left"
                                    style={{ background: 'rgba(239,246,255,0.6)', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', border: 'none' }}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                                        style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB' }}>IPD</span>
                                      <span className="text-xs" style={{ color: '#94A3B8' }}>
                                        {ipd.bills.length + ipd.deposits.length} item{ipd.bills.length + ipd.deposits.length !== 1 ? 's' : ''}
                                      </span>
                                      {ipd.totalBilled !== 0 && (
                                        <span className="text-xs" style={{ color: '#64748B' }}>
                                          Billed <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={ipd.totalBilled} /></span>
                                        </span>
                                      )}
                                      {ipd.totalPaid !== 0 && (
                                        <span className="text-xs" style={{ color: '#64748B' }}>
                                          Paid <span className="font-semibold" style={{ color: '#10B981' }}><Money amount={ipd.totalPaid} /></span>
                                        </span>
                                      )}
                                      {ipdAdvHasBalance && !ipdAdv?.hasRefundBill && (
                                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                                          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                                          {fmtCompact(ipdAdvNet)} advance left
                                        </span>
                                      )}
                                      {ipdAdvExhausted && ipd.totalOutstanding > 0 && (
                                        <span className="text-xs font-semibold" style={{ color: '#DC2626' }}>Adv overdue</span>
                                      )}
                                      {ipd.totalOutstanding > 0 ? (
                                        <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>
                                          <Money amount={ipd.totalOutstanding} /> due
                                        </span>
                                      ) : ipd.totalBilled > 0 ? (
                                        <span className="text-xs font-semibold" style={{ color: '#10B981' }}>Cleared</span>
                                      ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {ipd.admissionId && (
                                        <Link href={`/billing/combined/${ipd.admissionId}`}
                                          className="flex items-center gap-1 text-xs font-semibold"
                                          style={{ color: '#7C3AED', textDecoration: 'none' }}
                                          onClick={(e) => e.stopPropagation()}>
                                          <FileText className="w-3 h-3" /> Summary →
                                        </Link>
                                      )}
                                      {ipdOpen
                                        ? <ChevronDown className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                                        : <ChevronRight className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />}
                                    </div>
                                  </button>

                                  {ipdOpen && (
                                    <>
                                      {/* Top-Up Advance */}
                                      {canAdvance && (
                                        <div className="px-4 py-2" style={{ background: 'rgba(240,253,250,0.5)', borderBottom: '1px solid #F1F5F9' }}>
                                          {topUpAdmissionId === ipd.admissionId ? (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {topUpError && <span className="text-xs w-full" style={{ color: '#DC2626' }}>{topUpError}</span>}
                                              <input type="number" placeholder="Amount" value={topUpAmount}
                                                onChange={(e) => setTopUpAmount(e.target.value)}
                                                className="px-2 py-1 rounded-lg text-xs"
                                                style={{ width: '80px', border: '1px solid #CBD5E1', background: '#fff', outline: 'none' }} />
                                              <Select value={topUpMethod} onChange={(e) => setTopUpMethod(e.target.value as typeof topUpMethod)} style={{ minWidth: '90px' }}>
                                                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                              </Select>
                                              <button onClick={() => handleTopUp(ipd.admissionId)} disabled={topUpPending}
                                                className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                                                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                                {topUpPending ? '…' : 'Record'}
                                              </button>
                                              <button onClick={() => { setTopUpAdmissionId(null); setTopUpAmount(''); setTopUpError('') }}
                                                className="px-2 py-1 rounded-lg text-xs"
                                                style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>✕</button>
                                            </div>
                                          ) : (
                                            <button onClick={() => { setTopUpAdmissionId(ipd.admissionId); setTopUpAmount(''); setTopUpError('') }}
                                              className="flex items-center gap-1 text-xs font-semibold"
                                              style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', padding: 0 }}>
                                              + Top Up Advance
                                            </button>
                                          )}
                                        </div>
                                      )}

                                      {/* Advance deposit rows */}
                                      {ipd.deposits.map((dep) => {
                                        const isPending   = dep.status === 'pending'
                                        const isCollected = dep.status === 'collected'
                                        const isCollecting = collectingId === dep.id
                                        return (
                                          <div key={dep.id} className="px-4 py-3"
                                            style={{ background: isPending ? 'rgba(254,243,199,0.4)' : 'rgba(240,253,250,0.4)', borderBottom: '1px solid #F1F5F9' }}>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <BedDouble className="w-4 h-4 flex-shrink-0" style={{ color: isPending ? '#D97706' : '#0D9488' }} />
                                              <span className="text-xs font-semibold flex-1" style={{ color: '#0F172A' }}>IPD Advance Deposit</span>
                                              <span className="text-xs px-1.5 py-0.5 rounded-md font-medium flex-shrink-0"
                                                style={isPending ? { background: '#FEF3C7', color: '#92400E' } : isCollected ? { background: 'rgba(16,185,129,0.1)', color: '#065F46' } : { background: '#F1F5F9', color: '#64748B' }}>
                                                {dep.status}
                                              </span>
                                              <Money amount={dep.amount} className="font-bold flex-shrink-0"
                                                style={{ color: isPending ? '#D97706' : '#0D9488', fontSize: '0.95rem' }} />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap" style={{ paddingLeft: '20px' }}>
                                              {dep.method && <span className="text-xs" style={{ color: '#94A3B8' }}>{dep.method}</span>}
                                              {(dep.admission?.ward?.name || dep.admission?.bed?.bed_no) && (
                                                <span className="text-xs" style={{ color: '#94A3B8' }}>
                                                  · {dep.admission?.ward?.name}{dep.admission?.bed?.bed_no ? ` — Bed ${dep.admission.bed.bed_no}` : ''}
                                                </span>
                                              )}
                                              {isCollected && dep.admission_id && (
                                                <Link href={`/billing/advance-receipt/${dep.admission_id}`}
                                                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                  style={{ background: '#F0FDF4', color: '#0D9488', border: '1px solid #D1FAE5', textDecoration: 'none' }}>
                                                  🖨 Receipt
                                                </Link>
                                              )}
                                              {isCollected && dep.admission_id && ipdAdv && (() => {
                                                const isDischarged = ipdAdv.admissionStatus === 'discharged'
                                                const refundDue = ipdAdv.netBalance
                                                if (ipdAdv.hasRefundBill) return (
                                                  <span className="text-xs px-2 py-1 rounded-md font-semibold flex-shrink-0"
                                                    style={{ background: '#F0FDF4', color: '#16A34A', border: '1px solid #D1FAE5' }}>Refunded ✓</span>
                                                )
                                                if (isDischarged && refundDue > 0.01) {
                                                  return refundAdmissionId === dep.admission_id ? (
                                                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap w-full mt-2">
                                                      <span className="text-xs font-semibold w-full" style={{ color: '#DC2626' }}>Issue Refund — <Money amount={refundDue} /></span>
                                                      {refundError && <span className="text-xs w-full" style={{ color: '#DC2626' }}>{refundError}</span>}
                                                      <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)} style={{ minWidth: '120px' }}>
                                                        {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                      </Select>
                                                      <input type="text" placeholder="Ref # (optional)" value={refundRef} onChange={(e) => setRefundRef(e.target.value)}
                                                        className="px-2 py-1 rounded-lg text-xs" style={{ width: '130px', border: '1px solid #CBD5E1', background: '#fff', outline: 'none' }} />
                                                      <button onClick={() => handleRefund(dep.admission_id!)} disabled={refundPending}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                        style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                                        {refundPending ? '…' : 'Confirm Refund'}
                                                      </button>
                                                      <button onClick={() => { setRefundAdmissionId(null); setRefundError('') }}
                                                        className="px-2 py-1.5 rounded-lg text-xs"
                                                        style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>Cancel</button>
                                                    </div>
                                                  ) : (
                                                    <button onClick={() => { setRefundAdmissionId(dep.admission_id!); setRefundError(''); setRefundMethod('cash'); setRefundRef('') }}
                                                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                                                      Issue Refund <Money amount={refundDue} />
                                                    </button>
                                                  )
                                                }
                                                return null
                                              })()}
                                              {isPending && canAdvance && (
                                                isCollecting ? (
                                                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                                    {collectError && <span className="text-xs w-full" style={{ color: '#DC2626' }}>{collectError}</span>}
                                                    <Select value={collectMethod} onChange={(e) => setCollectMethod(e.target.value as typeof collectMethod)} style={{ minWidth: '110px' }}>
                                                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                    </Select>
                                                    <button onClick={() => handleCollect(dep.id)} disabled={collectPending}
                                                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                      style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                                      {collectPending ? '…' : 'Confirm'}
                                                    </button>
                                                    <button onClick={() => { setCollectingId(null); setCollectError('') }}
                                                      className="px-2 py-1.5 rounded-lg text-xs"
                                                      style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>Cancel</button>
                                                  </div>
                                                ) : (
                                                  <button onClick={() => { setCollectingId(dep.id); setCollectMethod('cash'); setCollectError('') }}
                                                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                                                    style={{ background: '#D97706', color: '#fff', border: 'none', cursor: 'pointer' }}>Collect</button>
                                                )
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}

                                      {/* IPD bill rows */}
                                      {ipd.bills.map((bill, i) => {
                                        const balance = Math.max(0, bill.total - bill.paid)
                                        const canApply = canAdvance && ipdAdvHasBalance && balance > 0
                                          && (bill.status === 'unpaid' || bill.status === 'partial' || bill.status === 'draft')
                                        return (
                                          <div key={bill.id} className="px-4 py-3 cursor-pointer"
                                            style={{
                                              borderBottom: i < ipd.bills.length - 1 ? '1px solid #F8FAFC' : '1px solid #F1F5F9',
                                              background: bill.status === 'cancelled' ? 'rgba(241,245,249,0.4)' : 'rgba(248,250,252,0.5)',
                                              opacity: bill.status === 'cancelled' ? 0.65 : 1,
                                            }}
                                            onClick={() => router.push(`/billing/${bill.id}`)}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.9)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = bill.status === 'cancelled' ? 'rgba(241,245,249,0.4)' : 'rgba(248,250,252,0.5)' }}>
                                            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                                              <span className="font-mono text-xs font-semibold"
                                                style={{ color: '#0D9488', textDecoration: bill.status === 'cancelled' ? 'line-through' : 'none' }}>
                                                {bill.bill_no}
                                              </span>
                                              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                                {canApply && (
                                                  <button onClick={(e) => handleApplyAdvance(e, bill.id, ipd.admissionId)} disabled={applyingBillId === bill.id}
                                                    className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                                                    style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', cursor: 'pointer' }}>
                                                    {applyingBillId === bill.id ? 'Applying…' : '↳ Adjust Advance'}
                                                  </button>
                                                )}
                                                <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                                                {canManage && bill.status !== 'cancelled' && bill.status !== 'paid' && (
                                                  <button onClick={(e) => handleCancelBill(e, bill.id)} disabled={cancelState === bill.id}
                                                    className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                                                    style={cancelState === `${bill.id}:confirm`
                                                      ? { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }
                                                      : { background: 'transparent', color: '#94A3B8', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                                                    {cancelState === bill.id ? '…' : cancelState === `${bill.id}:confirm` ? 'Confirm?' : '✕ Cancel'}
                                                  </button>
                                                )}
                                                <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>View</span>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs flex-wrap">
                                              <span style={{ color: '#94A3B8' }}><DateText date={bill.created_at} /></span>
                                              {(() => { const bl = getBillLabel(bill); return bl ? (
                                                <span className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                                                  style={BILL_SOURCE_COLORS[bl.colorKey] ?? { background: '#F1F5F9', color: '#475569' }}>
                                                  {bl.label}
                                                </span>
                                              ) : null })()}
                                              <span style={{ color: '#64748B' }}>Total: <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={bill.total} /></span></span>
                                              {balance > 0
                                                ? <span className="font-semibold" style={{ color: '#EF4444' }}><Money amount={balance} /> due</span>
                                                : <span style={{ color: '#10B981', fontWeight: 600 }}>Cleared</span>}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </>
                                  )}
                                </div>
                              )
                            })}
                            </>
                            )}
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </GlassCard>,
                ]
              })
          }
        </div>
        )
      })()}

      {/* ── All Bills flat list ── */}
      {viewMode === 'list' && (
        <GlassCard>
          {/* Mobile */}
          <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
            {filtered.length === 0 ? <EmptyBills /> : filtered.map((bill) => {
              const balance = Math.max(0, bill.total - bill.paid)
              return (
                <div key={bill.id} className="px-4 py-3.5 cursor-pointer"
                  onClick={() => router.push(`/billing/${bill.id}`)}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-mono text-sm font-semibold" style={{ color: '#0D9488' }}>{bill.bill_no}</p>
                    <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <p className="text-xs" style={{ color: '#64748B' }}>
                      {bill.patient?.full_name} · {bill.patient?.uhid}
                    </p>
                    {(() => {
                      const bl = getBillLabel(bill)
                      return bl ? (
                        <span className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                          style={BILL_SOURCE_COLORS[bl.colorKey] ?? { background: '#F1F5F9', color: '#475569' }}>
                          {bl.label}
                        </span>
                      ) : null
                    })()}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: '#64748B' }}>
                      Total: <Money amount={bill.total} className="font-semibold" style={{ color: '#0F172A' }} />
                      {' '}&nbsp;<DateText date={bill.created_at} />
                    </span>
                    <span style={{ color: balance > 0 ? '#EF4444' : '#10B981', fontWeight: 600 }}>
                      {balance > 0 ? <>Due: <Money amount={balance} /></> : 'Cleared'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'rgba(248,250,252,0.8)', borderBottom: '1px solid #E2E8F0' }}>
                  {['Bill No', 'Patient', 'Date', 'Total', 'Paid', 'Balance', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={8}><EmptyBills /></td></tr>
                  : filtered.map((bill, i) => {
                      const balance = Math.max(0, bill.total - bill.paid)
                      return (
                        <tr key={bill.id} className="cursor-pointer"
                          style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                          onClick={() => router.push(`/billing/${bill.id}`)}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.6)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                          <td className="px-4 py-3">
                            <p className="font-mono text-xs font-medium" style={{ color: '#0D9488' }}>{bill.bill_no}</p>
                            {(() => {
                              const bl = getBillLabel(bill)
                              return bl ? (
                                <span className="mt-0.5 inline-block px-1.5 py-0.5 rounded-md text-xs font-medium"
                                  style={BILL_SOURCE_COLORS[bl.colorKey] ?? { background: '#F1F5F9', color: '#475569' }}>
                                  {bl.label}
                                </span>
                              ) : null
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <p style={{ color: '#0F172A' }}>{bill.patient?.full_name}</p>
                            <p className="text-xs" style={{ color: '#94A3B8' }}>{bill.patient?.uhid}</p>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}><DateText date={bill.created_at} /></td>
                          <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}><Money amount={bill.total} /></td>
                          <td className="px-4 py-3" style={{ color: '#10B981' }}><Money amount={bill.paid} /></td>
                          <td className="px-4 py-3 font-medium" style={{ color: balance > 0 ? '#EF4444' : '#10B981' }}><Money amount={balance} /></td>
                          <td className="px-4 py-3"><StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} /></td>
                          <td className="px-4 py-3">
                            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>View</span>
                          </td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {showBuilder && (
        <BillBuilderModal
          onClose={() => setShowBuilder(false)}
          onGenerated={(billId) => { setShowBuilder(false); router.push(`/billing/${billId}`) }}
        />
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function StatCard({ label, value = 0, icon, color, sub }: {
  label: string; value?: number; icon: React.ReactNode; color: string; sub?: string
}) {
  return (
    <div className="p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4"
      style={{ background: `${color}0d`, border: `1px solid ${color}20` }}>
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-tight" style={{ color: '#64748B' }}>{label}</p>
        <p className="text-base sm:text-xl font-bold mt-0.5 truncate" style={{ color }}>
          ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </p>
        {sub && <p className="text-xs mt-0.5 truncate" style={{ color: '#94A3B8' }}>{sub}</p>}
      </div>
    </div>
  )
}

function EmptyBills() {
  return (
    <div className="px-4 py-10 flex flex-col items-center gap-2" style={{ color: '#94A3B8' }}>
      <Receipt className="w-8 h-8 opacity-30" />
      <p className="text-sm">No bills found</p>
    </div>
  )
}
