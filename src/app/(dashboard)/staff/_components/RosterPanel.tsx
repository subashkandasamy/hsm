'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import { setRoster, getRoster } from '@/app/actions/hr'
import { useAuth } from '@/context/AuthContext'
import { hasPermission } from '@/lib/rbac'
import type { StaffMember, DutyRoster, Shift } from '@/lib/types'

const SHIFT_STYLES: Record<Shift, { label: string; color: string; bg: string }> = {
  morning: { label: 'Morning', color: '#1E40AF', bg: 'rgba(59,130,246,0.1)' },
  evening: { label: 'Evening', color: '#92400E', bg: 'rgba(251,191,36,0.1)' },
  night:   { label: 'Night',   color: '#5B21B6', bg: 'rgba(139,92,246,0.1)' },
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr)
  return {
    day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
    date: d.getDate(),
  }
}

interface Props {
  staff: StaffMember[]
  initialRoster: DutyRoster[]
  weekStart: string
}

export default function RosterPanel({ staff, initialRoster, weekStart: initWeekStart }: Props) {
  const { profile } = useAuth()
  const role = profile?.role
  const canManage = !!role && hasPermission(role, 'hr:manage')

  const [weekStart, setWeekStart] = useState(initWeekStart)
  const [roster, setRosterData]   = useState(initialRoster)
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState<Record<string, boolean>>({})

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  async function loadRoster(ws: string) {
    setLoading(true)
    const data = await getRoster({ weekStart: ws })
    setRosterData(data)
    setLoading(false)
  }

  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7)
    setWeekStart(next)
    loadRoster(next)
  }

  const rosterMap = new Map(roster.map((r) => [`${r.profile_id}__${r.date}`, r]))

  async function handleSetShift(profileId: string, date: string, shift: Shift | '') {
    const key = `${profileId}__${date}`
    setSaving((s) => ({ ...s, [key]: true }))
    await setRoster({ profile_id: profileId, date, shift: shift || null })
    setSaving((s) => ({ ...s, [key]: false }))
    await loadRoster(weekStart)
  }

  const weekLabel = `${new Date(weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${new Date(addDays(weekStart, 6)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const activeStaff = staff.filter((s) => s.is_active)

  return (
    <div className="space-y-5">
      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button onClick={() => shiftWeek(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold px-3" style={{ color: '#0F172A', minWidth: '200px', textAlign: 'center' }}>
          {weekLabel}
        </span>
        <button onClick={() => shiftWeek(1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer' }}>
          <ChevronRight className="w-4 h-4" />
        </button>
        {loading && <span className="text-xs animate-pulse" style={{ color: '#94A3B8' }}>Loading…</span>}
      </div>

      {/* Desktop grid — hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 text-sm font-semibold w-44" style={{ color: '#475569' }}>Staff</th>
              {weekDates.map((d) => {
                const { day, date } = formatDayLabel(d)
                const isToday = d === new Date().toISOString().slice(0, 10)
                return (
                  <th key={d} className="px-2 py-3 text-center text-sm font-semibold"
                    style={{ color: isToday ? '#0D9488' : '#475569', minWidth: '100px' }}>
                    <div>{day}</div>
                    <div className="text-xs font-normal">{date}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {activeStaff.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                <td className="px-4 py-2">
                  <p className="text-sm font-medium truncate" style={{ color: '#0F172A' }}>{s.full_name}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{s.role}</p>
                </td>
                {weekDates.map((d) => {
                  const key = `${s.id}__${d}`
                  const entry = rosterMap.get(key)
                  return (
                    <td key={d} className="px-2 py-2 text-center">
                      {canManage ? (
                        <Select
                          value={entry?.shift ?? ''}
                          onChange={(e) => handleSetShift(s.id, d, e.target.value as Shift | '')}
                          disabled={saving[key]}
                          style={{ minHeight: '36px', fontSize: '0.75rem' }}
                        >
                          <option value="">—</option>
                          <option value="morning">Morning</option>
                          <option value="evening">Evening</option>
                          <option value="night">Night</option>
                        </Select>
                      ) : (
                        entry?.shift ? (
                          <span className="px-2 py-1 rounded-lg text-xs font-medium"
                            style={{ background: SHIFT_STYLES[entry.shift].bg, color: SHIFT_STYLES[entry.shift].color }}>
                            {SHIFT_STYLES[entry.shift].label}
                          </span>
                        ) : (
                          <span style={{ color: '#CBD5E1' }}>—</span>
                        )
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — card per staff member */}
      <div className="md:hidden space-y-3">
        {activeStaff.map((s) => (
          <GlassCard key={s.id} className="p-4">
            <p className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
              {s.full_name} <span className="text-xs font-normal" style={{ color: '#94A3B8' }}>· {s.role}</span>
            </p>
            <div className="grid grid-cols-7 gap-1">
              {weekDates.map((d) => {
                const { day, date } = formatDayLabel(d)
                const key = `${s.id}__${d}`
                const entry = rosterMap.get(key)
                const isToday = d === new Date().toISOString().slice(0, 10)
                return (
                  <div key={d} className="flex flex-col items-center gap-1">
                    <p className="text-[10px] font-medium" style={{ color: isToday ? '#0D9488' : '#94A3B8' }}>{day}</p>
                    <p className="text-xs font-semibold" style={{ color: isToday ? '#0D9488' : '#475569' }}>{date}</p>
                    {entry?.shift ? (
                      <span className="text-[9px] px-1 py-0.5 rounded text-center leading-tight"
                        style={{ background: SHIFT_STYLES[entry.shift].bg, color: SHIFT_STYLES[entry.shift].color }}>
                        {SHIFT_STYLES[entry.shift].label.slice(0, 3)}
                      </span>
                    ) : (
                      <span className="text-[10px]" style={{ color: '#CBD5E1' }}>—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
