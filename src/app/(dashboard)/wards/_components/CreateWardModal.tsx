'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createWard } from '@/app/actions/wards'
import type { Ward } from '@/lib/types'

const WARD_TYPES = ['general', 'private', 'icu', 'hdu', 'maternity', 'pediatric', 'surgical', 'orthopedic']

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (ward: Ward) => void
  departments: { id: string; name: string }[]
}

export default function CreateWardModal({ open, onClose, onSuccess, departments }: Props) {
  const [name, setName] = useState('')
  const [wardType, setWardType] = useState('')
  const [deptId, setDeptId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await createWard({ name, ward_type: wardType || null, department_id: deptId || null })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess(result.ward)
    setName(''); setWardType(''); setDeptId('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Ward">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Ward Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Male General Ward" required />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Ward Type">
            <Select value={wardType} onChange={(e) => setWardType(e.target.value)}>
              <option value="">Select type…</option>
              {WARD_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </Select>
          </FormField>
          <FormField label="Department">
            <Select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">None</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </FormField>
        </div>
        {error && <div className="text-sm rounded-xl px-3 py-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Creating…' : 'Create Ward'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
