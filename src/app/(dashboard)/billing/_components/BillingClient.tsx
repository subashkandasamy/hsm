'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Receipt } from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Money from '@/components/ui/Money'
import DateText from '@/components/ui/DateText'
import { listBills } from '@/app/actions/billing'
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

interface Props { initialBills: Bill[] }

export default function BillingClient({ initialBills }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canWrite  = !!role && hasPermission(role, 'billing:write')
  const router    = useRouter()

  const [bills, setBills]               = useState(initialBills)
  const [loading, setLoading]           = useState(false)
  const [showBuilder, setShowBuilder]   = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch]             = useState('')

  async function refresh() {
    setLoading(true)
    const data = await listBills()
    setBills(data)
    setLoading(false)
  }

  const filtered = bills.filter((b) => {
    const matchStatus = statusFilter === 'all' || b.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      b.bill_no.toLowerCase().includes(q) ||
      (b.patient?.full_name ?? '').toLowerCase().includes(q) ||
      (b.patient?.uhid ?? '').toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Generate bills, record payments, manage invoices"
        actions={
          canWrite ? (
            <button
              onClick={() => setShowBuilder(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: '#0D9488', minHeight: '44px' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}
            >
              <Plus className="w-4 h-4" />
              <span>New Bill</span>
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="search"
          placeholder="Search by bill no, patient name or UHID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-3 py-2.5 rounded-xl text-sm"
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm"
          style={{
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid #E2E8F0',
            color: '#0F172A',
            minHeight: '44px',
            outline: 'none',
          }}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid #E2E8F0',
            color: '#475569',
            minHeight: '44px',
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Bills list */}
      <GlassCard>
        {/* Mobile card view */}
        <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
              No bills found
            </div>
          ) : (
            filtered.map((bill) => (
              <div
                key={bill.id}
                className="px-4 py-3.5 cursor-pointer"
                onClick={() => router.push(`/billing/${bill.id}`)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{bill.bill_no}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                      {bill.patient?.full_name} &middot; {bill.patient?.uhid}
                    </p>
                  </div>
                  <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                </div>
                <div className="flex items-center justify-between text-xs" style={{ color: '#64748B' }}>
                  <span>Total: <Money amount={bill.total} className="font-semibold" /></span>
                  <span>Balance: <Money amount={Math.max(0, bill.total - bill.paid)} className="font-semibold" style={{ color: bill.total - bill.paid > 0 ? '#EF4444' : '#10B981' }} /></span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                  <DateText date={bill.created_at} />
                </p>
              </div>
            ))
          )}
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: '#94A3B8' }}>
                    <div className="flex flex-col items-center gap-2">
                      <Receipt className="w-8 h-8 opacity-30" />
                      No bills found
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((bill, i) => {
                  const balance = Math.max(0, bill.total - bill.paid)
                  return (
                    <tr
                      key={bill.id}
                      className="cursor-pointer"
                      style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none' }}
                      onClick={() => router.push(`/billing/${bill.id}`)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.6)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: '#0D9488' }}>{bill.bill_no}</td>
                      <td className="px-4 py-3">
                        <p style={{ color: '#0F172A' }}>{bill.patient?.full_name}</p>
                        <p className="text-xs" style={{ color: '#94A3B8' }}>{bill.patient?.uhid}</p>
                      </td>
                      <td className="px-4 py-3" style={{ color: '#64748B' }}>
                        <DateText date={bill.created_at} />
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: '#0F172A' }}>
                        <Money amount={bill.total} />
                      </td>
                      <td className="px-4 py-3" style={{ color: '#10B981' }}>
                        <Money amount={bill.paid} />
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: balance > 0 ? '#EF4444' : '#10B981' }}>
                        <Money amount={balance} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={STATUS_MAP[bill.status] ?? 'info'} label={bill.status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#F1F5F9', color: '#475569' }}>View</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {showBuilder && (
        <BillBuilderModal
          onClose={() => setShowBuilder(false)}
          onGenerated={(billId) => {
            setShowBuilder(false)
            router.push(`/billing/${billId}`)
          }}
        />
      )}
    </div>
  )
}
