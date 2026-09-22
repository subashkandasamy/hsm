'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { updateWardDetails } from '@/app/actions/wards'
import { nursingUnitLabel, type WardWithBeds, type WardRoomType, type NursingUnit } from '@/lib/types'

interface Props {
  open: boolean
  ward: WardWithBeds
  roomTypes: WardRoomType[]
  nursingUnits: NursingUnit[]
  onClose: () => void
  onSuccess: (updated: { name: string; room_type_id: string | null; nursing_unit_id: string | null; floor: string | null; block: string | null }) => void
}

export default function EditWardModal({ open, ward, roomTypes, nursingUnits, onClose, onSuccess }: Props) {
  const [name, setName]           = useState(ward.name)
  const [roomTypeId, setRoomTypeId] = useState(ward.room_type_id ?? '')
  const [unitId, setUnitId]       = useState(ward.nursing_unit_id ?? '')
  const [floor, setFloor]         = useState(ward.floor ?? '')
  const [block, setBlock]         = useState(ward.block ?? '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(ward.name); setRoomTypeId(ward.room_type_id ?? '')
      setUnitId(ward.nursing_unit_id ?? ''); setError(null)
      setFloor(ward.floor ?? ''); setBlock(ward.block ?? '')
    }
  }, [open, ward])

  /** Choosing a wing offers its location; anything already set is left alone. */
  function pickUnit(id: string) {
    setUnitId(id)
    const unit = nursingUnits.find(u => u.id === id) ?? null
    if (!unit) return
    if (unit.floor) setFloor(unit.floor)
    if (unit.block) setBlock(`${unit.block}${unit.wing ? ' · ' + unit.wing : ''}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Ward name is required'); return }
    setLoading(true); setError(null)
    // The location is what the form holds. It used to be re-derived from the
    // nursing unit on every save, which quietly wiped the floor and block of any
    // room that had no wing.
    const nextFloor = floor.trim() || null
    const nextBlock = block.trim() || null
    const result = await updateWardDetails(ward.id, {
      name: name.trim(),
      room_type_id: roomTypeId || null,
      nursing_unit_id: unitId || null,
      floor: nextFloor, block: nextBlock,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess({ name: name.trim(), room_type_id: roomTypeId || null, nursing_unit_id: unitId || null, floor: nextFloor, block: nextBlock })
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

        <FormField label="Nursing Unit (wing)" hint="Which wing/nursing station covers this room — used for nurse rostering">
          <Select value={unitId} onChange={e => pickUnit(e.target.value)}>
            <option value="">— None —</option>
            {nursingUnits.filter(u => u.is_active || u.id === unitId).map(u => (
              <option key={u.id} value={u.id}>{nursingUnitLabel(u)}{u.station_name ? ` (${u.station_name})` : ''}</option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Floor">
            <Input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 1" />
          </FormField>
          <FormField label="Block / Wing">
            <Input value={block} onChange={e => setBlock(e.target.value)} placeholder="e.g. Block B" />
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
