'use client'

import { useState, useEffect, useTransition } from 'react'
import { UserCheck, X, Plus, AlertCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import { assignNurse, unassignNurse, listAssignments } from '@/app/actions/nurseAssignment'
import type { AdmissionNurseAssignment } from '@/lib/types'

interface Nurse { id: string; full_name: string; nursing_charge_per_shift: number | null }

interface Props {
  admissionId: string
  canAssign: boolean
  nurses: Nurse[]
  today: string
}

const SHIFTS = [
  { value: 'morning' as const, label: 'Morning' },
  { value: 'night'   as const, label: 'Night' },
]

function dateLabel(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function NursingPanel({ admissionId, canAssign, nurses, today }: Props) {
  const [assignments, setAssignments] = useState<AdmissionNurseAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Assignment form state (morning / night for today)
  const [form, setForm] = useState<Record<'morning' | 'night', string>>({ morning: '', night: '' })

  useEffect(() => {
    listAssignments(admissionId).then((rows) => {
      setAssignments(rows)
      setLoading(false)
    })
  }, [admissionId])

  function todayAssignment(shift: 'morning' | 'night') {
    return assignments.find((a) => a.assigned_date === today && a.shift === shift)
  }

  function assign(shift: 'morning' | 'night') {
    const nurseId = form[shift]
    if (!nurseId) return
    const nurse = nurses.find((n) => n.id === nurseId)
    if (nurse && !nurse.nursing_charge_per_shift) {
      setError(`${nurse.full_name} has no nursing charge configured. Set it on their staff profile first.`)
      return
    }
    setError('')
    startTransition(async () => {
      const res = await assignNurse({ admissionId, nurseId, shift, date: today })
      if (!res.success) { setError(res.error); return }
      setAssignments((prev) => [res.assignment, ...prev])
      setForm((f) => ({ ...f, [shift]: '' }))
    })
  }

  function unassign(id: string) {
    setError('')
    startTransition(async () => {
      const res = await unassignNurse(id)
      if (!res.success) { setError(res.error); return }
      setAssignments((prev) => prev.filter((a) => a.id !== id))
    })
  }

  // Group past assignments by date
  const past = assignments.filter((a) => a.assigned_date !== today)
  const dateGroups = [...new Set(past.map((a) => a.assigned_date))].sort((a, b) => b.localeCompare(a))

  return (
    <GlassCard>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <UserCheck className="w-4 h-4" style={{ color: '#0D9488' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Nursing Assignments</h3>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2 rounded-lg text-xs mb-3"
            style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Today's shifts */}
        <p className="text-xs font-medium mb-2" style={{ color: '#64748B' }}>Today — {dateLabel(today)}</p>
        <div className="space-y-2 mb-4">
          {SHIFTS.map(({ value, label }) => {
            const existing = todayAssignment(value)
            return (
              <div key={value} className="flex items-center gap-2 p-2 rounded-xl"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <span className="text-xs font-medium w-16 flex-shrink-0" style={{ color: '#64748B' }}>{label}</span>
                {existing ? (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block" style={{ color: '#0F172A' }}>
                        {existing.nurse?.full_name ?? '—'}
                      </span>
                      {existing.charge_snapshot > 0 && (
                        <Money amount={existing.charge_snapshot} className="text-xs" style={{ color: '#0D9488' }} />
                      )}
                    </div>
                    {canAssign && (
                      <button onClick={() => unassign(existing.id)} disabled={isPending}
                        className="p-1 rounded-lg flex-shrink-0"
                        style={{ color: '#EF4444' }}
                        title="Unassign">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                ) : canAssign ? (
                  <>
                    <select
                      value={form[value]}
                      onChange={(e) => setForm((f) => ({ ...f, [value]: e.target.value }))}
                      className="flex-1 px-2 py-1 rounded-lg text-xs border"
                      style={{ borderColor: '#CBD5E1', color: '#0F172A' }}
                    >
                      <option value="">Select nurse…</option>
                      {nurses.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.full_name}{n.nursing_charge_per_shift ? ` (₹${n.nursing_charge_per_shift})` : ' (no rate)'}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assign(value)}
                      disabled={isPending || !form[value]}
                      className="p-1.5 rounded-lg flex-shrink-0"
                      style={{ background: form[value] ? '#0D9488' : '#94A3B8', color: '#fff' }}
                      title="Assign">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: '#94A3B8' }}>Unassigned</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Past assignments */}
        {!loading && dateGroups.length > 0 && (
          <details>
            <summary className="text-xs font-medium cursor-pointer mb-2" style={{ color: '#94A3B8' }}>
              Assignment History ({past.length})
            </summary>
            <div className="space-y-2 mt-2">
              {dateGroups.map((date) => (
                <div key={date}>
                  <p className="text-xs mb-1" style={{ color: '#64748B' }}>{dateLabel(date)}</p>
                  {assignments.filter((a) => a.assigned_date === date).map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs py-1"
                      style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <span style={{ color: '#475569' }}>
                        <span className="capitalize">{a.shift}</span> · {a.nurse?.full_name ?? '—'}
                      </span>
                      <Money amount={a.charge_snapshot} style={{ color: '#0D9488' }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
        {loading && (
          <p className="text-xs text-center py-2" style={{ color: '#94A3B8' }}>Loading…</p>
        )}
      </div>
    </GlassCard>
  )
}
