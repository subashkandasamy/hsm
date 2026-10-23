'use client'

import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { addPoliceIntimation } from '@/app/actions/mlc'
import { INTIMATION_METHODS } from '@/lib/mlc'

/**
 * Recording that the police were told.
 *
 * Nothing is sent from here. The hospital telephones the station or walks a
 * printed intimation across, and this writes down that it happened, to whom,
 * and when — which is the part the hospital has to be able to prove.
 *
 * The time is editable and defaults to now, because the real sequence is a
 * call at two in the morning written up at nine. A record that says nine
 * understates what the hospital actually did.
 *
 * Once saved it cannot be rewritten. A mistake is corrected by recording a
 * further intimation, and both stay — an intimation log that can be tidied up
 * afterwards proves nothing at all.
 */
export default function PoliceIntimationModal({
  open, mlcId, arNo, onClose, onSaved,
}: {
  open: boolean
  mlcId: string | null
  arNo?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [station, setStation] = useState('')
  const [officer, setOfficer] = useState('')
  const [rank, setRank] = useState('')
  const [phone, setPhone] = useState('')
  const [method, setMethod] = useState('telephone')
  const [when, setWhen] = useState(localNow())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!mlcId) return
    setSaving(true); setError(null)
    const r = await addPoliceIntimation({
      mlc_id: mlcId,
      station_name: station,
      officer_name: officer || null,
      officer_rank: rank || null,
      officer_phone: phone || null,
      method: method as 'in_person' | 'telephone' | 'written' | 'other',
      intimated_at: when ? new Date(when).toISOString() : null,
      notes: notes || null,
    })
    setSaving(false)
    if (!r.success) { setError(r.error); return }
    setStation(''); setOfficer(''); setRank(''); setPhone('')
    setMethod('telephone'); setWhen(localNow()); setNotes('')
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose}
      title={arNo ? `Police intimation — ${arNo}` : 'Police intimation'} maxWidth="34rem">
      <form onSubmit={save} className="space-y-4">
        <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
          style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
          <p className="text-xs" style={{ color: '#92400E' }}>
            This records an intimation you have already given. Nothing is sent to the
            police from here — print the intimation and hand it over, or telephone the
            station, then write down what you did. It cannot be edited afterwards.
          </p>
        </div>

        <FormField label="Police station" required>
          <Input value={station} onChange={(e) => setStation(e.target.value)}
            placeholder="e.g. Karur Town Police Station" />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Officer informed">
            <Input value={officer} onChange={(e) => setOfficer(e.target.value)} placeholder="Name" />
          </FormField>
          <FormField label="Rank">
            <Input value={rank} onChange={(e) => setRank(e.target.value)} placeholder="e.g. SI, HC" />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="How">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {INTIMATION_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="When">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </FormField>
        </div>

        <FormField label="Officer's phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        </FormField>

        <FormField label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth recording — what the station said, who else was present…"
            style={{ minHeight: '3rem' }} />
        </FormField>

        {error && (
          <div className="text-sm rounded-xl px-3 py-2"
            style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>
        )}

        <div className="flex gap-3 justify-end pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !station.trim()}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{
              background: saving || !station.trim() ? '#94A3B8' : '#DC2626', color: '#fff',
              border: 'none', cursor: saving || !station.trim() ? 'not-allowed' : 'pointer',
            }}>
            {saving ? 'Recording…' : 'Record intimation'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Now, in the browser's own timezone, shaped for a datetime-local input. */
function localNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
