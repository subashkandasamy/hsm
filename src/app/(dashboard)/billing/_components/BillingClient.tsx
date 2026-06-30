'use client'

import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, Receipt, LayoutList, Users,
  Wallet, AlertCircle, ChevronDown, ChevronRight, BedDouble,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { listBills, getBillingStats } from '@/app/actions/billing'
import { collectAdvanceDeposit, listAllAdvanceDeposits } from '@/app/actions/admissionBilling'
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
}

interface Props {
  initialBills: Bill[]
  initialStats: BillingStats
  initialDeposits: AdvanceDepositRequest[]
}

type ViewMode = 'list' | 'patient'

export default function BillingClient({ initialBills, initialStats, initialDeposits }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite  = !!role && hasPermission(role, 'billing:write')
  const canAdvance = !!role && hasPermission(role, 'billing:advance')
  const router = useRouter()

  const [bills, setBills]       = useState(initialBills)
  const [stats, setStats]       = useState(initialStats)
  const [deposits, setDeposits] = useState(initialDeposits)
  const [loading, setLoading]   = useState(false)
  const [showBuilder, setShowBuilder] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]     = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('patient')
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())
  // Advance collection state
  const [collectingId, setCollectingId]     = useState<string | null>(null)
  const [collectMethod, setCollectMethod]   = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash')
  const [collectError, setCollectError]     = useState('')
  const [collectPending, setCollectPending] = useState(false)

  async function refresh() {
    setLoading(true)
    const [data, newStats, newDeposits] = await Promise.all([
      listBills(), getBillingStats(), listAllAdvanceDeposits(),
    ])
    setBills(data)
    setStats(newStats)
    setDeposits(newDeposits)
    setLoading(false)
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
      const g = map.get(pid)
      if (g) {
        g.bills.push(bill)
        g.totalBilled      += bill.total
        g.totalPaid        += bill.paid
        g.totalOutstanding += Math.max(0, bill.total - bill.paid)
      } else {
        map.set(pid, {
          patientId:        pid,
          patientName:      bill.patient?.full_name ?? 'Unknown',
          uhid:             bill.patient?.uhid ?? '',
          bills:            [bill],
          deposits:         [],
          totalBilled:      bill.total,
          totalPaid:        bill.paid,
          totalOutstanding: Math.max(0, bill.total - bill.paid),
          pendingAdvance:   0,
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
        })
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      // Pending advance first, then outstanding bills, then cleared
      const aUrgent = (a.pendingAdvance > 0 ? 2 : 0) + (a.totalOutstanding > 0 ? 1 : 0)
      const bUrgent = (b.pendingAdvance > 0 ? 2 : 0) + (b.totalOutstanding > 0 ? 1 : 0)
      return bUrgent - aUrgent || b.totalOutstanding - a.totalOutstanding
    })
  }, [bills, deposits])

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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>

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
                const expanded        = expandedPatients.has(group.patientId)
                const hasOutstanding  = group.totalOutstanding > 0
                const hasPendingAdv   = group.pendingAdvance > 0
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

                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                          {group.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm" style={{ color: '#0F172A' }}>{group.patientName}</span>
                            <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>{group.uhid}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-lg" style={{ background: '#F1F5F9', color: '#64748B' }}>
                              {billCount + depCount} {itemLabel}
                            </span>
                          </div>
                          {/* Summary line */}
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            {billCount > 0 && (
                              <>
                                <span className="text-xs" style={{ color: '#64748B' }}>
                                  Billed: <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={group.totalBilled} /></span>
                                </span>
                                <span className="text-xs" style={{ color: '#64748B' }}>
                                  Paid: <span className="font-semibold" style={{ color: '#10B981' }}><Money amount={group.totalPaid} /></span>
                                </span>
                              </>
                            )}
                            {hasPendingAdv && (
                              <span className="text-xs" style={{ color: '#64748B' }}>
                                Advance due: <span className="font-semibold" style={{ color: '#D97706' }}><Money amount={group.pendingAdvance} /></span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status chip */}
                        <div className="flex-shrink-0 flex items-center gap-1.5">
                          {hasPendingAdv && (
                            <div className="px-2 py-0.5 rounded-lg text-xs font-semibold"
                              style={{ background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
                              Advance
                            </div>
                          )}
                          {hasOutstanding ? (
                            <div className="px-2.5 py-1 rounded-xl text-xs font-bold"
                              style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}>
                              <Money amount={group.totalOutstanding} /> due
                            </div>
                          ) : billCount > 0 ? (
                            <div className="px-2.5 py-1 rounded-xl text-xs font-bold"
                              style={{ background: 'rgba(16,185,129,0.08)', color: '#10B981', border: '1px solid rgba(16,185,129,0.15)' }}>
                              Cleared
                            </div>
                          ) : null}
                          <div style={{ color: '#94A3B8' }}>
                            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
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
                                      <select
                                        value={collectMethod}
                                        onChange={(e) => setCollectMethod(e.target.value as typeof collectMethod)}
                                        className="px-2 py-1.5 text-xs rounded-lg border"
                                        style={{ borderColor: '#FDE68A', color: '#0F172A' }}>
                                        {PAYMENT_METHODS.map((m) => (
                                          <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                      </select>
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

                        {/* Bill rows */}
                        {sortedBills.map((bill, i) => {
                          const balance = Math.max(0, bill.total - bill.paid)
                          return (
                            <div key={bill.id}
                              className="px-4 py-3 cursor-pointer"
                              style={{
                                borderBottom: i < sortedBills.length - 1 ? '1px solid #F8FAFC' : 'none',
                                background: 'rgba(248,250,252,0.5)',
                              }}
                              onClick={() => router.push(`/billing/${bill.id}`)}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.9)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.5)' }}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-mono text-xs font-semibold" style={{ color: '#0D9488' }}>
                                  {bill.bill_no}
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                                  <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>View</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-xs flex-wrap">
                                <span style={{ color: '#94A3B8' }}><DateText date={bill.created_at} /></span>
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
                        })}
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
                  <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>
                    {bill.patient?.full_name} · {bill.patient?.uhid}
                  </p>
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
                          <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: '#0D9488' }}>{bill.bill_no}</td>
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
