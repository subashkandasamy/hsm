'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, RefreshCw, FlaskConical, Settings, Printer, IndianRupee } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import SetupNudge from '@/components/ui/SetupNudge'
import { collectSample, verifyOrder, reportOrder, loadLabList, type OpenCritical, type LabTab } from '@/app/actions/lab'
import Pager from '@/components/ui/Pager'
import ListSearch from '@/components/ui/ListSearch'
import { writeListUrl, rememberedSize, rememberSize, useDebounced } from '@/lib/listUrl'
import { DEFAULT_PAGE_SIZE, type Paged } from '@/lib/paging'
import CriticalResultsBar from './CriticalResultsBar'
import SilentAnalyzerBar from './SilentAnalyzerBar'
import type { SilentAnalyzer } from '@/lib/lab/silent'
import type { LabOrder, LabTestCatalog } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import OrderLabModal from './OrderLabModal'
import ResultEntryModal from './ResultEntryModal'
import LabReportModal from './LabReportModal'
import AddLabTestModal from './AddLabTestModal'
import SampleLabelModal from '@/components/barcode/SampleLabelModal'
import TubeBarcodes from '@/components/barcode/TubeBarcodes'
import { useIsReadOnly } from '@/context/ReadOnlyContext'

const STATUS_MAP: Record<string, string> = {
  ordered: 'pending', collected: 'info', processing: 'info',
  verified: 'info', reported: 'success', cancelled: 'cancelled',
}

// Every flag a test can carry — a critical result showed as a grey
// "CRITICAL_HIGH" chip, the same grey as one with nothing wrong.
const FLAG_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  pending:       { bg: '#F1F5F9', color: '#64748B', label: 'PENDING' },
  unranged:      { bg: '#F1F5F9', color: '#64748B', label: 'ENTERED' },
  normal:        { bg: '#DCFCE7', color: '#15803D', label: 'NORMAL' },
  high:          { bg: '#FEE2E2', color: '#DC2626', label: 'HIGH' },
  low:           { bg: '#DBEAFE', color: '#1D4ED8', label: 'LOW' },
  abnormal:      { bg: '#FEF3C7', color: '#B45309', label: 'ABNORMAL' },
  critical_high: { bg: '#991B1B', color: '#fff',    label: 'CRIT HIGH' },
  critical_low:  { bg: '#1E3A8A', color: '#fff',    label: 'CRIT LOW' },
}

interface Props {
  initial: Paged<LabOrder>
  initialTab: LabTab
  initialQuery: string
  initialFrom: string
  initialTo: string
  counts: Record<LabTab, number>
  awaitingPayment?: string[]
  critical?: OpenCritical[]
  silentAnalyzers?: SilentAnalyzer[]
  catalog: LabTestCatalog[]
}

type TabKey = LabTab
const LIST = 'lab'

export default function LabClient({ initial, initialTab, initialQuery, initialFrom, initialTo, counts: initCounts, catalog: initCatalog, awaitingPayment: initAwaiting, critical: initCritical, silentAnalyzers = [] }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canOrder   = !!role && hasPermission(role, 'lab:order', profile?.granted_permissions)
  const canProcess      = !!role && hasPermission(role, 'lab:process', profile?.granted_permissions)
  const canVerify       = !!role && hasPermission(role, 'lab:verify', profile?.granted_permissions)
  const canPrintSample  = !!role && hasPermission(role, 'barcode:print:sample', profile?.granted_permissions)
  const isAdmin    = !!role && hasPermission(role, 'lab:manage', profile?.granted_permissions)
  const isReadOnly = useIsReadOnly()
  const [tab, setTabState] = useState<TabKey>(initialTab)
  // One page of the open tab; the other tabs are counted, not loaded.
  const [rows, setRows] = useState<LabOrder[]>(initial.rows)
  const [total, setTotal] = useState(initial.total)
  const [page, setPage] = useState(initial.page)
  const [size, setSize] = useState(initial.size)
  const [counts, setCounts] = useState(initCounts)
  const [query, setQuery] = useState(initialQuery)
  const debounced = useDebounced(query.trim())
  const [dateFrom, setDateFrom] = useState(initialFrom)
  const [dateTo, setDateTo] = useState(initialTo)
  // Orders held up by an unpaid outpatient bill. Inpatients and cashless-
  // approved patients are never in here — same rule as collectSample.
  const [awaitingPayment, setAwaitingPayment] = useState<Set<string>>(new Set(initAwaiting ?? []))
  const [critical, setCritical] = useState<OpenCritical[]>(initCritical ?? [])
  const [catalog, setCatalog] = useState<LabTestCatalog[]>(initCatalog)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [partialAsk, setPartialAsk] = useState<{ id: string; msg: string } | null>(null)
  const [actionError, setActionError] = useState<{ id: string; msg: string } | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [showAddTest, setShowAddTest] = useState(false)
  const [resultOrder, setResultOrder] = useState<LabOrder | null>(null)
  const [viewOrder, setViewOrder] = useState<LabOrder | null>(null)
  const [labelOrder, setLabelOrder] = useState<LabOrder | null>(null)

  // ── Loading a page: the newest request wins; the address follows. ──
  const view = useRef({ tab: initialTab, q: initialQuery.trim(), from: initialFrom, to: initialTo, page: initial.page, size: initial.size })
  const ticket = useRef(0)
  async function load(next: Partial<typeof view.current>, opts: { also?: boolean; counts?: boolean } = {}) {
    const v = { ...view.current, ...next }
    view.current = v
    const mine = ++ticket.current
    setLoading(true)
    const { list: res, counts: cnt, awaiting, critical: crit, catalog: cat } = await loadLabList(
      { tab: v.tab, q: v.q, from: v.from, to: v.to, page: v.page, size: v.size },
      { counts: opts.counts || opts.also, extras: opts.also },
    )
    if (mine !== ticket.current) return   // a newer request has gone out
    setRows(res.rows); setTotal(res.total); setPage(res.page); setSize(v.size)
    if (cnt) setCounts(cnt)
    setAwaitingPayment(new Set(awaiting))
    if (crit) setCritical(crit)
    if (cat) setCatalog(cat)
    setLoading(false)
    writeListUrl({ tab: v.tab, q: v.q, from: v.from, to: v.to, page: res.page, size: v.size }, { tab: 'collect', page: 1, size: DEFAULT_PAGE_SIZE })
  }
  // After an action: the same page again, and the counts, critical list and catalogue.
  async function refresh() { await load({}, { also: true }) }
  function setTab(t: TabKey) { setTabState(t); void load({ tab: t, page: 1 }, { counts: true }) }
  // After an action that moves the order on: open the tab it moved to, in one load.
  async function moveTo(t: TabKey) { setTabState(t); await load({ tab: t, page: 1 }, { also: true }) }
  const closeAddTest = useCallback(() => { setShowAddTest(false); void refresh() }, [])

  // Rows per page chosen before on this browser, when the address does not say.
  useEffect(() => {
    const remembered = rememberedSize(LIST)
    if (!remembered || remembered === initial.size || new URLSearchParams(window.location.search).get('size')) return
    const t = setTimeout(() => { void load({ size: remembered, page: 1 }) }, 0)
    return () => clearTimeout(t)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  // A changed search starts again from page 1.
  useEffect(() => { if (debounced !== view.current.q) void load({ q: debounced, page: 1 }) }, [debounced])

  async function handleCollect(orderId: string) {
    setActionId(orderId)
    setActionError(null)
    const res = await collectSample(orderId)
    if (!res.success) {
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    await moveTo('results')
    setActionId(null)
  }

  /**
   * Verify, and ask once before releasing a panel that is only partly answered.
   *
   * A laboratory legitimately releases twenty-seven results rather than hold
   * them for a twenty-eighth nobody can produce. What it must not do is
   * release them believing the panel is complete, which is what happened
   * until now — a Complete Blood Count with fourteen of its numbers went out
   * as a final report with nothing on it to say so.
   *
   * The second press is the consent. The report then prints as interim.
   */
  async function handleVerify(orderId: string, releasePartial = false) {
    setActionId(orderId)
    setActionError(null)
    const res = await verifyOrder(orderId, releasePartial)
    if (!res.success) {
      if ('needsConfirmation' in res && res.needsConfirmation) {
        setPartialAsk({ id: orderId, msg: res.error })
        setActionId(null)
        return
      }
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    setPartialAsk(null)
    await moveTo('verify')
    setActionId(null)
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
    { key: 'collect', label: 'To Collect', count: counts.collect },
    { key: 'results', label: 'Result Entry', count: counts.results },
    { key: 'verify', label: 'To Release', count: counts.verify },
    { key: 'reported', label: 'Reported', count: counts.reported },
  ]

  const currentList = rows

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

      {/* Above everything. A potassium of 6.8 is not something to find by browsing. */}
      <CriticalResultsBar items={critical} canAct={canProcess} onDone={refresh} />
      {/* Below the critical bar: a wrong result is more urgent than a missing one. */}
      <SilentAnalyzerBar items={silentAnalyzers} />

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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <ListSearch value={query} onChange={setQuery} busy={loading && !!query}
          placeholder="Patient name, UHID, old no., accession or old lab no." />
        {tab === 'reported' && (
          <div className="flex items-center gap-2 text-xs" style={{ color: '#64748B' }}>
            <label className="flex items-center gap-1">From
              <input type="date" value={dateFrom} max={dateTo || undefined}
                onChange={(e) => { setDateFrom(e.target.value); void load({ from: e.target.value, page: 1 }) }}
                className="rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.9)', color: '#0F172A' }} />
            </label>
            <label className="flex items-center gap-1">To
              <input type="date" value={dateTo} min={dateFrom || undefined}
                onChange={(e) => { setDateTo(e.target.value); void load({ to: e.target.value, page: 1 }) }}
                className="rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid #E2E8F0', background: 'rgba(255,255,255,0.9)', color: '#0F172A' }} />
            </label>
            {(dateFrom || dateTo) && (
              <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); void load({ from: '', to: '', page: 1 }) }}
                className="px-2 py-1 rounded-lg" style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', cursor: 'pointer' }}>
                Clear dates
              </button>
            )}
          </div>
        )}
      </div>

      {currentList.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title={query.trim() || dateFrom || dateTo ? 'No orders match' : 'No orders in this queue'}
            description={query.trim() || dateFrom || dateTo ? 'Try a different name, number or dates.' : tab === 'collect' ? 'New orders will appear here.' : 'Orders move here after sample collection.'}
            icon={<FlaskConical className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {currentList.map((order) => (
            <GlassCard key={order.id} className="p-4">
              {/* The buttons go under the order on a phone. Beside it they
                  left about sixty pixels, and a test chip like "Urine Routine
                  & Microscopy (R&M)" came out four lines tall. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
                    {order.package_order?.name_snapshot && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: '#F0FDFA', color: '#0F766E', border: '1px solid #99F6E4' }}>
                        Package: {order.package_order.name_snapshot}
                      </span>
                    )}
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
                            {FLAG_COLORS[item.flag]?.label ?? item.flag.toUpperCase()}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  <TubeBarcodes samples={order.samples} />
                  <p className="text-xs mt-1.5" style={{ color: '#94A3B8' }}>
                    {order.accession_no && <span className="font-mono" style={{ color: '#64748B' }}>#{order.accession_no} · </span>}
                    {order.legacy_request_no && <span className="font-mono" style={{ color: '#64748B' }}>Old no. {order.legacy_request_no} · </span>}
                    {order.orderer?.full_name} · <DateText date={order.ordered_at} />
                  </p>
                  {actionError?.id === order.id && (
                    <p className="text-xs mt-1.5 font-medium" style={{ color: '#DC2626' }}>
                      ⚠ {actionError.msg}
                    </p>
                  )}
                  {partialAsk?.id === order.id && (
                    <div className="mt-2 px-3 py-2 rounded-lg"
                         style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <p className="text-xs" style={{ color: '#92400E', lineHeight: 1.5 }}>
                        {partialAsk.msg}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleVerify(order.id, true)}
                          disabled={actionId === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#B45309', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          Release as interim
                        </button>
                        <button onClick={() => setPartialAsk(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#fff', color: '#92400E', border: '1px solid #FDE68A', cursor: 'pointer' }}>
                          Go back and enter them
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
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
                      {canProcess && (awaitingPayment.has(order.id) ? (
                        <span
                          title="An outpatient sample is collected once the bill is paid, or once a cashless claim is approved. Inpatients are not held up."
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                          style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                          <IndianRupee className="w-3 h-3" /> Awaiting payment
                        </span>
                      ) : (
                        <button
                          onClick={() => handleCollect(order.id)}
                          disabled={actionId === order.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: actionId === order.id ? 'not-allowed' : 'pointer' }}>
                          {actionId === order.id ? 'Collecting…' : 'Collect Sample'}
                        </button>
                      ))}
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

      {total > 0 && (
        <Pager page={page} size={size} total={total} busy={loading}
          onPage={(p) => { void load({ page: p }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
          onSize={(n) => { rememberSize(LIST, n); setSize(n); void load({ size: n, page: 1 }) }} />
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
