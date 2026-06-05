'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { receivePO } from '@/app/actions/inventory'
import type { PurchaseOrder } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  po: PurchaseOrder | null
}

export default function ReceivePOModal({ open, onClose, onSuccess, po }: Props) {
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!po) return null

  function setQty(poItemId: string, v: string) {
    setQtys((q) => ({ ...q, [poItemId]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const receipts = (po!.items ?? []).map((item) => ({
      po_item_id: item.id,
      received_qty: parseFloat(qtys[item.id] ?? '0') || 0,
    }))
    if (receipts.every((r) => r.received_qty === 0)) {
      setError('Enter received quantity for at least one item')
      return
    }
    setSaving(true); setError('')
    const res = await receivePO({ po_id: po!.id, receipts })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Receive — ${po.po_no}`}
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button form="receive-form" type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Confirm Receipt'}
          </button>
        </div>
      }
    >
      <form id="receive-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}
        <p className="text-sm" style={{ color: '#64748B' }}>
          Enter the quantity received for each line. Partial receipts are allowed.
        </p>
        <div className="space-y-3">
          {(po.items ?? []).map((item) => {
            const remaining = item.qty - item.received_qty
            return (
              <div key={item.id} className="p-3 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium" style={{ color: '#0F172A' }}>
                    {item.item?.name ?? item.item_id}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: remaining > 0 ? 'rgba(251,191,36,0.12)' : 'rgba(16,185,129,0.1)', color: remaining > 0 ? '#92400E' : '#065F46' }}>
                    {item.received_qty}/{item.qty} {item.item?.unit ?? ''}
                  </span>
                </div>
                <FormField label={`Receive now (max ${remaining} ${item.item?.unit ?? ''})`}>
                  <Input
                    type="number" min="0" max={remaining}
                    value={qtys[item.id] ?? ''}
                    onChange={(e) => setQty(item.id, e.target.value)}
                    placeholder="0"
                    disabled={remaining <= 0}
                  />
                </FormField>
              </div>
            )
          })}
        </div>
      </form>
    </Modal>
  )
}
