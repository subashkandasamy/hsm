'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, RefreshCw, Scan, Settings } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import Money from '@/components/ui/Money'
import EmptyState from '@/components/ui/EmptyState'
import SetupNudge from '@/components/ui/SetupNudge'
import { markPerformed, verifyRadiologyOrder, loadRadiologyList, type RadiologyTab } from '@/app/actions/radiology'
import Pager from '@/components/ui/Pager'
import ListSearch from '@/components/ui/ListSearch'
import { writeListUrl, rememberedSize, rememberSize, useDebounced } from '@/lib/listUrl'
import { DEFAULT_PAGE_SIZE, type Paged } from '@/lib/paging'
import { startFormF } from '@/app/actions/pcpndt'
import type { RadiologyOrder, RadiologyCatalog } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import OrderRadiologyModal from './OrderRadiologyModal'
import ReportEntryModal from './ReportEntryModal'
import AddRadiologyTestModal from './AddRadiologyTestModal'
import ViewScanButton from './ViewScanButton'
import RadiologyReportModal from './RadiologyReportModal'

const STATUS_MAP: Record<string, string> = {
  ordered: 'pending', performed: 'info', verified: 'info', reported: 'success', cancelled: 'cancelled',
}

const MODALITY_COLORS: Record<string, { bg: string; color: string }> = {
  xray:  { bg: '#EFF6FF', color: '#1D4ED8' },
  ct:    { bg: '#FEF3C7', color: '#B45309' },
  mri:   { bg: '#F3E8FF', color: '#7C3AED' },
  usg:   { bg: '#DCFCE7', color: '#15803D' },
}

interface Props {
  initial: Paged<RadiologyOrder>
  initialTab: RadiologyTab
  initialQuery: string
  initialFrom: string
  initialTo: string
  counts: Record<RadiologyTab, number>
  catalog: RadiologyCatalog[]
}

type TabKey = RadiologyTab
const LIST = 'radiology'

export default function RadiologyClient({ initial, initialTab, initialQuery, initialFrom, initialTo, counts: initCounts, catalog: initCatalog }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canOrder   = !!role && hasPermission(role, 'radiology:order', profile?.granted_permissions)
  const canProcess = !!role && hasPermission(role, 'radiology:process', profile?.granted_permissions)
  const canVerify  = !!role && hasPermission(role, 'radiology:verify', profile?.granted_permissions)
  const isAdmin    = !!role && hasPermission(role, 'radiology:manage', profile?.granted_permissions)
  const [tab, setTabState] = useState<TabKey>(initialTab)
  // One page of the open tab; the other tabs are counted, not loaded.
  const [rows, setRows] = useState<RadiologyOrder[]>(initial.rows)
  const [total, setTotal] = useState(initial.total)
  const [page, setPage] = useState(initial.page)
  const [size, setSize] = useState(initial.size)
  const [counts, setCounts] = useState(initCounts)
  const [query, setQuery] = useState(initialQuery)
  const debounced = useDebounced(query.trim())
  const [dateFrom, setDateFrom] = useState(initialFrom)
  const [dateTo, setDateTo] = useState(initialTo)
  const [catalog, setCatalog] = useState<RadiologyCatalog[]>(initCatalog)
  const [loading, setLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ id: string; msg: string } | null>(null)
  const [showOrder, setShowOrder] = useState(false)
  const [showAddTest, setShowAddTest] = useState(false)
  const [reportOrder, setReportOrder] = useState<RadiologyOrder | null>(null)
  const [viewOrder, setViewOrder] = useState<RadiologyOrder | null>(null)
  const canFormF = !!role && hasPermission(role, 'pcpndt:record', profile?.granted_permissions)

  // ── Loading a page: the newest request wins; the address follows. ──
  const view = useRef({ tab: initialTab, q: initialQuery.trim(), from: initialFrom, to: initialTo, page: initial.page, size: initial.size })
  const ticket = useRef(0)
  async function load(next: Partial<typeof view.current>, opts: { also?: boolean; counts?: boolean } = {}) {
    const v = { ...view.current, ...next }
    view.current = v
    const mine = ++ticket.current
    setLoading(true)
    const { list: res, counts: cnt, catalog: cat } = await loadRadiologyList(
      { tab: v.tab, q: v.q, from: v.from, to: v.to, page: v.page, size: v.size },
      { counts: opts.counts || opts.also, catalog: opts.also },
    )
    if (mine !== ticket.current) return   // a newer request has gone out
    setRows(res.rows); setTotal(res.total); setPage(res.page); setSize(v.size)
    if (cnt) setCounts(cnt)
    if (cat) setCatalog(cat)
    setLoading(false)
    writeListUrl({ tab: v.tab, q: v.q, from: v.from, to: v.to, page: res.page, size: v.size }, { tab: 'pending', page: 1, size: DEFAULT_PAGE_SIZE })
  }
  // After an action: the same page again, the counts and the catalogue.
  async function refresh() { await load({}, { also: true }) }
  function setTab(t: TabKey) { setTabState(t); void load({ tab: t, page: 1 }, { counts: true }) }
  async function moveTo(t: TabKey) { setTabState(t); await load({ tab: t, page: 1 }, { also: true }) }

  // Rows per page chosen before on this browser, when the address does not say.
  useEffect(() => {
    const remembered = rememberedSize(LIST)
    if (!remembered || remembered === initial.size || new URLSearchParams(window.location.search).get('size')) return
    const t = setTimeout(() => { void load({ size: remembered, page: 1 }) }, 0)
    return () => clearTimeout(t)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  // A changed search starts again from page 1.
  useEffect(() => { if (debounced !== view.current.q) void load({ q: debounced, page: 1 }) }, [debounced])

  async function handlePerform(orderId: string) {
    setActionId(orderId)
    setActionError(null)
    const res = await markPerformed(orderId)
    if (!res.success) {
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    await moveTo('performed')
    setActionId(null)
  }

  async function handleRelease(orderId: string) {
    setActionId(orderId)
    setActionError(null)
    const res = await verifyRadiologyOrder(orderId)
    if (!res.success) {
      setActionError({ id: orderId, msg: res.error })
      setActionId(null)
      return
    }
    await moveTo('reported')
    setActionId(null)
  }

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'performed', label: 'Performed', count: counts.performed },
    { key: 'reported', label: 'Reported', count: counts.reported },
  ]

  const currentList = rows
  const filtered = !!(query.trim() || dateFrom || dateTo)

  // Group the tab's orders by patient — one card per patient, scans nested.
  const patientGroups = (() => {
    const m = new Map<string, { name: string; uhid: string; orders: RadiologyOrder[] }>()
    for (const o of currentList) {
      const key = o.patient_id
      if (!m.has(key)) m.set(key, { name: o.patient?.full_name ?? '—', uhid: o.patient?.uhid ?? '', orders: [] })
      m.get(key)!.orders.push(o)
    }
    return [...m.values()]
  })()

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

      {catalog.length === 0 && <SetupNudge message="Add your scans to start ordering" />}

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
                style={tab === key ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#F1F5F9', color: '#64748B' }}>
                {count.toLocaleString('en-IN')}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <ListSearch value={query} onChange={setQuery} busy={loading && !!query}
          placeholder="Patient name, scan name, UHID, old no. or accession" />
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

      {patientGroups.length === 0 ? (
        <GlassCard className="p-6">
          <EmptyState title={filtered ? 'No scans match' : 'No orders'} description={filtered ? 'Try a different name, number or dates.' : 'Orders will appear here.'}
            icon={<Scan className="w-6 h-6" style={{ color: '#94A3B8' }} />} />
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {patientGroups.map((group) => (
            <GlassCard key={group.uhid + group.name} className="p-4">
              {/* Patient header */}
              <div className="flex items-center gap-2 mb-3 pb-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{group.name}</p>
                <span className="font-mono text-xs px-2 py-0.5 rounded-lg" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{group.uhid}</span>
                <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}>
                  {group.orders.length} scan{group.orders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Scans for this patient */}
              <div className="space-y-2">
                {group.orders.map((order) => {
                  const mod = order.test?.modality?.toLowerCase()
                  const mc = mod ? (MODALITY_COLORS[mod] ?? { bg: '#F1F5F9', color: '#475569' }) : { bg: '#F1F5F9', color: '#475569' }
                  return (
                    // The buttons on the right are unshrinkable, so side by
                    // side on a phone they left about forty pixels for the scan
                    // name — "Chest X-Ray (PA view)" came out four lines tall
                    // and one word wide. They go underneath instead.
                    <div key={order.id}
                      className="flex flex-col gap-2 px-3 py-2.5 rounded-xl sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                      style={{ background: '#F8FAFC' }}>
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: mc.bg, border: `1px solid ${mc.bg}` }}>
                          <Scan className="w-4.5 h-4.5" style={{ color: mc.color }} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm" style={{ color: '#0F172A' }}>{order.test?.name ?? '—'}</p>
                            {order.test?.modality && (
                              <span className="text-xs px-2 py-0.5 rounded-lg uppercase font-semibold"
                                style={{ background: mc.bg, color: mc.color }}>{order.test.modality}</span>
                            )}
                            <StatusBadge status={STATUS_MAP[order.status] ?? 'pending'} label={order.status} />
                          </div>
                          <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs flex-wrap" style={{ color: '#94A3B8' }}>
                            <span>{order.orderer?.full_name}</span>
                            <DateText date={order.ordered_at} />
                            <Money amount={order.price_snapshot} />
                          </div>
                          {actionError?.id === order.id && (
                            <p className="text-xs mt-1.5 font-medium" style={{ color: '#DC2626' }}>⚠ {actionError.msg}</p>
                          )}
                          {tab === 'reported' && order.report && (
                            <p className="text-xs mt-1.5 line-clamp-2" style={{ color: '#475569' }}>{order.report}</p>
                          )}
                          {tab === 'reported' && order.verifier?.full_name && (
                            <p className="text-xs mt-1" style={{ color: '#64748B' }}>Reported by {order.verifier.full_name}</p>
                          )}
                          {/* The stored image is a private path — a plain link to it opened a
                              404 (BUG-026). The report popup signs it, and prints. */}
                          {tab === 'reported' && (
                            <div className="flex items-center gap-3 mt-1">
                              <button onClick={() => setViewOrder(order)} className="text-xs font-medium"
                                style={{ color: '#0D9488', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                                {order.image_url ? 'View Image →' : 'View Report →'}
                              </button>
                              <a href={`/print/radiology/${order.id}/pdf`} target="_blank" rel="noreferrer"
                                className="text-xs font-medium" style={{ color: '#0D9488' }}>Print</a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
                        {/* Only appears once a machine has actually sent images
                            and the computer holding them is reachable. */}
                        {tab !== 'pending' && <ViewScanButton orderId={order.id} />}
                        {tab === 'pending' && canProcess && (
                          <button onClick={() => handlePerform(order.id)} disabled={actionId === order.id}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: actionId === order.id ? 'not-allowed' : 'pointer' }}>
                            {actionId === order.id ? 'Processing…' : 'Mark Performed'}
                          </button>
                        )}
                        {/* A scan centre's sonologist works from this list, not
                            from the patient file — so the Form F starts here
                            too. Only for women: the Act is about pregnancy, and
                            offering it on a man's knee X-ray is noise. */}
                        {canFormF && order.patient?.gender === 'female' && (
                          <FormFButton orderId={order.id} patientId={order.patient_id} />
                        )}
                        {tab === 'performed' && canProcess && (
                          <button onClick={() => setReportOrder(order)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: order.report ? '#fff' : '#0D9488', color: order.report ? '#0D9488' : '#fff', border: order.report ? '1px solid #99F6E4' : 'none', cursor: 'pointer' }}>
                            {order.report ? 'Edit Report' : 'Add Report'}
                          </button>
                        )}
                        {tab === 'performed' && canVerify && order.report && (
                          <button onClick={() => handleRelease(order.id)} disabled={actionId === order.id}
                            title="Authorise this report and release it to the patient"
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: actionId === order.id ? 'not-allowed' : 'pointer' }}>
                            {actionId === order.id ? 'Releasing…' : 'Release Report'}
                          </button>
                        )}
                        {tab === 'reported' && (
                          <StatusBadge
                            status={order.billing_status === 'billed' ? 'info' : 'pending'}
                            label={order.billing_status === 'billed' ? 'Billed' : 'Unbilled'} />
                        )}
                      </div>
                    </div>
                  )
                })}
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

      <OrderRadiologyModal open={showOrder} onClose={() => setShowOrder(false)} catalog={catalog}
        onSuccess={() => { setShowOrder(false); refresh() }} />

      {viewOrder && <RadiologyReportModal order={viewOrder} onClose={() => setViewOrder(null)} />}
      {reportOrder && (
        <ReportEntryModal open={true} order={reportOrder}
          onClose={() => setReportOrder(null)}
          onSuccess={() => { setReportOrder(null); refresh() }} />
      )}

      <AddRadiologyTestModal
        open={showAddTest}
        onClose={() => { setShowAddTest(false); refresh() }}
        onSuccess={() => { setShowAddTest(false); refresh() }}
      />
    </div>
  )
}

/**
 * Opens a Form F for this scan and goes straight to it.
 *
 * Linked to the order, so the register can show which scan it belongs to —
 * but a Form F does not require one, because a scan centre may see a woman
 * who was never booked through Uyirly.
 */
function FormFButton({ orderId, patientId }: { orderId: string; patientId: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  if (!patientId) return null
  return (
    <button
      onClick={async () => {
        setBusy(true)
        const res = await startFormF({ patient_id: patientId, radiology_order_id: orderId })
        setBusy(false)
        if (res.success) router.push(`/pcpndt/${res.id}`)
      }}
      disabled={busy}
      title="Record the Form F this scan needs under the PC&PNDT Act"
      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
      style={{ background: 'rgba(219,39,119,0.07)', color: '#DB2777',
               border: '1px solid rgba(219,39,119,0.25)', cursor: busy ? 'wait' : 'pointer' }}>
      {busy ? 'Opening…' : 'Form F'}
    </button>
  )
}
