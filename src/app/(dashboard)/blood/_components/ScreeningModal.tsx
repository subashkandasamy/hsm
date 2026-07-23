'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { recordScreening } from '@/app/actions/blood'
import type { BloodUnit } from '@/lib/types'

const MARKERS: { key: 'hiv' | 'hbsag' | 'hcv' | 'syphilis' | 'malaria'; label: string }[] = [
  { key: 'hiv',      label: 'HIV I & II' },
  { key: 'hbsag',    label: 'HBsAg (Hepatitis B)' },
  { key: 'hcv',      label: 'Anti-HCV (Hepatitis C)' },
  { key: 'syphilis', label: 'Syphilis (VDRL)' },
  { key: 'malaria',  label: 'Malaria' },
]

type Result = 'reactive' | 'non_reactive'

interface Props {
  unit: BloodUnit
  onClose: () => void
  onSuccess: () => void
}

export default function ScreeningModal({ unit, onClose, onSuccess }: Props) {
  const [results, setResults] = useState<Record<string, Result>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allSet = MARKERS.every((m) => results[m.key])
  const anyReactive = MARKERS.some((m) => results[m.key] === 'reactive')

  async function save() {
    if (!allSet) { setError('Record every marker before saving'); return }
    setSaving(true); setError(null)
    const res = await recordScreening(unit.id, results)
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
  }

  return (
    <Modal open onClose={onClose} title={`TTI Screening — ${unit.blood_group} ${unit.component}`} maxWidth="32rem">
      <div className="space-y-3">
        <p className="text-xs" style={{ color: '#64748B' }}>
          {unit.bag_number ? `Bag ${unit.bag_number}. ` : ''}Mark each mandatory marker. The unit is
          released to stock only when all markers are non-reactive; any reactive result discards it.
        </p>

        {MARKERS.map((m) => (
          <div key={m.key} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
            style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <span className="text-sm font-medium flex-1" style={{ color: '#0F172A' }}>{m.label}</span>
            {(['non_reactive', 'reactive'] as Result[]).map((r) => {
              const active = results[m.key] === r
              const isReactive = r === 'reactive'
              return (
                <button key={r} type="button"
                  onClick={() => setResults((p) => ({ ...p, [m.key]: r }))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: active ? (isReactive ? '#FEE2E2' : '#DCFCE7') : '#fff',
                    color: active ? (isReactive ? '#DC2626' : '#15803D') : '#94A3B8',
                    border: `1px solid ${active ? (isReactive ? '#FECACA' : '#BBF7D0') : '#E2E8F0'}`,
                    cursor: 'pointer',
                  }}>
                  {isReactive ? 'Reactive' : 'Non-reactive'}
                </button>
              )
            })}
          </div>
        ))}

        {allSet && (
          <div className="text-sm rounded-xl px-3 py-2 font-medium"
            style={anyReactive
              ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }
              : { background: '#DCFCE7', color: '#15803D', border: '1px solid #BBF7D0' }}>
            {anyReactive ? '⚠ Reactive marker — this unit will be discarded.' : '✓ All non-reactive — unit will be released for issue.'}
          </div>
        )}

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={save} disabled={saving || !allSet}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (saving || !allSet) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (saving || !allSet) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Screening'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
