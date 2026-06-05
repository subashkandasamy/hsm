'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createLabTest } from '@/app/actions/lab'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const SAMPLE_TYPES = ['blood', 'urine', 'swab', 'stool', 'csf', 'tissue', 'sputum', 'other']

export default function AddLabTestModal({ open, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    name: '', code: '', sample_type: '', unit: '',
    ref_low: '', ref_high: '', reference_range: '', price: '',
  })
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

    const result = await createLabTest({
      name: form.name.trim(),
      code: form.code.trim() || null,
      sample_type: form.sample_type || null,
      unit: form.unit.trim() || null,
      ref_low: form.ref_low !== '' ? parseFloat(form.ref_low) : null,
      ref_high: form.ref_high !== '' ? parseFloat(form.ref_high) : null,
      reference_range: form.reference_range.trim() || null,
      price: parseFloat(form.price),
      is_active: true,
    })

    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setForm({ name: '', code: '', sample_type: '', unit: '', ref_low: '', ref_high: '', reference_range: '', price: '' })
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Lab Test to Catalog" maxWidth="36rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Test Name *">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Complete Blood Count" />
          </FormField>
          <FormField label="Code" hint="Short identifier">
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. CBC" />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Sample Type">
            <Select value={form.sample_type} onChange={(e) => set('sample_type', e.target.value)}>
              <option value="">— Select —</option>
              {SAMPLE_TYPES.map((s) => (
                <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Unit" hint="Result unit, e.g. mg/dL">
            <Input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="mg/dL" />
          </FormField>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Ref Low" hint="Numeric">
            <Input type="number" step="any" value={form.ref_low} onChange={(e) => set('ref_low', e.target.value)} placeholder="70" />
          </FormField>
          <FormField label="Ref High" hint="Numeric">
            <Input type="number" step="any" value={form.ref_high} onChange={(e) => set('ref_high', e.target.value)} placeholder="110" />
          </FormField>
          <FormField label="Price (₹) *">
            <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="150" />
          </FormField>
        </div>

        <FormField label="Reference Range (display)" hint="e.g. 70–110 mg/dL — shown on report">
          <Input value={form.reference_range} onChange={(e) => set('reference_range', e.target.value)} placeholder="70–110 mg/dL" />
        </FormField>

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
            {loading ? 'Saving…' : 'Add Test'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
