'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { createSupplier, updateSupplier } from '@/app/actions/inventory'
import type { Supplier } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  supplier?: Supplier | null
}

export default function SupplierFormModal({ open, onClose, onSuccess, supplier }: Props) {
  const isEdit = !!supplier

  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    contact_person: supplier?.contact_person ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Supplier name is required'); return }
    setSaving(true); setError('')
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    }
    const res = isEdit
      ? await updateSupplier(supplier!.id, payload)
      : await createSupplier(payload)
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Supplier' : 'Add Supplier'}
      footer={
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button form="supplier-form" type="submit" disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Supplier'}
          </button>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.15)' }}>
            {error}
          </div>
        )}
        <FormField label="Supplier Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. MedSupply India Pvt. Ltd." required />
        </FormField>
        <FormField label="Contact Person">
          <Input value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} placeholder="Name of sales rep / account manager" />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Phone">
            <Input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="supplier@example.com" />
          </FormField>
        </div>
      </form>
    </Modal>
  )
}
