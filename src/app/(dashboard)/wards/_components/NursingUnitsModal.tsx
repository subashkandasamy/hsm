'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2, Pencil, AlertCircle, Building2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { createNursingUnit, updateNursingUnit, deleteNursingUnit } from '@/app/actions/wards'
import { nursingUnitLabel, type NursingUnit } from '@/lib/types'

interface Props {
  open: boolean
  units: NursingUnit[]
  onClose: () => void
  onChange: () => Promise<void> | void
}

const BLANK = { id: '', block: '', floor: '', wing: '', station_name: '', target_ratio: 6, is_active: true }

export default function NursingUnitsModal({ open, units, onClose, onChange }: Props) {
  const [form, setForm] = useState<typeof BLANK>(BLANK)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError('')
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error || 'Failed'); return }
      await onChange()
      setForm(BLANK)
    })
  }

  function save() {
    const payload = {
      block: form.block, floor: form.floor, wing: form.wing,
      station_name: form.station_name || null,
      target_ratio: Number(form.target_ratio) || 6, is_active: form.is_active,
    }
    run(() => (form.id ? updateNursingUnit(form.id, payload) : createNursingUnit(payload)))
  }

  return (
    <Modal open={open} onClose={onClose} title="Nursing Units (wings)" maxWidth="40rem">
      <p className="text-xs mb-3" style={{ color: '#64748B' }}>
        A nursing unit is a wing — Block · Floor · Wing — with one central nursing station. Nurses are rostered to the
        unit, and each room is assigned to its unit. The target ratio (1 nurse : N patients) drives roster coverage.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs mb-3"
          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Existing units */}
      <div className="space-y-1.5 mb-4 max-h-64 overflow-y-auto">
        {units.map((u) => (
          <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ background: '#F8FAFC' }}>
            <Building2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#0D9488' }} />
            <span className="font-medium" style={{ color: '#0F172A' }}>{nursingUnitLabel(u)}</span>
            {u.station_name && <span className="text-xs" style={{ color: '#64748B' }}>· {u.station_name}</span>}
            <span className="text-xs" style={{ color: '#0D9488' }}>· 1:{u.target_ratio}</span>
            {!u.is_active && <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#F1F5F9', color: '#94A3B8' }}>Inactive</span>}
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setForm({ id: u.id, block: u.block, floor: u.floor, wing: u.wing, station_name: u.station_name ?? '', target_ratio: u.target_ratio, is_active: u.is_active })}
                className="p-1 rounded" style={{ color: '#64748B' }} title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => run(() => deleteNursingUnit(u.id))} disabled={isPending}
                className="p-1 rounded" style={{ color: '#EF4444' }} title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
        {units.length === 0 && <p className="text-xs" style={{ color: '#CBD5E1' }}>No nursing units yet — add your first wing below.</p>}
      </div>

      {/* Add / edit form */}
      <div className="pt-3 space-y-3" style={{ borderTop: '1px solid #F1F5F9' }}>
        <div className="grid grid-cols-3 gap-2">
          <FormField label="Block *"><Input value={form.block} onChange={(e) => setForm(f => ({ ...f, block: e.target.value }))} placeholder="e.g. Block A" /></FormField>
          <FormField label="Floor *"><Input value={form.floor} onChange={(e) => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="e.g. 1st Floor" /></FormField>
          <FormField label="Wing *"><Input value={form.wing} onChange={(e) => setForm(f => ({ ...f, wing: e.target.value }))} placeholder="e.g. B Wing" /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Nursing station" hint="optional label"><Input value={form.station_name} onChange={(e) => setForm(f => ({ ...f, station_name: e.target.value }))} placeholder="e.g. Station 3" /></FormField>
          <FormField label="Target ratio (1 : N)"><Input type="number" min={1} value={String(form.target_ratio)} onChange={(e) => setForm(f => ({ ...f, target_ratio: Number(e.target.value) || 1 }))} /></FormField>
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: '#475569' }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ accentColor: '#0D9488' }} /> Active
        </label>
        <div className="flex gap-2 justify-end">
          {form.id && <button onClick={() => setForm(BLANK)} className="px-3 py-2 text-sm" style={{ color: '#64748B' }}>Cancel edit</button>}
          <button onClick={save} disabled={isPending || !form.block.trim() || !form.floor.trim() || !form.wing.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
            <Plus className="w-4 h-4" /> {form.id ? 'Save unit' : 'Add unit'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
