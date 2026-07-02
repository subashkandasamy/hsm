'use client'

import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, Receipt, LayoutList, Users,
  Wallet, AlertCircle, ChevronDown, ChevronRight, BedDouble,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { listBills, getBillingStats } from '@/app/actions/billing'
import { collectAdvanceDeposit, listAllAdvanceDeposits, applyAdvanceToBill, recordAdvance, listAdvanceSummariesBatch } from '@/app/actions/admissionBilling'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { Bill, AdvanceDepositRequest } from '@/lib/types'
import BillBuilderModal from './BillBuilderModal'

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

const BILL_SOURCE_LABELS: Record<string, string> = {
  bed:          'Room Rent',
  lab:          'Lab',
  radiology:    'Radiology',
  ipd_pharmacy: 'Pharmacy (Ward)',
  nursing:      'Nursing',
}

const BILL_SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  bed:          { bg: '#F0FDF4', color: '#16A34A' },
  lab:          { bg: '#EFF6FF', color: '#2563EB' },
  radiology:    { bg: '#FDF4FF', color: '#9333EA' },
  ipd_pharmacy: { bg: '#FFF7ED', color: '#C2410C' },
  nursing:      { bg: '#FFF1F2', color: '#BE123C' },
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
  totalOutstanding: number
}

interface AdvanceSummary { totalCollected: number; totalApplied: number; netBalance: number }

interface PatientGroup {
  patientId: string
  patientName: string
  uhid: string
  bills: Bill[]
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
  const canWrite  = !!role && hasPermission(role, 'billing:write')
  const canAdvance = !!role && hasPermission(role, 'billing:advance')
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

  async function refresh() {
    setLoading(true)
    const [data, newStats, newDeposits] = await Promise.all([
      listBills(), getBillingStats(), listAllAdvanceDeposits(),
    ])
    setBills(data)
    setStats(newStats)
    setDeposits(newDeposits)
    const admissionIds = [...new Set(data.filter((b) => b.admission_id).map((b) => b.admission_id!))]
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
    await applyAdvanceToBill(billId, admissionId)
    setApplyingBillId(null)
    refresh()
  }

  function togglePatient(id: string) {
    setExpandedPatients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Patient groups: merge bills + deposits keyed by patient_id ──────────────
  const patientGroups = useMemo<PatientGroup[]>(() => {
    const map = new Map<string, PatientGroup>()

    for (const bill of bills) {
      const pid = (bill as unknown as { patient_id: string }).patient_id
      if (!pid) continue
      const isCancelled = bill.status === 'cancelled'
      const g = map.get(pid)
      if (g) {
        g.bills.push(bill)
        if (!isCancelled) {
          g.totalBilled      += bill.total
          g.totalPaid        += bill.paid
          g.totalOutstanding += Math.max(0, bill.total - bill.paid)
        }
        // Prefer admission_id from the most recent bill
        if (bill.admission_id && !g.admissionId) g.admissionId = bill.admission_id
      } else {
        map.set(pid, {
          patientId:        pid,
          patientName:      bill.patient?.full_name ?? 'Unknown',
          uhid:             bill.patient?.uhid ?? '',
          bills:            [bill],
          deposits:         [],
          totalBilled:      isCancelled ? 0 : bill.total,
          totalPaid:        isCancelled ? 0 : bill.paid,
          totalOutstanding: isCancelled ? 0 : Math.max(0, bill.total - bill.paid),
          pendingAdvance:   0,
          admissionId:      bill.admission_id ?? null,
          advanceSummary:   null,
        })
      }
    }

    // Attach deposits to matching patient group; create a group even if no bills yet
    for (const dep of deposits) {
      const pid = dep.patient_id
      if (!pid) continue
      const g = map.get(pid)
      if (g) {
        g.deposits.push(dep)
        if (dep.status === 'pending') g.pendingAdvance += dep.amount
        if (!g.admissionId && dep.admission_id) g.admissionId = dep.admission_id
      } else {
        map.set(pid, {
          patientId:        pid,
          patientName:      dep.patient?.full_name ?? 'Unknown',
          uhid:             dep.patient?.uhid ?? '',
          bills:            [],
          deposits:         [dep],
          totalBilled:      0,
          totalPaid:        0,
          totalOutstanding: 0,
          pendingAdvance:   dep.status === 'pending' ? dep.amount : 0,
          admissionId:      dep.admission_id ?? null,
          advanceSummary:   null,
        })
      }
    }

    // Attach advance summaries
    for (const g of map.values()) {
      if (g.admissionId && advanceSummaries[g.admissionId]) {
        g.advanceSummary = advanceSummaries[g.admissionId]
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      // Pending advance first, then outstanding bills, then cleared
      const aUrgent = (a.pendingAdvance > 0 ? 2 : 0) + (a.totalOutstanding > 0 ? 1 : 0)
      const bUrgent = (b.pendingAdvance > 0 ? 2 : 0) + (b.totalOutstanding > 0 ? 1 : 0)
      return bUrgent - aUrgent || b.totalOutstanding - a.totalOutstanding
    })
  }, [bills, deposits, advanceSummaries])

  const filteredGroups = useMemo(() => {
    const byStatus = statusFilter === 'all'
      ? patientGroups
      : patientGroups.filter((g) => g.bills.some((b) => b.status === statusFilter))
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
              onClick={() => setShowBuilder(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#0D9488', color: '#fff', minHeight: '44px', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
              <Plus className="w-4 h-4" /> New Bill
            </button>
          ) : undefined
        }
      />

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
        <StatCard label="Today Billed"  value={stats.todayBilled}    icon={<Receipt className="w-4 h-4 sm:w-5 sm:h-5" />}   color="#0D9488" />
        <StatCard label="Collected"     value={stats.todayCollected} icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />}    color="#10B981" />
        <StatCard
          label="Outstanding"
          value={stats.totalOutstanding}
          icon={<AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
          color={stats.totalOutstanding > 0 ? '#EF4444' : '#10B981'}
        />
      </div>

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
      {viewMode === 'patient' && (
        <div className="space-y-3">
          {filteredGroups.length === 0
            ? <GlassCard className="p-8"><EmptyBills /></GlassCard>
            : filteredGroups.map((group) => {
                const expanded           = expandedPatients.has(group.patientId)
                const hasOutstanding    = group.totalOutstanding > 0
                const hasPendingAdv     = group.pendingAdvance > 0
                const adv               = group.advanceSummary
                const advNetBalance     = adv?.netBalance ?? 0
                const advCollected      = adv?.totalCollected ?? 0
                const advExhausted      = advCollected > 0 && advNetBalance <= 0
                const advHasBalance     = advNetBalance > 0
                const sortedBills     = [...group.bills].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )
                const billCount  = group.bills.length
                const depCount   = group.deposits.length
                const itemLabel  = billCount + depCount === 1 ? 'item' : 'items'

                return (
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
                            {advHasBalance && (
                              <span className="px-2 py-0.5 rounded-lg text-xs font-semibold"
                                style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.2)' }}>
                                {fmtCompact(advNetBalance)} left
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

                        {/* Chevron only — no chips here */}
                        <div className="flex-shrink-0 mt-1" style={{ color: '#94A3B8' }}>
                          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                      </div>
                    </button>

                    {/* Expanded items */}
                    {expanded && (billCount > 0 || depCount > 0) && (
                      <div style={{ borderTop: '1px solid #F1F5F9' }}>

                        {/* Advance deposit rows */}
                        {group.deposits.map((dep) => {
                          const isPending   = dep.status === 'pending'
                          const isCollected = dep.status === 'collected'
                          const isCollecting = collectingId === dep.id

                          return (
                            <div key={dep.id}
                              className="px-4 py-3"
                              style={{
                                background: isPending ? 'rgba(254,243,199,0.4)' : 'rgba(240,253,250,0.4)',
                                borderBottom: '1px solid #F1F5F9',
                              }}>
                              <div className="flex items-center gap-3 flex-wrap">
                                {/* Icon + label */}
                                <BedDouble className="w-4 h-4 flex-shrink-0" style={{ color: isPending ? '#D97706' : '#0D9488' }} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold" style={{ color: '#0F172A' }}>
                                      IPD Advance Deposit
                                    </span>
                                    <span className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                                      style={isPending
                                        ? { background: '#FEF3C7', color: '#92400E' }
                                        : isCollected
                                          ? { background: 'rgba(16,185,129,0.1)', color: '#065F46' }
                                          : { background: '#F1F5F9', color: '#64748B' }}>
                                      {dep.status}
                                    </span>
                                    {dep.method && (
                                      <span className="text-xs" style={{ color: '#94A3B8' }}>· {dep.method}</span>
                                    )}
                                  </div>
                                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                                    {dep.admission?.ward?.name}{dep.admission?.bed?.bed_no ? ` — Bed ${dep.admission.bed.bed_no}` : ''}
                                  </p>
                                </div>
                                <Money amount={dep.amount} className="font-bold flex-shrink-0"
                                  style={{ color: isPending ? '#D97706' : '#0D9488', fontSize: '0.95rem' }} />

                                {/* Collect inline */}
                                {isPending && canAdvance && (
                                  isCollecting ? (
                                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                      {collectError && (
                                        <span className="text-xs w-full" style={{ color: '#DC2626' }}>{collectError}</span>
                                      )}
                                      <Select
                                        value={collectMethod}
                                        onChange={(e) => setCollectMethod(e.target.value as typeof collectMethod)}
                                        style={{ minWidth: '110px' }}
                                      >
                                        {PAYMENT_METHODS.map((m) => (
                                          <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                      </Select>
                                      <button onClick={() => handleCollect(dep.id)} disabled={collectPending}
                                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                        style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                        {collectPending ? '…' : 'Confirm'}
                                      </button>
                                      <button onClick={() => { setCollectingId(null); setCollectError('') }}
                                        className="px-2 py-1.5 rounded-lg text-xs"
                                        style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setCollectingId(dep.id); setCollectMethod('cash'); setCollectError('') }}
                                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                                      style={{ background: '#D97706', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                      Collect
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          )
                        })}

                        {/* Top Up Advance row — shown for IPD patients when accountant has permission */}
                        {canAdvance && group.admissionId && (
                          <div className="px-4 py-2.5" style={{ background: 'rgba(240,253,250,0.5)', borderBottom: '1px solid #F1F5F9' }}>
                            {topUpAdmissionId === group.admissionId ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold" style={{ color: '#0D9488' }}>Top Up Advance</span>
                                {topUpError && <span className="text-xs w-full" style={{ color: '#DC2626' }}>{topUpError}</span>}
                                <input
                                  type="number"
                                  placeholder="Amount"
                                  value={topUpAmount}
                                  onChange={(e) => setTopUpAmount(e.target.value)}
                                  className="px-2 py-1 rounded-lg text-xs"
                                  style={{ width: '100px', border: '1px solid #CBD5E1', background: '#fff', outline: 'none' }}
                                />
                                <Select
                                  value={topUpMethod}
                                  onChange={(e) => setTopUpMethod(e.target.value as typeof topUpMethod)}
                                  style={{ minWidth: '100px' }}
                                >
                                  {PAYMENT_METHODS.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                  ))}
                                </Select>
                                <button onClick={() => handleTopUp(group.admissionId!)} disabled={topUpPending}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                                  style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                  {topUpPending ? '…' : 'Record'}
                                </button>
                                <button onClick={() => { setTopUpAdmissionId(null); setTopUpAmount(''); setTopUpError('') }}
                                  className="px-2 py-1.5 rounded-lg text-xs"
                                  style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setTopUpAdmissionId(group.admissionId!); setTopUpAmount(''); setTopUpError('') }}
                                className="flex items-center gap-1.5 text-xs font-semibold"
                                style={{ background: 'none', border: 'none', color: '#0D9488', cursor: 'pointer', padding: 0 }}>
                                + Top Up Advance
                              </button>
                            )}
                          </div>
                        )}

                        {/* Bill rows */}
                        {(() => {
                          const hasCollectedAdvance = group.deposits.some((d) => d.status === 'collected') || advCollected > 0
                          return sortedBills.map((bill, i) => {
                            const balance = Math.max(0, bill.total - bill.paid)
                            const canApply = canAdvance && hasCollectedAdvance
                              && balance > 0
                              && (bill.status === 'unpaid' || bill.status === 'partial' || bill.status === 'draft')
                              && !!bill.admission_id
                            return (
                              <div key={bill.id}
                                className="px-4 py-3 cursor-pointer"
                                style={{
                                  borderBottom: i < sortedBills.length - 1 ? '1px solid #F8FAFC' : 'none',
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
                                      <button
                                        onClick={(e) => handleApplyAdvance(e, bill.id, bill.admission_id!)}
                                        disabled={applyingBillId === bill.id}
                                        className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                                        style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', cursor: 'pointer' }}>
                                        {applyingBillId === bill.id ? 'Applying…' : '↳ Adjust Advance'}
                                      </button>
                                    )}
                                    <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                                    <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>View</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3 text-xs flex-wrap">
                                  <span style={{ color: '#94A3B8' }}><DateText date={bill.created_at} /></span>
                                  {bill.bill_source && BILL_SOURCE_LABELS[bill.bill_source] && (
                                    <span className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                                      style={BILL_SOURCE_COLORS[bill.bill_source] ?? { bg: '#F1F5F9', color: '#475569' }}>
                                      {BILL_SOURCE_LABELS[bill.bill_source]}
                                    </span>
                                  )}
                                  <span style={{ color: '#64748B' }}>
                                    Total: <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={bill.total} /></span>
                                  </span>
                                  {balance > 0 ? (
                                    <span className="font-semibold" style={{ color: '#EF4444' }}><Money amount={balance} /> due</span>
                                  ) : (
                                    <span style={{ color: '#10B981', fontWeight: 600 }}>Cleared</span>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </GlassCard>
                )
              })
          }
        </div>
      )}

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
                    {bill.bill_source && BILL_SOURCE_LABELS[bill.bill_source] && (
                      <span className="px-1.5 py-0.5 rounded-md text-xs font-medium"
                        style={BILL_SOURCE_COLORS[bill.bill_source] ?? { background: '#F1F5F9', color: '#475569' }}>
                        {BILL_SOURCE_LABELS[bill.bill_source]}
                      </span>
                    )}
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
                            {bill.bill_source && BILL_SOURCE_LABELS[bill.bill_source] && (
                              <span className="mt-0.5 inline-block px-1.5 py-0.5 rounded-md text-xs font-medium"
                                style={BILL_SOURCE_COLORS[bill.bill_source] ?? { background: '#F1F5F9', color: '#475569' }}>
                                {BILL_SOURCE_LABELS[bill.bill_source]}
                              </span>
                            )}
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

function StatCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode; color: string
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
