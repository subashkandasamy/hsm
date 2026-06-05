'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createRadiologyTest } from '@/app/actions/radiology'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const MODALITIES = [
  { value: 'xray', label: 'X-Ray' },
  { value: 'ct', label: 'CT Scan' },
  { value: 'mri', label: 'MRI' },
  { value: 'usg', label: 'Ultrasound (USG)' },
]

export default function AddRadiologyTestModal({ open, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({ name: '', modality: '', price: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.price || isNaN(parseFloat(form.price))) { setError('Price is required'); return }
    setLoading(true); setError(null)

    const result = await createRadiologyTest({
      name: form.name.trim(),
      modality: form.modality || null,
      price: parseFloat(form.price),
      is_active: true,
    })

    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setForm({ name: '', modality: '', price: '' })
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Imaging Procedure to Catalog" maxWidth="32rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Procedure Name *">
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Chest X-Ray PA View" />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Modality">
            <Select value={form.modality} onChange={(e) => set('modality', e.target.value)}>
              <option value="">— Select —</option>
              {MODALITIES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Price (₹) *">
            <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="500" />
          </FormField>
        </div>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Saving…' : 'Add Procedure'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
