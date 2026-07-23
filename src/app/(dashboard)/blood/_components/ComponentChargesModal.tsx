'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import { listComponentCharges, upsertComponentCharge } from '@/app/actions/blood'
import type { BloodComponent } from '@/lib/types'

const COMPONENTS: { value: BloodComponent; label: string }[] = [
  { value: 'whole',     label: 'Whole Blood' },
  { value: 'prbc',      label: 'Packed Red Cells (PRBC)' },
  { value: 'plasma',    label: 'Plasma (FFP)' },
  { value: 'platelets', label: 'Platelets' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function ComponentChargesModal({ open, onClose }: Props) {
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    listComponentCharges().then((charges) => {
      const map: Record<string, string> = {}
      for (const c of charges) map[c.component] = String(c.price)
      setPrices(map)
      setLoading(false)
    })
  }, [open])

  async function save(component: BloodComponent) {
    setSavingId(component); setSavedId(null)
    const res = await upsertComponentCharge({ component, price: parseFloat(prices[component] || '0') || 0 })
    setSavingId(null)
    if (res.success) { setSavedId(component); setTimeout(() => setSavedId(null), 1500) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Blood Processing Charges" maxWidth="34rem">
      <div className="space-y-3">
        <p className="text-xs" style={{ color: '#64748B' }}>
          Set the processing/service charge levied per unit for each component. This is applied
          automatically when a unit is issued (and added to the admission bill for inpatients).
        </p>
        {loading ? (
          <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
        ) : (
          <div className="space-y-2">
            {COMPONENTS.map((c) => (
              <div key={c.value} className="flex items-center gap-3 rounded-xl px-3.5 py-2.5"
                style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                <span className="text-sm font-medium flex-1" style={{ color: '#0F172A' }}>{c.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm" style={{ color: '#64748B' }}>₹</span>
                  <div style={{ width: '7rem' }}>
                    <Input type="number" min={0} step="0.01" value={prices[c.value] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [c.value]: e.target.value }))}
                      placeholder="0.00" />
                  </div>
                </div>
                <button onClick={() => save(c.value)} disabled={savingId === c.value}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: savedId === c.value ? '#DCFCE7' : '#0D9488', color: savedId === c.value ? '#15803D' : '#fff', border: 'none', cursor: 'pointer', minWidth: '4.5rem' }}>
                  {savingId === c.value ? 'Saving…' : savedId === c.value ? 'Saved ✓' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Done</button>
        </div>
      </div>
    </Modal>
  )
}
