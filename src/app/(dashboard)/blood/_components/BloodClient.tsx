'use client'

import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Droplets, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { getInventory, listUnits, listRequests, cancelRequest, expireOldUnits, listCamps, getStockSummary } from '@/app/actions/blood'
import type { BloodInventoryCell, BloodUnit, BloodRequest, BloodDonor, BloodGroup, BloodComponent, BloodDonationCamp, BloodStockSummary } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import AddUnitModal from './AddUnitModal'
import RaiseRequestModal from './RaiseRequestModal'
import IssueUnitModal from './IssueUnitModal'
import ComponentChargesModal from './ComponentChargesModal'
import ScreeningModal from './ScreeningModal'
import CrossMatchModal from './CrossMatchModal'
import TransfusionModal from './TransfusionModal'
import SeparateModal from './SeparateModal'
import CampModal from './CampModal'
import UnitTraceModal from './UnitTraceModal'
import { istToday } from '@/lib/istDate'

// Eligibility: deferred if under active deferral or donated within 90 days.
function donorEligible(d: BloodDonor): boolean {
  const today = istToday()
  if (d.deferral_until && d.deferral_until >= today) return false
  if (d.last_donation_date) {
    const days = (Date.now() - new Date(d.last_donation_date).getTime()) / 86400000
    if (days < 90) return false
  }
  return true
}

const SCREENING_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  passed:  { bg: '#DCFCE7', color: '#15803D', label: 'Screened' },
  pending: { bg: '#FEF3C7', color: '#B45309', label: 'Unscreened' },
  failed:  { bg: '#FEE2E2', color: '#DC2626', label: 'Failed' },
}

const URGENCY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  routine:   { bg: '#F1F5F9', color: '#475569', label: 'Routine' },
  urgent:    { bg: '#FEF3C7', color: '#B45309', label: 'Urgent' },
  emergency: { bg: '#FEE2E2', color: '#DC2626', label: 'Emergency' },
}

const PAYMENT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  paid:     { bg: '#DCFCE7', color: '#15803D', label: 'Paid' },
  unpaid:   { bg: '#FEE2E2', color: '#DC2626', label: 'Awaiting payment' },
  due:      { bg: '#F1F5F9', color: '#475569', label: 'Payment due' },
  cashless: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Cashless' },
}

function encounterTag(r: BloodRequest): string | null {
  if (r.admission_id) return 'IPD'
  if (r.ot_schedule_id) return 'OT'
  if (r.visit_id) return 'OPD'
  return null
}

const BLOOD_GROUPS: BloodGroup[]     = ['A+','A-','B+','B-','AB+','AB-','O+','O-']
const BLOOD_COMPONENTS: BloodComponent[] = ['whole','prbc','plasma','platelets']
const COMPONENT_LABELS: Record<BloodComponent, string> = {
  whole: 'Whole', prbc: 'PRBC', plasma: 'Plasma', platelets: 'Platelets',
}

const STATUS_MAP: Record<string, string> = {
  requested: 'pending', cross_matched: 'info', issued: 'success', cancelled: 'cancelled',
}
const UNIT_STATUS_MAP: Record<string, string> = {
  available: 'success', reserved: 'info', issued: 'pending', expired: 'danger', discarded: 'cancelled',
}

type TabKey = 'inventory' | 'units' | 'requests' | 'donors'

interface Props {
  initialInventory: BloodInventoryCell[]
  initialUnits: BloodUnit[]
  initialRequests: BloodRequest[]
  initialDonors: BloodDonor[]
}

export default function BloodClient({ initialInventory, initialUnits, initialRequests, initialDonors }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canManage  = !!role && hasPermission(role, 'bloodbank:manage', profile?.granted_permissions)
  const canRequest = !!role && hasPermission(role, 'bloodbank:request', profile?.granted_permissions)
  const canIssue   = !!role && hasPermission(role, 'bloodbank:issue', profile?.granted_permissions)
  const canScreen  = !!role && hasPermission(role, 'bloodbank:screen', profile?.granted_permissions)
  const canTransfuse = !!role && hasPermission(role, 'bloodbank:transfuse', profile?.granted_permissions)

  const [tab, setTab] = useState<TabKey>('inventory')
  const [inventory, setInventory] = useState(initialInventory)
  const [units, setUnits]         = useState(initialUnits)
  const [requests, setRequests]   = useState(initialRequests)
  const [donors]                  = useState(initialDonors)
  const [loading, setLoading]     = useState(false)

  const [showAddUnit, setShowAddUnit]   = useState(false)
  const [showRequest, setShowRequest]   = useState(false)
  const [showCharges, setShowCharges]   = useState(false)
  const [issueRequest, setIssueRequest] = useState<BloodRequest | null>(null)
  const [crossMatchRequest, setCrossMatchRequest] = useState<BloodRequest | null>(null)
  const [transfuseRequest, setTransfuseRequest] = useState<BloodRequest | null>(null)
  const [screenUnit, setScreenUnit]     = useState<BloodUnit | null>(null)
  const [separateUnit, setSeparateUnit] = useState<BloodUnit | null>(null)
  const [camps, setCamps]               = useState<BloodDonationCamp[]>([])
  const [showCamp, setShowCamp]         = useState(false)
  const [traceUnit, setTraceUnit]       = useState<BloodUnit | null>(null)
  const [summary, setSummary]           = useState<BloodStockSummary | null>(null)
  const [actionId, setActionId]         = useState<string | null>(null)

  useEffect(() => { listCamps().then(setCamps); getStockSummary().then(setSummary) }, [])

  async function refresh() {
    setLoading(true)
    const [inv, u, r, c, sm] = await Promise.all([getInventory(), listUnits(), listRequests(), listCamps(), getStockSummary()])
    setInventory(inv); setUnits(u); setRequests(r); setCamps(c); setSummary(sm)
    setLoading(false)
  }

  async function handleCancel(requestId: string) {
    setActionId(requestId)
    await cancelRequest(requestId)
    setActionId(null)
    await refresh()
  }

  async function handleExpire() {
    setLoading(true)
    await expireOldUnits()
    await refresh()
  }

  const alertCount = inventory.filter((c) => c.near_expiry > 0 || c.expired > 0).length
  const pendingReqs = requests.filter((r) => r.status !== 'issued' && r.status !== 'cancelled').length

  const TABS = [
    { key: 'inventory' as TabKey, label: 'Inventory', count: null },
    { key: 'units'     as TabKey, label: 'Units',     count: units.filter((u) => u.status === 'available').length },
    { key: 'requests'  as TabKey, label: 'Requests',  count: pendingReqs, urgent: pendingReqs > 0 },
    { key: 'donors'    as TabKey, label: 'Donors',    count: donors.length },
  ]

  return (
    <div>
      <PageHeader
        title="Blood Bank"
        subtitle="Inventory, requests, and issue tracking"
        action={
          // Three buttons in a row do not fit a phone, and without wrapping the
          // longest label folds a word per line instead of moving down.
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={refresh} className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button onClick={handleExpire}
                className="px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.8)', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                Expire Old Units
              </button>
            )}
            {canManage && (
              <button onClick={() => setShowCharges(true)}
                className="px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.8)', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                Charges
              </button>
            )}
            {canRequest && (
              <button onClick={() => setShowRequest(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(220,252,231,0.8)', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'pointer' }}>
                <Plus className="w-4 h-4" /> Request
              </button>
            )}
            {canManage && (
              <button onClick={() => setShowAddUnit(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0F766E' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0D9488' }}>
                <Plus className="w-4 h-4" /> Add Unit
              </button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 mb-5">
        <div className="flex gap-1 p-1 rounded-xl w-max"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #E2E8F0' }}>
        {TABS.map(({ key, label, count, urgent }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
            style={tab === key ? { background: '#0D9488', color: '#fff' } : { color: '#64748B', background: 'transparent' }}>
            {label}
            {count !== null && (
              <span className="text-xs px-1.5 py-0.5 rounded-full"
                style={tab === key
                  ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                  : urgent ? { background: '#FEE2E2', color: '#DC2626' } : { background: '#F1F5F9', color: '#64748B' }}>
                {count}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {tab === 'inventory' && (
        <InventoryGrid inventory={inventory} alertCount={alertCount} summary={summary} />
      )}
      {tab === 'units' && (
        <UnitsView units={units} canScreen={canScreen} canManage={canManage}
          onScreen={setScreenUnit} onSeparate={setSeparateUnit} onTrace={setTraceUnit} />
      )}
      {tab === 'requests' && (
        <RequestsView
          requests={requests}
          canIssue={canIssue}
          canRequest={canRequest}
          canTransfuse={canTransfuse}
          actionId={actionId}
          onCrossMatch={setCrossMatchRequest}
          onIssue={setIssueRequest}
          onTransfuse={setTransfuseRequest}
          onCancel={handleCancel}
        />
      )}
      {tab === 'donors' && <DonorsView donors={donors} camps={camps} canManage={canManage} onAddCamp={() => setShowCamp(true)} />}

      <AddUnitModal open={showAddUnit} donors={donors} camps={camps}
        onClose={() => setShowAddUnit(false)} onSuccess={() => { setShowAddUnit(false); refresh() }} />

      <RaiseRequestModal open={showRequest}
        onClose={() => setShowRequest(false)} onSuccess={() => { setShowRequest(false); refresh() }} />

      <ComponentChargesModal open={showCharges} onClose={() => setShowCharges(false)} />

      {screenUnit && (
        <ScreeningModal unit={screenUnit}
          onClose={() => setScreenUnit(null)}
          onSuccess={() => { setScreenUnit(null); refresh() }} />
      )}

      {crossMatchRequest && (
        <CrossMatchModal request={crossMatchRequest}
          onClose={() => setCrossMatchRequest(null)}
          onSuccess={() => { setCrossMatchRequest(null); refresh() }} />
      )}

      {transfuseRequest && (
        <TransfusionModal request={transfuseRequest}
          onClose={() => { setTransfuseRequest(null); refresh() }} />
      )}

      {separateUnit && (
        <SeparateModal unit={separateUnit}
          onClose={() => setSeparateUnit(null)}
          onSuccess={() => { setSeparateUnit(null); refresh() }} />
      )}

      <CampModal open={showCamp} onClose={() => setShowCamp(false)}
        onSuccess={() => { setShowCamp(false); refresh() }} />

      {traceUnit && <UnitTraceModal unit={traceUnit} onClose={() => setTraceUnit(null)} />}

      {issueRequest && (
        <IssueUnitModal open={true} request={issueRequest}
          onClose={() => setIssueRequest(null)}
          onSuccess={() => { setIssueRequest(null); refresh() }} />
      )}
    </div>
  )
}

// ---- Inventory Grid ----
function InventoryGrid({ inventory, alertCount, summary }: { inventory: BloodInventoryCell[]; alertCount: number; summary: BloodStockSummary | null }) {
  return (
    <div>
      {summary && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
          {([
            ['Available', summary.available, '#0D9488', '#F0FDFA'],
            ['Reserved', summary.reserved, '#1D4ED8', '#EFF6FF'],
            ['Issued', summary.issued, '#475569', '#F8FAFC'],
            ['Unscreened', summary.unscreened, '#B45309', '#FFFBEB'],
            ['Near Expiry', summary.nearExpiry, '#B45309', '#FEF3C7'],
            ['Expired', summary.expired, '#DC2626', '#FEF2F2'],
          ] as const).map(([label, val, color, bg]) => (
            <div key={label} className="rounded-xl px-3 py-2.5" style={{ background: bg, border: '1px solid #E2E8F0' }}>
              <p className="text-2xl font-bold" style={{ color }}>{val}</p>
              <p className="text-xs" style={{ color: '#64748B' }}>{label}</p>
            </div>
          ))}
        </div>
      )}
      {alertCount > 0 && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold"
          style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A' }}>
          <AlertTriangle className="w-4 h-4" />
          {alertCount} blood group/component combination(s) have near-expiry or expired units
        </div>
      )}
      <GlassCard className="overflow-hidden">
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: '#475569' }}>Blood Group</th>
                {(['whole','prbc','plasma','platelets'] as BloodComponent[]).map((c) => (
                  <th key={c} className="text-center px-4 py-3 text-xs font-semibold" style={{ color: '#475569' }}>
                    {COMPONENT_LABELS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['A+','A-','B+','B-','AB+','AB-','O+','O-'] as BloodGroup[]).map((bg, gi) => (
                <tr key={bg} style={{ borderBottom: gi < 7 ? '1px solid #F1F5F9' : 'none' }}>
                  <td className="px-4 py-3">
                    <span className="font-bold text-sm px-2.5 py-1 rounded-lg"
                      style={{ background: '#FEE2E2', color: '#DC2626' }}>{bg}</span>
                  </td>
                  {(['whole','prbc','plasma','platelets'] as BloodComponent[]).map((comp) => {
                    const cell = inventory.find((c) => c.blood_group === bg && c.component === comp)
                    const avail = cell?.available ?? 0
                    const nearExp = cell?.near_expiry ?? 0
                    const expired = cell?.expired ?? 0
                    return (
                      <td key={comp} className="px-4 py-3 text-center">
                        <span className="font-bold text-lg" style={{ color: avail > 0 ? '#0D9488' : '#94A3B8' }}>
                          {avail}
                        </span>
                        {(nearExp > 0 || expired > 0) && (
                          <div className="flex gap-1 justify-center mt-1">
                            {nearExp > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{ background: '#FEF3C7', color: '#B45309' }}>
                                ⚠ {nearExp}
                              </span>
                            )}
                            {expired > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{ background: '#FEE2E2', color: '#DC2626' }}>
                                ✕ {expired}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 flex items-center gap-4 text-xs" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
          <span>Numbers = available units</span>
          <span className="flex items-center gap-1"><span style={{ color: '#B45309' }}>⚠</span> near expiry (≤7 days)</span>
          <span className="flex items-center gap-1"><span style={{ color: '#DC2626' }}>✕</span> expired</span>
        </div>
      </GlassCard>
    </div>
  )
}

// ---- Units View ----
function UnitsView({ units, canScreen, canManage, onScreen, onSeparate, onTrace }: { units: BloodUnit[]; canScreen: boolean; canManage: boolean; onScreen: (u: BloodUnit) => void; onSeparate: (u: BloodUnit) => void; onTrace: (u: BloodUnit) => void }) {
  const today = istToday()
  if (units.length === 0) {
    return <GlassCard className="p-6"><EmptyState title="No blood units" description="Add units via 'Add Unit' to begin tracking." icon={<Droplets className="w-6 h-6" style={{ color: '#94A3B8' }} />} /></GlassCard>
  }
  return (
    <GlassCard className="overflow-hidden">
      {/* ── MOBILE CARDS (< md) ── */}
      <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
        {units.map((u) => {
          const isExpired = u.expiry < today
          return (
            <div key={u.id} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs px-2 py-0.5 rounded-lg"
                    style={{ background: '#FEE2E2', color: '#DC2626' }}>{u.blood_group}</span>
                  <span className="text-sm font-medium capitalize" style={{ color: '#0F172A' }}>
                    {COMPONENT_LABELS[u.component]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: SCREENING_STYLE[u.screening_status]?.bg, color: SCREENING_STYLE[u.screening_status]?.color }}>
                    {SCREENING_STYLE[u.screening_status]?.label ?? u.screening_status}
                  </span>
                  <StatusBadge status={UNIT_STATUS_MAP[u.status] ?? 'pending'} label={u.status} />
                </div>
              </div>
              {canScreen && u.screening_status === 'pending' && u.status === 'available' && (
                <button onClick={() => onScreen(u)}
                  className="mb-1.5 px-3 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Record Screening
                </button>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                {u.bag_number && (
                  <div><span style={{ color: '#94A3B8' }}>Bag </span>
                    <span className="font-mono" style={{ color: '#475569' }}>{u.bag_number}</span></div>
                )}
                <div><span style={{ color: '#94A3B8' }}>Donor </span>
                  <span style={{ color: '#475569' }}>{u.donor?.name ?? '—'}</span></div>
                <div><span style={{ color: '#94A3B8' }}>Collected </span>
                  <span style={{ color: '#475569' }}>{u.collected_at ? <DateText date={u.collected_at} /> : '—'}</span></div>
                <div className="col-span-2">
                  <span style={{ color: '#94A3B8' }}>Expires </span>
                  <span style={{ color: isExpired ? '#DC2626' : '#0F172A' }}>
                    <DateText date={u.expiry} />
                  </span>
                  {isExpired && <span className="ml-1 font-semibold" style={{ color: '#DC2626' }}>EXPIRED</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── DESKTOP TABLE (md+) ── */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
            {['Group', 'Component', 'Bag', 'Donor', 'Expiry', 'Screening', 'Status', ''].map((h, i) => (
              <th key={i} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#475569' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u, i) => {
            const isExpired = u.expiry < today
            return (
              <tr key={u.id} style={{ borderBottom: i < units.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                <td className="px-4 py-2.5">
                  <span className="font-bold text-xs px-2 py-0.5 rounded-lg"
                    style={{ background: '#FEE2E2', color: '#DC2626' }}>{u.blood_group}</span>
                </td>
                <td className="px-4 py-2.5 capitalize" style={{ color: '#475569' }}>{COMPONENT_LABELS[u.component]}</td>
                <td className="px-4 py-2.5 font-mono text-xs" style={{ color: '#64748B' }}>{u.bag_number ?? '—'}</td>
                <td className="px-4 py-2.5" style={{ color: '#475569' }}>{u.donor?.name ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <span style={{ color: isExpired ? '#DC2626' : '#0F172A' }}><DateText date={u.expiry} /></span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{ background: SCREENING_STYLE[u.screening_status]?.bg, color: SCREENING_STYLE[u.screening_status]?.color }}>
                    {SCREENING_STYLE[u.screening_status]?.label ?? u.screening_status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={UNIT_STATUS_MAP[u.status] ?? 'pending'} label={u.status} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {canScreen && u.screening_status === 'pending' && u.status === 'available' && (
                      <button onClick={() => onScreen(u)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold"
                        style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        Screen
                      </button>
                    )}
                    {canManage && u.component === 'whole' && u.status === 'available' && u.screening_status === 'passed' && (
                      <button onClick={() => onSeparate(u)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold"
                        style={{ background: '#EEF2FF', color: '#4338CA', border: '1px solid #E0E7FF', cursor: 'pointer' }}>
                        Separate
                      </button>
                    )}
                    <button onClick={() => onTrace(u)}
                      className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                      Trace
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </GlassCard>
  )
}

// ---- Requests View ----
function RequestsView({ requests, canIssue, canRequest, canTransfuse, actionId, onCrossMatch, onIssue, onTransfuse, onCancel }: {
  requests: BloodRequest[]
  canIssue: boolean
  canRequest: boolean
  canTransfuse: boolean
  actionId: string | null
  onCrossMatch: (req: BloodRequest) => void
  onIssue: (req: BloodRequest) => void
  onTransfuse: (req: BloodRequest) => void
  onCancel: (id: string) => void
}) {
  if (requests.length === 0) {
    return <GlassCard className="p-6"><EmptyState title="No blood requests" description="Doctors and nurses can raise requests via the Request button." /></GlassCard>
  }
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <GlassCard key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm px-2.5 py-1 rounded-lg"
                  style={{ background: '#FEE2E2', color: '#DC2626' }}>{r.blood_group}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg capitalize font-medium"
                  style={{ background: '#F1F5F9', color: '#475569' }}>
                  {COMPONENT_LABELS[r.component as BloodComponent] ?? r.component}
                </span>
                <span className="text-xs" style={{ color: '#64748B' }}>{r.units_required} unit{r.units_required !== 1 ? 's' : ''} required</span>
                <StatusBadge status={STATUS_MAP[r.status] ?? 'pending'} label={r.status.replace('_', ' ')} />
                {r.urgency && r.urgency !== 'routine' && (
                  <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                    style={{ background: URGENCY_STYLE[r.urgency].bg, color: URGENCY_STYLE[r.urgency].color }}>
                    {URGENCY_STYLE[r.urgency].label}
                  </span>
                )}
                {encounterTag(r) && (
                  <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                    style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                    {encounterTag(r)}
                  </span>
                )}
                {r.payment_status && r.status !== 'cancelled' && PAYMENT_STYLE[r.payment_status] && (
                  <span className="text-xs px-2 py-0.5 rounded-lg font-semibold"
                    style={{ background: PAYMENT_STYLE[r.payment_status].bg, color: PAYMENT_STYLE[r.payment_status].color }}>
                    {PAYMENT_STYLE[r.payment_status].label}
                  </span>
                )}
              </div>
              <p className="text-sm mt-1" style={{ color: '#475569' }}>
                {r.patient?.full_name} · <span className="font-mono text-xs">{r.patient?.uhid}</span>
              </p>
              {r.indication && <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Indication: {r.indication}</p>}
              {r.notes && <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{r.notes}</p>}
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                By {r.requester?.full_name ?? '—'} · <DateText date={r.requested_at} />
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {r.status === 'requested' && canIssue && (
                <button onClick={() => onCrossMatch(r)} disabled={actionId === r.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}>
                  Cross-match
                </button>
              )}
              {r.status === 'cross_matched' && canIssue && (
                <button onClick={() => onIssue(r)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Issue Unit
                </button>
              )}
              {r.status === 'issued' && canTransfuse && (
                <button onClick={() => onTransfuse(r)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#DBEAFE', color: '#1D4ED8', border: 'none', cursor: 'pointer' }}>
                  Transfusion
                </button>
              )}
              {(r.status === 'requested' || r.status === 'cross_matched') && canRequest && (
                <button onClick={() => onCancel(r.id)} disabled={actionId === r.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  )
}

// ---- Donors View ----
function DonorsView({ donors, camps, canManage, onAddCamp }: { donors: BloodDonor[]; camps: BloodDonationCamp[]; canManage: boolean; onAddCamp: () => void }) {
  return (
    <div className="space-y-4">
      {/* Donation camps */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Donation Camps</h3>
          {canManage && (
            <button onClick={onAddCamp} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3.5 h-3.5" /> New Camp
            </button>
          )}
        </div>
        {camps.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No camps yet.</p>
        ) : (
          <div className="space-y-1.5">
            {camps.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'rgba(248,250,252,0.8)' }}>
                <span className="font-medium" style={{ color: '#0F172A' }}>{c.name}</span>
                {c.location && <span className="text-xs" style={{ color: '#64748B' }}>{c.location}</span>}
                <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}><DateText date={c.camp_date} /></span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {donors.length === 0 ? (
        <GlassCard className="p-6"><EmptyState title="No donors registered" description="Donors can be linked when adding blood units." /></GlassCard>
      ) : (
      <GlassCard className="overflow-hidden">
      {/* ── MOBILE CARDS (< md) ── */}
      <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
        {donors.map((d) => (
          <div key={d.id} className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm truncate" style={{ color: '#0F172A' }}>{d.name}</p>
              <span className="font-bold text-xs px-2 py-0.5 rounded-lg flex-shrink-0"
                style={{ background: '#FEE2E2', color: '#DC2626' }}>{d.blood_group}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: '#64748B' }}>
              <span>{d.phone ?? 'No phone'}</span>
              {d.last_donation_date && <span>Last: <DateText date={d.last_donation_date} /></span>}
              <EligibilityBadge donor={d} />
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP TABLE (md+) ── */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
            {['Name', 'Blood Group', 'Phone', 'Last Donation', 'Eligibility'].map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold" style={{ color: '#475569' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {donors.map((d, i) => (
            <tr key={d.id} style={{ borderBottom: i < donors.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
              <td className="px-4 py-2.5 font-medium" style={{ color: '#0F172A' }}>{d.name}</td>
              <td className="px-4 py-2.5">
                <span className="font-bold text-xs px-2 py-0.5 rounded-lg"
                  style={{ background: '#FEE2E2', color: '#DC2626' }}>{d.blood_group}</span>
              </td>
              <td className="px-4 py-2.5" style={{ color: '#64748B' }}>{d.phone ?? '—'}</td>
              <td className="px-4 py-2.5" style={{ color: '#64748B' }}>
                {d.last_donation_date ? <DateText date={d.last_donation_date} /> : '—'}
              </td>
              <td className="px-4 py-2.5"><EligibilityBadge donor={d} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
      )}
    </div>
  )
}

function EligibilityBadge({ donor }: { donor: BloodDonor }) {
  const eligible = donorEligible(donor)
  return (
    <span className="text-xs px-2 py-0.5 rounded font-semibold"
      style={eligible ? { background: '#DCFCE7', color: '#15803D' } : { background: '#FEF3C7', color: '#B45309' }}>
      {eligible ? 'Eligible' : 'Deferred'}
    </span>
  )
}
