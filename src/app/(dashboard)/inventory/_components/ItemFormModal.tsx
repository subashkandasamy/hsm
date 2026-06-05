'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { createItem, updateItem } from '@/app/actions/inventory'
import type { InventoryItem } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  item?: InventoryItem | null
}

export default function ItemFormModal({ open, onClose, onSuccess, item }: Props) {
  const isEdit = !!item

  const [form, setForm] = useState({
    name: item?.name ?? '',
    category: item?.category ?? '',
    unit: item?.unit ?? '',
    reorder_level: String(item?.reorder_level ?? '10'),
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Item name is required'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      unit: form.unit.trim() || null,
      reorder_level: parseInt(form.reorder_level) || 10,
    }
    const res = isEdit
      ? await updateItem(item!.id, payload)
      : await createItem(payload)
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Item' : 'Add Inventory Item'}
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button form="item-form" type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      }
    >
      <form id="item-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}
        <FormField label="Item Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Paracetamol 500mg" required />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Category">
            <Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Medicine, PPE" />
          </FormField>
          <FormField label="Unit">
            <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. Tablet, Box, Litre" />
          </FormField>
        </div>
        <FormField label="Reorder Level" hint="Alert when stock falls to or below this quantity">
          <Input type="number" min="0" value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} />
        </FormField>
      </form>
    </Modal>
  )
}
