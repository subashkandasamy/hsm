'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Money from '@/components/ui/Money'
import { createPO } from '@/app/actions/inventory'
import type { Supplier, InventoryItem } from '@/lib/types'

interface Line { item_id: string; qty: string; unit_price: string }

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  suppliers: Supplier[]
  items: InventoryItem[]
}

export default function PoBuilderModal({ open, onClose, onSuccess, suppliers, items }: Props) {
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', qty: '1', unit_price: '' }])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function addLine() {
    setLines((l) => [...l, { item_id: '', qty: '1', unit_price: '' }])
  }

  function removeLine(i: number) {
    setLines((l) => l.filter((_, idx) => idx !== i))
  }

  function setLine(i: number, k: keyof Line, v: string) {
    setLines((l) => l.map((row, idx) => idx === i ? { ...row, [k]: v } : row))
  }

  const total = lines.reduce((s, l) => {
    const q = parseFloat(l.qty) || 0
    const p = parseFloat(l.unit_price) || 0
    return s + q * p
  }, 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter((l) => l.item_id && parseFloat(l.qty) > 0 && parseFloat(l.unit_price) >= 0)
    if (validLines.length === 0) { setError('Add at least one item line'); return }
    setSaving(true); setError('')
    const res = await createPO({
      supplier_id: supplierId || null,
      lines: validLines.map((l) => ({
        item_id: l.item_id,
        qty: parseFloat(l.qty),
        unit_price: parseFloat(l.unit_price),
      })),
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Purchase Order"
      maxWidth="40rem"
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            Total: <Money amount={total} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
              Cancel
            </button>
            <button form="po-form" type="submit" disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Creating…' : 'Create PO'}
            </button>
          </div>
        </div>
      }
    >
      <form id="po-form" onSubmit={submit} className="space-y-5">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}
        <FormField label="Supplier (optional)">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </FormField>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>Line Items</p>
            <button type="button" onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488', border: '1px solid rgba(13,148,136,0.15)', cursor: 'pointer' }}>
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_40px] gap-2 items-end">
                <FormField label={i === 0 ? 'Item' : ''}>
                  <Select value={line.item_id} onChange={(e) => setLine(i, 'item_id', e.target.value)}>
                    <option value="">Select item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={i === 0 ? 'Qty' : ''}>
                  <Input type="number" min="1" value={line.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} />
                </FormField>
                <FormField label={i === 0 ? 'Unit Price (₹)' : ''}>
                  <Input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => setLine(i, 'unit_price', e.target.value)} placeholder="0.00" />
                </FormField>
                <div className={i === 0 ? 'pt-[26px]' : ''}>
                  <button type="button" onClick={() => removeLine(i)} disabled={lines.length === 1}
                    className="w-10 h-11 flex items-center justify-center rounded-xl"
                    style={{ background: lines.length === 1 ? 'transparent' : 'rgba(220,38,38,0.06)', color: lines.length === 1 ? '#CBD5E1' : '#DC2626', border: 'none', cursor: lines.length === 1 ? 'not-allowed' : 'pointer' }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
