'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import StatusBadge from '@/components/ui/StatusBadge'
import { enterResults } from '@/app/actions/lab'
import type { LabOrder, LabFlag } from '@/lib/types'

const FLAG_COLORS: Record<LabFlag, { bg: string; color: string }> = {
  pending: { bg: '#F1F5F9', color: '#64748B' },
  normal:  { bg: '#DCFCE7', color: '#15803D' },
  high:    { bg: '#FEE2E2', color: '#DC2626' },
  low:     { bg: '#DBEAFE', color: '#1D4ED8' },
}

function autoFlag(value: number | null, refLow?: number | null, refHigh?: number | null): LabFlag {
  if (value == null) return 'pending'
  if (refHigh != null && value > refHigh) return 'high'
  if (refLow  != null && value < refLow)  return 'low'
  if (refLow != null || refHigh != null)  return 'normal'
  return 'pending'
}

interface ResultState {
  result_value: string
  result_text: string
  unit: string
  previewFlag: LabFlag
}

interface Props {
  open: boolean
  order: LabOrder
  onClose: () => void
  onSuccess: () => void
}

export default function ResultEntryModal({ open, order, onClose, onSuccess }: Props) {
  const initial: Record<string, ResultState> = {}
  for (const item of order.items ?? []) {
    initial[item.id] = {
      result_value: item.result_value != null ? String(item.result_value) : '',
      result_text:  item.result_text ?? '',
      unit:         item.unit ?? item.test?.unit ?? '',
      previewFlag:  item.flag,
    }
  }
  const [results, setResults] = useState<Record<string, ResultState>>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(itemId: string, field: keyof ResultState, value: string) {
    setResults((prev) => {
      const cur = { ...prev[itemId], [field]: value }
      // Auto-preview flag when result_value changes
      if (field === 'result_value') {
        const item = (order.items ?? []).find((i) => i.id === itemId)
        const numVal = value !== '' ? parseFloat(value) : null
        cur.previewFlag = autoFlag(numVal, item?.test?.ref_low, item?.test?.ref_high)
      }
      return { ...prev, [itemId]: cur }
    })
  }

  async function handleSave() {
    setSaving(true); setError(null)
    const items = Object.entries(results).map(([item_id, r]) => ({
      item_id,
      result_value: r.result_value !== '' ? parseFloat(r.result_value) : null,
      result_text: r.result_text || null,
      unit: r.unit || null,
    }))
    const result = await enterResults(order.id, items)
    setSaving(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Enter Results — ${order.patient?.full_name}`} maxWidth="48rem">
      <div className="space-y-4">
        {(order.items ?? []).map((item) => {
          const r = results[item.id] ?? { result_value: '', result_text: '', unit: '', previewFlag: 'pending' as LabFlag }
          const flag = r.previewFlag
          const fc = FLAG_COLORS[flag]
          return (
            <div key={item.id} className="rounded-xl p-4"
              style={{ background: flag !== 'pending' ? fc.bg + '80' : 'rgba(248,250,252,0.8)', border: `1px solid ${flag !== 'pending' ? fc.bg : '#E2E8F0'}` }}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>
                    {item.test?.name ?? 'Unknown test'}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs" style={{ color: '#64748B' }}>
                    {item.test?.sample_type && <span className="capitalize">{item.test.sample_type}</span>}
                    {item.test?.reference_range && (
                      <span>Ref: {item.test.reference_range}</span>
                    )}
                    {!item.test?.reference_range && item.test?.ref_low != null && item.test?.ref_high != null && (
                      <span>Ref: {item.test.ref_low} – {item.test.ref_high} {item.test.unit}</span>
                    )}
                  </div>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-xl font-semibold"
                  style={{ background: fc.bg, color: fc.color, border: `1px solid ${fc.bg}` }}>
                  {flag.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Numeric Value">
                  <Input type="number" step="any"
                    value={r.result_value}
                    onChange={(e) => update(item.id, 'result_value', e.target.value)}
                    placeholder="e.g. 95.5" />
                </FormField>
                <FormField label="Unit">
                  <Input value={r.unit}
                    onChange={(e) => update(item.id, 'unit', e.target.value)}
                    placeholder={item.test?.unit ?? ''} />
                </FormField>
                <FormField label="Text Result">
                  <Input value={r.result_text}
                    onChange={(e) => update(item.id, 'result_text', e.target.value)}
                    placeholder="e.g. Negative, Reactive" />
                </FormField>
              </div>
            </div>
          )
        })}

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Results'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
