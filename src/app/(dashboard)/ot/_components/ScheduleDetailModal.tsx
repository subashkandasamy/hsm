'use client'

import { useState, useEffect } from 'react'
import { Trash2, Plus, Save, Printer } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Select from '@/components/ui/Select'
import StatusBadge from '@/components/ui/StatusBadge'
import DateText from '@/components/ui/DateText'
import Money from '@/components/ui/Money'
import { getSchedule, setOtStatus, saveOtNotes, addConsumable, removeConsumable, cancelSurgery } from '@/app/actions/ot'
import type { OtSchedule, OtConsumable, OtRoom, Profile } from '@/lib/types'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'

const STATUS_MAP: Record<string, string> = {
  scheduled: 'pending', in_progress: 'info', completed: 'success', cancelled: 'cancelled',
}

interface Props {
  open: boolean
  scheduleId: string
  rooms: OtRoom[]
  doctors: Pick<Profile, 'id' | 'full_name' | 'role'>[]
  onClose: () => void
  onSuccess: () => void
}

export default function ScheduleDetailModal({ open, scheduleId, onClose, onSuccess }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canSchedule = !!role && hasPermission(role, 'ot:schedule', profile?.granted_permissions)
  const canRecord   = !!role && hasPermission(role, 'ot:record', profile?.granted_permissions)

  const [schedule, setSchedule] = useState<OtSchedule | null>(null)
  const [consumables, setConsumables] = useState<OtConsumable[]>([])
  const [notes, setNotes] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New consumable form
  const [newDesc, setNewDesc] = useState('')
  const [newQty, setNewQty]   = useState('1')
  const [newPrice, setNewPrice] = useState('0')
  const [addingC, setAddingC] = useState(false)

  async function load() {
    const s = await getSchedule(scheduleId)
    if (s) {
      setSchedule(s)
      setNotes(s.notes ?? '')
      setConsumables(s.consumables ?? [])
    }
  }

  useEffect(() => { if (open) load() }, [open, scheduleId])

  async function handleStatus(status: 'in_progress' | 'completed') {
    setActionLoading(true); setError(null)
    const r = await setOtStatus(scheduleId, status)
    setActionLoading(false)
    if (!r.success) { setError(r.error); return }
    onSuccess()
  }

  async function handleCancel() {
    setActionLoading(true); setError(null)
    const r = await cancelSurgery(scheduleId)
    setActionLoading(false)
    if (!r.success) { setError(r.error); return }
    onSuccess()
  }

  async function handleSaveNotes() {
    setNoteSaving(true)
    await saveOtNotes(scheduleId, notes)
    setNoteSaving(false); setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  async function handleAddConsumable(e: React.FormEvent) {
    e.preventDefault()
    if (!newDesc.trim()) return
    setAddingC(true)
    const r = await addConsumable({
      ot_schedule_id: scheduleId,
      description: newDesc.trim(),
      qty: parseInt(newQty, 10) || 1,
      unit_price: parseFloat(newPrice) || 0,
    })
    setAddingC(false)
    if (r.success) {
      setConsumables((c) => [...c, r.consumable])
      setNewDesc(''); setNewQty('1'); setNewPrice('0')
    }
  }

  async function handleRemoveConsumable(id: string) {
    await removeConsumable(id)
    setConsumables((c) => c.filter((x) => x.id !== id))
  }

  const consumablesTotal = consumables.reduce((s, c) => s + c.qty * c.unit_price, 0)

  if (!schedule) return null

  const isClosed = schedule.status === 'completed' || schedule.status === 'cancelled'

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  return (
    <Modal open={open} onClose={onClose} title={schedule.procedure_name} maxWidth="52rem">
      <div className="space-y-5">
        {/* Header info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Patient</p>
            <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{schedule.patient?.full_name}</p>
            <p className="font-mono text-xs mt-0.5" style={{ color: '#94A3B8' }}>{schedule.patient?.uhid}</p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Schedule</p>
            <p className="text-sm" style={{ color: '#0F172A' }}>
              <DateText date={schedule.scheduled_start} />
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              {fmtTime(schedule.scheduled_start)} – {fmtTime(schedule.scheduled_end)}
            </p>
          </div>
          <div className="p-3 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Surgical Team</p>
            <p className="text-sm" style={{ color: '#0F172A' }}>{schedule.surgeon?.full_name}</p>
            {schedule.anaesthetist && (
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Anaest: {schedule.anaesthetist.full_name}</p>
            )}
          </div>
          <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Status</p>
              <StatusBadge status={STATUS_MAP[schedule.status] ?? 'pending'} label={schedule.status.replace('_', ' ')} />
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: '#94A3B8' }}>Procedure fee</p>
              <p className="font-bold text-sm" style={{ color: '#0D9488' }}>
                <Money amount={schedule.price_snapshot} />
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        {/* Status controls */}
        {!isClosed && canRecord && (
          <div className="flex gap-3 flex-wrap">
            {schedule.status === 'scheduled' && (
              <button onClick={() => handleStatus('in_progress')} disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FDE68A', cursor: 'pointer' }}>
                Mark In Progress
              </button>
            )}
            {schedule.status === 'in_progress' && (
              <button onClick={() => handleStatus('completed')} disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0', cursor: 'pointer' }}>
                Mark Completed
              </button>
            )}
            {canSchedule && schedule.status === 'scheduled' && (
              <button onClick={handleCancel} disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
                Cancel Surgery
              </button>
            )}
          </div>
        )}

        <a href={`/print/ot/${scheduleId}/pdf`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.25)' }}>
          <Printer className="w-4 h-4" /> Print operation record
        </a>

        {/* OT Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>OT Notes</p>
            {canRecord && !isClosed && (
              <button onClick={handleSaveNotes} disabled={noteSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: noteSaved ? '#DCFCE7' : '#0D9488', color: noteSaved ? '#15803D' : '#fff', border: 'none', cursor: 'pointer' }}>
                <Save className="w-3.5 h-3.5" />
                {noteSaved ? 'Saved!' : noteSaving ? 'Saving…' : 'Save Notes'}
              </button>
            )}
          </div>
          <Textarea value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Intraoperative notes, findings, complications…"
            disabled={isClosed || !canRecord}
            style={{ minHeight: '5rem', ...(isClosed ? { opacity: 0.7 } : {}) }} />
        </div>

        {/* Consumables */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
              Consumables
              {consumablesTotal > 0 && (
                <span className="ml-2 text-xs font-normal" style={{ color: '#0D9488' }}>
                  Total: <Money amount={consumablesTotal} />
                </span>
              )}
            </p>
          </div>
          {consumables.length > 0 && (
            <div className="rounded-xl overflow-hidden mb-3" style={{ border: '1px solid #E2E8F0' }}>
              {/* Mobile: card rows */}
              <div className="md:hidden divide-y" style={{ borderColor: '#F1F5F9' }}>
                {consumables.map((c) => (
                  <div key={c.id} className="px-3 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{c.description}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        {c.qty} × <Money amount={c.unit_price} /> =
                        <span className="font-semibold ml-1" style={{ color: '#0D9488' }}>
                          <Money amount={c.qty * c.unit_price} />
                        </span>
                      </p>
                    </div>
                    {!isClosed && canRecord && (
                      <button onClick={() => handleRemoveConsumable(c.id)}
                        className="p-1.5 rounded-lg flex-shrink-0"
                        style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <table className="hidden md:table w-full text-sm">
                <thead>
                  <tr style={{ background: 'rgba(248,250,252,0.9)', borderBottom: '1px solid #E2E8F0' }}>
                    {['Description', 'Qty', 'Unit Price', 'Total', ''].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold" style={{ color: '#475569' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {consumables.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: i < consumables.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <td className="px-3 py-2" style={{ color: '#0F172A' }}>{c.description}</td>
                      <td className="px-3 py-2" style={{ color: '#475569' }}>{c.qty}</td>
                      <td className="px-3 py-2" style={{ color: '#475569' }}><Money amount={c.unit_price} /></td>
                      <td className="px-3 py-2 font-medium" style={{ color: '#0D9488' }}><Money amount={c.qty * c.unit_price} /></td>
                      <td className="px-3 py-2">
                        {!isClosed && canRecord && (
                          <button onClick={() => handleRemoveConsumable(c.id)}
                            className="p-1 rounded-lg"
                            style={{ background: '#FEE2E2', color: '#DC2626', border: 'none', cursor: 'pointer' }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isClosed && canRecord && (
            <form onSubmit={handleAddConsumable}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                <FormField label="Description">
                  <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="e.g. Gloves" />
                </FormField>
                <FormField label="Qty">
                  <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(e.target.value)} />
                </FormField>
                <FormField label="Unit Price (₹)">
                  <Input type="number" min={0} step="0.01" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
                </FormField>
                <button type="submit" disabled={addingC || !newDesc.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium mb-0.5"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Close</button>
        </div>
      </div>
    </Modal>
  )
}
