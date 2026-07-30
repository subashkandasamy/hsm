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

interface LineInput { qty: string; batch_no: string; expiry: string; unit_cost: string }
const emptyLine = (): LineInput => ({ qty: '', batch_no: '', expiry: '', unit_cost: '' })

export default function ReceivePOModal({ open, onClose, onSuccess, po }: Props) {
  const [lines, setLines] = useState<Record<string, LineInput>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!po) return null

  function setLine(poItemId: string, patch: Partial<LineInput>) {
    setLines((m) => ({ ...m, [poItemId]: { ...(m[poItemId] ?? emptyLine()), ...patch } }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const receipts = (po!.items ?? []).map((item) => {
      const l = lines[item.id] ?? emptyLine()
      return {
        po_item_id: item.id,
        received_qty: parseInt(l.qty) || 0,
        batch_no: l.batch_no.trim() || null,
        expiry: l.expiry || null,
        unit_cost: l.unit_cost.trim() ? parseFloat(l.unit_cost) : null,
      }
    })
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
          Enter the quantity received for each line, plus its batch/lot no and expiry where the
          item has one. Partial receipts are allowed.
        </p>
        <div className="space-y-3">
          {(po.items ?? []).map((item) => {
            const remaining = item.qty - item.received_qty
            const l = lines[item.id] ?? emptyLine()
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
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <FormField label={`Qty (max ${remaining})`}>
                    <Input type="number" min="0" max={remaining} value={l.qty}
                      onChange={(e) => setLine(item.id, { qty: e.target.value })}
                      placeholder="0" disabled={remaining <= 0} />
                  </FormField>
                  <FormField label="Batch / lot no">
                    <Input value={l.batch_no}
                      onChange={(e) => setLine(item.id, { batch_no: e.target.value })}
                      placeholder="optional" disabled={remaining <= 0} />
                  </FormField>
                  <FormField label="Expiry">
                    <Input type="date" value={l.expiry}
                      onChange={(e) => setLine(item.id, { expiry: e.target.value })}
                      disabled={remaining <= 0} />
                  </FormField>
                  <FormField label="Unit cost (₹)">
                    <Input type="number" min="0" step="0.01" value={l.unit_cost}
                      onChange={(e) => setLine(item.id, { unit_cost: e.target.value })}
                      placeholder={String(item.unit_price ?? '')} disabled={remaining <= 0} />
                  </FormField>
                </div>
              </div>
            )
          })}
        </div>
      </form>
    </Modal>
  )
}
