'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { addBatch, createDrug } from '@/app/actions/pharmacy'
import type { Drug } from '@/lib/types'

interface Props {
  open: boolean
  drugs: Drug[]
  onClose: () => void
  onSuccess: () => void
}

export default function AddBatchModal({ open, drugs, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [drugId, setDrugId] = useState('')
  const [newDrug, setNewDrug] = useState({ name: '', generic_name: '', form: '', strength: '', unit: '', reorder_level: '10' })
  const [batch, setBatch] = useState({ batch_no: '', expiry: '', qty_available: '', purchase_price: '', mrp: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setBatchField(field: string, value: string) {
    setBatch((b) => ({ ...b, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)

    let targetDrugId = drugId

    if (mode === 'new') {
      if (!newDrug.name.trim()) { setError('Drug name is required'); setLoading(false); return }
      const drugResult = await createDrug({
        name: newDrug.name, generic_name: newDrug.generic_name || null,
        form: newDrug.form || null, strength: newDrug.strength || null,
        unit: newDrug.unit || null, reorder_level: parseInt(newDrug.reorder_level, 10) || 0,
      })
      if (!drugResult.success) { setError(drugResult.error); setLoading(false); return }
      targetDrugId = drugResult.drug.id
    }

    if (!targetDrugId) { setError('Please select or create a drug'); setLoading(false); return }
    if (!batch.batch_no || !batch.expiry || !batch.qty_available || !batch.mrp) {
      setError('Batch No, Expiry, Qty, and MRP are required')
      setLoading(false); return
    }

    const result = await addBatch({
      drug_id: targetDrugId,
      batch_no: batch.batch_no,
      expiry: batch.expiry,
      qty_available: parseInt(batch.qty_available, 10),
      purchase_price: batch.purchase_price ? parseFloat(batch.purchase_price) : null,
      mrp: parseFloat(batch.mrp),
    })

    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Drug Batch (Goods Receipt)" maxWidth="34rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drug selection */}
        <div className="flex gap-2 mb-2">
          {(['existing', 'new'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={mode === m ? { background: '#0D9488', color: '#fff' } : { background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
              {m === 'existing' ? 'Existing Drug' : 'New Drug'}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <FormField label="Drug" required>
            <Select value={drugId} onChange={(e) => setDrugId(e.target.value)} required>
              <option value="">Select drug…</option>
              {drugs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.strength ? ` ${d.strength}` : ''}{d.form ? ` (${d.form})` : ''}
                </option>
              ))}
            </Select>
          </FormField>
        ) : (
          <div className="p-3 rounded-xl space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>New Drug</p>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Name *"><Input value={newDrug.name} onChange={(e) => setNewDrug((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Paracetamol" /></FormField>
              <FormField label="Generic Name"><Input value={newDrug.generic_name} onChange={(e) => setNewDrug((d) => ({ ...d, generic_name: e.target.value }))} placeholder="e.g. Acetaminophen" /></FormField>
              <FormField label="Form"><Select value={newDrug.form} onChange={(e) => setNewDrug((d) => ({ ...d, form: e.target.value }))}><option value="">—</option>
                {['tablet','capsule','syrup','injection','cream','drops','inhaler','patch'].map((f) => <option key={f} value={f} className="capitalize">{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}</Select></FormField>
              <FormField label="Strength"><Input value={newDrug.strength} onChange={(e) => setNewDrug((d) => ({ ...d, strength: e.target.value }))} placeholder="e.g. 500 mg" /></FormField>
              <FormField label="Unit"><Input value={newDrug.unit} onChange={(e) => setNewDrug((d) => ({ ...d, unit: e.target.value }))} placeholder="tablet / ml / strip" /></FormField>
              <FormField label="Reorder Level"><Input type="number" min={0} value={newDrug.reorder_level} onChange={(e) => setNewDrug((d) => ({ ...d, reorder_level: e.target.value }))} /></FormField>
            </div>
          </div>
        )}

        {/* Batch details */}
        <div className="p-3 rounded-xl space-y-3" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Batch Details</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Batch No *"><Input value={batch.batch_no} onChange={(e) => setBatchField('batch_no', e.target.value)} placeholder="e.g. B2024-001" required /></FormField>
            <FormField label="Expiry Date *"><Input type="date" value={batch.expiry} onChange={(e) => setBatchField('expiry', e.target.value)} required /></FormField>
            <FormField label="Qty Received *"><Input type="number" min={1} value={batch.qty_available} onChange={(e) => setBatchField('qty_available', e.target.value)} placeholder="100" required /></FormField>
            <FormField label="MRP (₹) *"><Input type="number" min={0} step="0.01" value={batch.mrp} onChange={(e) => setBatchField('mrp', e.target.value)} placeholder="10.50" required /></FormField>
            <FormField label="Purchase Price (₹)"><Input type="number" min={0} step="0.01" value={batch.purchase_price} onChange={(e) => setBatchField('purchase_price', e.target.value)} placeholder="8.00" /></FormField>
          </div>
        </div>

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Saving…' : 'Add Batch'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
