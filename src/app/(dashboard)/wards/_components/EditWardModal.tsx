'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { updateWardDetails } from '@/app/actions/wards'
import type { WardWithBeds, WardRoomType } from '@/lib/types'

interface Props {
  open: boolean
  ward: WardWithBeds
  roomTypes: WardRoomType[]
  onClose: () => void
  onSuccess: (updated: { name: string; room_type_id: string | null; floor: string | null; block: string | null }) => void
}

export default function EditWardModal({ open, ward, roomTypes, onClose, onSuccess }: Props) {
  const [name, setName]           = useState(ward.name)
  const [roomTypeId, setRoomTypeId] = useState(ward.room_type_id ?? '')
  const [floor, setFloor]         = useState(ward.floor ?? '')
  const [block, setBlock]         = useState(ward.block ?? '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(ward.name); setRoomTypeId(ward.room_type_id ?? '')
      setFloor(ward.floor ?? ''); setBlock(ward.block ?? ''); setError(null)
    }
  }, [open, ward])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Ward name is required'); return }
    setLoading(true); setError(null)
    const result = await updateWardDetails(ward.id, {
      name: name.trim(),
      room_type_id: roomTypeId || null,
      floor: floor.trim() || null,
      block: block.trim() || null,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess({ name: name.trim(), room_type_id: roomTypeId || null, floor: floor.trim() || null, block: block.trim() || null })
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit — ${ward.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name" required>
          <Input value={name} onChange={e => setName(e.target.value)} required autoFocus />
        </FormField>

        <FormField label="Room Type">
          <Select value={roomTypeId} onChange={e => setRoomTypeId(e.target.value)}>
            <option value="">— None —</option>
            {roomTypes.filter(r => r.is_active).map(r => (
              <option key={r.id} value={r.id}>
                {r.name}{r.daily_rate > 0 ? ` — ₹${r.daily_rate.toLocaleString('en-IN')}/day` : ''}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Floor">
            <Input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 1st Floor" />
          </FormField>
          <FormField label="Block / Wing">
            <Input value={block} onChange={e => setBlock(e.target.value)} placeholder="e.g. Block A" />
          </FormField>
        </div>

        {error && <div className="text-sm rounded-xl px-3 py-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
