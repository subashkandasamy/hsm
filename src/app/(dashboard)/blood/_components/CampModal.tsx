'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import { createCamp } from '@/app/actions/blood'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function CampModal({ open, onClose, onSuccess }: Props) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [date, setDate] = useState('')
  const [organizer, setOrganizer] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) { setError('Camp name is required'); return }
    if (!date) { setError('Camp date is required'); return }
    setSaving(true); setError(null)
    const res = await createCamp({
      name: name.trim(), location: location.trim() || null, camp_date: date,
      organizer: organizer.trim() || null, notes: notes.trim() || null,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setName(''); setLocation(''); setDate(''); setOrganizer(''); setNotes('')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="New Donation Camp" maxWidth="32rem">
      <div className="space-y-3">
        <FormField label="Camp Name *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Republic Day Blood Drive" /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Date *"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
          <FormField label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue" /></FormField>
        </div>
        <FormField label="Organizer"><Input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Organising body" /></FormField>
        <FormField label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></FormField>
        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Create Camp'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
