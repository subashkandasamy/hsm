'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import {
  Pill, Droplets, Wind, Plus, StopCircle, Check, Clock,
  ChevronDown, ChevronRight, Copy, AlertCircle, X,
} from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import SelectUI from '@/components/ui/Select'
import {
  listOrders, createOrder, stopOrder,
  listSchedule, markGiven,
  getVisitPrescriptions, copyPrescriptionsToIPD,
} from '@/app/actions/ipdTreatment'
import { listDrugs } from '@/app/actions/pharmacy'
import type { IpdMedicationOrder, IpdAdminSchedule, FrequencyType, Drug } from '@/lib/types'

interface Props {
  admissionId: string
  patientId: string
  canOrder: boolean    // doctor / admin
  canGive: boolean     // nurse / doctor / admin
}

const TYPE_ICON = {
  medication:   <Pill    className="w-3.5 h-3.5" />,
  iv_infusion:  <Droplets className="w-3.5 h-3.5" />,
  oxygen:       <Wind    className="w-3.5 h-3.5" />,
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
const ROUTES = ['IV','IM','Oral','SC','Inhale','Topical','Sublingual']
const FLUIDS = ['Normal Saline (NS)','Dextrose 5% (D5W)','Ringer\'s Lactate','DNS','D10W','Plain Water']
const DELIVERY = ['Nasal Cannula','Simple Mask','Venturi Mask','Non-Rebreather Mask']
const DOSE_UNITS = ['mg','ml','g','mcg','units','IU','mmol']

function formatDue(due: string) {
  return new Date(due).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12: true })
}

function orderLabel(o: IpdMedicationOrder): string {
  if (o.type === 'medication') return `${o.drug_name ?? '—'} ${o.dose ?? ''}${o.dose_unit ?? ''} ${o.route ?? ''}`.trim()
  if (o.type === 'iv_infusion') return `${o.fluid_name ?? 'IV Fluid'} ${o.volume_ml ?? ''}ml @ ${o.rate_ml_per_hr ?? '?'} ml/hr`
  return `O₂ ${o.flow_rate_lpm ?? '?'} L/min — ${o.delivery_method ?? ''}`
}

// ─── Drug Name Combobox ───────────────────────────────────────────────────────

interface DrugComboboxProps {
  value: string
  drugs: Drug[]
  onChange: (name: string, drug: Drug | null) => void
}

function DrugCombobox({ value, drugs, onChange }: DrugComboboxProps) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState(value)
  const inputRef          = useRef<HTMLInputElement>(null)

  const filtered = query.trim().length > 0
    ? drugs.filter((d) =>
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        (d.generic_name ?? '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : []

  function select(drug: Drug) {
    const label = drug.strength ? `${drug.name} ${drug.strength}` : drug.name
    setQuery(label)
    onChange(label, drug)
    setOpen(false)
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    onChange(e.target.value, null)
    setOpen(true)
  }

  function handleBlur() {
    // short delay so click on dropdown item fires first
    setTimeout(() => setOpen(false), 150)
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={handleInput}
        onFocus={() => { if (query.trim()) setOpen(true) }}
        onBlur={handleBlur}
        placeholder="Search pharmacy or type new drug name…"
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden"
          style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
          {filtered.map((drug) => (
            <button
              key={drug.id}
              type="button"
              onMouseDown={() => select(drug)}
              className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F8FAFC' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{drug.name}</p>
                {drug.generic_name && (
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{drug.generic_name}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {drug.strength && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>
                    {drug.strength}
                  </span>
                )}
                {drug.form && (
                  <span className="text-xs px-1.5 py-0.5 rounded-md"
                    style={{ background: '#F1F5F9', color: '#64748B' }}>
                    {drug.form}
                  </span>
                )}
              </div>
            </button>
          ))}
          {/* Always allow the typed value as a custom entry */}
          {query.trim() && !filtered.some((d) => d.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button
              type="button"
              onMouseDown={() => { onChange(query.trim(), null); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0D9488' }} />
              <p className="text-sm" style={{ color: '#0D9488' }}>
                Use &ldquo;<strong>{query.trim()}</strong>&rdquo; (new drug)
              </p>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── New Order Form ───────────────────────────────────────────────────────────

interface OrderForm {
  type: IpdMedicationOrder['type']
  drug_name: string
  dose: string
  dose_unit: string
  route: string
  fluid_name: string
  volume_ml: string
  rate_ml_per_hr: string
  flow_rate_lpm: string
  delivery_method: string
  frequency_type: FrequencyType
  frequency_hours: string
  notes: string
}

const BLANK: OrderForm = {
  type: 'medication', drug_name: '', dose: '', dose_unit: 'mg', route: 'IV',
  fluid_name: '', volume_ml: '', rate_ml_per_hr: '',
  flow_rate_lpm: '', delivery_method: 'Nasal Cannula',
  frequency_type: 'daily', frequency_hours: '6', notes: '',
}

export default function TreatmentPanel({ admissionId, patientId, canOrder, canGive }: Props) {
  const [orders, setOrders]       = useState<IpdMedicationOrder[]>([])
  const [schedule, setSchedule]   = useState<IpdAdminSchedule[]>([])
  const [loading, setLoading]     = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError]         = useState('')

  // Pharmacy drug list for autocomplete
  const [pharmaDrugs, setPharmaDrugs] = useState<Drug[]>([])

  // New order form
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState<OrderForm>(BLANK)
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Copy from OPD
  const [showCopy, setShowCopy]   = useState(false)
  const [visitGroups, setVisitGroups] = useState<Awaited<ReturnType<typeof getVisitPrescriptions>>>([])
  const [selectedPrx, setSelectedPrx] = useState<Set<string>>(new Set())
  const [copyVisitId, setCopyVisitId] = useState('')
  const [copyPending, setCopyPending] = useState(false)

  // History expand
  const [showHistory, setShowHistory] = useState(false)

  // Mark given
  const [givingId, setGivingId]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listOrders(admissionId), listSchedule(admissionId)]).then(([o, s]) => {
      setOrders(o); setSchedule(s); setLoading(false)
    })
  }, [admissionId])

  useEffect(() => {
    if (showForm && pharmaDrugs.length === 0) {
      listDrugs().then(setPharmaDrugs)
    }
  }, [showForm]) // eslint-disable-line react-hooks/exhaustive-deps

  function setF(k: keyof OrderForm, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function submitOrder() {
    setFormSaving(true); setFormError('')
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
      notes:           form.notes || undefined,
    })
    setFormSaving(false)
    if (!res.success) { setFormError(res.error); return }
    setOrders((prev) => [res.order, ...prev])
    const newSchedule = await listSchedule(admissionId)
    setSchedule(newSchedule)
    setShowForm(false); setForm(BLANK)
  }

  async function handleStop(orderId: string) {
    startTransition(async () => {
      const res = await stopOrder(orderId)
      if (!res.success) { setError(res.error); return }
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'stopped' } : o))
      setSchedule((prev) => prev.map((s) => s.order_id === orderId && s.status === 'pending' ? { ...s, status: 'held' } : s))
    })
  }

  async function handleGiven(scheduleId: string) {
    setGivingId(scheduleId)
    const res = await markGiven(scheduleId)
    setGivingId(null)
    if (!res.success) { setError(res.error); return }
    setSchedule((prev) => prev.map((s) => s.id === scheduleId
      ? { ...s, status: 'given', given_at: new Date().toISOString() }
      : s))
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

  const activeOrders = orders.filter((o) => o.status === 'active')
  const stoppedOrders = orders.filter((o) => o.status === 'stopped')

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const todaySlots = schedule.filter((s) => s.due_at.startsWith(todayStr) || s.status === 'pending')
    .sort((a, b) => a.due_at.localeCompare(b.due_at))
  const givenSlots = schedule.filter((s) => s.status === 'given')
    .sort((a, b) => b.given_at!.localeCompare(a.given_at!))

  const currentGroup = visitGroups.find((g) => g.visitId === copyVisitId)

  return (
    <div className="space-y-4">

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Active Orders ───────────────────────────────────── */}
      <GlassCard>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4" style={{ color: '#0D9488' }} />
              <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                Active Orders <span className="text-xs font-normal" style={{ color: '#94A3B8' }}>({activeOrders.length})</span>
              </h3>
            </div>
            {canOrder && (
              <div className="flex gap-2">
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
              </div>
            )}
          </div>

          {/* New order form */}
          {showForm && (
            <div className="mb-4 p-4 rounded-xl space-y-3"
              style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
              {formError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }}>{formError}</p>
              )}

              {/* Type selector */}
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

              {/* Medication fields */}
              {form.type === 'medication' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Drug Name *</label>
                    <DrugCombobox
                      value={form.drug_name}
                      drugs={pharmaDrugs}
                      onChange={(name, drug) => {
                        setF('drug_name', name)
                        if (drug?.unit) setF('dose_unit', drug.unit)
                      }}
                    />
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

              {/* IV Infusion fields */}
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

              {/* Oxygen fields */}
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

              {/* Frequency */}
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

              {/* Notes */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: '#64748B' }}>Notes / Instructions</label>
                <input value={form.notes} onChange={(e) => setF('notes', e.target.value)}
                  placeholder="e.g. dilute in 100ml NS, infuse over 30 min"
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ borderColor: '#E2E8F0', color: '#0F172A' }} />
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowForm(false); setForm(BLANK) }}
                  className="px-3 py-1.5 rounded-lg text-xs" style={{ background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={submitOrder} disabled={formSaving}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: formSaving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: formSaving ? 'not-allowed' : 'pointer' }}>
                  {formSaving ? 'Saving…' : 'Add Order'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
          ) : activeOrders.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>No active orders. {canOrder ? 'Add a new order above.' : ''}</p>
          ) : (
            <div className="space-y-2">
              {activeOrders.map((o) => {
                const col = TYPE_COLOR[o.type]
                return (
                  <div key={o.id} className="flex items-start gap-3 px-3 py-3 rounded-xl"
                    style={{ background: col.bg, border: `1px solid ${col.color}20` }}>
                    <div className="mt-0.5 flex-shrink-0" style={{ color: col.color }}>{TYPE_ICON[o.type]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{orderLabel(o)}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: '#64748B' }}>{FREQ_LABELS[o.frequency_type]}</span>
                        {o.notes && <span className="text-xs" style={{ color: '#94A3B8' }}>· {o.notes}</span>}
                        {o.copied_from_visit_id && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>copied from OPD</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                        {o.doctor?.full_name} · {new Date(o.start_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    {canOrder && (
                      <button onClick={() => handleStop(o.id)} disabled={isPending}
                        title="Stop order"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs flex-shrink-0"
                        style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)', cursor: 'pointer' }}>
                        <StopCircle className="w-3 h-3" /> Stop
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Today's Schedule ────────────────────────────────── */}
      <GlassCard>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4" style={{ color: '#0D9488' }} />
            <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Administration Schedule</h3>
          </div>

          {todaySlots.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No pending administrations.</p>
          ) : (
            <div className="space-y-2">
              {todaySlots.map((s) => {
                const isOverdue = s.status === 'pending' && new Date(s.due_at) < now
                const o = s.order
                const label = o
                  ? (o.type === 'medication' ? `${o.drug_name ?? '—'} ${o.dose ?? ''}${o.dose_unit ?? ''}`.trim()
                    : o.type === 'iv_infusion' ? o.fluid_name ?? 'IV Fluid'
                    : `O₂ ${o.flow_rate_lpm ?? '?'} L/min`)
                  : '—'

                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl flex-wrap"
                    style={{
                      background: s.status === 'given' ? 'rgba(16,185,129,0.05)' : isOverdue ? 'rgba(239,68,68,0.05)' : '#F8FAFC',
                      border: `1px solid ${s.status === 'given' ? 'rgba(16,185,129,0.2)' : isOverdue ? 'rgba(239,68,68,0.2)' : '#E2E8F0'}`,
                    }}>
                    {/* Status dot */}
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: s.status === 'given' ? '#10B981' : isOverdue ? '#EF4444' : '#F59E0B' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold" style={{ color: '#0F172A' }}>{label}</p>
                      <p className="text-xs" style={{ color: '#94A3B8' }}>
                        {s.status === 'given'
                          ? `Given at ${formatDue(s.given_at!)} by ${s.nurse?.full_name ?? '—'}`
                          : `Due ${formatDue(s.due_at)}`}
                        {isOverdue && s.status === 'pending' && (
                          <span className="ml-1 font-semibold" style={{ color: '#EF4444' }}>· OVERDUE</span>
                        )}
                      </p>
                    </div>
                    {s.status === 'pending' && canGive && (
                      <button
                        onClick={() => handleGiven(s.id)}
                        disabled={givingId === s.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                        style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
                        <Check className="w-3 h-3" />
                        {givingId === s.id ? '…' : 'Mark Given'}
                      </button>
                    )}
                    {s.status === 'given' && (
                      <span className="flex-shrink-0"><Check className="w-3.5 h-3.5" style={{ color: '#10B981' }} /></span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </GlassCard>

      {/* ── Administration History ───────────────────────────── */}
      {givenSlots.length > 0 && (
        <GlassCard>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full p-4 flex items-center justify-between text-left"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              Given History ({givenSlots.length})
            </span>
            {showHistory ? <ChevronDown className="w-4 h-4" style={{ color: '#94A3B8' }} /> : <ChevronRight className="w-4 h-4" style={{ color: '#94A3B8' }} />}
          </button>
          {showHistory && (
            <div className="px-4 pb-4 space-y-1.5" style={{ borderTop: '1px solid #F1F5F9' }}>
              {givenSlots.slice(0, 30).map((s) => {
                const o = s.order
                const label = o?.type === 'medication' ? `${o.drug_name ?? '—'} ${o.dose ?? ''}${o.dose_unit ?? ''}`.trim()
                  : o?.type === 'iv_infusion' ? o.fluid_name ?? 'IV Fluid'
                  : `O₂ ${o?.flow_rate_lpm ?? '?'} L/min`
                return (
                  <div key={s.id} className="flex items-center justify-between text-xs py-1.5"
                    style={{ borderBottom: '1px solid #F8FAFC' }}>
                    <div>
                      <span className="font-medium" style={{ color: '#0F172A' }}>{label}</span>
                      <span className="ml-2" style={{ color: '#94A3B8' }}>{s.nurse?.full_name ?? '—'}</span>
                    </div>
                    <span style={{ color: '#64748B' }}>{s.given_at ? formatDue(s.given_at) : '—'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>
      )}

      {/* Stopped orders */}
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

      {/* ── Copy from OPD modal ──────────────────────────────── */}
      {showCopy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: '#0F172A' }}>Copy from OPD Visit</h3>
              <button onClick={() => setShowCopy(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {visitGroups.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No past OPD prescriptions found for this patient.</p>
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
                          setSelectedPrx((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(p.id); else next.delete(p.id)
                            return next
                          })
                        }} className="mt-0.5" />
                      <div>
                        <p className="text-sm font-medium" style={{ color: '#0F172A' }}>{p.drug_name}</p>
                        <p className="text-xs" style={{ color: '#64748B' }}>
                          {p.dosage} · {p.frequency}
                          {p.instructions && ` · ${p.instructions}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowCopy(false)}
                    className="px-4 py-2 rounded-xl text-sm" style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleCopy} disabled={copyPending || selectedPrx.size === 0}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: (copyPending || selectedPrx.size === 0) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (copyPending || selectedPrx.size === 0) ? 'not-allowed' : 'pointer' }}>
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
