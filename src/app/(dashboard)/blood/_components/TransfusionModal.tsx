'use client'

import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { listIssuedUnitsForRequest, recordTransfusion, recordTransfusionReaction } from '@/app/actions/blood'
import type { BloodRequest, BloodIssuedUnit } from '@/lib/types'

const COMPONENT_LABELS: Record<string, string> = { whole: 'Whole Blood', prbc: 'PRBC', plasma: 'Plasma', platelets: 'Platelets' }
const REACTION_TYPES = ['febrile', 'allergic', 'hemolytic', 'anaphylactic', 'taco', 'trali', 'septic', 'other'] as const
const SEVERITIES = ['mild', 'moderate', 'severe', 'life_threatening'] as const

interface Props {
  request: BloodRequest
  onClose: () => void
}

export default function TransfusionModal({ request, onClose }: Props) {
  const [units, setUnits] = useState<BloodIssuedUnit[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    listIssuedUnitsForRequest(request.id).then((u) => { setUnits(u); setLoading(false) })
  }, [request.id])
  useEffect(() => { load() }, [load])

  return (
    <Modal open onClose={onClose} title={`Transfusion — ${request.patient?.full_name ?? ''}`} maxWidth="42rem">
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
        ) : units.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>No issued units for this request.</p>
        ) : (
          units.map((u) => <UnitBlock key={u.id} unit={u} onChanged={load} />)
        )}
        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Done</button>
        </div>
      </div>
    </Modal>
  )
}

function UnitBlock({ unit, onChanged }: { unit: BloodIssuedUnit; onChanged: () => void }) {
  const tf = unit.transfusion
  return (
    <div className="rounded-xl p-3.5" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-xs px-2 py-0.5 rounded" style={{ background: '#FEE2E2', color: '#DC2626' }}>{unit.blood_group}</span>
        <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{COMPONENT_LABELS[unit.component] ?? unit.component}</span>
        {unit.bag_number && <span className="font-mono text-xs" style={{ color: '#64748B' }}>{unit.bag_number}</span>}
      </div>
      {tf ? <TransfusionRecorded transfusion={tf} onChanged={onChanged} /> : <TransfusionForm issueId={unit.id} onSaved={onChanged} />}
    </div>
  )
}

function TransfusionForm({ issueId, onSaved }: { issueId: string; onSaved: () => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [preBp, setPreBp] = useState(''); const [prePulse, setPrePulse] = useState(''); const [preTemp, setPreTemp] = useState('')
  const [postBp, setPostBp] = useState(''); const [postPulse, setPostPulse] = useState(''); const [postTemp, setPostTemp] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true); setError(null)
    const res = await recordTransfusion(issueId, {
      started_at: start || null, ended_at: end || null,
      vitals_pre: { bp: preBp || null, pulse: prePulse || null, temp: preTemp || null },
      vitals_post: { bp: postBp || null, pulse: postPulse || null, temp: postTemp || null },
      notes: notes || null,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSaved()
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        <FormField label="Start"><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
        <FormField label="End"><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></FormField>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Pre-transfusion vitals</p>
      <div className="grid grid-cols-3 gap-2.5">
        <Input value={preBp} onChange={(e) => setPreBp(e.target.value)} placeholder="BP" />
        <Input value={prePulse} onChange={(e) => setPrePulse(e.target.value)} placeholder="Pulse" />
        <Input value={preTemp} onChange={(e) => setPreTemp(e.target.value)} placeholder="Temp" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Post-transfusion vitals</p>
      <div className="grid grid-cols-3 gap-2.5">
        <Input value={postBp} onChange={(e) => setPostBp(e.target.value)} placeholder="BP" />
        <Input value={postPulse} onChange={(e) => setPostPulse(e.target.value)} placeholder="Pulse" />
        <Input value={postTemp} onChange={(e) => setPostTemp(e.target.value)} placeholder="Temp" />
      </div>
      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      {error && <p className="text-xs font-medium" style={{ color: '#DC2626' }}>{error}</p>}
      <button onClick={save} disabled={saving}
        className="px-4 py-2 rounded-lg text-xs font-semibold"
        style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Saving…' : 'Record Transfusion'}
      </button>
    </div>
  )
}

function TransfusionRecorded({ transfusion, onChanged }: { transfusion: NonNullable<BloodIssuedUnit['transfusion']>; onChanged: () => void }) {
  const [showReaction, setShowReaction] = useState(false)
  const [rType, setRType] = useState<typeof REACTION_TYPES[number]>('febrile')
  const [sev, setSev] = useState<typeof SEVERITIES[number]>('mild')
  const [action, setAction] = useState('')
  const [saving, setSaving] = useState(false)
  const reactions = transfusion.reactions ?? []

  async function saveReaction() {
    setSaving(true)
    const res = await recordTransfusionReaction(transfusion.id, { reaction_type: rType, severity: sev, action_taken: action || null })
    setSaving(false)
    if (res.success) { setShowReaction(false); setAction(''); onChanged() }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs" style={{ color: '#15803D' }}>
        <span className="px-2 py-0.5 rounded font-semibold" style={{ background: '#DCFCE7' }}>✓ Transfused</span>
        {transfusion.started_at && <span style={{ color: '#64748B' }}>{new Date(transfusion.started_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      {reactions.map((r) => (
        <div key={r.id} className="text-xs rounded-lg px-2.5 py-1.5" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
          ⚠ {r.reaction_type} · {r.severity.replace('_', ' ')}{r.action_taken ? ` — ${r.action_taken}` : ''}
        </div>
      ))}
      {showReaction ? (
        <div className="space-y-2 rounded-lg p-2.5" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
          <div className="grid grid-cols-2 gap-2">
            <Select value={rType} onChange={(e) => setRType(e.target.value as typeof rType)}>
              {REACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </Select>
          </div>
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action taken" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowReaction(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
            <button onClick={saveReaction} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save Reaction'}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowReaction(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', cursor: 'pointer' }}>
          + Report Reaction
        </button>
      )}
    </div>
  )
}
