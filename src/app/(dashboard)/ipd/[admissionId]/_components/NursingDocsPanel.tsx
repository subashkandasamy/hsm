'use client'

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Repeat, Plus } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import DateText from '@/components/ui/DateText'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import { listCarePlans, addCarePlan, setCarePlanStatus, listHandovers, addHandover } from '@/app/actions/nursingCare'
import type { NursingCarePlan, NursingHandover, CarePlanStatus } from '@/lib/types'

const CP_STYLE: Record<CarePlanStatus, { bg: string; color: string; label: string }> = {
  active:        { bg: '#DBEAFE', color: '#1D4ED8', label: 'Active' },
  met:           { bg: '#DCFCE7', color: '#15803D', label: 'Goal met' },
  discontinued:  { bg: '#F1F5F9', color: '#64748B', label: 'Discontinued' },
}
const SBAR: [string, string, string][] = [
  ['situation', 'Situation', 'Current status / why handing over'],
  ['background', 'Background', 'Diagnosis, relevant history'],
  ['assessment', 'Assessment', 'Vitals, concerns, current state'],
  ['recommendation', 'Recommendation', 'What the next shift should do / watch'],
]

interface Props { admissionId: string; canWrite: boolean }

export default function NursingDocsPanel({ admissionId, canWrite }: Props) {
  const [plans, setPlans] = useState<NursingCarePlan[]>([])
  const [handovers, setHandovers] = useState<NursingHandover[]>([])
  const [cp, setCp] = useState<Record<string, string>>({}); const [showCp, setShowCp] = useState(false)
  const [ho, setHo] = useState<Record<string, string>>({}); const [showHo, setShowHo] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    listCarePlans(admissionId).then(setPlans)
    listHandovers(admissionId).then(setHandovers)
  }, [admissionId])
  useEffect(() => { load() }, [load])

  async function saveCp() {
    if (!cp.problem?.trim()) return
    setBusy(true)
    const res = await addCarePlan(admissionId, { problem: cp.problem, goal: cp.goal || null, interventions: cp.interventions || null })
    setBusy(false)
    if (res.success) { setCp({}); setShowCp(false); load() }
  }
  async function cycle(p: NursingCarePlan) {
    const next: CarePlanStatus = p.status === 'active' ? 'met' : p.status === 'met' ? 'discontinued' : 'active'
    await setCarePlanStatus(p.id, next); load()
  }
  async function saveHo() {
    setBusy(true)
    const res = await addHandover(admissionId, { shift: ho.shift || null, situation: ho.situation || null, background: ho.background || null, assessment: ho.assessment || null, recommendation: ho.recommendation || null })
    setBusy(false)
    if (res.success) { setHo({}); setShowHo(false); load() }
  }

  return (
    <div className="space-y-4">
      {/* Care plans */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <ClipboardList className="w-4 h-4" style={{ color: '#0D9488' }} /> Nursing Care Plan
          </h3>
          {canWrite && <button onClick={() => setShowCp((s) => !s)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}><Plus className="w-3 h-3" /> Add</button>}
        </div>
        {showCp && (
          <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <Input value={cp.problem ?? ''} onChange={(e) => setCp((c) => ({ ...c, problem: e.target.value }))} placeholder="Nursing problem / diagnosis" />
            <Input value={cp.goal ?? ''} onChange={(e) => setCp((c) => ({ ...c, goal: e.target.value }))} placeholder="Goal / expected outcome" />
            <Input value={cp.interventions ?? ''} onChange={(e) => setCp((c) => ({ ...c, interventions: e.target.value }))} placeholder="Interventions" />
            <div className="flex justify-end"><button onClick={saveCp} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>{busy ? '…' : 'Add Plan'}</button></div>
          </div>
        )}
        {plans.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>No care plans.</p> : (
          <div className="space-y-1.5">
            {plans.map((p) => (
              <div key={p.id} className="rounded-lg px-3 py-2" style={{ background: '#F8FAFC', opacity: p.status === 'discontinued' ? 0.65 : 1 }}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{p.problem}</span>
                  <button onClick={() => canWrite && cycle(p)} disabled={!canWrite} className="text-xs px-1.5 py-0.5 rounded font-semibold ml-auto" style={{ background: CP_STYLE[p.status].bg, color: CP_STYLE[p.status].color, border: 'none', cursor: canWrite ? 'pointer' : 'default' }}>{CP_STYLE[p.status].label}</button>
                </div>
                {p.goal && <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Goal: {p.goal}</p>}
                {p.interventions && <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Interventions: {p.interventions}</p>}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* SBAR handover */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <Repeat className="w-4 h-4" style={{ color: '#7C3AED' }} /> Shift Handover (SBAR)
          </h3>
          {canWrite && <button onClick={() => setShowHo((s) => !s)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>+ Handover</button>}
        </div>
        {showHo && (
          <div className="rounded-xl p-3 mb-3 space-y-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <Select value={ho.shift ?? ''} onChange={(e) => setHo((h) => ({ ...h, shift: e.target.value }))}>
              <option value="">Shift…</option><option value="morning">Morning</option><option value="evening">Evening</option><option value="night">Night</option>
            </Select>
            {SBAR.map(([k, l, ph]) => (
              <div key={k}>
                <label className="text-xs block mb-1 font-semibold" style={{ color: '#64748B' }}>{l}</label>
                <SpeechTextarea value={ho[k] ?? ''} onChange={(v) => setHo((h) => ({ ...h, [k]: v }))} placeholder={ph} rows={2} disabled={!canWrite}
                  className="w-full px-3 py-2 rounded-xl text-sm" style={{ border: '1px solid #E2E8F0', color: '#0F172A', resize: 'vertical' }} />
              </div>
            ))}
            <div className="flex justify-end"><button onClick={saveHo} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>{busy ? '…' : 'Save Handover'}</button></div>
          </div>
        )}
        {handovers.length === 0 ? <p className="text-xs" style={{ color: '#94A3B8' }}>No handovers recorded.</p> : (
          <div className="space-y-2">
            {handovers.map((h) => (
              <div key={h.id} className="rounded-lg px-3 py-2" style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                <div className="flex items-center gap-2 mb-1 text-xs">
                  {h.shift && <span className="px-1.5 py-0.5 rounded font-semibold capitalize" style={{ background: '#EEF2FF', color: '#4338CA' }}>{h.shift}</span>}
                  <span style={{ color: '#94A3B8' }}>{h.author?.full_name}</span>
                  <span className="ml-auto" style={{ color: '#94A3B8' }}><DateText date={h.created_at} /></span>
                </div>
                {([['S', h.situation], ['B', h.background], ['A', h.assessment], ['R', h.recommendation]] as const).filter(([, v]) => v).map(([l, v]) => (
                  <p key={l} className="text-xs" style={{ color: '#475569' }}><span className="font-bold" style={{ color: '#7C3AED' }}>{l}:</span> {v}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  )
}
