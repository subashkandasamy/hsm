'use client'

import { useState } from 'react'
import { Activity, Check, Plus } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import { saveExamination } from '@/app/actions/opd'

const SIGNS = ['pallor', 'icterus', 'cyanosis', 'clubbing', 'oedema', 'lymphadenopathy'] as const
const SIGN_LABELS: Record<string, string> = {
  pallor: 'Pallor', icterus: 'Icterus', cyanosis: 'Cyanosis', clubbing: 'Clubbing', oedema: 'Oedema', lymphadenopathy: 'Lymphadenopathy',
}
const SYSTEMS: { key: string; label: string; placeholder: string }[] = [
  { key: 'cvs', label: 'CVS', placeholder: 'S1 S2 heard, no murmur' },
  { key: 'rs',  label: 'Respiratory', placeholder: 'B/L air entry equal, no added sounds' },
  { key: 'pa',  label: 'Abdomen (P/A)', placeholder: 'Soft, non-tender, no organomegaly' },
  { key: 'cns', label: 'CNS', placeholder: 'Conscious, oriented, no focal deficit' },
  { key: 'other', label: 'Other / Local', placeholder: 'Local examination findings' },
]

function bmiInfo(weight: string, height: string): { bmi: string; label: string; color: string } | null {
  const w = parseFloat(weight), hCm = parseFloat(height)
  if (!w || !hCm) return null
  const h = hCm / 100
  const bmi = w / (h * h)
  if (!isFinite(bmi) || bmi <= 0) return null
  const val = bmi.toFixed(1)
  if (bmi < 18.5) return { bmi: val, label: 'Underweight', color: '#B45309' }
  if (bmi < 25)   return { bmi: val, label: 'Normal', color: '#15803D' }
  if (bmi < 30)   return { bmi: val, label: 'Overweight', color: '#B45309' }
  return { bmi: val, label: 'Obese', color: '#DC2626' }
}

interface Props {
  visitId: string
  initialExam?: Record<string, unknown> | null
  weight: string
  height: string
  canWrite: boolean
  /** Start collapsed (specialties that rarely need a systemic exam) unless something is recorded. */
  collapsible?: boolean
}

export default function ExaminationPanel({ visitId, initialExam, weight, height, canWrite, collapsible = false }: Props) {
  const init = (initialExam ?? {}) as Record<string, unknown>
  const [signs, setSigns] = useState<Record<string, boolean>>((init.signs as Record<string, boolean>) ?? {})
  const [general, setGeneral] = useState<string>((init.general as string) ?? '')
  const [sys, setSys] = useState<Record<string, string>>((init.systems as Record<string, string>) ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const bmi = bmiInfo(weight, height)
  const hasFindings = Object.values(signs).some(Boolean) || general.trim() !== '' || Object.values(sys).some((t) => t?.trim())
  const [expanded, setExpanded] = useState(!collapsible || hasFindings)

  async function save() {
    setSaving(true); setSaved(false)
    const res = await saveExamination(visitId, { signs, general, systems: sys, bmi: bmi?.bmi ?? null })
    setSaving(false)
    if (res.success) { setSaved(true); setTimeout(() => setSaved(false), 1800) }
  }

  if (!expanded) {
    if (!canWrite) return null
    return (
      <button type="button" onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium"
        style={{ background: 'rgba(255,255,255,0.6)', border: '1px dashed #CBD5E1', color: '#0D9488', cursor: 'pointer' }}>
        <Plus className="w-4 h-4" /> Add general examination
        <span className="text-xs font-normal" style={{ color: '#94A3B8' }}>· pallor, icterus, CVS, RS, abdomen, CNS</span>
      </button>
    )
  }

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
          <Activity className="w-4 h-4" style={{ color: '#0D9488' }} /> Examination
        </h3>
        {bmi && (
          <span className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ background: `${bmi.color}14`, color: bmi.color }}>
            BMI {bmi.bmi} · {bmi.label}
          </span>
        )}
      </div>

      {/* General signs */}
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>General</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {SIGNS.map((s) => {
          const on = !!signs[s]
          return (
            <button key={s} type="button" disabled={!canWrite}
              onClick={() => setSigns((v) => ({ ...v, [s]: !v[s] }))}
              className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: on ? '#FEE2E2' : '#F1F5F9', color: on ? '#DC2626' : '#64748B', border: `1px solid ${on ? '#FECACA' : '#E2E8F0'}`, cursor: canWrite ? 'pointer' : 'default' }}>
              {on ? '⚠ ' : ''}{SIGN_LABELS[s]}{on ? '' : ' —'}
            </button>
          )
        })}
      </div>
      <div className="mb-3">
        <SpeechTextarea value={general} disabled={!canWrite} onChange={setGeneral}
          placeholder="General condition, build/nutrition, vitals summary…" rows={2}
          className="w-full px-3 py-2 rounded-xl text-sm"
          style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: canWrite ? '#fff' : '#F8FAFC', resize: 'vertical' }} />
      </div>

      {/* Systemic */}
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#64748B' }}>Systemic Examination</p>
      <div className="grid md:grid-cols-2 gap-3">
        {SYSTEMS.map((f) => (
          <div key={f.key}>
            <label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{f.label}</label>
            <SpeechTextarea value={sys[f.key] ?? ''} disabled={!canWrite}
              onChange={(v) => setSys((prev) => ({ ...prev, [f.key]: v }))}
              placeholder={f.placeholder} rows={2}
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ border: '1px solid #E2E8F0', color: '#0F172A', background: canWrite ? '#fff' : '#F8FAFC', resize: 'vertical' }} />
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="flex justify-end mt-3">
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: saved ? '#DCFCE7' : '#0D9488', color: saved ? '#15803D' : '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Saving…' : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save Examination'}
          </button>
        </div>
      )}
    </GlassCard>
  )
}
