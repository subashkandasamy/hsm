'use client'

import { useState, useTransition } from 'react'
import { Clock, Users, ShieldCheck, Plus, Trash2, Pencil, AlertCircle } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import {
  listShiftDefinitions, upsertShiftDefinition, deleteShiftDefinition,
  listCoverageRules, upsertCoverageRule, deleteCoverageRule,
  listWardIncharges, addWardIncharge, removeWardIncharge,
} from '@/app/actions/scheduling'
import type { ShiftDefinition, WardCoverageRule, WardIncharge } from '@/lib/types'

interface Props {
  wards: { id: string; name: string }[]
  nurses: { id: string; full_name: string }[]
  initialShifts: ShiftDefinition[]
  initialCoverage: WardCoverageRule[]
  initialIncharges: WardIncharge[]
}

const inputCls = 'text-sm px-3 py-2 rounded-xl'
const inputStyle: React.CSSProperties = { border: '1px solid #E2E8F0', background: '#fff', color: '#0F172A' }

export default function ConfigPanel({ wards, nurses, initialShifts, initialCoverage, initialIncharges }: Props) {
  const [shifts, setShifts] = useState(initialShifts)
  const [coverage, setCoverage] = useState(initialCoverage)
  const [incharges, setIncharges] = useState(initialIncharges)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const blankShift = { id: '', code: '', label: '', start_time: '07:00', end_time: '19:00', crosses_midnight: false, sort_order: shifts.length + 1, is_active: true }
  const [sForm, setSForm] = useState<typeof blankShift>(blankShift)
  const [cForm, setCForm] = useState({ ward_id: '', shift_code: '', patient_ratio: 6, min_nurses: 1 })
  const [iForm, setIForm] = useState({ ward_id: '', profile_id: '' })

  function run(fn: () => Promise<{ success: boolean; error?: string }>, after: () => Promise<void>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error || 'Failed'); return }
      await after()
    })
  }
  const reloadShifts = async () => setShifts(await listShiftDefinitions())
  const reloadCoverage = async () => setCoverage(await listCoverageRules())
  const reloadIncharges = async () => setIncharges(await listWardIncharges())

  const wardName = (id: string) => wards.find((w) => w.id === id)?.name ?? '—'
  const shiftLabel = (code: string) => shifts.find((s) => s.code === code)?.label ?? code

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* ── Shifts ── */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4" style={{ color: '#0D9488' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Shift Types</h3>
        </div>
        <div className="space-y-1.5 mb-4">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#F8FAFC' }}>
              <span className="text-sm font-medium capitalize" style={{ color: '#0F172A' }}>{s.label}</span>
              <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#EEF2FF', color: '#4338CA' }}>{s.code}</span>
              <span className="text-xs" style={{ color: '#64748B' }}>{s.start_time}–{s.end_time}{s.crosses_midnight ? ' (+1)' : ''}</span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => run(() => upsertShiftDefinition({ ...s, is_active: !s.is_active }), reloadShifts)}
                  disabled={isPending} className="text-[11px] px-2 py-0.5 rounded-md"
                  style={s.is_active ? { background: '#F0FDF4', color: '#0D9488' } : { background: '#F1F5F9', color: '#94A3B8' }}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => setSForm({ id: s.id, code: s.code, label: s.label, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5), crosses_midnight: s.crosses_midnight, sort_order: s.sort_order, is_active: s.is_active })}
                  className="p-1 rounded" style={{ color: '#64748B' }} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => run(() => deleteShiftDefinition(s.id), reloadShifts)} disabled={isPending}
                  className="p-1 rounded" style={{ color: '#EF4444' }} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <input placeholder="code" value={sForm.code} onChange={(e) => setSForm((f) => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))} className={inputCls} style={{ ...inputStyle, width: 90 }} />
          <input placeholder="Label" value={sForm.label} onChange={(e) => setSForm((f) => ({ ...f, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 120 }} />
          <input type="time" value={sForm.start_time} onChange={(e) => setSForm((f) => ({ ...f, start_time: e.target.value }))} className={inputCls} style={inputStyle} />
          <input type="time" value={sForm.end_time} onChange={(e) => setSForm((f) => ({ ...f, end_time: e.target.value }))} className={inputCls} style={inputStyle} />
          <label className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
            <input type="checkbox" checked={sForm.crosses_midnight} onChange={(e) => setSForm((f) => ({ ...f, crosses_midnight: e.target.checked }))} /> +1 day
          </label>
          <button onClick={() => run(() => upsertShiftDefinition(sForm), async () => { await reloadShifts(); setSForm(blankShift) })}
            disabled={isPending || !sForm.code || !sForm.label}
            className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: '#0D9488', color: '#fff' }}>
            <Plus className="w-3.5 h-3.5" /> {sForm.id ? 'Save' : 'Add'}
          </button>
          {sForm.id && <button onClick={() => setSForm(blankShift)} className="text-xs px-2 py-2" style={{ color: '#64748B' }}>Cancel</button>}
        </div>
      </GlassCard>

      {/* ── Coverage rules ── */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4" style={{ color: '#0D9488' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Coverage Ratios</h3>
        </div>
        <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>1 nurse : N patients per ward &amp; shift. Drives required-staffing and auto-fill. Default 1:6 if unset.</p>
        <div className="space-y-1.5 mb-4">
          {coverage.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: '#F8FAFC' }}>
              <span className="font-medium" style={{ color: '#0F172A' }}>{c.ward?.name ?? wardName(c.ward_id)}</span>
              <span className="text-xs capitalize" style={{ color: '#64748B' }}>· {shiftLabel(c.shift_code)}</span>
              <span className="ml-auto text-xs" style={{ color: '#0D9488' }}>1:{c.patient_ratio} · min {c.min_nurses}</span>
              <button onClick={() => run(() => deleteCoverageRule(c.id), reloadCoverage)} disabled={isPending}
                className="p-1 rounded" style={{ color: '#EF4444' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {coverage.length === 0 && <p className="text-xs" style={{ color: '#CBD5E1' }}>No custom ratios — all wards use 1:6.</p>}
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <Select value={cForm.ward_id} onChange={(e) => setCForm((f) => ({ ...f, ward_id: e.target.value }))} className="w-40">
            <option value="">Ward…</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select value={cForm.shift_code} onChange={(e) => setCForm((f) => ({ ...f, shift_code: e.target.value }))} className="w-32">
            <option value="">Shift…</option>
            {shifts.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </Select>
          <div className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>1:
            <input type="number" min={1} value={cForm.patient_ratio} onChange={(e) => setCForm((f) => ({ ...f, patient_ratio: Number(e.target.value) }))} className={inputCls} style={{ ...inputStyle, width: 64 }} />
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>min
            <input type="number" min={0} value={cForm.min_nurses} onChange={(e) => setCForm((f) => ({ ...f, min_nurses: Number(e.target.value) }))} className={inputCls} style={{ ...inputStyle, width: 64 }} />
          </div>
          <button onClick={() => run(() => upsertCoverageRule(cForm), async () => { await reloadCoverage(); setCForm({ ward_id: '', shift_code: '', patient_ratio: 6, min_nurses: 1 }) })}
            disabled={isPending || !cForm.ward_id || !cForm.shift_code}
            className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: '#0D9488', color: '#fff' }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </GlassCard>

      {/* ── Ward in-charges ── */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4" style={{ color: '#0D9488' }} />
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Ward In-charges</h3>
        </div>
        <p className="text-xs mb-3" style={{ color: '#94A3B8' }}>An in-charge nurse can build &amp; publish rosters and approve leave for their ward.</p>
        <div className="space-y-1.5 mb-4">
          {incharges.map((ic) => (
            <div key={ic.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: '#F8FAFC' }}>
              <span className="font-medium" style={{ color: '#0F172A' }}>{ic.ward?.name ?? wardName(ic.ward_id)}</span>
              <span className="text-xs" style={{ color: '#64748B' }}>· {ic.profile?.full_name ?? '—'}</span>
              <button onClick={() => run(() => removeWardIncharge(ic.id), reloadIncharges)} disabled={isPending}
                className="ml-auto p-1 rounded" style={{ color: '#EF4444' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {incharges.length === 0 && <p className="text-xs" style={{ color: '#CBD5E1' }}>No in-charges assigned — only admins manage rosters.</p>}
        </div>
        <div className="flex flex-wrap items-end gap-2 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
          <Select value={iForm.ward_id} onChange={(e) => setIForm((f) => ({ ...f, ward_id: e.target.value }))} className="w-40">
            <option value="">Ward…</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select value={iForm.profile_id} onChange={(e) => setIForm((f) => ({ ...f, profile_id: e.target.value }))} className="w-44">
            <option value="">Nurse…</option>
            {nurses.map((n) => <option key={n.id} value={n.id}>{n.full_name}</option>)}
          </Select>
          <button onClick={() => run(() => addWardIncharge(iForm), async () => { await reloadIncharges(); setIForm({ ward_id: '', profile_id: '' }) })}
            disabled={isPending || !iForm.ward_id || !iForm.profile_id}
            className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg disabled:opacity-50" style={{ background: '#0D9488', color: '#fff' }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </GlassCard>
    </div>
  )
}
