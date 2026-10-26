'use client'

import { useState, useTransition } from 'react'
import { Save, CheckCircle, Eye } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import SpeechTextarea from '@/components/ui/SpeechTextarea'
import { saveClinicalData } from '@/app/actions/opd'
import type { EyeExamData } from '@/lib/types'

interface Props {
  visitId: string
  initialData: EyeExamData | null
  disabled?: boolean
}

const EMPTY_EYE_DATA: EyeExamData = {
  visualAcuity: { od: '', os: '' },
  iop: { od: null, os: null },
  refraction: {
    od: { sphere: null, cylinder: null, axis: null },
    os: { sphere: null, cylinder: null, axis: null },
  },
  notes: '',
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0',
  color: '#0F172A', outline: 'none', borderRadius: '0.75rem',
  padding: '0.5rem 0.875rem', fontSize: '0.875rem', width: '100%', minHeight: '40px',
}
const focusStyle = { borderColor: '#0D9488', boxShadow: '0 0 0 3px rgba(13,148,136,0.1)' }

function numericToStr(v: number | null): string {
  return v === null ? '' : String(v)
}
function strToNum(v: string): number | null {
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

export default function EyeClinicalSection({ visitId, initialData, disabled }: Props) {
  // The visit's clinical_data may hold only the general examination — fill in missing eye fields.
  const [data, setData] = useState<EyeExamData>(() => ({
    visualAcuity: { ...EMPTY_EYE_DATA.visualAcuity, ...initialData?.visualAcuity },
    iop: { ...EMPTY_EYE_DATA.iop, ...initialData?.iop },
    refraction: {
      od: { ...EMPTY_EYE_DATA.refraction.od, ...initialData?.refraction?.od },
      os: { ...EMPTY_EYE_DATA.refraction.os, ...initialData?.refraction?.os },
    },
    notes: initialData?.notes ?? '',
  }))
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  function handleSave() {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const res = await saveClinicalData(visitId, data as unknown as Record<string, unknown>)
      if (!res.success) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  // OD = Right Eye, OS = Left Eye
  const eyes = ['od', 'os'] as const
  const EYE_LABELS = { od: 'Right Eye (OD)', os: 'Left Eye (OS)' }

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
          <Eye className="w-4 h-4" style={{ color: '#0D9488' }} />
          Eye Examination
        </h3>
        {!disabled && (
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: saved ? '#DCFCE7' : '#0D9488',
              color: saved ? '#15803D' : '#fff',
              border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {saved
              ? <><CheckCircle className="w-3.5 h-3.5" /> Saved!</>
              : <><Save className="w-3.5 h-3.5" /> Save Exam</>
            }
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-xl text-sm"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
          {error}
        </div>
      )}

      {/* Two-column eye layout — stacked vertically on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {eyes.map((eye) => (
          <div key={eye} className="space-y-3">
            {/* Eye header */}
            <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: '#E2E8F0' }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'rgba(13,148,136,0.1)', color: '#0D9488' }}>
                {eye.toUpperCase()}
              </div>
              <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                {EYE_LABELS[eye]}
              </span>
            </div>

            {/* Visual Acuity */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>
                Visual Acuity
              </label>
              <input
                type="text"
                value={data.visualAcuity[eye]}
                onChange={(e) => setData((d) => ({
                  ...d,
                  visualAcuity: { ...d.visualAcuity, [eye]: e.target.value },
                }))}
                placeholder="e.g. 6/6, 6/9"
                disabled={disabled}
                style={{ ...inputStyle, ...(disabled ? { opacity: 0.7 } : {}) }}
                onFocus={(e) => !disabled && Object.assign(e.currentTarget.style, focusStyle)}
                onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
              />
            </div>

            {/* IOP */}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#475569' }}>
                IOP (mmHg)
              </label>
              <input
                type="number" step="0.1"
                value={numericToStr(data.iop[eye])}
                onChange={(e) => setData((d) => ({
                  ...d,
                  iop: { ...d.iop, [eye]: strToNum(e.target.value) },
                }))}
                placeholder="e.g. 14"
                disabled={disabled}
                style={{ ...inputStyle, ...(disabled ? { opacity: 0.7 } : {}) }}
                onFocus={(e) => !disabled && Object.assign(e.currentTarget.style, focusStyle)}
                onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
              />
            </div>

            {/* Refraction */}
            <div>
              <label className="block text-xs font-medium mb-2" style={{ color: '#475569' }}>
                Refraction
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['sphere', 'cylinder', 'axis'] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-xs mb-1 capitalize" style={{ color: '#94A3B8' }}>{field}</label>
                    <input
                      type="number" step={field === 'axis' ? '1' : '0.25'}
                      value={numericToStr(data.refraction[eye][field])}
                      onChange={(e) => setData((d) => ({
                        ...d,
                        refraction: {
                          ...d.refraction,
                          [eye]: { ...d.refraction[eye], [field]: strToNum(e.target.value) },
                        },
                      }))}
                      placeholder={field === 'axis' ? '0' : '0.00'}
                      disabled={disabled}
                      style={{ ...inputStyle, ...(disabled ? { opacity: 0.7 } : {}) }}
                      onFocus={(e) => !disabled && Object.assign(e.currentTarget.style, focusStyle)}
                      onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="mt-5">
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#475569' }}>
          Clinical Notes
        </label>
        <SpeechTextarea
          fieldKey="eye.notes"
          value={data.notes}
          onChange={(v) => setData((d) => ({ ...d, notes: v }))}
          placeholder="Additional ophthalmic findings, management plan…"
          disabled={disabled}
          rows={3}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical', ...(disabled ? { opacity: 0.7 } : {}) }}
          onFocus={(e) => !disabled && Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={(e) => Object.assign(e.currentTarget.style, { borderColor: '#E2E8F0', boxShadow: 'none' })}
        />
      </div>
    </GlassCard>
  )
}
