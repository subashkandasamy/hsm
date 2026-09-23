'use client'

import { useState, useCallback } from 'react'
import { Plus, RefreshCw, FlaskConical, Settings, Printer } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import SetupNudge from '@/components/ui/SetupNudge'
import { collectSample, verifyOrder, reportOrder, listLabOrders, listLabCatalog } from '@/app/actions/lab'
import type { LabOrder, LabTestCatalog } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import OrderLabModal from './OrderLabModal'
import ResultEntryModal from './ResultEntryModal'
import LabReportModal from './LabReportModal'
import AddLabTestModal from './AddLabTestModal'
import SampleLabelModal from '@/components/barcode/SampleLabelModal'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

const STATUS_MAP: Record<string, string> = {
  ordered: 'pending', collected: 'info', processing: 'info',
  verified: 'info', reported: 'success', cancelled: 'cancelled',
}

const FLAG_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#F1F5F9', color: '#64748B' },
  normal:  { bg: '#DCFCE7', color: '#15803D' },
  high:    { bg: '#FEE2E2', color: '#DC2626' },
  low:     { bg: '#DBEAFE', color: '#1D4ED8' },
}

interface Props {
  toCollect: LabOrder[]
  resultQueue: LabOrder[]
  verified?: LabOrder[]
  reported: LabOrder[]
  catalog: LabTestCatalog[]
}

type TabKey = 'collect' | 'results' | 'verify' | 'reported'

export default function LabClient({ toCollect: initCollect, resultQueue: initQueue, verified: initVerified, reported: initReported, catalog: initCatalog }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canOrder   = !!role && hasPermission(role, 'lab:order')
  const canProcess      = !!role && hasPermission(role, 'lab:process')
  const canVerify       = !!role && hasPermission(role, 'lab:verify')
  const canPrintSample  = !!role && hasPermission(role, 'barcode:print:sample')
  const isAdmin    = !!role && hasPermission(role, 'lab:manage')
  const isReadOnly = useIsReadOnly()
  const [tab, setTab] = useState<TabKey>('collect')
  const [toCollect, setToCollect] = useState<LabOrder[]>(initCollect)
  const [resultQueue, setResultQueue] = useState<LabOrder[]>(initQueue)
  const [verified, setVerified] = useState<LabOrder[]>(initVerified ?? [])
  const [reported, setReported] = useState<LabOrder[]>(initReported)
  const [catalog, setCatalog] = useState<LabTestCatalog[]>(initCatalog)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ id: string; msg: string } | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [showAddTest, setShowAddTest] = useState(false)
  const [resultOrder, setResultOrder] = useState<LabOrder | null>(null)
  const [viewOrder, setViewOrder] = useState<LabOrder | null>(null)
  const [labelOrder, setLabelOrder] = useState<LabOrder | null>(null)

  const closeAddTest = useCallback(() => { setShowAddTest(false); refresh() }, [])

  async function refresh() {
    setLoading(true)
    const [c, col, proc, ver, r, cat] = await Promise.all([
      listLabOrders({ status: 'ordered' }),
      listLabOrders({ status: 'collected' }),
      listLabOrders({ status: 'processing' }),
      listLabOrders({ status: 'verified' }),
      listLabOrders({ status: 'reported' }),
      listLabCatalog(),
    ])
    setToCollect(c)
    setResultQueue([...col, ...proc])
    setVerified(ver)
    setReported(r)
    setCatalog(cat)
    setLoading(false)
  }

  async function handleCollect(orderId: string) {
    setActionId(orderId)
    setActionError(null)
    const res = await collectSample(orderId)
    if (!res.success) {
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    await refresh()
    setActionId(null)
    setTab('results')
  }

  async function handleVerify(orderId: string) {
    setActionId(orderId)
    setActionError(null)
    const res = await verifyOrder(orderId)
    if (!res.success) {
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    await refresh()
    setActionId(null)
    setTab('verify')
  }

  async function handleReport(orderId: string) {
    setActionId(orderId)
    setActionError(null)
    const res = await reportOrder(orderId)
    if (!res.success) {
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    await refresh()
    setActionId(null)
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'collect', label: 'To Collect', count: toCollect.length },
    { key: 'results', label: 'Result Entry', count: resultQueue.length },
    { key: 'verify', label: 'To Release', count: verified.length },
    { key: 'reported', label: 'Reported', count: reported.length },
  ]

  const currentList =
    tab === 'collect' ? toCollect
    : tab === 'results' ? resultQueue
    : tab === 'verify' ? verified
    : reported

  return (
    <div>
      <PageHeader
        title="Laboratory"
        subtitle="Order management and result entry"
        action={
          <div className="flex items-center gap-2">
            <button onClick={refresh}
              className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isAdmin && (
              <button onClick={() => setShowAddTest(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.8)', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                title={`Manage catalog (${catalog.length} tests)`}>
                <Settings className="w-4 h-4" /> Catalog ({catalog.length})
              </button>
            )}
            {canOrder && (
              <button onClick={() => !isReadOnly && setShowOrder(true)}
                disabled={isReadOnly}
                title={isReadOnly ? 'Renew subscription to place lab orders' : undefined}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1 }}
                onMouseEnter={(e) => { if (!isReadOnly) e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> New Order
              </button>
            )}
          </div>
        }
      />

      {catalog.length === 0 && <SetupNudge message="Add your lab tests to start ordering" />}

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 mb-5">
        <div className="flex gap-1 p-1 rounded-xl w-max"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
          {TABS.map(({ key, label, count }) => (
            <button key={key} onClick={() => setTab(key)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
              style={tab === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }}>
              {label}
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={tab === key
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : { background: '#F1F5F9', color: '#64748B' }}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {currentList.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title="No orders in this queue"
            description={tab === 'collect' ? 'New orders will appear here.' : 'Orders move here after sample collection.'}
            icon={<FlaskConical className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {currentList.map((order) => (
            <GlassCard key={order.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold" style={{ color: '#0F172A' }}>
                      {order.patient?.full_name ?? '—'}
                    </p>
                    <span className="font-mono text-xs" style={{ color: '#94A3B8' }}>
                      {order.patient?.uhid}
                    </span>
                    <StatusBadge status={STATUS_MAP[order.status] ?? 'pending'}
                      label={order.status.replace('_', ' ')} />
                  </div>
                  {/* Tests */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(order.items ?? []).map((item) => (
                      <span key={item.id}
                        className="text-xs px-2 py-0.5 rounded-lg flex items-center gap-1"
                        style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                        <span>{item.test?.name ?? item.test_id}</span>
                        {item.flag !== 'pending' && (
                          <span className="px-1.5 py-0 rounded font-semibold text-xs"
                            style={{ background: FLAG_COLORS[item.flag]?.bg ?? '#F1F5F9', color: FLAG_COLORS[item.flag]?.color ?? '#64748B' }}>
                            {item.flag.toUpperCase()}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>
                    {order.accession_no && <span className="font-mono" style={{ color: '#64748B' }}>#{order.accession_no} · </span>}
                    {order.orderer?.full_name} · <DateText date={order.ordered_at} />
                  </p>
                  {actionError?.id === order.id && (
                    <p className="text-xs mt-1.5 font-medium" style={{ color: '#DC2626' }}>
                      ⚠ {actionError.msg}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {tab === 'collect' && (
                    <>
                      {canPrintSample && (
                        <button
                          onClick={() => setLabelOrder(order)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                          style={{ background: 'rgba(124,58,237,0.08)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.2)', cursor: 'pointer' }}>
                          <Printer className="w-3 h-3" /> Label
                        </button>
                      )}
                      {canProcess && (
                        <button
                          onClick={() => handleCollect(order.id)}
                          disabled={actionId === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: actionId === order.id ? 'not-allowed' : 'pointer' }}>
                          {actionId === order.id ? 'Collecting…' : 'Collect Sample'}
                        </button>
                      )}
                    </>
                  )}
                  {tab === 'results' && canProcess && (
                    <>
                      <button
                        onClick={() => setResultOrder(order)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        Enter Results
                      </button>
                      {canVerify && (
                        <button
                          onClick={() => handleVerify(order.id)}
                          disabled={actionId === order.id}
                          title="Check the results, then authorise them for release"
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#DCFCE7', color: '#15803D', border: 'none', cursor: 'pointer' }}>
                          Verify
                        </button>
                      )}
                    </>
                  )}
                  {tab === 'verify' && (
                    <>
                      <button
                        onClick={() => setViewOrder(order)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#fff', color: '#0D9488', border: '1px solid #99F6E4', cursor: 'pointer' }}>
                        Review
                      </button>
                      {canVerify && (
                        <button
                          onClick={() => handleReport(order.id)}
                          disabled={actionId === order.id}
                          title="Release to the patient and allow the report to print"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          Release Report
                        </button>
                      )}
                    </>
                  )}
                  {tab === 'reported' && (
                    <>
                      <button
                        onClick={() => setViewOrder(order)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        View Report
                      </button>
                      <StatusBadge
                        status={order.billing_status === 'billed' ? 'info' : 'pending'}
                        label={order.billing_status === 'billed' ? 'Billed' : 'Unbilled'}
                      />
                    </>
                  )}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <OrderLabModal
        open={showOrder}
        onClose={() => setShowOrder(false)}
        catalog={catalog}
        onSuccess={() => { setShowOrder(false); refresh() }}
      />

      {resultOrder && (
        <ResultEntryModal
          open={true}
          order={resultOrder}
          onClose={() => setResultOrder(null)}
          onSuccess={() => { setResultOrder(null); refresh() }}
        />
      )}

      {viewOrder && (
        <LabReportModal
          order={viewOrder}
          canEdit={canProcess}
          onClose={() => setViewOrder(null)}
          onEdit={() => { setResultOrder(viewOrder); setViewOrder(null) }}
        />
      )}

      <AddLabTestModal
        open={showAddTest}
        onClose={closeAddTest}
      />

      {labelOrder && (
        <SampleLabelModal
          order={labelOrder}
          onClose={() => setLabelOrder(null)}
        />
      )}
    </div>
  )
}
