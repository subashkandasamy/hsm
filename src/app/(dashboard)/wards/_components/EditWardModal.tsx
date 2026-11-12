'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { updateWardDetails, setRoomTypeMultiBed } from '@/app/actions/wards'
import MultiBedTick from './MultiBedTick'
import { nursingUnitLabel, type WardWithBeds, type WardRoomType, type NursingUnit } from '@/lib/types'

interface Props {
  open: boolean
  ward: WardWithBeds
  roomTypes: WardRoomType[]
  nursingUnits: NursingUnit[]
  /** Rooms of a type, for "applies to every room of this type". */
  roomsOfType?: (typeId: string) => number
  onRoomTypeChange?: (typeId: string, isMultiBed: boolean) => void
  onClose: () => void
  onSuccess: (updated: { name: string; room_type_id: string | null; nursing_unit_id: string | null; floor: string | null; block: string | null }) => void
}

export default function EditWardModal({ open, ward, roomTypes, nursingUnits, roomsOfType, onRoomTypeChange, onClose, onSuccess }: Props) {
  const [name, setName]           = useState(ward.name)
  const [roomTypeId, setRoomTypeId] = useState(ward.room_type_id ?? '')
  const [unitId, setUnitId]       = useState(ward.nursing_unit_id ?? '')
  const [floor, setFloor]         = useState(ward.floor ?? '')
  const [block, setBlock]         = useState(ward.block ?? '')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  // null = leave the room type as it is
  const [multiBed, setMultiBed]   = useState<boolean | null>(null)
  const type = roomTypes.find(r => r.id === roomTypeId) ?? null
  const shownMulti = multiBed ?? !!type?.is_multi_bed
  const others = type && roomsOfType ? roomsOfType(type.id) - (ward.room_type_id === type.id ? 1 : 0) : 0

  useEffect(() => {
    if (open) {
      setName(ward.name); setRoomTypeId(ward.room_type_id ?? '')
      setUnitId(ward.nursing_unit_id ?? ''); setError(null)
      setFloor(ward.floor ?? ''); setBlock(ward.block ?? ''); setMultiBed(null)
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
    // Multiple beds lives on the room type: change it there first, so a refusal
    // (a room still holding several beds) stops before anything else is saved.
    if (type && multiBed !== null && multiBed !== !!type.is_multi_bed) {
      const r = await setRoomTypeMultiBed(type.id, multiBed)
      if (!r.success) { setLoading(false); setError(r.error); return }
      onRoomTypeChange?.(type.id, multiBed)
    }
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

        {type && (
          <MultiBedTick checked={shownMulti} onChange={setMultiBed}
            note={others > 0 ? `Changes the room type "${type.name}" — ${others} other room${others === 1 ? '' : 's'} of this type too.` : `Changes the room type "${type.name}".`} />
        )}

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
