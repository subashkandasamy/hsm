'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { createWard } from '@/app/actions/wards'
import { nursingUnitLabel, type Ward, type WardRoomType, type NursingUnit } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (ward: Ward) => void
  departments: { id: string; name: string }[]
  roomTypes: WardRoomType[]
  nursingUnits: NursingUnit[]
  preselectedRoomTypeId?: string | null
}

export default function CreateWardModal({ open, onClose, onSuccess, departments, roomTypes, nursingUnits, preselectedRoomTypeId }: Props) {
  const defaultTypeId = preselectedRoomTypeId ?? ''
  const [name, setName] = useState('')
  const [roomTypeId, setRoomTypeId] = useState(defaultTypeId)
  const [unitId, setUnitId] = useState('')
  const [deptId, setDeptId] = useState('')
  const [floor, setFloor] = useState('')
  const [block, setBlock] = useState('')
  const [isTemp, setIsTemp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedType = roomTypes.find(r => r.id === roomTypeId) ?? null

  /**
   * A wing knows where it is, so picking one fills the location in — but it is
   * only a starting point. A hospital with no wings set up must still be able to
   * say which floor a room is on, which it could not before.
   */
  function pickUnit(id: string) {
    setUnitId(id)
    const unit = nursingUnits.find(u => u.id === id) ?? null
    if (!unit) return
    if (unit.floor) setFloor(unit.floor)
    if (unit.block) setBlock(`${unit.block}${unit.wing ? ' · ' + unit.wing : ''}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const result = await createWard({
      name: name.trim(),
      room_type_id: roomTypeId || null,
      nursing_unit_id: unitId || null,
      floor: floor.trim() || null,
      block: block.trim() || null,
      department_id: deptId || null,
      is_temp: isTemp,
    })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    onSuccess(result.ward)
    setName(''); setRoomTypeId(defaultTypeId); setUnitId('')
    setDeptId(''); setIsTemp(false); setFloor(''); setBlock('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Room">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Room name */}
        <FormField label="Room / Ward Name" required hint={selectedType?.is_multi_bed ? (selectedType.is_icu ? 'e.g. ICU, MICU, HDU' : 'e.g. Male General Ward, Female Ward') : 'e.g. 101, Room A, Suite 1'}>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder={selectedType?.is_multi_bed ? 'e.g. Male General Ward' : 'e.g. 101'} required autoFocus />
        </FormField>

        {/* Room type */}
        <FormField label="Room Type">
          <Select value={roomTypeId} onChange={e => setRoomTypeId(e.target.value)}>
            <option value="">— Select type —</option>
            {roomTypes.filter(r => r.is_active).map(r => (
              <option key={r.id} value={r.id}>{r.name}{r.daily_rate > 0 ? ` — ₹${r.daily_rate.toLocaleString('en-IN')}/day` : ''}</option>
            ))}
          </Select>
          {selectedType && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: selectedType.is_multi_bed ? 'rgba(13,148,136,0.08)' : 'rgba(99,102,241,0.08)', color: selectedType.is_multi_bed ? '#0D9488' : '#4F46E5' }}>
                {selectedType.is_multi_bed ? 'Multiple beds in one room — add beds after creating' : 'Private single room — 1 bed auto-created'}
              </span>
            </div>
          )}
        </FormField>

        {/* Nursing unit (wing) — sets the room's location and who staffs it */}
        <FormField label="Nursing Unit (wing)" hint="Which wing/nursing station covers this room — used for nurse rostering">
          <Select value={unitId} onChange={e => pickUnit(e.target.value)}>
            <option value="">— None —</option>
            {nursingUnits.filter(u => u.is_active).map(u => (
              <option key={u.id} value={u.id}>{nursingUnitLabel(u)}{u.station_name ? ` (${u.station_name})` : ''}</option>
            ))}
          </Select>
          {nursingUnits.length === 0 && (
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>No nursing units yet — add them from the “Nursing Units” button.</p>
          )}
        </FormField>

        {/* Where the room is. Filled in by the wing when there is one, typed when there is not. */}
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Floor" hint={unitId ? 'from the wing — editable' : undefined}>
            <Input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 1" />
          </FormField>
          <FormField label="Block / Wing" hint={unitId ? 'from the wing — editable' : undefined}>
            <Input value={block} onChange={e => setBlock(e.target.value)} placeholder="e.g. Block B" />
          </FormField>
        </div>

        <FormField label="Department">
          <Select value={deptId} onChange={e => setDeptId(e.target.value)}>
            <option value="">None</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </FormField>

        <label className="flex items-center gap-3 cursor-pointer select-none"
          style={{ padding: '0.75rem 1rem', borderRadius: '0.75rem', border: isTemp ? '1px solid rgba(234,179,8,0.4)' : '1px solid #E2E8F0', background: isTemp ? 'rgba(254,243,199,0.6)' : 'rgba(248,250,252,0.8)' }}>
          <input type="checkbox" checked={isTemp} onChange={e => setIsTemp(e.target.checked)}
            style={{ width: '1rem', height: '1rem', accentColor: '#D97706', cursor: 'pointer' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#0F172A' }}>Overflow / temporary ward</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Unlimited beds — created on demand at admission</p>
          </div>
        </label>

        {error && <div className="text-sm rounded-xl px-3 py-2"
          style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button type="submit" disabled={loading} className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Adding…' : 'Add Room'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
