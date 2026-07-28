'use client'

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Plus, Check, X } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
  getPatientHistory, upsertPatientHistory,
  listPatientProblems, addProblem, setProblemStatus, deleteProblem,
} from '@/app/actions/emrHistory'
import IcdPicker from '@/components/ui/IcdPicker'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import type { PatientProblem, ProblemStatus } from '@/lib/types'

const HISTORY_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'past_medical',   label: 'Past Medical',   placeholder: 'HTN, DM, asthma…' },
  { key: 'past_surgical',  label: 'Past Surgical',  placeholder: 'Appendectomy 2019…' },
  { key: 'drug_history',   label: 'Drug History',   placeholder: 'Current/regular medications' },
  { key: 'family_history', label: 'Family History', placeholder: 'Diabetes, cardiac…' },
  { key: 'social_history', label: 'Social History', placeholder: 'Smoking, alcohol, occupation' },
]
const STATUS_STYLE: Record<ProblemStatus, { bg: string; color: string; label: string }> = {
  active:   { bg: '#FEE2E2', color: '#DC2626', label: 'Active' },
  chronic:  { bg: '#FEF3C7', color: '#B45309', label: 'Chronic' },
  resolved: { bg: '#DCFCE7', color: '#15803D', label: 'Resolved' },
}

interface Props {
  patientId: string
  canWrite: boolean
}

export default function HistoryProblemsPanel({ patientId, canWrite }: Props) {
  const [hist, setHist] = useState<Record<string, string>>({})
  const [savedHist, setSavedHist] = useState(false)
  const [savingHist, setSavingHist] = useState(false)
  const [problems, setProblems] = useState<PatientProblem[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [pName, setPName] = useState(''); const [pStatus, setPStatus] = useState<ProblemStatus>('active')
  const [pOnset, setPOnset] = useState(''); const [pIcd, setPIcd] = useState(''); const [pIcdTitle, setPIcdTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const loadProblems = useCallback(() => { listPatientProblems(patientId).then(setProblems) }, [patientId])
  useEffect(() => {
    getPatientHistory(patientId).then((h) => {
      if (h) setHist({ past_medical: h.past_medical ?? '', past_surgical: h.past_surgical ?? '', drug_history: h.drug_history ?? '', family_history: h.family_history ?? '', social_history: h.social_history ?? '' })
    })
    loadProblems()
  }, [patientId, loadProblems])

  async function saveHistory() {
    setSavingHist(true); setSavedHist(false)
    const res = await upsertPatientHistory(patientId, hist)
    setSavingHist(false)
    if (res.success) { setSavedHist(true); setTimeout(() => setSavedHist(false), 1800) }
  }

  async function submitProblem() {
    if (!pName.trim()) return
    setBusy(true)
    const res = await addProblem(patientId, { problem: pName.trim(), status: pStatus, onset_date: pOnset || null, icd_code: pIcd || null })
    setBusy(false)
    if (res.success) { setPName(''); setPOnset(''); setPIcd(''); setPIcdTitle(''); setPStatus('active'); setShowAdd(false); loadProblems() }
  }

  async function cycle(p: PatientProblem) {
    const next: ProblemStatus = p.status === 'active' ? 'chronic' : p.status === 'chronic' ? 'resolved' : 'active'
    await setProblemStatus(p.id, next); loadProblems()
  }
  async function remove(id: string) { await deleteProblem(id); loadProblems() }

  return (
    <GlassCard className="p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-4" style={{ color: '#0F172A' }}>
        <ClipboardList className="w-4 h-4" style={{ color: '#0D9488' }} /> History & Problem List
      </h3>

      {/* Problem list */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Problem List</p>
          {canWrite && (
            <button onClick={() => setShowAdd((s) => !s)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>

        {showAdd && (
          <div className="rounded-xl p-3 mb-2 space-y-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Problem / diagnosis" />
            <div className="grid grid-cols-2 gap-2">
              <Select value={pStatus} onChange={(e) => setPStatus(e.target.value as ProblemStatus)}>
                <option value="active">Active</option><option value="chronic">Chronic</option><option value="resolved">Resolved</option>
              </Select>
              <Input type="date" value={pOnset} onChange={(e) => setPOnset(e.target.value)} />
            </div>
            {/* ICD-10 picker (auto-fills problem name if empty) */}
            <IcdPicker onPick={(code, title) => { setPIcd(code); setPIcdTitle(title); if (!pName.trim()) setPName(title) }} />
            {pIcd && <p className="text-xs" style={{ color: '#64748B' }}>ICD: {pIcd}{pIcdTitle ? ` — ${pIcdTitle}` : ''}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#fff', color: '#475569', border: '1px solid #E2E8F0', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitProblem} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Add Problem</button>
            </div>
          </div>
        )}

        {problems.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No problems recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {problems.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#F8FAFC', opacity: p.status === 'resolved' ? 0.7 : 1 }}>
                <span className="text-sm font-medium" style={{ color: '#0F172A', textDecoration: p.status === 'resolved' ? 'line-through' : 'none' }}>{p.problem}</span>
                {p.icd_code && <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{p.icd_code}</span>}
                <button onClick={() => canWrite && cycle(p)} disabled={!canWrite}
                  className="text-xs px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: STATUS_STYLE[p.status].bg, color: STATUS_STYLE[p.status].color, border: 'none', cursor: canWrite ? 'pointer' : 'default' }}>
                  {STATUS_STYLE[p.status].label}
                </button>
                {p.onset_date && <span className="text-xs" style={{ color: '#94A3B8' }}>{p.onset_date}</span>}
                {canWrite && (
                  <button onClick={() => remove(p.id)} className="ml-auto" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1' }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History (patient-level, persists across visits) */}
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>Clinical History</p>
      <div className="grid md:grid-cols-2 gap-3">
        {HISTORY_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{f.label}</label>
            <SpeechTextarea value={hist[f.key] ?? ''} disabled={!canWrite}
              onChange={(v) => setHist((h) => ({ ...h, [f.key]: v }))}
              placeholder={f.placeholder} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: canWrite ? '#fff' : '#F8FAFC', resize: 'vertical' }} />
          </div>
        ))}
      </div>
      {canWrite && (
        <div className="flex justify-end mt-3">
          <button onClick={saveHistory} disabled={savingHist}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: savedHist ? '#DCFCE7' : '#0D9488', color: savedHist ? '#15803D' : '#fff', border: 'none', cursor: 'pointer' }}>
            {savingHist ? 'Saving…' : savedHist ? <><Check className="w-4 h-4" /> Saved</> : 'Save History'}
          </button>
        </div>
      )}
    </GlassCard>
  )
}
