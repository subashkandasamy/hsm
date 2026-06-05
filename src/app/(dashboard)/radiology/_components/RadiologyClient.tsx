'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Scan, Settings } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import Money from '@/components/ui/Money'
import EmptyState from '@/components/ui/EmptyState'
import { markPerformed, listRadiologyOrders, listRadiologyCatalog } from '@/app/actions/radiology'
import type { RadiologyOrder, RadiologyCatalog } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import OrderRadiologyModal from './OrderRadiologyModal'
import ReportEntryModal from './ReportEntryModal'
import AddRadiologyTestModal from './AddRadiologyTestModal'

const STATUS_MAP: Record<string, string> = {
  ordered: 'pending', performed: 'info', reported: 'success', cancelled: 'cancelled',
}

const MODALITY_COLORS: Record<string, { bg: string; color: string }> = {
  xray:  { bg: '#EFF6FF', color: '#1D4ED8' },
  ct:    { bg: '#FEF3C7', color: '#B45309' },
  mri:   { bg: '#F3E8FF', color: '#7C3AED' },
  usg:   { bg: '#DCFCE7', color: '#15803D' },
}

interface Props {
  pending: RadiologyOrder[]
  performed: RadiologyOrder[]
  reported: RadiologyOrder[]
  catalog: RadiologyCatalog[]
}

type TabKey = 'pending' | 'performed' | 'reported'

export default function RadiologyClient({ pending: initP, performed: initPf, reported: initR, catalog: initCatalog }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canOrder   = !!role && hasPermission(role, 'radiology:order')
  const canProcess = !!role && hasPermission(role, 'radiology:process')
  const isAdmin    = !!role && hasPermission(role, 'radiology:manage')
  const [tab, setTab] = useState<TabKey>('pending')
  const [pending, setPending] = useState<RadiologyOrder[]>(initP)
  const [performed, setPerformed] = useState<RadiologyOrder[]>(initPf)
  const [reported, setReported] = useState<RadiologyOrder[]>(initR)
  const [catalog, setCatalog] = useState<RadiologyCatalog[]>(initCatalog)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [showAddTest, setShowAddTest] = useState(false)
  const [reportOrder, setReportOrder] = useState<RadiologyOrder | null>(null)

  async function refresh() {
    setLoading(true)
    const [p, pf, r, cat] = await Promise.all([
      listRadiologyOrders({ status: 'ordered' }),
      listRadiologyOrders({ status: 'performed' }),
      listRadiologyOrders({ status: 'reported' }),
      listRadiologyCatalog(),
    ])
    setPending(p); setPerformed(pf); setReported(r); setCatalog(cat)
    setLoading(false)
  }

  async function handlePerform(orderId: string) {
    setActionId(orderId)
    await markPerformed(orderId)
    await refresh()
    setActionId(null)
    setTab('performed')
  }

  const TABS: { key: TabKey; label: string; data: RadiologyOrder[] }[] = [
    { key: 'pending', label: 'Pending', data: pending },
    { key: 'performed', label: 'Performed', data: performed },
    { key: 'reported', label: 'Reported', data: reported },
  ]

  const currentList = TABS.find((t) => t.key === tab)?.data ?? []

  return (
    <div>
      <PageHeader
        title="Radiology"
        subtitle="Imaging orders and reports"
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isAdmin && (
              <button onClick={() => setShowAddTest(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.8)', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                title={`Manage catalog (${catalog.length} procedures)`}>
                <Settings className="w-4 h-4" /> Catalog ({catalog.length})
              </button>
            )}
            {canOrder && (
              <button onClick={() => setShowOrder(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> New Order
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {TABS.map(({ key, label, data }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
            style={tab === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }}>
            {label}
            <span className="text-xs px-1.5 py-0.5 rounded-full"
              style={tab === key ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
              {data.length}
            </span>
          </button>
        ))}
      </div>

      {currentList.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title="No orders" description="Orders will appear here."
            icon={<Scan className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {currentList.map((order) => {
            const mod = order.test?.modality?.toLowerCase()
            const mc = mod ? (MODALITY_COLORS[mod] ?? { bg: '#F1F5F9', color: '#475569' }) : { bg: '#F1F5F9', color: '#475569' }
            return (
              <GlassCard key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: mc.bg, border: `1px solid ${mc.bg}` }}>
                      <Scan className="w-5 h-5" style={{ color: mc.color }} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                          {order.test?.name ?? '—'}
                        </p>
                        {order.test?.modality && (
                          <span className="text-xs px-2 py-0.5 rounded-lg uppercase font-semibold"
                            style={{ background: mc.bg, color: mc.color }}>
                            {order.test.modality}
                          </span>
                        )}
                        <StatusBadge status={STATUS_MAP[order.status] ?? 'pending'} label={order.status} />
                      </div>
                      <p className="text-sm mt-0.5" style={{ color: '#475569' }}>
                        {order.patient?.full_name} · <span className="font-mono text-xs">{order.patient?.uhid}</span>
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#94A3B8' }}>
                        <span>{order.orderer?.full_name}</span>
                        <DateText date={order.ordered_at} />
                        <Money amount={order.price_snapshot} />
                      </div>
                      {tab === 'reported' && order.report && (
                        <p className="text-xs mt-1.5 line-clamp-2" style={{ color: '#475569' }}>{order.report}</p>
                      )}
                      {tab === 'reported' && order.image_url && (
                        <a href={order.image_url} target="_blank" rel="noreferrer"
                          className="text-xs mt-1 inline-block"
                          style={{ color: '#0D9488' }}>View Image →</a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tab === 'pending' && canProcess && (
                      <button onClick={() => handlePerform(order.id)} disabled={actionId === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}>
                        Mark Performed
                      </button>
                    )}
                    {tab === 'performed' && canProcess && (
                      <button onClick={() => setReportOrder(order)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        Add Report
                      </button>
                    )}
                    {tab === 'reported' && <StatusBadge status="success" label="Unbilled" />}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      <OrderRadiologyModal open={showOrder} onClose={() => setShowOrder(false)} catalog={catalog}
        onSuccess={() => { setShowOrder(false); refresh() }} />

      {reportOrder && (
        <ReportEntryModal open={true} order={reportOrder}
          onClose={() => setReportOrder(null)}
          onSuccess={() => { setReportOrder(null); refresh() }} />
      )}

      <AddRadiologyTestModal
        open={showAddTest}
        onClose={() => setShowAddTest(false)}
        onSuccess={() => { setShowAddTest(false); refresh() }}
      />
    </div>
  )
}
