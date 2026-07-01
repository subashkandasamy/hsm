'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Pill, Droplets, Wind, Plus, StopCircle, Check,
  ChevronDown, ChevronRight, Copy, AlertCircle, X, Ban, Pause,
  FlaskConical, ScanLine, Search, XCircle,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'

// ─── Collapsible Section wrapper ─────────────────────────────────────────────

interface CollapsibleSectionProps {
  icon: React.ReactNode
  title: string
  badge?: string
  iconColor: string
  action?: React.ReactNode
  children: React.ReactNode
}
function CollapsibleSection({ icon, title, badge, iconColor, action, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <GlassCard>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex-1 flex items-center gap-2 min-w-0"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
          >
            <span style={{ color: iconColor, flexShrink: 0 }}>{icon}</span>
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{title}</span>
            {badge && <span className="text-xs font-normal" style={{ color: '#94A3B8' }}>{badge}</span>}
            <span style={{ marginLeft: 'auto', flexShrink: 0, color: '#94A3B8' }}>
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          </button>
          {action && <div className="flex-shrink-0 flex gap-2">{action}</div>}
        </div>
        {open && (
          <div className="mt-3">
            {children}
          </div>
        )}
      </div>
    </GlassCard>
  )
}
import SelectUI from '@/components/ui/Select'
import {
  listOrders, createOrder, stopOrder,
  listSchedule, updateSlotStatus,
  getVisitPrescriptions, copyPrescriptionsToIPD,
  listIpdLabOrders, createIpdLabOrder, cancelIpdLabOrder, listLabCatalogForIpd,
  listIpdRadiologyOrders, createIpdRadiologyOrder, cancelIpdRadiologyOrder, listRadiologyCatalogForIpd,
} from '@/app/actions/ipdTreatment'
import { listDrugs } from '@/app/actions/pharmacy'
import type {
  IpdMedicationOrder, IpdAdminSchedule, FrequencyType, AdminStatus, Drug,
  LabOrder, LabTestCatalog, LabOrderStatus,
  RadiologyOrder, RadiologyCatalog, RadiologyOrderStatus,
} from '@/lib/types'

interface Props {
  admissionId: string
  patientId: string
  canOrder: boolean
  canGive: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_ICON = {
  medication:  <Pill     className="w-3.5 h-3.5" />,
  iv_infusion: <Droplets className="w-3.5 h-3.5" />,
  oxygen:      <Wind     className="w-3.5 h-3.5" />,
}
const TYPE_COLOR = {
  medication:  { bg: 'rgba(13,148,136,0.08)',  color: '#0D9488' },
  iv_infusion: { bg: 'rgba(59,130,246,0.08)',  color: '#2563EB' },
  oxygen:      { bg: 'rgba(168,85,247,0.08)',  color: '#7C3AED' },
}
const FREQ_LABELS: Record<FrequencyType, string> = {
  stat: 'Stat (once)', daily: 'Once daily', twice_daily: 'Twice daily',
  thrice_daily: 'Three times daily', every_x_hours: 'Every X hours',
  sos: 'SOS (as needed)', continuous: 'Continuous',
}
const ROUTES      = ['IV','IM','Oral','SC','Inhale','Topical','Sublingual']
const FLUIDS      = ['Normal Saline (NS)','Dextrose 5% (D5W)',"Ringer's Lactate",'DNS','D10W','Plain Water']
const DELIVERY    = ['Nasal Cannula','Simple Mask','Venturi Mask','Non-Rebreather Mask']
const DOSE_UNITS  = ['mg','ml','g','mcg','units','IU','mmol']
const QUICK_DAYS  = [1, 3, 5, 7, 10, 14]

const STATUS_STYLE: Record<AdminStatus, { dot: string; label: string; textColor: string; bg: string; border: string }> = {
  pending: { dot: '#F59E0B', label: 'Pending',  textColor: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  given:   { dot: '#10B981', label: 'Given',    textColor: '#065F46', bg: '#F0FDF4', border: '#BBF7D0' },
  missed:  { dot: '#EF4444', label: 'Missed',   textColor: '#7F1D1D', bg: '#FEF2F2', border: '#FECACA' },
  held:    { dot: '#8B5CF6', label: 'Held',     textColor: '#4C1D95', bg: '#F5F3FF', border: '#DDD6FE' },
}

const LAB_STATUS_STYLE: Record<LabOrderStatus, { label: string; color: string; bg: string }> = {
  ordered:    { label: 'Ordered',    color: '#92400E', bg: '#FEF3C7' },
  collected:  { label: 'Collected',  color: '#1E40AF', bg: '#DBEAFE' },
  processing: { label: 'Processing', color: '#7C3AED', bg: '#F5F3FF' },
  reported:   { label: 'Reported',   color: '#065F46', bg: '#DCFCE7' },
  cancelled:  { label: 'Cancelled',  color: '#6B7280', bg: '#F3F4F6' },
}

const RAD_STATUS_STYLE: Record<RadiologyOrderStatus, { label: string; color: string; bg: string }> = {
  ordered:   { label: 'Ordered',   color: '#92400E', bg: '#FEF3C7' },
  performed: { label: 'Performed', color: '#1E40AF', bg: '#DBEAFE' },
  reported:  { label: 'Reported',  color: '#065F46', bg: '#DCFCE7' },
  cancelled: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
}

function fmtDue(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
function fmtDay(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
}
function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

function orderLabel(o: IpdMedicationOrder): string {
  if (o.type === 'medication')  return `${o.drug_name ?? '—'} ${o.dose ?? ''}${o.dose_unit ?? ''} ${o.route ?? ''}`.trim()
  if (o.type === 'iv_infusion') return `${o.fluid_name ?? 'IV Fluid'} ${o.volume_ml ?? ''}ml @ ${o.rate_ml_per_hr ?? '?'} ml/hr`
  return `O₂ ${o.flow_rate_lpm ?? '?'} L/min — ${o.delivery_method ?? ''}`
}

// ─── Drug Name Combobox ───────────────────────────────────────────────────────

interface DrugComboboxProps {
  value: string; drugs: Drug[]
  onChange: (name: string, drug: Drug | null) => void
}
function DrugCombobox({ value, drugs, onChange }: DrugComboboxProps) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState(value)

  const filtered = query.trim().length > 0
    ? drugs.filter((d) =>
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        (d.generic_name ?? '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : []

  function select(drug: Drug) {
    const label = drug.strength ? `${drug.name} ${drug.strength}` : drug.name
    setQuery(label); onChange(label, drug); setOpen(false)
  }

  return (
    <div className="relative">
      <input value={query} onChange={(e) => { setQuery(e.target.value); onChange(e.target.value, null); setOpen(true) }}
        onFocus={() => { if (query.trim()) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search pharmacy or type new drug name…"
        className="w-full px-3 py-2 rounded-lg text-sm border" autoComplete="off"
        style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden"
          style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
          {filtered.map((drug) => (
            <button key={drug.id} type="button" onMouseDown={() => select(drug)}
              className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F8FAFC' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{drug.name}</p>
                {drug.generic_name && <p className="text-xs" style={{ color: '#94A3B8' }}>{drug.generic_name}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {drug.strength && <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{drug.strength}</span>}
                {drug.form && <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F1F5F9', color: '#64748B' }}>{drug.form}</span>}
              </div>
            </button>
          ))}
          {query.trim() && !filtered.some((d) => d.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button type="button" onMouseDown={() => { onChange(query.trim(), null); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0D9488' }} />
              <p className="text-sm" style={{ color: '#0D9488' }}>Use &ldquo;<strong>{query.trim()}</strong>&rdquo; (new drug)</p>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Slot Row ─────────────────────────────────────────────────────────────────

interface SlotRowProps {
  slot: IpdAdminSchedule; todayStr: string; canGive: boolean
  actingId: string | null
  onAction: (id: string, status: 'given' | 'missed' | 'held') => void
}
function SlotRow({ slot, todayStr, canGive, actingId, onAction }: SlotRowProps) {
  const slotDay  = slot.due_at.split('T')[0]
  const isToday  = slotDay === todayStr
  const isPast   = slotDay < todayStr
  const isFuture = slotDay > todayStr
  const isActed  = slot.status !== 'pending'
  const isOverdue = slot.status === 'pending' && isPast
  const isActing  = actingId === slot.id
  const st = STATUS_STYLE[slot.status]

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl flex-wrap"
      style={{
        background: isFuture && !isActed ? 'rgba(248,250,252,0.5)' : st.bg,
        border: `1px solid ${isFuture && !isActed ? '#F1F5F9' : st.border}`,
        opacity: isFuture ? 0.7 : 1,
      }}>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isOverdue ? '#EF4444' : st.dot }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: isFuture ? '#94A3B8' : '#0F172A' }}>
            {fmtDue(slot.due_at)}
          </span>
          {isOverdue && <span className="text-xs font-bold" style={{ color: '#EF4444' }}>OVERDUE</span>}
          {isActed && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
              style={{ background: st.border, color: st.textColor }}>{st.label}</span>
          )}
        </div>
        {isActed && slot.given_at && (
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            by {slot.nurse?.full_name ?? '—'} at {fmtDue(slot.given_at)}
            {slot.given_notes && ` · ${slot.given_notes}`}
          </p>
        )}
      </div>

      {/* Today / overdue: Given + Missed + Hold */}
      {!isActed && canGive && (isToday || isPast) && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => onAction(slot.id, 'given')} disabled={isActing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Check className="w-3 h-3" />{isActing ? '…' : 'Given'}
          </button>
          <button onClick={() => onAction(slot.id, 'missed')} disabled={isActing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
            <Ban className="w-3 h-3" />Missed
          </button>
          <button onClick={() => onAction(slot.id, 'held')} disabled={isActing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', cursor: 'pointer' }}>
            <Pause className="w-3 h-3" />Hold
          </button>
        </div>
      )}

      {/* Future pending: Skip */}
      {!isActed && isFuture && canGive && (
        <button onClick={() => onAction(slot.id, 'held')} disabled={isActing}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.08)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)', cursor: 'pointer' }}>
          <XCircle className="w-3 h-3" />{isActing ? '…' : 'Skip'}
        </button>
      )}
      {!isActed && isFuture && !canGive && (
        <span className="text-xs flex-shrink-0" style={{ color: '#CBD5E1' }}>Scheduled</span>
      )}
    </div>
  )
}

// ─── Order Card (drug-grouped) ────────────────────────────────────────────────

interface OrderCardProps {
  order: IpdMedicationOrder; slots: IpdAdminSchedule[]; todayStr: string
  canOrder: boolean; canGive: boolean; actingId: string | null; stoppingId: string | null
  onAction: (id: string, status: 'given' | 'missed' | 'held') => void
  onStop: (orderId: string) => void
}
function OrderCard({ order, slots, todayStr, canOrder, canGive, actingId, stoppingId, onAction, onStop }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const col = TYPE_COLOR[order.type]

  const byDay = slots.reduce<Record<string, IpdAdminSchedule[]>>((acc, s) => {
    const day = s.due_at.split('T')[0];(acc[day] ??= []).push(s); return acc
  }, {})
  const days = Object.keys(byDay).sort()

  const overdueCount = slots.filter((s) => s.due_at.split('T')[0] < todayStr && s.status === 'pending').length
  const todayPending = slots.filter((s) => s.due_at.split('T')[0] === todayStr && s.status === 'pending').length
  const urgentCount  = overdueCount + todayPending

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${col.color}25` }}>
      <div className="flex items-center gap-2 px-3 py-3 flex-wrap" style={{ background: col.bg }}>
        <span style={{ color: col.color }}>{TYPE_ICON[order.type]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>{orderLabel(order)}</p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            {FREQ_LABELS[order.frequency_type]} · {order.duration_days}d
            {order.notes ? ` · ${order.notes}` : ''}
          </p>
        </div>
        {urgentCount > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ background: overdueCount > 0 ? '#FEE2E2' : '#FEF3C7', color: overdueCount > 0 ? '#DC2626' : '#92400E' }}>
            {overdueCount > 0 ? `${overdueCount} overdue` : `${todayPending} due today`}
          </span>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {canOrder && order.status === 'active' && (
            <button onClick={() => onStop(order.id)} disabled={stoppingId === order.id}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)', cursor: 'pointer' }}>
              <StopCircle className="w-3 h-3" />{stoppingId === order.id ? '…' : 'Stop'}
            </button>
          )}
          <button onClick={() => setExpanded((v) => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
          {days.map((day) => (
            <div key={day} className="px-3 py-2">
              <p className="text-xs font-semibold mb-1.5"
                style={{ color: day === todayStr ? '#0D9488' : day < todayStr ? '#94A3B8' : '#64748B' }}>
                {day === todayStr ? '▶ Today' : fmtDay(day + 'T00:00:00')}
                {day < todayStr && <span className="ml-1" style={{ color: '#CBD5E1' }}>(past)</span>}
              </p>
              <div className="space-y-1.5">
                {byDay[day].map((slot) => (
                  <SlotRow key={slot.id} slot={slot} todayStr={todayStr}
                    canGive={canGive} actingId={actingId} onAction={onAction} />
                ))}
              </div>
            </div>
          ))}
          {slots.length === 0 && (
            <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No schedule slots.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Lab Panel ────────────────────────────────────────────────────────────────

interface LabPanelProps { admissionId: string; patientId: string; canOrder: boolean }
function LabPanel({ admissionId, patientId, canOrder }: LabPanelProps) {
  const [orders, setOrders]             = useState<LabOrder[]>([])
  const [catalog, setCatalog]           = useState<LabTestCatalog[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [query, setQuery]               = useState('')
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [saving, setSaving]             = useState(false)
  const [err, setErr]                   = useState('')
  const [cancelingId, setCancelingId]   = useState<string | null>(null)

  useEffect(() => {
    listIpdLabOrders(admissionId).then((o) => { setOrders(o); setLoading(false) })
  }, [admissionId])

  async function openModal() {
    setShowModal(true); setSelected(new Set()); setQuery(''); setErr('')
    if (catalog.length === 0) {
      setCatalogLoading(true)
      setCatalog(await listLabCatalogForIpd())
      setCatalogLoading(false)
    }
  }

  async function submitOrder() {
    if (selected.size === 0) return
    setSaving(true); setErr('')
    const res = await createIpdLabOrder(admissionId, patientId, Array.from(selected))
    setSaving(false)
    if (!res.success) { setErr(res.error); return }
    setOrders(await listIpdLabOrders(admissionId)); setShowModal(false); setSelected(new Set())
  }

  async function handleCancel(orderId: string) {
    setCancelingId(orderId)
    await cancelIpdLabOrder(orderId)
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'cancelled' } : o))
    setCancelingId(null)
  }

  const filtered = query.trim()
    ? catalog.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || (t.code ?? '').toLowerCase().includes(query.toLowerCase()))
    : catalog

  return (
    <>
      <CollapsibleSection
        icon={<FlaskConical className="w-4 h-4" />}
        title="Lab Tests"
        badge={`(${orders.filter((o) => o.status !== 'cancelled').length} active)`}
        iconColor="#2563EB"
        action={canOrder ? (
          <button onClick={openModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-3.5 h-3.5" /> Order Lab Test
          </button>
        ) : undefined}
      >
        {loading ? (
          <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No lab orders yet.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const st = LAB_STATUS_STYLE[order.status]
              const isCancelled = order.status === 'cancelled'
              return (
                <div key={order.id} className="rounded-xl p-3"
                  style={{ background: isCancelled ? '#F8FAFC' : 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.1)', opacity: isCancelled ? 0.55 : 1 }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: st.bg, color: st.color }}>{st.label}</span>
                        <span className="text-xs" style={{ color: '#94A3B8' }}>
                          {fmtDateTime(order.ordered_at)}
                          {order.orderer?.full_name ? ` · Dr. ${order.orderer.full_name}` : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {order.items?.map((item) => (
                          <span key={item.id} className="text-xs px-2 py-0.5 rounded-md"
                            style={{ background: '#DBEAFE', color: '#1E40AF' }}>
                            {item.test?.name ?? item.test_id}
                            {item.flag !== 'pending' && item.flag !== 'normal' && (
                              <span className="ml-1 font-bold" style={{ color: item.flag === 'high' ? '#DC2626' : '#D97706' }}>
                                {item.flag === 'high' ? '↑' : '↓'}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                      {order.reported_at && (
                        <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>Reported: {fmtDateTime(order.reported_at)}</p>
                      )}
                    </div>
                    {canOrder && !isCancelled && order.status === 'ordered' && (
                      <button onClick={() => handleCancel(order.id)} disabled={cancelingId === order.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs flex-shrink-0"
                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                        <X className="w-3 h-3" />{cancelingId === order.id ? '…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Order Lab Test Modal ─────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="w-full max-w-lg rounded-2xl flex flex-col"
            style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: '80vh' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4" style={{ color: '#2563EB' }} />
                <h3 className="font-semibold" style={{ color: '#0F172A' }}>Order Lab Tests</h3>
              </div>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Search */}
            <div className="px-5 pt-4 pb-3" style={{ flexShrink: 0 }}>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tests…" autoFocus
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border"
                  style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
              </div>
            </div>
            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1">
              {catalogLoading ? (
                <p className="text-xs text-center py-6" style={{ color: '#94A3B8' }}>Loading tests…</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: '#94A3B8' }}>No tests found.</p>
              ) : (
                filtered.map((test) => (
                  <label key={test.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer"
                    style={{
                      background: selected.has(test.id) ? 'rgba(37,99,235,0.06)' : '#F8FAFC',
                      border: `1px solid ${selected.has(test.id) ? 'rgba(37,99,235,0.2)' : '#E2E8F0'}`,
                    }}>
                    <input type="checkbox" checked={selected.has(test.id)}
                      onChange={(e) => setSelected((prev) => {
                        const n = new Set(prev)
                        if (e.target.checked) n.add(test.id); else n.delete(test.id); return n
                      })} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium" style={{ color: '#0F172A' }}>{test.name}</p>
                      {test.sample_type && <p className="text-xs" style={{ color: '#94A3B8' }}>{test.sample_type}</p>}
                    </div>
                    {test.code && <span className="text-xs flex-shrink-0" style={{ color: '#94A3B8' }}>{test.code}</span>}
                  </label>
                ))
              )}
            </div>
            {/* Footer */}
            <div className="px-5 py-4 flex items-center justify-between gap-3"
              style={{ borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
              <div className="flex-1 min-w-0">
                {err ? (
                  <p className="text-xs truncate" style={{ color: '#DC2626' }}>{err}</p>
                ) : (
                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                    {selected.size > 0 ? `${selected.size} test${selected.size !== 1 ? 's' : ''} selected` : 'Select tests to order'}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs"
                  style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={submitOrder} disabled={saving || selected.size === 0}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: (saving || selected.size === 0) ? '#94A3B8' : '#0D9488',
                    color: '#fff', border: 'none',
                    cursor: (saving || selected.size === 0) ? 'not-allowed' : 'pointer',
                  }}>
                  {saving ? 'Ordering…' : `Order${selected.size > 0 ? ` ${selected.size}` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Radiology Panel ──────────────────────────────────────────────────────────

interface RadPanelProps { admissionId: string; patientId: string; canOrder: boolean }
function RadiologyPanel({ admissionId, patientId, canOrder }: RadPanelProps) {
  const [orders, setOrders]               = useState<RadiologyOrder[]>([])
  const [catalog, setCatalog]             = useState<RadiologyCatalog[]>([])
  const [loading, setLoading]             = useState(true)
  const [showForm, setShowForm]           = useState(false)
  const [query, setQuery]                 = useState('')
  const [selectedTest, setSelectedTest]   = useState<RadiologyCatalog | null>(null)
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [err, setErr]                     = useState('')
  const [cancelingId, setCancelingId]     = useState<string | null>(null)

  useEffect(() => {
    listIpdRadiologyOrders(admissionId).then((o) => { setOrders(o); setLoading(false) })
  }, [admissionId])

  async function openForm() {
    setShowForm(true); setSelectedTest(null); setNotes(''); setQuery('')
    if (catalog.length === 0) setCatalog(await listRadiologyCatalogForIpd())
  }

  async function submitOrder() {
    if (!selectedTest) return
    setSaving(true); setErr('')
    const res = await createIpdRadiologyOrder(admissionId, patientId, selectedTest.id, notes || undefined)
    setSaving(false)
    if (!res.success) { setErr(res.error); return }
    setOrders(await listIpdRadiologyOrders(admissionId))
    setShowForm(false); setSelectedTest(null); setNotes('')
  }

  async function handleCancel(orderId: string) {
    setCancelingId(orderId)
    await cancelIpdRadiologyOrder(orderId)
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'cancelled' } : o))
    setCancelingId(null)
  }

  const filtered = query.trim()
    ? catalog.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()) || (t.modality ?? '').toLowerCase().includes(query.toLowerCase()))
    : catalog

  return (
    <CollapsibleSection
      icon={<ScanLine className="w-4 h-4" />}
      title="Radiology"
      badge={`(${orders.filter((o) => o.status !== 'cancelled').length} active)`}
      iconColor="#7C3AED"
      action={canOrder ? (
        <button onClick={() => showForm ? setShowForm(false) : openForm()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          <Plus className="w-3.5 h-3.5" /> Order Scan
        </button>
      ) : undefined}
    >
      {showForm && (
        <div className="mb-4 p-3 rounded-xl space-y-2.5"
          style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          {err && <p className="text-xs px-2 py-1.5 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{err}</p>}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scans…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1">
            {filtered.map((test) => (
              <button key={test.id} type="button"
                onClick={() => setSelectedTest(test.id === selectedTest?.id ? null : test)}
                className="w-full text-left px-2.5 py-2 rounded-lg"
                style={{
                  background: selectedTest?.id === test.id ? 'rgba(124,58,237,0.08)' : '#F8FAFC',
                  border: `1px solid ${selectedTest?.id === test.id ? 'rgba(124,58,237,0.25)' : '#E2E8F0'}`,
                  cursor: 'pointer',
                }}>
                <p className="text-xs font-medium" style={{ color: '#0F172A' }}>{test.name}</p>
                {test.modality && <p className="text-xs" style={{ color: '#94A3B8' }}>{test.modality}</p>}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No scans found.</p>
            )}
          </div>
          {selectedTest && (
            <div className="px-2.5 py-2 rounded-lg" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <p className="text-xs font-semibold" style={{ color: '#7C3AED' }}>Selected: {selectedTest.name}</p>
            </div>
          )}
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Clinical indication / notes (optional)"
            className="w-full px-3 py-2 rounded-lg text-sm border"
            style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>Cancel</button>
            <button onClick={submitOrder} disabled={saving || !selectedTest}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: (saving || !selectedTest) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {saving ? 'Ordering…' : 'Order Scan'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No radiology orders yet.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const st = RAD_STATUS_STYLE[order.status]
            const isCancelled = order.status === 'cancelled'
            return (
              <div key={order.id} className="rounded-xl p-3"
                style={{ background: isCancelled ? '#F8FAFC' : 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.1)', opacity: isCancelled ? 0.55 : 1 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{order.test?.name ?? '—'}</p>
                      {order.test?.modality && (
                        <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: '#F5F3FF', color: '#7C3AED' }}>{order.test.modality}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      <span className="text-xs" style={{ color: '#94A3B8' }}>
                        {fmtDateTime(order.ordered_at)}
                        {order.orderer?.full_name ? ` · Dr. ${order.orderer.full_name}` : ''}
                      </span>
                    </div>
                    {order.report && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: '#475569' }}>{order.report}</p>
                    )}
                    {order.reported_at && (
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Reported: {fmtDateTime(order.reported_at)}</p>
                    )}
                  </div>
                  {canOrder && !isCancelled && order.status === 'ordered' && (
                    <button onClick={() => handleCancel(order.id)} disabled={cancelingId === order.id}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs flex-shrink-0"
                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                      <X className="w-3 h-3" />{cancelingId === order.id ? '…' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </CollapsibleSection>
  )
}

// ─── Order Form State ─────────────────────────────────────────────────────────

interface OrderForm {
  type: IpdMedicationOrder['type']
  drug_name: string; dose: string; dose_unit: string; route: string
  fluid_name: string; volume_ml: string; rate_ml_per_hr: string
  flow_rate_lpm: string; delivery_method: string
  frequency_type: FrequencyType; frequency_hours: string
  duration_days: string; notes: string
}
const BLANK: OrderForm = {
  type: 'medication', drug_name: '', dose: '', dose_unit: 'mg', route: 'IV',
  fluid_name: '', volume_ml: '', rate_ml_per_hr: '',
  flow_rate_lpm: '', delivery_method: 'Nasal Cannula',
  frequency_type: 'daily', frequency_hours: '6', duration_days: '5', notes: '',
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function TreatmentPanel({ admissionId, patientId, canOrder, canGive }: Props) {
  const [orders, setOrders]     = useState<IpdMedicationOrder[]>([])
  const [schedule, setSchedule] = useState<IpdAdminSchedule[]>([])
  const [loading, setLoading]   = useState(true)
  const [, startTransition]     = useTransition()
  const [error, setError]       = useState('')

  const [pharmaDrugs, setPharmaDrugs] = useState<Drug[]>([])

  const [showForm, setShowForm]       = useState(false)
  const [form, setForm]               = useState<OrderForm>(BLANK)
  const [formError, setFormError]     = useState('')
  const [formSaving, setFormSaving]   = useState(false)

  const [showCopy, setShowCopy]       = useState(false)
  const [visitGroups, setVisitGroups] = useState<Awaited<ReturnType<typeof getVisitPrescriptions>>>([])
  const [selectedPrx, setSelectedPrx] = useState<Set<string>>(new Set())
  const [copyVisitId, setCopyVisitId] = useState('')
  const [copyPending, setCopyPending] = useState(false)

  const [actingId, setActingId]       = useState<string | null>(null)
  const [stoppingId, setStoppingId]   = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    Promise.all([listOrders(admissionId), listSchedule(admissionId)]).then(([o, s]) => {
      setOrders(o); setSchedule(s); setLoading(false)
    })
  }, [admissionId])

  useEffect(() => {
    if (showForm && pharmaDrugs.length === 0) listDrugs().then(setPharmaDrugs)
  }, [showForm]) // eslint-disable-line react-hooks/exhaustive-deps

  function setF(k: keyof OrderForm, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submitOrder() {
    setFormSaving(true); setFormError('')
    const dur = parseInt(form.duration_days) || 5
    const res = await createOrder(admissionId, {
      type:            form.type,
      drug_name:       form.drug_name || undefined,
      dose:            form.dose ? parseFloat(form.dose) : undefined,
      dose_unit:       form.dose_unit || undefined,
      route:           form.route || undefined,
      fluid_name:      form.fluid_name || undefined,
      volume_ml:       form.volume_ml ? parseFloat(form.volume_ml) : undefined,
      rate_ml_per_hr:  form.rate_ml_per_hr ? parseFloat(form.rate_ml_per_hr) : undefined,
      flow_rate_lpm:   form.flow_rate_lpm ? parseFloat(form.flow_rate_lpm) : undefined,
      delivery_method: form.delivery_method || undefined,
      frequency_type:  form.frequency_type,
      frequency_hours: form.frequency_type === 'every_x_hours' && form.frequency_hours ? parseInt(form.frequency_hours) : undefined,
      duration_days:   dur,
      notes:           form.notes || undefined,
    })
    setFormSaving(false)
    if (!res.success) { setFormError(res.error); return }
    setOrders((prev) => [res.order, ...prev])
    setSchedule(await listSchedule(admissionId))
    setShowForm(false); setForm(BLANK)
  }

  async function handleStop(orderId: string) {
    setStoppingId(orderId)
    startTransition(async () => {
      const res = await stopOrder(orderId)
      setStoppingId(null)
      if (!res.success) { setError(res.error); return }
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'stopped' } : o))
      setSchedule((prev) => prev.map((s) => s.order_id === orderId && s.status === 'pending' ? { ...s, status: 'held' } : s))
    })
  }

  async function handleSlotAction(scheduleId: string, status: 'given' | 'missed' | 'held') {
    setActingId(scheduleId)
    const res = await updateSlotStatus(scheduleId, status)
    setActingId(null)
    if (!res.success) { setError(res.error); return }
    setSchedule((prev) => prev.map((s) => s.id === scheduleId
      ? { ...s, status, given_at: new Date().toISOString() } : s))
  }

  async function openCopy() {
    setShowCopy(true)
    const groups = await getVisitPrescriptions(patientId)
    setVisitGroups(groups)
    if (groups[0]) setCopyVisitId(groups[0].visitId)
  }

  async function handleCopy() {
    if (!copyVisitId || selectedPrx.size === 0) return
    setCopyPending(true)
    const res = await copyPrescriptionsToIPD(admissionId, copyVisitId, Array.from(selectedPrx))
    setCopyPending(false)
    if (!res.success) { setError(res.error); return }
    const [newOrders, newSchedule] = await Promise.all([listOrders(admissionId), listSchedule(admissionId)])
    setOrders(newOrders); setSchedule(newSchedule)
    setShowCopy(false); setSelectedPrx(new Set())
  }

  function slotsForOrder(orderId: string) { return schedule.filter((s) => s.order_id === orderId) }

  const activeOrders  = orders.filter((o) => o.status === 'active')
  const stoppedOrders = orders.filter((o) => o.status === 'stopped')
  const currentGroup  = visitGroups.find((g) => g.visitId === copyVisitId)

  return (
    <div className="space-y-4">

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Medications / IV / Oxygen ────────────────────────── */}
      <CollapsibleSection
        icon={<Pill className="w-4 h-4" />}
        title="Medications / IV / O₂"
        badge={`(${activeOrders.length} active)`}
        iconColor="#0D9488"
        action={canOrder ? (
          <>
            <button onClick={openCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(13,148,136,0.06)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.15)', cursor: 'pointer' }}>
              <Copy className="w-3.5 h-3.5" /> Copy from OPD
            </button>
            <button onClick={() => { setShowForm((v) => !v); setFormError('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3.5 h-3.5" /> New Order
            </button>
          </>
        ) : undefined}
      >
        {showForm && (
          <div className="mb-4 p-4 rounded-xl space-y-3"
            style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            {formError && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</p>
            )}
            <div className="flex gap-2">
              {(['medication','iv_infusion','oxygen'] as const).map((t) => (
                <button key={t} onClick={() => setF('type', t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-1 justify-center"
                  style={form.type === t
                    ? { background: TYPE_COLOR[t].bg, color: TYPE_COLOR[t].color, border: `1px solid ${TYPE_COLOR[t].color}40`, cursor: 'pointer' }
                    : { background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  {TYPE_ICON[t]} {t === 'iv_infusion' ? 'IV Infusion' : t === 'oxygen' ? 'Oxygen' : 'Medication'}
                </button>
              ))}
            </div>

            {form.type === 'medication' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Drug Name *</label>
                  <DrugCombobox value={form.drug_name} drugs={pharmaDrugs}
                    onChange={(name, drug) => { setF('drug_name', name); if (drug?.unit) setF('dose_unit', drug.unit) }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Dose</label>
                  <div className="flex gap-1">
                    <input type="number" value={form.dose} onChange={(e) => setF('dose', e.target.value)}
                      placeholder="1.2" className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm border"
                      style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                    <SelectUI value={form.dose_unit} onChange={(e) => setF('dose_unit', e.target.value)} style={{ minWidth: '75px' }}>
                      {DOSE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </SelectUI>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Route</label>
                  <SelectUI value={form.route} onChange={(e) => setF('route', e.target.value)}>
                    {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </SelectUI>
                </div>
              </div>
            )}

            {form.type === 'iv_infusion' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Fluid *</label>
                  <SelectUI value={form.fluid_name} onChange={(e) => setF('fluid_name', e.target.value)}>
                    <option value="">Select fluid…</option>
                    {FLUIDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </SelectUI>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Volume (ml)</label>
                  <input type="number" value={form.volume_ml} onChange={(e) => setF('volume_ml', e.target.value)}
                    placeholder="500" className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Rate (ml/hr)</label>
                  <input type="number" value={form.rate_ml_per_hr} onChange={(e) => setF('rate_ml_per_hr', e.target.value)}
                    placeholder="60" className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                </div>
              </div>
            )}

            {form.type === 'oxygen' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Flow Rate (L/min) *</label>
                  <input type="number" value={form.flow_rate_lpm} onChange={(e) => setF('flow_rate_lpm', e.target.value)}
                    placeholder="2" className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Delivery Method</label>
                  <SelectUI value={form.delivery_method} onChange={(e) => setF('delivery_method', e.target.value)}>
                    {DELIVERY.map((d) => <option key={d} value={d}>{d}</option>)}
                  </SelectUI>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Frequency *</label>
                <SelectUI value={form.frequency_type} onChange={(e) => setF('frequency_type', e.target.value as FrequencyType)}>
                  {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </SelectUI>
              </div>
              {form.frequency_type === 'every_x_hours' && (
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Every (hours)</label>
                  <input type="number" value={form.frequency_hours} onChange={(e) => setF('frequency_hours', e.target.value)}
                    min="1" max="24" className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
                </div>
              )}
            </div>

            {!['stat','sos','continuous'].includes(form.frequency_type) && (
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Duration (days) *</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="number" value={form.duration_days} onChange={(e) => setF('duration_days', e.target.value)}
                    min="1" max="60" className="w-20 px-3 py-2 rounded-lg text-sm border font-semibold"
                    style={{ borderColor: '#0D9488', color: '#0D9488' }} />
                  <div className="flex gap-1 flex-wrap">
                    {QUICK_DAYS.map((d) => (
                      <button key={d} type="button" onClick={() => setF('duration_days', String(d))}
                        className="px-2 py-1 rounded-lg text-xs font-medium"
                        style={{
                          background: form.duration_days === String(d) ? '#0D9488' : '#F1F5F9',
                          color:      form.duration_days === String(d) ? '#fff' : '#64748B',
                          border: 'none', cursor: 'pointer',
                        }}>{d}d</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Notes / Instructions</label>
              <input value={form.notes} onChange={(e) => setF('notes', e.target.value)}
                placeholder="e.g. dilute in 100ml NS, infuse over 30 min"
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowForm(false); setForm(BLANK) }}
                className="px-3 py-1.5 rounded-lg text-xs"
                style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitOrder} disabled={formSaving}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: formSaving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: formSaving ? 'not-allowed' : 'pointer' }}>
                {formSaving ? 'Saving…' : 'Add Order'}
              </button>
            </div>
          </div>
        )}

        {!showForm && !loading && orders.length > 0 && (
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {(['given','missed','held'] as AdminStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1 text-xs" style={{ color: STATUS_STYLE[s].textColor }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_STYLE[s].dot }} />
                {STATUS_STYLE[s].label}
              </span>
            ))}
            <span className="text-xs ml-auto" style={{ color: '#94A3B8' }}>Future slots can be skipped</span>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
        ) : activeOrders.length === 0 && !showForm ? (
          <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>
            No active orders.{canOrder ? ' Add a new order above.' : ''}
          </p>
        ) : (
          <div className="space-y-3">
            {activeOrders.map((o) => (
              <OrderCard key={o.id} order={o} slots={slotsForOrder(o.id)}
                todayStr={todayStr} canOrder={canOrder} canGive={canGive}
                actingId={actingId} stoppingId={stoppingId}
                onAction={handleSlotAction} onStop={handleStop} />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {stoppedOrders.length > 0 && (
        <details>
          <summary className="text-xs cursor-pointer py-1" style={{ color: '#94A3B8' }}>
            Stopped Orders ({stoppedOrders.length})
          </summary>
          <GlassCard className="mt-2">
            <div className="p-3 space-y-1.5">
              {stoppedOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-xs py-1"
                  style={{ borderBottom: '1px solid #F8FAFC', color: '#94A3B8' }}>
                  <span className="line-through">{orderLabel(o)}</span>
                  <span>Stopped {o.stop_at ? new Date(o.stop_at).toLocaleDateString('en-IN') : ''}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </details>
      )}

      {/* ── Lab Tests ─────────────────────────────────────────── */}
      <LabPanel admissionId={admissionId} patientId={patientId} canOrder={canOrder} />

      {/* ── Radiology ─────────────────────────────────────────── */}
      <RadiologyPanel admissionId={admissionId} patientId={patientId} canOrder={canOrder} />

      {/* ── Copy from OPD modal ──────────────────────────────── */}
      {showCopy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: '#0F172A' }}>Copy from OPD Visit</h3>
              <button onClick={() => setShowCopy(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {visitGroups.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No past OPD prescriptions found.</p>
            ) : (
              <>
                <SelectUI value={copyVisitId} onChange={(e) => { setCopyVisitId(e.target.value); setSelectedPrx(new Set()) }}>
                  {visitGroups.map((g) => (
                    <option key={g.visitId} value={g.visitId}>
                      Visit — {new Date(g.visitDate).toLocaleDateString('en-IN')} ({g.prescriptions.length} drugs)
                    </option>
                  ))}
                </SelectUI>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {currentGroup?.prescriptions.map((p) => (
                    <label key={p.id} className="flex items-start gap-3 p-2.5 rounded-xl cursor-pointer"
                      style={{ background: selectedPrx.has(p.id) ? 'rgba(13,148,136,0.06)' : '#F8FAFC', border: `1px solid ${selectedPrx.has(p.id) ? 'rgba(13,148,136,0.2)' : '#E2E8F0'}` }}>
                      <input type="checkbox" checked={selectedPrx.has(p.id)}
                        onChange={(e) => {
                          setSelectedPrx((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n })
                        }} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{p.drug_name}</p>
                        <p className="text-xs" style={{ color: '#64748B' }}>
                          {p.dosage} · {p.frequency}{p.instructions ? ` · ${p.instructions}` : ''}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowCopy(false)}
                    className="px-4 py-2 rounded-xl text-sm"
                    style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleCopy} disabled={copyPending || selectedPrx.size === 0}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: (copyPending || selectedPrx.size === 0) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    {copyPending ? 'Copying…' : `Copy ${selectedPrx.size} Drug${selectedPrx.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
