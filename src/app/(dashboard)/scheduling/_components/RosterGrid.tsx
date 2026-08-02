'use client'

import { useState, useEffect, useTransition, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Copy, Wand2, Send, Plus, AlertCircle, Users } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import {
  getWardRoster, setRosterCell, clearRosterCell, publishRoster, generateRoster,
} from '@/app/actions/scheduling'
import type { WardRosterData, RosterPattern } from '@/lib/types'

interface Props {
  wards: { id: string; name: string }[]
  canManage: boolean
  patterns: RosterPattern[]
}

function mondayOf(base: Date): string {
  const x = new Date(base)
  const day = (x.getDay() + 6) % 7   // 0 = Monday
  x.setDate(x.getDate() - day)
  return x.toISOString().slice(0, 10)
}
function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function dow(date: string) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
}

export default function RosterGrid({ wards, canManage, patterns }: Props) {
  const [wardId, setWardId] = useState(wards[0]?.id ?? '')
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [data, setData] = useState<WardRosterData | null>(null)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [extra, setExtra] = useState<string[]>([])   // manually added nurse rows
  const [addSel, setAddSel] = useState('')
  const [patternId, setPatternId] = useState('')

  const weekEnd = addDays(weekStart, 6)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const load = useCallback(async () => {
    if (!wardId) return
    setLoading(true)
    const d = await getWardRoster({ wardId, weekStart })
    setData(d); setLoading(false)
  }, [wardId, weekStart])

  useEffect(() => { load(); setExtra([]) }, [load])

  // roster lookup: profileId|date -> { shift, status }
  const cellMap = useMemo(() => {
    const m = new Map<string, { shift: string | null; status?: string }>()
    for (const r of data?.roster ?? []) m.set(`${r.profile_id}|${r.date}`, { shift: r.shift, status: r.status })
    return m
  }, [data])

  const nurseName = useMemo(() => new Map((data?.nurses ?? []).map((n) => [n.id, n.full_name])), [data])

  // Per-day shortfall = Σ max(0, required − assigned) across shifts, for each day.
  const shortByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of data?.coverage ?? []) m.set(c.date, (m.get(c.date) ?? 0) + Math.max(0, c.required - c.assigned))
    return m
  }, [data])

  // rows = nurses rostered this week + manually added
  const rowIds = useMemo(() => {
    const ids = new Set<string>(extra)
    for (const r of data?.roster ?? []) ids.add(r.profile_id)
    return [...ids].sort((a, b) => (nurseName.get(a) ?? '').localeCompare(nurseName.get(b) ?? ''))
  }, [data, extra, nurseName])

  const availableToAdd = (data?.nurses ?? []).filter((n) => !rowIds.includes(n.id))

  function act(fn: () => Promise<{ success: boolean; error?: string } | { success: true; created: number }>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(('error' in res && res.error) || 'Action failed'); return }
      await load()
    })
  }

  function changeCell(profileId: string, date: string, shift: string) {
    if (!shift) act(() => clearRosterCell({ wardId, profileId, date }))
    else act(() => setRosterCell({ wardId, profileId, date, shift }))
  }

  const shifts = data?.shifts ?? []

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <GlassCard className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={wardId} onChange={(e) => setWardId(e.target.value)} className="w-48">
            {wards.length === 0 && <option value="">No wards</option>}
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>

          <div className="flex items-center gap-1">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="p-2 rounded-lg" style={{ border: '1px solid #E2E8F0', background: '#fff' }} title="Previous week">
              <ChevronLeft className="w-4 h-4" style={{ color: '#475569' }} />
            </button>
            <span className="text-xs font-medium px-2" style={{ color: '#334155' }}>
              {new Date(weekStart + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – {new Date(weekEnd + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="p-2 rounded-lg" style={{ border: '1px solid #E2E8F0', background: '#fff' }} title="Next week">
              <ChevronRight className="w-4 h-4" style={{ color: '#475569' }} />
            </button>
            <button onClick={() => setWeekStart(mondayOf(new Date()))}
              className="text-xs px-2 py-2 rounded-lg" style={{ color: '#0D9488' }}>This week</button>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button onClick={() => act(() => generateRoster({ ward_id: wardId, start_date: weekStart, end_date: weekEnd, copy_forward: true }))}
                disabled={isPending} className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg"
                style={{ background: '#F1F5F9', color: '#334155' }} title="Copy the previous week into empty slots">
                <Copy className="w-3.5 h-3.5" /> Copy last week
              </button>
              <button onClick={() => act(() => generateRoster({ ward_id: wardId, start_date: weekStart, end_date: weekEnd, auto_fill: true }))}
                disabled={isPending} className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg"
                style={{ background: '#F1F5F9', color: '#334155' }} title="Fill gaps to meet coverage ratios">
                <Wand2 className="w-3.5 h-3.5" /> Auto-fill
              </button>
              {patterns.length > 0 && (
                <div className="flex items-center gap-1">
                  <Select value={patternId} onChange={(e) => setPatternId(e.target.value)} className="w-44">
                    <option value="">Apply pattern…</option>
                    {patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                  {patternId && (
                    <button onClick={() => act(() => generateRoster({ ward_id: wardId, start_date: weekStart, end_date: weekEnd, pattern_id: patternId }))}
                      disabled={isPending} className="text-xs px-2 py-2 rounded-lg" style={{ background: '#F1F5F9', color: '#334155' }}>Apply</button>
                  )}
                </div>
              )}
              <button onClick={() => act(() => publishRoster({ wardId, start: weekStart, end: weekEnd }))}
                disabled={isPending} className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-lg"
                style={{ background: '#0D9488', color: '#fff' }} title="Publish drafts for this week">
                <Send className="w-3.5 h-3.5" /> Publish
              </button>
            </div>
          )}
        </div>

        {/* Coverage note — per-day shortfall is flagged in each day column below */}
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 text-[11px]" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
            <Users className="w-3 h-3" /> {data.coverage[0]?.occupied_beds ?? 0} beds occupied · required staff is ratio-driven; each day flags its own shortfall below.
          </div>
        )}
      </GlassCard>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Grid */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                <th className="text-left px-3 py-2 text-xs font-semibold sticky left-0" style={{ color: '#64748B', background: '#F8FAFC', minWidth: 150 }}>Nurse</th>
                {days.map((d) => {
                  const short = shortByDay.get(d) ?? 0
                  return (
                    <th key={d} className="px-2 py-2 text-xs font-semibold text-center" style={{ color: '#64748B' }}>
                      <div>{dow(d)}</div>
                      {short > 0
                        ? <div className="text-[10px] font-medium" style={{ color: '#DC2626' }} title="Understaffed vs coverage ratio">{short} short</div>
                        : <div className="text-[10px]" style={{ color: '#0D9488' }}>✓</div>}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-xs" style={{ color: '#94A3B8' }}>Loading…</td></tr>
              ) : rowIds.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-xs" style={{ color: '#94A3B8' }}>
                  No nurses rostered this week{canManage ? ' — add a nurse or use Copy / Auto-fill above.' : '.'}
                </td></tr>
              ) : rowIds.map((pid) => (
                <tr key={pid} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td className="px-3 py-1.5 text-xs font-medium sticky left-0" style={{ color: '#0F172A', background: '#fff' }}>
                    {nurseName.get(pid) ?? '—'}
                  </td>
                  {days.map((d) => {
                    const cell = cellMap.get(`${pid}|${d}`)
                    const isDraft = cell?.status === 'draft'
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        {canManage ? (
                          <select
                            value={cell?.shift ?? ''}
                            disabled={isPending}
                            onChange={(e) => changeCell(pid, d, e.target.value)}
                            className="text-[11px] px-1 py-1 rounded-md w-full"
                            style={{
                              border: isDraft ? '1px dashed #F59E0B' : '1px solid #E2E8F0',
                              background: cell?.shift ? (isDraft ? '#FFFBEB' : '#F0FDFA') : '#fff',
                              color: cell?.shift ? '#0F766E' : '#94A3B8',
                            }}>
                            <option value="">—</option>
                            {shifts.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md capitalize"
                            style={cell?.shift ? { background: '#F0FDFA', color: '#0F766E' } : { color: '#CBD5E1' }}>
                            {cell?.shift ? (shifts.find((s) => s.code === cell.shift)?.label ?? cell.shift) : '—'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add nurse row */}
        {canManage && availableToAdd.length > 0 && (
          <div className="flex items-center gap-2 p-3" style={{ borderTop: '1px solid #F1F5F9' }}>
            <Select value={addSel} onChange={(e) => setAddSel(e.target.value)} className="w-56">
              <option value="">Add nurse to roster…</option>
              {availableToAdd.map((n) => <option key={n.id} value={n.id}>{n.full_name}</option>)}
            </Select>
            <button onClick={() => { if (addSel) { setExtra((x) => [...x, addSel]); setAddSel('') } }}
              disabled={!addSel} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
              style={{ background: '#F1F5F9', color: '#334155' }}>
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
            <span className="text-[11px]" style={{ color: '#CBD5E1' }}>Amber dashed = draft (unpublished)</span>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
