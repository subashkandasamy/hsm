'use client'

import { useState, useTransition } from 'react'
import { Plane, Check, X, AlertCircle, Plus } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import { requestLeave, reviewLeave, cancelLeave, listLeaveRequests } from '@/app/actions/scheduling'
import type { LeaveRequest, LeaveType } from '@/lib/types'

interface Props {
  initialLeave: LeaveRequest[]
  nurses: { id: string; full_name: string }[]
  canApprove: boolean
  actorId: string
}

const LEAVE_TYPES: LeaveType[] = ['casual', 'annual', 'sick', 'unpaid', 'maternity', 'other']
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  pending:   { background: '#FFFBEB', color: '#B45309' },
  approved:  { background: '#F0FDF4', color: '#0D9488' },
  rejected:  { background: '#FEF2F2', color: '#DC2626' },
  cancelled: { background: '#F1F5F9', color: '#94A3B8' },
}
function fmt(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) }

export default function LeavePanel({ initialLeave, nurses, canApprove, actorId }: Props) {
  const [rows, setRows] = useState<LeaveRequest[]>(initialLeave)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    profile_id: '', leave_type: 'casual' as LeaveType, start_date: '', end_date: '', reason: '',
  })

  async function refresh() { setRows(await listLeaveRequests()) }

  function submit() {
    setError('')
    startTransition(async () => {
      const res = await requestLeave({
        ...(canApprove && form.profile_id ? { profile_id: form.profile_id } : {}),
        leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date,
        reason: form.reason || null,
      })
      if (!res.success) { setError(res.error); return }
      setShowForm(false)
      setForm({ profile_id: '', leave_type: 'casual', start_date: '', end_date: '', reason: '' })
      await refresh()
    })
  }

  function review(id: string, decision: 'approved' | 'rejected') {
    setError('')
    startTransition(async () => {
      const res = await reviewLeave({ id, decision })
      if (!res.success) { setError(res.error); return }
      await refresh()
    })
  }
  function cancel(id: string) {
    setError('')
    startTransition(async () => {
      const res = await cancelLeave(id)
      if (!res.success) { setError(res.error); return }
      await refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: '#334155' }}>
          {canApprove ? 'All leave requests' : 'My leave requests'}
        </p>
        <button onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg"
          style={{ background: '#0D9488', color: '#fff' }}>
          <Plus className="w-3.5 h-3.5" /> Request leave
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {showForm && (
        <GlassCard className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {canApprove && (
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Nurse (blank = you)</label>
                <Select value={form.profile_id} onChange={(e) => setForm((f) => ({ ...f, profile_id: e.target.value }))}>
                  <option value="">Myself</option>
                  {nurses.map((n) => <option key={n.id} value={n.id}>{n.full_name}</option>)}
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Type</label>
              <Select value={form.leave_type} onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value as LeaveType }))} className="capitalize">
                {LEAVE_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>From</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-xl" style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' }} />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>To</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-xl" style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' }} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium block mb-1" style={{ color: '#64748B' }}>Reason (optional)</label>
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="w-full text-sm px-3 py-2 rounded-xl" style={{ border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' }} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setShowForm(false)} className="text-xs px-3 py-2 rounded-lg" style={{ color: '#64748B' }}>Cancel</button>
            <button onClick={submit} disabled={isPending || !form.start_date || !form.end_date}
              className="text-xs px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: '#0D9488', color: '#fff' }}>Submit</button>
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: '#94A3B8' }}>
            <Plane className="w-5 h-5 mx-auto mb-2" style={{ color: '#CBD5E1' }} />
            No leave requests yet.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {rows.map((lr) => {
              const isOwn = lr.profile_id === actorId
              return (
                <div key={lr.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>
                        {lr.profile?.full_name ?? (isOwn ? 'You' : '—')}
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md capitalize" style={{ background: '#F1F5F9', color: '#64748B' }}>{lr.leave_type}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                      {fmt(lr.start_date)} → {fmt(lr.end_date)}{lr.reason ? ` · ${lr.reason}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-md capitalize shrink-0" style={STATUS_STYLE[lr.status]}>{lr.status}</span>
                  {lr.status === 'pending' && canApprove && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => review(lr.id, 'approved')} disabled={isPending}
                        className="p-1.5 rounded-lg" style={{ background: '#F0FDF4', color: '#0D9488' }} title="Approve">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => review(lr.id, 'rejected')} disabled={isPending}
                        className="p-1.5 rounded-lg" style={{ background: '#FEF2F2', color: '#DC2626' }} title="Reject">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {lr.status === 'pending' && isOwn && !canApprove && (
                    <button onClick={() => cancel(lr.id)} disabled={isPending}
                      className="text-xs px-2 py-1 rounded-lg shrink-0" style={{ color: '#94A3B8' }}>Cancel</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
