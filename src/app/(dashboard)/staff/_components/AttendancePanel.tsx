'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import StatusBadge from '@/components/ui/StatusBadge'
import Select from '@/components/ui/Select'
import { markAttendance, getAttendance } from '@/app/actions/hr'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { StaffMember, StaffAttendance, AttendanceStatus, Shift } from '@/lib/types'
import { istToday } from '@/lib/istDate'

const STATUS_STYLES: Record<AttendanceStatus, { label: string; variant: string }> = {
  present:  { label: 'Present',  variant: 'success' },
  absent:   { label: 'Absent',   variant: 'danger' },
  leave:    { label: 'Leave',    variant: 'warning' },
  half_day: { label: 'Half Day', variant: 'info' },
}

const SHIFTS: { value: Shift | ''; label: string }[] = [
  { value: '',        label: 'No shift' },
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'night',   label: 'Night' },
]

interface Props {
  staff: StaffMember[]
  initialAttendance: StaffAttendance[]
  currentMonth: string
}

export default function AttendancePanel({ staff, initialAttendance, currentMonth }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canMark = !!role && hasPermission(role, 'hr:attendance', profile?.granted_permissions)

  const [month, setMonth] = useState(currentMonth)
  const [attendance, setAttendance] = useState(initialAttendance)
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(istToday())
  const [marking, setMarking] = useState<Record<string, boolean>>({})
  const [markError, setMarkError] = useState('')

  async function loadMonth(m: string) {
    setLoading(true)
    const data = await getAttendance({ month: m })
    setAttendance(data)
    setLoading(false)
  }

  function shiftMonth(delta: number) {
    const [y, mo] = month.split('-').map(Number)
    const d = new Date(y, mo - 1 + delta, 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    setMonth(next)
    loadMonth(next)
  }

  const todayAttendance = attendance.filter((a) => a.date === selectedDate)
  const attendanceMap = new Map(todayAttendance.map((a) => [a.profile_id, a]))

  async function handleMark(profileId: string, status: AttendanceStatus, shift?: Shift) {
    setMarking((m) => ({ ...m, [profileId]: true }))
    setMarkError('')
    const res = await markAttendance({ profile_id: profileId, date: selectedDate, status, shift: shift ?? null })
    setMarking((m) => ({ ...m, [profileId]: false }))
    if (!res.success) { setMarkError(res.error); return }
    await loadMonth(month)
  }

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  // Build summary stats for the month
  const totalPresent  = attendance.filter((a) => a.status === 'present').length
  const totalAbsent   = attendance.filter((a) => a.status === 'absent').length
  const totalLeave    = attendance.filter((a) => a.status === 'leave').length
  const totalHalfDay  = attendance.filter((a) => a.status === 'half_day').length

  return (
    <div className="space-y-5">
      {/* Month navigation + summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold px-3" style={{ color: '#0F172A', minWidth: '140px', textAlign: 'center' }}>
            {monthLabel}
          </span>
          <button onClick={() => shiftMonth(1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Present', value: totalPresent, color: '#065F46', bg: 'rgba(16,185,129,0.08)' },
            { label: 'Absent',  value: totalAbsent,  color: '#991B1B', bg: 'rgba(239,68,68,0.08)' },
            { label: 'Leave',   value: totalLeave,   color: '#92400E', bg: 'rgba(251,191,36,0.1)' },
            { label: 'Half',    value: totalHalfDay, color: '#1E40AF', bg: 'rgba(59,130,246,0.08)' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
              style={{ background: bg, color }}>
              {value} {label}
            </div>
          ))}
        </div>
      </div>

      {/* Date picker for daily marking */}
      {canMark && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <label className="text-sm font-semibold" style={{ color: '#0F172A' }}>Mark Attendance for</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm"
              style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', minHeight: '40px' }}
            />
          </div>
          {markError && (
            <div className="p-2 mb-3 rounded-xl text-xs" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626' }}>
              {markError}
            </div>
          )}
          <div className="space-y-2">
            {staff.filter((s) => s.is_active).map((s) => {
              const existing = attendanceMap.get(s.id)
              return (
                // Four buttons in a row leave about twenty-six pixels for a
                // name on a phone — every member of staff read "Dr. Aru…", and
                // marking the wrong person present is the whole risk here.
                <div key={s.id}
                  className="flex flex-col gap-2 py-2 px-3 rounded-xl sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
                  style={{ background: 'rgba(248,250,252,0.6)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words" style={{ color: '#0F172A' }}>{s.full_name}</p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{s.role}</p>
                  </div>
                  {existing && (
                    <StatusBadge status={existing.status === 'present' ? 'success' : existing.status === 'absent' ? 'error' : existing.status === 'leave' ? 'pending' : 'info'} label={STATUS_STYLES[existing.status].label} />
                  )}
                  <div className="flex gap-1.5 flex-wrap">
                    {(['present', 'absent', 'leave', 'half_day'] as AttendanceStatus[]).map((st) => (
                      <button key={st} disabled={marking[s.id]}
                        onClick={() => handleMark(s.id, st)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium"
                        style={{
                          background: existing?.status === st
                            ? st === 'present' ? 'rgba(16,185,129,0.15)' : st === 'absent' ? 'rgba(239,68,68,0.12)' : st === 'leave' ? 'rgba(251,191,36,0.12)' : 'rgba(59,130,246,0.1)'
                            : 'rgba(241,245,249,0.8)',
                          color: existing?.status === st
                            ? st === 'present' ? '#065F46' : st === 'absent' ? '#991B1B' : st === 'leave' ? '#92400E' : '#1E40AF'
                            : '#64748B',
                          border: 'none',
                          cursor: marking[s.id] ? 'not-allowed' : 'pointer',
                          fontWeight: existing?.status === st ? '600' : '400',
                        }}>
                        {STATUS_STYLES[st].label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* Monthly attendance list — read-only */}
      {!canMark && (
        <div className="space-y-2">
          {attendance.length === 0 ? (
            <GlassCard className="p-8">
              <p className="text-center text-sm" style={{ color: '#94A3B8' }}>No attendance records for this month</p>
            </GlassCard>
          ) : (
            attendance.map((a) => (
              <GlassCard key={a.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                      {a.profile?.full_name ?? a.profile_id}
                    </p>
                    <p className="text-xs" style={{ color: '#94A3B8' }}>{a.date} {a.shift ? `· ${a.shift}` : ''}</p>
                  </div>
                  <StatusBadge status={a.status === 'present' ? 'success' : a.status === 'absent' ? 'error' : a.status === 'leave' ? 'pending' : 'info'} label={STATUS_STYLES[a.status].label} />
                </div>
              </GlassCard>
            ))
          )}
        </div>
      )}
    </div>
  )
}
