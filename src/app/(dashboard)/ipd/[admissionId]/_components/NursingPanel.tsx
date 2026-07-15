'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { UserCheck, X, AlertCircle, Search, Check, Users } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Money from '@/components/ui/Money'
import { assignNurse, unassignNurse, listAssignments, listNursesForPicker } from '@/app/actions/nurseAssignment'
import { listShiftDefinitions } from '@/app/actions/scheduling'
import type { AdmissionNurseAssignment, ShiftDefinition, NursePickerData, PickerNurse } from '@/lib/types'

interface Props {
  admissionId: string
  canAssign: boolean
  today: string
}

function dateLabel(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

// load / capacity chip colours
function loadStyle(load: number, capacity: number): React.CSSProperties {
  if (load > capacity) return { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
  if (load >= capacity) return { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }
  return { background: '#F0FDF4', color: '#0D9488', border: '1px solid #A7F3D0' }
}

export default function NursingPanel({ admissionId, canAssign, today }: Props) {
  const [assignments, setAssignments] = useState<AdmissionNurseAssignment[]>([])
  const [shifts, setShifts] = useState<ShiftDefinition[]>([])
  const [picker, setPicker] = useState<Record<string, NursePickerData>>({})
  const [openShift, setOpenShift] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  async function loadPicker(code: string) {
    const data = await listNursesForPicker({ admissionId, date: today, shift: code })
    setPicker((p) => ({ ...p, [code]: data }))
  }

  useEffect(() => {
    (async () => {
      const [rows, activeShifts] = await Promise.all([
        listAssignments(admissionId),
        listShiftDefinitions(true),
      ])
      setAssignments(rows)
      setShifts(activeShifts)
      await Promise.all(activeShifts.map((s) => loadPicker(s.code)))
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admissionId, today])

  function todayAssignment(code: string) {
    return assignments.find((a) => a.assigned_date === today && a.shift === code)
  }

  function assign(code: string, nurseId: string) {
    setError('')
    startTransition(async () => {
      const res = await assignNurse({ admissionId, nurseId, shift: code, date: today })
      if (!res.success) { setError(res.error); return }
      setAssignments((prev) => [res.assignment, ...prev])
      setOpenShift(null)
      setSearch('')
      loadPicker(code)   // refresh loads
    })
  }

  function unassign(id: string, code: string) {
    setError('')
    startTransition(async () => {
      const res = await unassignNurse(id)
      if (!res.success) { setError(res.error); return }
      setAssignments((prev) => prev.filter((a) => a.id !== id))
      loadPicker(code)
    })
  }

  // Past assignments grouped by date
  const past = assignments.filter((a) => a.assigned_date !== today)
  const dateGroups = [...new Set(past.map((a) => a.assigned_date))].sort((a, b) => b.localeCompare(a))
  const shiftLabel = useMemo(() => new Map(shifts.map((s) => [s.code, s.label])), [shifts])

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

        <p className="text-xs font-medium mb-2" style={{ color: '#64748B' }}>Today — {dateLabel(today)}</p>

        {loading ? (
          <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
        ) : shifts.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: '#94A3B8' }}>
            No active shifts configured. Set them up in Scheduling → Shifts.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {shifts.map((s) => {
              const existing = todayAssignment(s.code)
              const data = picker[s.code]
              const cov = data?.coverage
              const isOpen = openShift === s.code
              return (
                <div key={s.code} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
                  <div className="flex items-center gap-2 p-2" style={{ background: '#F8FAFC' }}>
                    <span className="text-xs font-semibold w-16 flex-shrink-0 capitalize" style={{ color: '#334155' }}>{s.label}</span>

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
                          <button onClick={() => unassign(existing.id, s.code)} disabled={isPending}
                            className="p-1 rounded-lg flex-shrink-0" style={{ color: '#EF4444' }} title="Unassign">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    ) : canAssign ? (
                      <button
                        onClick={() => { setOpenShift(isOpen ? null : s.code); setSearch('') }}
                        className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                        style={{ background: '#fff', color: '#0D9488', border: '1px solid #CBD5E1' }}>
                        <Search className="w-3.5 h-3.5" />
                        {isOpen ? 'Close' : 'Select nurse…'}
                      </button>
                    ) : (
                      <span className="text-xs" style={{ color: '#94A3B8' }}>Unassigned</span>
                    )}

                    {/* Coverage chip */}
                    {cov && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-1 flex-shrink-0"
                        style={cov.assigned < cov.required
                          ? { background: '#FEF2F2', color: '#DC2626' }
                          : { background: '#F0FDF4', color: '#0D9488' }}>
                        <Users className="w-3 h-3" />{cov.assigned}/{cov.required}
                      </span>
                    )}
                  </div>

                  {/* Searchable picker */}
                  {isOpen && data && (
                    <div className="p-2 border-t" style={{ borderColor: '#E2E8F0', background: '#fff' }}>
                      {cov && cov.assigned < cov.required && (
                        <p className="text-[11px] mb-2 px-1" style={{ color: '#B45309' }}>
                          This {s.label.toLowerCase()} shift needs {cov.required} nurse{cov.required !== 1 ? 's' : ''} for {cov.occupied_beds} bed{cov.occupied_beds !== 1 ? 's' : ''} — {cov.assigned} rostered.
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg mb-2"
                        style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <Search className="w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
                        <input
                          autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                          placeholder="Search nurses…"
                          className="flex-1 bg-transparent text-xs outline-none" style={{ color: '#0F172A' }} />
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-1">
                        {data.nurses
                          .filter((n) => n.full_name.toLowerCase().includes(search.toLowerCase()))
                          .slice(0, 40)
                          .map((n: PickerNurse) => (
                            <button key={n.id} disabled={n.on_leave || isPending}
                              onClick={() => assign(s.code, n.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left disabled:opacity-50"
                              style={{ background: n.rostered ? '#F0FDFA' : '#fff', border: '1px solid #F1F5F9' }}>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium truncate block" style={{ color: '#0F172A' }}>{n.full_name}</span>
                                <span className="text-[10px]" style={{ color: '#94A3B8' }}>
                                  {n.nursing_charge_per_shift ? `₹${n.nursing_charge_per_shift}/shift` : 'no rate'}
                                </span>
                              </div>
                              {n.on_leave ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0"
                                  style={{ background: '#F1F5F9', color: '#94A3B8' }}>On leave</span>
                              ) : (
                                <>
                                  {n.rostered && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md flex items-center gap-0.5 flex-shrink-0"
                                      style={{ background: '#CCFBF1', color: '#0F766E' }}>
                                      <Check className="w-2.5 h-2.5" />On roster
                                    </span>
                                  )}
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0"
                                    style={loadStyle(n.load, n.capacity)} title="Patients this shift / capacity">
                                    {n.load}/{n.capacity}
                                  </span>
                                </>
                              )}
                            </button>
                          ))}
                        {data.nurses.filter((n) => n.full_name.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                          <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No nurses match.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

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
                        <span className="capitalize">{shiftLabel.get(a.shift) ?? a.shift}</span> · {a.nurse?.full_name ?? '—'}
                      </span>
                      <Money amount={a.charge_snapshot} style={{ color: '#0D9488' }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </GlassCard>
  )
}
