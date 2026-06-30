'use client'

import { useState, useTransition } from 'react'
import { Plus, X, Save, CalendarCheck, AlertCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import ToothChart from './ToothChart'
import {
  setToothStatus, addTreatment, listTreatmentHistory,
  scheduleRecall, listDueRecalls, markRecallNotified,
} from '@/app/actions/dental'
import type { DentalTooth, DentalTreatment, DentalRecall, ToothStatus } from '@/lib/types'

const PROCEDURES = [
  { value: 'filling',    label: 'Filling' },
  { value: 'extraction', label: 'Extraction' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'crown',      label: 'Crown' },
  { value: 'cleaning',   label: 'Cleaning' },
  { value: 'implant',    label: 'Implant' },
  { value: 'other',      label: 'Other' },
]

const TOOTH_STATUSES: { value: ToothStatus; label: string }[] = [
  { value: 'healthy',    label: 'Healthy' },
  { value: 'decayed',    label: 'Decayed' },
  { value: 'filled',     label: 'Filled' },
  { value: 'crowned',    label: 'Crowned' },
  { value: 'root_canal', label: 'Root Canal' },
  { value: 'missing',    label: 'Missing' },
  { value: 'extracted',  label: 'Extracted' },
  { value: 'implant',    label: 'Implant' },
]

interface Props {
  visitId: string
  patientId: string
  initialTeeth: DentalTooth[]
  initialTreatments: DentalTreatment[]
  initialRecalls: DentalRecall[]
  disabled?: boolean
}

interface ToothPanel {
  toothNumber: number
  currentStatus: ToothStatus
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0',
  color: '#0F172A', outline: 'none', borderRadius: '0.75rem',
  padding: '0.5rem 0.875rem', fontSize: '0.875rem', width: '100%', minHeight: '40px',
}
const focusStyle = { borderColor: '#0D9488', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' }

export default function DentalClinicalSection({
  visitId, patientId, initialTeeth, initialTreatments, initialRecalls, disabled,
}: Props) {
  const [teeth, setTeeth] = useState(initialTeeth)
  const [treatments, setTreatments] = useState(initialTreatments)
  const [recalls, setRecalls] = useState(initialRecalls)
  const [activePanel, setActivePanel] = useState<ToothPanel | null>(null)
  const [isPending, startTransition] = useTransition()

  // Treatment form
  const [treatForm, setTreatForm] = useState({
    procedure: 'filling', notes: '', priceSnapshot: '', toothNumber: '',
  })
  const [treatError, setTreatError] = useState('')

  // Status update form (inside tooth panel)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Recall form
  const [showRecallForm, setShowRecallForm] = useState(false)
  const [recallDate, setRecallDate] = useState('')
  const [recallReason, setRecallReason] = useState('cleaning')
  const [recallSaved, setRecallSaved] = useState(false)

  function openTooth(n: number) {
    if (disabled) return
    const tooth = teeth.find((t) => t.tooth_number === n)
    setActivePanel({ toothNumber: n, currentStatus: tooth?.current_status ?? 'healthy' })
    setTreatForm((f) => ({ ...f, toothNumber: String(n), procedure: 'filling', notes: '', priceSnapshot: '' }))
    setTreatError('')
  }

  function handleStatusChange(status: ToothStatus) {
    if (!activePanel) return
    setStatusUpdating(true)
    startTransition(async () => {
      const res = await setToothStatus(patientId, activePanel.toothNumber, status)
      setStatusUpdating(false)
      if (!res.success) return
      setTeeth((prev) =>
        prev.map((t) => t.tooth_number === activePanel.toothNumber ? { ...t, current_status: status } : t)
      )
      setActivePanel((p) => p ? { ...p, currentStatus: status } : null)
    })
  }

  function handleAddTreatment() {
    if (!activePanel) return
    if (!treatForm.procedure) { setTreatError('Select a procedure'); return }
    const price = parseFloat(treatForm.priceSnapshot)
    if (isNaN(price) || price < 0) { setTreatError('Enter a valid price'); return }
    setTreatError('')
    startTransition(async () => {
      const res = await addTreatment({
        visitId,
        patientId,
        toothNumber: activePanel.toothNumber,
        procedure: treatForm.procedure,
        notes: treatForm.notes || undefined,
        priceSnapshot: price,
      })
      if (!res.success) { setTreatError(res.error); return }
      setTreatments((t) => [res.treatment, ...t])
      // Refresh tooth status from server action side-effects
      const updated = await listTreatmentHistory(patientId)
      setTreatments(updated)
      setTreatForm((f) => ({ ...f, notes: '', priceSnapshot: '', procedure: 'filling' }))
    })
  }

  function handleScheduleRecall() {
    if (!recallDate) return
    startTransition(async () => {
      const res = await scheduleRecall({ patientId, recallDate, reason: recallReason })
      if (!res.success) return
      setRecallSaved(true)
      setShowRecallForm(false)
      setTimeout(() => setRecallSaved(false), 2000)
      const updated = await listDueRecalls()
      setRecalls(updated)
    })
  }

  function handleMarkNotified(id: string) {
    startTransition(async () => {
      await markRecallNotified(id)
      setRecalls((r) => r.filter((rec) => rec.id !== id))
    })
  }

  return (
    <div className="space-y-4">
      {/* Tooth Chart */}
      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>
          Dental Chart
        </h3>
        <ToothChart teeth={teeth} onToothClick={openTooth} disabled={disabled} />
      </GlassCard>

      {/* Tooth detail panel */}
      {activePanel && !disabled && (
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              Tooth #{activePanel.toothNumber}
            </h4>
            <button onClick={() => setActivePanel(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Status selector */}
          <div className="mb-4">
            <label className="block text-xs font-medium mb-2" style={{ color: '#475569' }}>
              Update Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TOOTH_STATUSES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleStatusChange(value)}
                  disabled={statusUpdating || activePanel.currentStatus === value}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium"
                  style={{
                    background: activePanel.currentStatus === value ? '#0D9488' : '#F1F5F9',
                    color: activePanel.currentStatus === value ? '#fff' : '#475569',
                    border: 'none', cursor: activePanel.currentStatus === value ? 'default' : 'pointer',
                    minHeight: '32px',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Add treatment */}
          <div className="border-t pt-4" style={{ borderColor: '#E2E8F0' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: '#475569' }}>Record Treatment</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Procedure *</label>
                <Select
                  value={treatForm.procedure}
                  onChange={(e) => setTreatForm((f) => ({ ...f, procedure: e.target.value }))}
                >
                  {PROCEDURES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Price (₹) *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={treatForm.priceSnapshot}
                  onChange={(e) => setTreatForm((f) => ({ ...f, priceSnapshot: e.target.value }))}
                  placeholder="0.00"
                  style={inputStyle}
                  onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Notes</label>
                <input
                  type="text"
                  value={treatForm.notes}
                  onChange={(e) => setTreatForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional"
                  style={inputStyle}
                  onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
                />
              </div>
            </div>
            {treatError && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{treatError}</p>}
            <button
              type="button"
              onClick={handleAddTreatment}
              disabled={isPending}
              className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold"
              style={{
                background: '#0D9488', color: '#fff',
                border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', minHeight: '40px',
              }}
            >
              <Plus className="w-4 h-4" /> {isPending ? 'Saving…' : 'Record Treatment'}
            </button>
          </div>
        </GlassCard>
      )}

      {/* Treatment history */}
      {treatments.length > 0 && (
        <GlassCard className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
            Treatment History
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full"
              style={{ background: '#F1F5F9', color: '#64748B' }}>
              {treatments.length}
            </span>
          </h3>
          <div className="space-y-2">
            {treatments.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0"
                style={{ borderColor: '#F1F5F9' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize" style={{ color: '#0F172A' }}>
                    {t.procedure.replace('_', ' ')}
                    {t.tooth_number && <span className="ml-1.5 text-xs" style={{ color: '#64748B' }}>(Tooth #{t.tooth_number})</span>}
                  </p>
                  {t.notes && <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{t.notes}</p>}
                  <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                    <DateText date={t.created_at} />
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-semibold" style={{ color: '#0D9488' }}>
                    ₹{t.price_snapshot.toLocaleString('en-IN')}
                  </span>
                  <StatusBadge
                    status={t.billing_status === 'billed' ? 'done' : 'waiting'}
                    label={t.billing_status === 'billed' ? 'Billed' : 'Unbilled'}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Recall section */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            <CalendarCheck className="w-4 h-4 inline mr-1.5" style={{ color: '#0D9488' }} />
            Recall Reminders
          </h3>
          {!disabled && !showRecallForm && (
            <button
              type="button"
              onClick={() => setShowRecallForm(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
              <Plus className="w-3.5 h-3.5" /> Schedule
            </button>
          )}
        </div>

        {showRecallForm && !disabled && (
          <div className="mb-4 p-3 rounded-xl space-y-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Recall Date *</label>
                <input type="date" value={recallDate}
                  onChange={(e) => setRecallDate(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#64748B' }}>Reason</label>
                <Select value={recallReason} onChange={(e) => setRecallReason(e.target.value)}>
                  <option value="cleaning">Cleaning</option>
                  <option value="followup">Follow-up</option>
                  <option value="review">Review</option>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleScheduleRecall}
                disabled={!recallDate || isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{
                  background: !recallDate ? '#94A3B8' : '#0D9488', color: '#fff',
                  border: 'none', cursor: !recallDate ? 'not-allowed' : 'pointer',
                }}>
                <Save className="w-3.5 h-3.5" /> {isPending ? 'Saving…' : 'Schedule'}
              </button>
              <button type="button" onClick={() => setShowRecallForm(false)}
                className="px-3 py-2 rounded-lg text-xs"
                style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
            {recallSaved && (
              <p className="text-xs" style={{ color: '#15803D' }}>Recall scheduled!</p>
            )}
          </div>
        )}

        {recalls.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold mb-1" style={{ color: '#475569' }}>Due this week</p>
            {recalls.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                style={{ borderColor: '#F1F5F9' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#F59E0B' }} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>
                      {r.patient?.full_name ?? 'Patient'}
                    </p>
                    <p className="text-xs" style={{ color: '#64748B' }}>
                      <DateText date={r.recall_date} /> · {r.reason ?? 'recall'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleMarkNotified(r.id)}
                  disabled={isPending}
                  className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg"
                  style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', cursor: 'pointer' }}>
                  Send Reminder
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#94A3B8' }}>No recalls due this week.</p>
        )}
      </GlassCard>
    </div>
  )
}
