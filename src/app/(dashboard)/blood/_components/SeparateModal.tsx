'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { separateComponents } from '@/app/actions/blood'
import type { BloodUnit } from '@/lib/types'

const COMPONENTS: { value: 'prbc' | 'plasma' | 'platelets'; label: string }[] = [
  { value: 'prbc',      label: 'Packed Red Cells (PRBC)' },
  { value: 'plasma',    label: 'Fresh Frozen Plasma (FFP)' },
  { value: 'platelets', label: 'Platelets' },
]

interface Props {
  unit: BloodUnit
  onClose: () => void
  onSuccess: () => void
}

export default function SeparateModal({ unit, onClose, onSuccess }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(['prbc', 'plasma', 'platelets']))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(v: string) {
    setSelected((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n })
  }

  async function save() {
    if (selected.size === 0) { setError('Select at least one component'); return }
    setSaving(true); setError(null)
    const res = await separateComponents(unit.id, { components: [...selected] })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
  }

  return (
    <Modal open onClose={onClose} title={`Separate Components — ${unit.blood_group} Whole Blood`} maxWidth="30rem">
      <div className="space-y-3">
        <p className="text-xs" style={{ color: '#64748B' }}>
          The whole-blood unit is consumed and each selected component becomes a new {unit.blood_group} unit.
          Children inherit the parent’s screening (already passed).
        </p>
        {COMPONENTS.map((c) => (
          <button key={c.value} type="button" onClick={() => toggle(c.value)}
            className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left"
            style={{ background: selected.has(c.value) ? 'rgba(13,148,136,0.07)' : 'rgba(248,250,252,0.8)',
              border: `1px solid ${selected.has(c.value) ? 'rgba(13,148,136,0.3)' : '#E2E8F0'}`, cursor: 'pointer' }}>
            <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: selected.has(c.value) ? '#0D9488' : '#fff', border: `1px solid ${selected.has(c.value) ? '#0D9488' : '#CBD5E1'}`, color: '#fff', fontSize: '10px' }}>
              {selected.has(c.value) ? '✓' : ''}
            </span>
            <span className="text-sm font-medium" style={{ color: '#0F172A' }}>{c.label}</span>
          </button>
        ))}
        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Separating…' : 'Separate'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
