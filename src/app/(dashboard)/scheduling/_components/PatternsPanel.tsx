'use client'

import { useState, useTransition } from 'react'
import { Repeat, Plus, Trash2, Users, X, AlertCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import { listPatterns, upsertPattern, deletePattern, setPatternMembers } from '@/app/actions/scheduling'
import type { RosterPattern, ShiftDefinition } from '@/lib/types'

interface Props {
  initialPatterns: RosterPattern[]
  initialShifts: ShiftDefinition[]
  wards: { id: string; name: string }[]
  nurses: { id: string; full_name: string }[]
}

const inputCls = 'text-sm px-3 py-2 rounded-xl'
const inputStyle: React.CSSProperties = { border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' }

interface MemberDraft { profile_id: string; ward_id: string; anchor_date: string; offset_days: number }

export default function PatternsPanel({ initialPatterns, initialShifts, wards, nurses }: Props) {
  const [patterns, setPatterns] = useState(initialPatterns)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // pattern builder
  const [name, setName] = useState('')
  const [dayPlan, setDayPlan] = useState<string[]>(['morning', 'morning', 'night', 'night', 'off', 'off', 'off'])
  const [editId, setEditId] = useState('')

  // members editor
  const [openMembers, setOpenMembers] = useState('')  // pattern id
  const [mDraft, setMDraft] = useState<MemberDraft>({ profile_id: '', ward_id: '', anchor_date: '', offset_days: 0 })
  const [members, setMembers] = useState<MemberDraft[]>([])

  const activeShifts = initialShifts.filter((s) => s.is_active)
  const nurseName = (id: string) => nurses.find((n) => n.id === id)?.full_name ?? '—'

  function run(fn: () => Promise<{ success: boolean; error?: string }>, after: () => Promise<void>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error || 'Failed'); return }
      await after()
    })
  }
  const reload = async () => setPatterns(await listPatterns())

  function savePattern() {
    run(() => upsertPattern({ ...(editId ? { id: editId } : {}), name, day_plan: dayPlan }),
      async () => { await reload(); setName(''); setEditId(''); setDayPlan(['morning', 'morning', 'night', 'night', 'off', 'off', 'off']) })
  }

  function openMembersFor(p: RosterPattern) {
    setOpenMembers(p.id)
    setMembers((p.members ?? []).map((m) => ({
      profile_id: m.profile_id, ward_id: m.ward_id ?? '', anchor_date: m.anchor_date, offset_days: m.offset_days,
    })))
  }
  function saveMembers() {
    run(() => setPatternMembers(openMembers, members.map((m) => ({
      profile_id: m.profile_id, ward_id: m.ward_id || null, anchor_date: m.anchor_date, offset_days: m.offset_days,
    }))), async () => { await reload(); setOpenMembers('') })
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Pattern list */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Repeat className="w-4 h-4" style={{ color: '#0D9488' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Rotation Patterns</h3>
        </div>
        {patterns.length === 0 ? (
          <p className="text-xs" style={{ color: '#CBD5E1' }}>No patterns yet. Build one below, then assign nurses and apply it from the Roster tab.</p>
        ) : (
          <div className="space-y-1.5">
            {patterns.map((p) => (
              <div key={p.id} className="px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{p.name}</span>
                  <span className="text-[11px]" style={{ color: '#64748B' }}>{p.cycle_days}-day · {p.members?.length ?? 0} nurse(s)</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => openMembersFor(p)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md" style={{ background: '#EEF2FF', color: '#4338CA' }}>
                      <Users className="w-3 h-3" /> Members
                    </button>
                    <button onClick={() => { setEditId(p.id); setName(p.name); setDayPlan(p.day_plan) }} className="text-[11px] px-2 py-1 rounded-md" style={{ background: '#F1F5F9', color: '#334155' }}>Edit</button>
                    <button onClick={() => run(() => deletePattern(p.id), reload)} disabled={isPending} className="p-1 rounded" style={{ color: '#EF4444' }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.day_plan.map((code, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded capitalize"
                      style={code === 'off' ? { background: '#F1F5F9', color: '#94A3B8' } : { background: '#CCFBF1', color: '#0F766E' }}>
                      {code === 'off' ? 'Off' : (initialShifts.find((s) => s.code === code)?.label ?? code)}
                    </span>
                  ))}
                </div>

                {/* Members editor */}
                {openMembers === p.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid #E2E8F0' }}>
                    <div className="space-y-1 mb-2">
                      {members.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: '#fff' }}>
                          <span style={{ color: '#0F172A' }}>{nurseName(m.profile_id)}</span>
                          <span style={{ color: '#94A3B8' }}>· anchor {m.anchor_date} · +{m.offset_days}d{m.ward_id ? ` · ${wards.find((w) => w.id === m.ward_id)?.name}` : ''}</span>
                          <button onClick={() => setMembers((xs) => xs.filter((_, j) => j !== i))} className="ml-auto p-0.5" style={{ color: '#EF4444' }}><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      {members.length === 0 && <p className="text-[11px]" style={{ color: '#CBD5E1' }}>No nurses on this pattern yet.</p>}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Select value={mDraft.profile_id} onChange={(e) => setMDraft((f) => ({ ...f, profile_id: e.target.value }))} className="w-44">
                        <option value="">Nurse…</option>
                        {nurses.map((n) => <option key={n.id} value={n.id}>{n.full_name}</option>)}
                      </Select>
                      <Select value={mDraft.ward_id} onChange={(e) => setMDraft((f) => ({ ...f, ward_id: e.target.value }))} className="w-40">
                        <option value="">Any ward</option>
                        {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </Select>
                      <input type="date" value={mDraft.anchor_date} onChange={(e) => setMDraft((f) => ({ ...f, anchor_date: e.target.value }))} className={inputCls} style={inputStyle} title="Cycle day-0 for this nurse" />
                      <button onClick={() => { if (mDraft.profile_id && mDraft.anchor_date) { setMembers((xs) => [...xs, mDraft]); setMDraft({ profile_id: '', ward_id: '', anchor_date: '', offset_days: 0 }) } }}
                        className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg" style={{ background: '#F1F5F9', color: '#334155' }}>
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                      <button onClick={saveMembers} disabled={isPending} className="text-xs px-3 py-2 rounded-lg" style={{ background: '#0D9488', color: '#fff' }}>Save members</button>
                      <button onClick={() => setOpenMembers('')} className="text-xs px-2 py-2" style={{ color: '#64748B' }}>Close</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Pattern builder */}
      <GlassCard className="p-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>{editId ? 'Edit pattern' : 'New pattern'}</h3>
        <input placeholder="Pattern name (e.g. Standard 3-shift rotation)" value={name} onChange={(e) => setName(e.target.value)}
          className={`${inputCls} w-full mb-3`} style={inputStyle} />
        <p className="text-xs mb-2" style={{ color: '#64748B' }}>Cycle days ({dayPlan.length}) — set each day's shift or Off:</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {dayPlan.map((code, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[10px]" style={{ color: '#94A3B8' }}>D{i + 1}</span>
              <select value={code} onChange={(e) => setDayPlan((dp) => dp.map((c, j) => (j === i ? e.target.value : c)))}
                className="text-[11px] px-1 py-1 rounded-md" style={inputStyle}>
                <option value="off">Off</option>
                {activeShifts.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
              <button onClick={() => setDayPlan((dp) => dp.filter((_, j) => j !== i))} className="p-0.5" style={{ color: '#EF4444' }}><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => setDayPlan((dp) => [...dp, 'off'])} className="self-center flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg" style={{ background: '#F1F5F9', color: '#334155' }}>
            <Plus className="w-3.5 h-3.5" /> Day
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={savePattern} disabled={isPending || !name || dayPlan.length === 0}
            className="text-xs px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: '#0D9488', color: '#fff' }}>
            {editId ? 'Save pattern' : 'Create pattern'}
          </button>
          {editId && <button onClick={() => { setEditId(''); setName(''); setDayPlan(['morning', 'morning', 'night', 'night', 'off', 'off', 'off']) }} className="text-xs px-2 py-2" style={{ color: '#64748B' }}>Cancel</button>}
        </div>
      </GlassCard>
    </div>
  )
}
