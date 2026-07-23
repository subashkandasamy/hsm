'use client'

import { useState } from 'react'
import { Plus, RefreshCw, Droplets, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import EmptyState from '@/components/ui/EmptyState'
import { getInventory, listUnits, listRequests, crossMatch, cancelRequest, expireOldUnits } from '@/app/actions/blood'
import type { BloodInventoryCell, BloodUnit, BloodRequest, BloodDonor, BloodGroup, BloodComponent } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import AddUnitModal from './AddUnitModal'
import RaiseRequestModal from './RaiseRequestModal'
import IssueUnitModal from './IssueUnitModal'
import ComponentChargesModal from './ComponentChargesModal'
import ScreeningModal from './ScreeningModal'

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
  const canManage  = !!role && hasPermission(role, 'bloodbank:manage')
  const canRequest = !!role && hasPermission(role, 'bloodbank:request')
  const canIssue   = !!role && hasPermission(role, 'bloodbank:issue')
  const canScreen  = !!role && hasPermission(role, 'bloodbank:screen')

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
  const [screenUnit, setScreenUnit]     = useState<BloodUnit | null>(null)
  const [actionId, setActionId]         = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const [inv, u, r] = await Promise.all([getInventory(), listUnits(), listRequests()])
    setInventory(inv); setUnits(u); setRequests(r)
    setLoading(false)
  }

  async function handleCrossMatch(requestId: string) {
    setActionId(requestId)
    await crossMatch(requestId)
    setActionId(null)
    await refresh()
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
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="p-2 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button onClick={handleExpire}
                className="px-3 py-2 rounded-xl text-xs font-medium"
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
        <InventoryGrid inventory={inventory} alertCount={alertCount} />
      )}
      {tab === 'units' && (
        <UnitsView units={units} canScreen={canScreen} onScreen={setScreenUnit} />
      )}
      {tab === 'requests' && (
        <RequestsView
          requests={requests}
          canIssue={canIssue}
          canRequest={canRequest}
          actionId={actionId}
          onCrossMatch={handleCrossMatch}
          onIssue={setIssueRequest}
          onCancel={handleCancel}
        />
      )}
      {tab === 'donors' && <DonorsView donors={donors} />}

      <AddUnitModal open={showAddUnit} donors={donors}
        onClose={() => setShowAddUnit(false)} onSuccess={() => { setShowAddUnit(false); refresh() }} />

      <RaiseRequestModal open={showRequest}
        onClose={() => setShowRequest(false)} onSuccess={() => { setShowRequest(false); refresh() }} />

      <ComponentChargesModal open={showCharges} onClose={() => setShowCharges(false)} />

      {screenUnit && (
        <ScreeningModal unit={screenUnit}
          onClose={() => setScreenUnit(null)}
          onSuccess={() => { setScreenUnit(null); refresh() }} />
      )}

      {issueRequest && (
        <IssueUnitModal open={true} request={issueRequest}
          onClose={() => setIssueRequest(null)}
          onSuccess={() => { setIssueRequest(null); refresh() }} />
      )}
    </div>
  )
}

// ---- Inventory Grid ----
function InventoryGrid({ inventory, alertCount }: { inventory: BloodInventoryCell[]; alertCount: number }) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <div>
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
function UnitsView({ units, canScreen, onScreen }: { units: BloodUnit[]; canScreen: boolean; onScreen: (u: BloodUnit) => void }) {
  const today = new Date().toISOString().split('T')[0]
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
                  {canScreen && u.screening_status === 'pending' && u.status === 'available' && (
                    <button onClick={() => onScreen(u)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                      Screen
                    </button>
                  )}
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
function RequestsView({ requests, canIssue, canRequest, actionId, onCrossMatch, onIssue, onCancel }: {
  requests: BloodRequest[]
  canIssue: boolean
  canRequest: boolean
  actionId: string | null
  onCrossMatch: (id: string) => void
  onIssue: (req: BloodRequest) => void
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
                <button onClick={() => onCrossMatch(r.id)} disabled={actionId === r.id}
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
function DonorsView({ donors }: { donors: BloodDonor[] }) {
  if (donors.length === 0) {
    return <GlassCard className="p-6"><EmptyState title="No donors registered" description="Donors can be linked when adding blood units." /></GlassCard>
  }
  return (
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
            <div className="flex gap-4 mt-1 text-xs" style={{ color: '#64748B' }}>
              <span>{d.phone ?? 'No phone'}</span>
              {d.last_donation_date && <span>Last: <DateText date={d.last_donation_date} /></span>}
            </div>
          </div>
        ))}
      </div>

      {/* ── DESKTOP TABLE (md+) ── */}
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
            {['Name', 'Blood Group', 'Phone', 'Last Donation'].map((h) => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  )
}
