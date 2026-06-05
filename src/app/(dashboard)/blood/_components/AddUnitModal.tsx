'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { addBloodUnit, addDonor } from '@/app/actions/blood'
import type { BloodDonor } from '@/lib/types'

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'] as const
const COMPONENTS   = [
  { value: 'whole',     label: 'Whole Blood' },
  { value: 'prbc',      label: 'Packed RBC (PRBC)' },
  { value: 'plasma',    label: 'Plasma' },
  { value: 'platelets', label: 'Platelets' },
] as const

interface Props {
  open: boolean
  donors: BloodDonor[]
  onClose: () => void
  onSuccess: () => void
}

export default function AddUnitModal({ open, donors, onClose, onSuccess }: Props) {
  const [bloodGroup, setBloodGroup] = useState('')
  const [component, setComponent]   = useState('')
  const [donorId, setDonorId]       = useState('')
  const [newDonorName, setNewDonorName] = useState('')
  const [collectedAt, setCollectedAt]   = useState('')
  const [expiry, setExpiry]             = useState('')
  const [mode, setMode] = useState<'existing' | 'new' | 'none'>('none')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!bloodGroup) { setError('Select a blood group'); return }
    if (!component)  { setError('Select a component'); return }
    if (!expiry)     { setError('Expiry date is required'); return }

    setLoading(true); setError(null)

    let resolvedDonorId: string | null = null

    if (mode === 'new' && newDonorName.trim()) {
      const dr = await addDonor({
        name: newDonorName.trim(), blood_group: bloodGroup,
        phone: null, last_donation_date: collectedAt || null,
      })
      if (!dr.success) { setError(dr.error); setLoading(false); return }
      resolvedDonorId = dr.donor.id
    } else if (mode === 'existing' && donorId) {
      resolvedDonorId = donorId
    }

    const result = await addBloodUnit({
      blood_group:  bloodGroup,
      component,
      donor_id:     resolvedDonorId,
      collected_at: collectedAt || null,
      expiry,
    })

    setLoading(false)
    if (!result.success) { setError(result.error); return }
    setBloodGroup(''); setComponent(''); setDonorId(''); setExpiry(''); setCollectedAt(''); setNewDonorName('')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Blood Unit" maxWidth="34rem">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Blood Group *">
            <Select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} required>
              <option value="">— Select —</option>
              {BLOOD_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </FormField>
          <FormField label="Component *">
            <Select value={component} onChange={(e) => setComponent(e.target.value)} required>
              <option value="">— Select —</option>
              {COMPONENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Collected Date">
            <Input type="date" value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} />
          </FormField>
          <FormField label="Expiry Date *">
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
          </FormField>
        </div>

        {/* Donor section */}
        <div>
          <p className="text-sm font-medium mb-2" style={{ color: '#0F172A' }}>Donor (optional)</p>
          <div className="flex gap-2 mb-3">
            {(['none','existing','new'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={mode === m ? { background: '#0D9488', color: '#fff' } : { background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' }}>
                {m === 'none' ? 'Unknown' : m === 'existing' ? 'Existing' : 'New Donor'}
              </button>
            ))}
          </div>
          {mode === 'existing' && (
            <Select value={donorId} onChange={(e) => setDonorId(e.target.value)}>
              <option value="">— Select donor —</option>
              {donors.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.blood_group})</option>
              ))}
            </Select>
          )}
          {mode === 'new' && (
            <Input value={newDonorName} onChange={(e) => setNewDonorName(e.target.value)} placeholder="Donor full name" />
          )}
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
            {loading ? 'Adding…' : 'Add Unit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
