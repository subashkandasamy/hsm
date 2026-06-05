'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { createRoom, listRooms } from '@/app/actions/ot'
import type { OtRoom } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (rooms: OtRoom[]) => void
}

export default function RoomModal({ open, onClose, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rooms, setRooms] = useState<OtRoom[]>([])
  const [loaded, setLoaded] = useState(false)

  async function ensureLoaded() {
    if (!loaded) {
      const r = await listRooms()
      setRooms(r); setLoaded(true)
    }
  }

  if (open && !loaded) { ensureLoaded() }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true); setError(null)
    const result = await createRoom({ name: name.trim() })
    setLoading(false)
    if (!result.success) { setError(result.error); return }
    const updated = await listRooms()
    setRooms(updated)
    setName('')
    onSuccess(updated)
  }

  return (
    <Modal open={open} onClose={onClose} title="Manage OT Rooms" maxWidth="30rem">
      <div className="space-y-4">
        {rooms.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0' }}>
            {rooms.map((r, i) => (
              <div key={r.id} className="px-4 py-3 text-sm font-medium"
                style={{ borderBottom: i < rooms.length - 1 ? '1px solid #F1F5F9' : 'none', color: '#0F172A' }}>
                {r.name}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAdd}>
          <FormField label="Add New Room">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. OT 1 — General Surgery" />
              <button type="submit" disabled={loading || !name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0"
                style={{ background: loading ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}>
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </FormField>
          {error && (
            <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{error}</p>
          )}
        </form>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Done</button>
        </div>
      </div>
    </Modal>
  )
}
