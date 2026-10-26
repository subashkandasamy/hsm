'use client'

import { useState } from 'react'
import { Activity, Check, ChevronDown, ChevronRight } from 'lucide-react'
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
}

export default function ExaminationPanel({ visitId, initialExam, weight, height, canWrite }: Props) {
  const init = (initialExam ?? {}) as Record<string, unknown>
  const [signs, setSigns] = useState<Record<string, boolean>>((init.signs as Record<string, boolean>) ?? {})
  const [general, setGeneral] = useState<string>((init.general as string) ?? '')
  const [sys, setSys] = useState<Record<string, string>>((init.systems as Record<string, string>) ?? {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const bmi = bmiInfo(weight, height)
  // Collapsed by default on every template — the header summarises what is recorded.
  const [expanded, setExpanded] = useState(false)
  const present = SIGNS.filter((s) => signs[s]).map((s) => SIGN_LABELS[s])
  const written = SYSTEMS.filter((f) => sys[f.key]?.trim()).map((f) => f.label)
  const summary = [
    present.length ? `${present.join(', ')} present` : null,
    general.trim() ? 'General' : null,
    written.length ? `${written.join(', ')} written` : null,
  ].filter(Boolean).join(' · ') || 'Not examined yet'

  async function save() {
    setSaving(true); setSaved(false)
    const res = await saveExamination(visitId, { signs, general, systems: sys, bmi: bmi?.bmi ?? null })
    setSaving(false)
    if (res.success) { setSaved(true); setTimeout(() => setSaved(false), 1800) }
  }

  return (
    <GlassCard className="p-5">
      <button type="button" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}
        className={`w-full flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 text-left ${expanded ? 'mb-3' : ''}`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <Activity className="w-4 h-4 shrink-0" style={{ color: '#0D9488' }} />
        <span className="text-sm font-semibold shrink-0" style={{ color: '#0F172A' }}>Examination</span>
        {!expanded && <span className="text-xs order-last basis-full pl-6 sm:order-none sm:basis-auto sm:pl-0 sm:truncate" style={{ color: present.length ? '#DC2626' : '#94A3B8' }}><span className="hidden sm:inline">· </span>{summary}</span>}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {bmi && (
            <span className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ background: `${bmi.color}14`, color: bmi.color }}>
              BMI {bmi.bmi} · {bmi.label}
            </span>
          )}
          <span style={{ color: '#94A3B8' }}>{expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
        </span>
      </button>
      {expanded && (<>

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
        <SpeechTextarea fieldKey="exam.general" value={general} disabled={!canWrite} onChange={setGeneral}
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
            <SpeechTextarea fieldKey={`exam.${f.key}`} value={sys[f.key] ?? ''} disabled={!canWrite}
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
      </>)}
    </GlassCard>
  )
}
