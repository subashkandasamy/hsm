'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { issueStock, adjustStock } from '@/app/actions/inventory'
import type { InventoryItem } from '@/lib/types'

type ActionType = 'issue' | 'adjust'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  item: InventoryItem | null
  action: ActionType
}

export default function StockActionModal({ open, onClose, onSuccess, item, action }: Props) {
  const [qty, setQty] = useState('')
  const [change, setChange] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!item) return null

  const isIssue = action === 'issue'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')

    let res
    if (isIssue) {
      const q = parseInt(qty)
      if (!q || q <= 0) { setError('Enter a valid quantity'); setSaving(false); return }
      res = await issueStock({ item_id: item!.id, qty: q, note: note.trim() || undefined })
    } else {
      const c = parseInt(change)
      if (isNaN(c) || c === 0) { setError('Enter a non-zero adjustment'); setSaving(false); return }
      res = await adjustStock({ item_id: item!.id, change: c, note: note.trim() })
    }

    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isIssue ? `Issue Stock — ${item.name}` : `Adjust Stock — ${item.name}`}
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button form="stock-action-form" type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : isIssue ? 'Issue' : 'Adjust'}
          </button>
        </div>
      }
    >
      <form id="stock-action-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}

        <div className="p-3 rounded-xl flex items-center justify-between" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <span className="text-sm" style={{ color: '#64748B' }}>Current stock</span>
          <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            {item.qty_in_stock} {item.unit ?? ''}
          </span>
        </div>

        {isIssue ? (
          <FormField label="Quantity to Issue" required>
            <Input type="number" min="1" max={item.qty_in_stock} value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`Max ${item.qty_in_stock}`} />
          </FormField>
        ) : (
          <FormField label="Adjustment" hint="Use negative numbers to reduce stock (e.g. -5 for wastage)">
            <Input type="number" value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="e.g. +50 or -10" />
          </FormField>
        )}

        <FormField label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={isIssue ? 'Ward / department (optional)' : 'Reason for adjustment'} />
        </FormField>
      </form>
    </Modal>
  )
}
