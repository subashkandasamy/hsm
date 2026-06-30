'use client'

import { useState, useMemo } from 'react'
import {
  Plus, RefreshCw, Receipt, LayoutList, Users,
  Wallet, AlertCircle, ChevronDown, ChevronRight,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { listBills, getBillingStats } from '@/app/actions/billing'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { Bill } from '@/lib/types'
import BillBuilderModal from './BillBuilderModal'

const STATUS_MAP: Record<string, string> = {
  draft:     'info',
  unpaid:    'danger',
  partial:   'pending',
  paid:      'success',
  cancelled: 'cancelled',
}

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
  totalBilled: number
  totalPaid: number
  totalOutstanding: number
}

interface Props {
  initialBills: Bill[]
  initialStats: BillingStats
}

type ViewMode = 'list' | 'patient'

export default function BillingClient({ initialBills, initialStats }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite = !!role && hasPermission(role, 'billing:write')
  const router = useRouter()

  const [bills, setBills]                       = useState(initialBills)
  const [stats, setStats]                       = useState(initialStats)
  const [loading, setLoading]                   = useState(false)
  const [showBuilder, setShowBuilder]           = useState(false)
  const [statusFilter, setStatusFilter]         = useState('all')
  const [search, setSearch]                     = useState('')
  const [viewMode, setViewMode]                 = useState<ViewMode>('list')
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(new Set())

  async function refresh() {
    setLoading(true)
    const [data, newStats] = await Promise.all([listBills(), getBillingStats()])
    setBills(data)
    setStats(newStats)
    setLoading(false)
  }

  function togglePatient(id: string) {
    setExpandedPatients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

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
          totalBilled:      bill.total,
          totalPaid:        bill.paid,
          totalOutstanding: Math.max(0, bill.total - bill.paid),
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding)
  }, [bills])

  const filteredGroups = useMemo(() => {
    if (!search) return patientGroups
    const q = search.toLowerCase()
    return patientGroups.filter(
      (g) => g.patientName.toLowerCase().includes(q) || g.uhid.toLowerCase().includes(q)
    )
  }, [patientGroups, search])

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

      {/* ── Stat cards — 3-column compact on mobile ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
        <StatCard label="Today Billed"    value={stats.todayBilled}      icon={<Receipt className="w-4 h-4 sm:w-5 sm:h-5" />}      color="#0D9488" />
        <StatCard label="Collected"       value={stats.todayCollected}   icon={<Wallet className="w-4 h-4 sm:w-5 sm:h-5" />}       color="#10B981" />
        <StatCard
          label="Outstanding"
          value={stats.totalOutstanding}
          icon={<AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
          color={stats.totalOutstanding > 0 ? '#EF4444' : '#10B981'}
        />
      </div>

      {/* ── Controls — search full width, rest on one row ── */}
      <div className="flex flex-col gap-2 mb-4">
        <input
          type="search"
          placeholder={viewMode === 'list' ? 'Search by bill no, patient name or UHID…' : 'Search by patient name or UHID…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#0F172A', minHeight: '44px', outline: 'none' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
        />

        <div className="flex items-center gap-2">
          {viewMode === 'list' && (
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
          )}

          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden flex-shrink-0" style={{ border: '1px solid #E2E8F0' }}>
            {([
              { key: 'list',    label: 'All Bills',  Icon: LayoutList },
              { key: 'patient', label: 'By Patient', Icon: Users },
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

      {/* ── All Bills (flat list) ── */}
      {viewMode === 'list' && (
        <GlassCard>
          {/* Mobile card list */}
          <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
            {filtered.length === 0 ? <EmptyBills /> : filtered.map((bill) => {
              const balance = Math.max(0, bill.total - bill.paid)
              return (
                <div key={bill.id} className="px-4 py-3.5 cursor-pointer"
                  onClick={() => router.push(`/billing/${bill.id}`)}>
                  {/* Row 1: bill no + status */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="font-mono text-sm font-semibold" style={{ color: '#0D9488' }}>{bill.bill_no}</p>
                    <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                  </div>
                  {/* Row 2: patient */}
                  <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>
                    {bill.patient?.full_name} · {bill.patient?.uhid}
                  </p>
                  {/* Row 3: total + due + date */}
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: '#64748B' }}>
                      Total: <Money amount={bill.total} className="font-semibold" style={{ color: '#0F172A' }} />
                      {' '}&nbsp;
                      <DateText date={bill.created_at} />
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

      {/* ── By Patient (grouped) ── */}
      {viewMode === 'patient' && (
        <div className="space-y-3">
          {filteredGroups.length === 0
            ? <GlassCard className="p-8"><EmptyBills /></GlassCard>
            : filteredGroups.map((group) => {
                const expanded       = expandedPatients.has(group.patientId)
                const hasOutstanding = group.totalOutstanding > 0
                const sortedBills    = [...group.bills].sort(
                  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                )

                return (
                  <GlassCard key={group.patientId} className="overflow-hidden">
                    {/* Patient header */}
                    <button
                      onClick={() => togglePatient(group.patientId)}
                      className="w-full px-4 py-3 text-left"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>

                      {/* Row 1: avatar + name + uhid + chevron */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                          {group.patientName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{group.patientName}</span>
                            <span className="font-mono text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>{group.uhid}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-lg flex-shrink-0" style={{ background: '#F1F5F9', color: '#64748B' }}>
                              {group.bills.length} bill{group.bills.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1">
                          <div className="px-2.5 py-1 rounded-xl text-xs font-bold flex-shrink-0"
                            style={hasOutstanding
                              ? { background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }
                              : { background: 'rgba(16,185,129,0.08)', color: '#10B981', border: '1px solid rgba(16,185,129,0.15)' }}>
                            {hasOutstanding ? <><Money amount={group.totalOutstanding} /> due</> : 'Cleared'}
                          </div>
                          <div style={{ color: '#94A3B8' }}>
                            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>

                      {/* Row 2: billed / paid / due summary */}
                      <div className="flex items-center gap-3 mt-2 flex-wrap" style={{ paddingLeft: '48px' }}>
                        <span className="text-xs" style={{ color: '#64748B' }}>
                          Billed: <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={group.totalBilled} /></span>
                        </span>
                        <span className="text-xs" style={{ color: '#64748B' }}>
                          Paid: <span className="font-semibold" style={{ color: '#10B981' }}><Money amount={group.totalPaid} /></span>
                        </span>
                        {hasOutstanding && (
                          <span className="text-xs" style={{ color: '#64748B' }}>
                            Due: <span className="font-semibold" style={{ color: '#EF4444' }}><Money amount={group.totalOutstanding} /></span>
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Expanded: individual bills */}
                    {expanded && (
                      <div style={{ borderTop: '1px solid #F1F5F9' }}>
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

                              {/* Row 1: bill no + status + view */}
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-mono text-xs font-semibold" style={{ color: '#0D9488' }}>
                                  {bill.bill_no}
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                                  <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>
                                    View
                                  </span>
                                </div>
                              </div>

                              {/* Row 2: date + total + due */}
                              <div className="flex items-center gap-3 text-xs flex-wrap">
                                <span style={{ color: '#94A3B8' }}><DateText date={bill.created_at} /></span>
                                <span style={{ color: '#64748B' }}>
                                  Total: <span className="font-semibold" style={{ color: '#0F172A' }}><Money amount={bill.total} /></span>
                                </span>
                                {balance > 0 ? (
                                  <span className="font-semibold" style={{ color: '#EF4444' }}>
                                    <Money amount={balance} /> due
                                  </span>
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
