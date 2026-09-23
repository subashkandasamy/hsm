'use client'

import { useState } from 'react'
import { AlertTriangle, Phone } from 'lucide-react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { acknowledgeCritical, type OpenCritical } from '@/app/actions/lab'

/**
 * Critical results waiting to be telephoned through.
 *
 * NABL 112 §5.8 asks for two things and most software does only the first: a
 * critical value has to be flagged, AND communicated to the clinician "after
 * proper documentation". This is the documentation. The telephone call is
 * still a person's job — nothing here sends anything, and it would be worse if
 * it pretended to.
 *
 * Sits above the worklist rather than in a tab, because a potassium of 6.8 is
 * not something to find by browsing.
 */
export default function CriticalResultsBar({
  items, canAct, onDone,
}: {
  items: OpenCritical[]
  canAct: boolean
  onDone: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [toName, setToName] = useState('')
  const [method, setMethod] = useState('phone')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!items.length) return null

  function start(c: OpenCritical) {
    setOpenId(c.id)
    // The ordering doctor is who the laboratory rings, so offer them first —
    // but let it be changed, because at 2am it is whoever is covering.
    setToName(c.notified_to_name ?? '')
    setMethod('phone'); setNote(''); setError('')
  }

  async function save(id: string) {
    setSaving(true); setError('')
    const res = await acknowledgeCritical({ id, toName, method, note })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setOpenId(null)
    onDone()
  }

  return (
    <div className="rounded-xl mb-4 overflow-hidden" style={{ border: '1px solid #FECACA', background: '#FEF2F2' }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #FECACA' }}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#DC2626' }} />
        <p className="text-sm font-semibold" style={{ color: '#991B1B' }}>
          {items.length} critical result{items.length > 1 ? 's' : ''} awaiting notification
        </p>
      </div>

      {items.map((c) => (
        <div key={c.id} style={{ borderTop: '1px solid #FEE2E2' }}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="text-sm font-semibold" style={{ color: '#0F172A' }}>{c.patient_name}</span>
            <span className="text-xs font-mono" style={{ color: '#94A3B8' }}>{c.patient_uhid}</span>
            <span className="text-sm font-bold" style={{ color: '#DC2626' }}>
              {c.analyte} {c.value_num}{c.unit ? ` ${c.unit}` : ''}
            </span>
            {c.accession_no && (
              <span className="text-xs font-mono" style={{ color: '#94A3B8' }}>#{c.accession_no}</span>
            )}
            {canAct && openId !== c.id && (
              <button onClick={() => start(c)}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                style={{ background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
                <Phone className="w-3 h-3" /> Record notification
              </button>
            )}
          </div>

          {openId === c.id && (
            <div className="px-4 pb-3" style={{ background: '#fff' }}>
              <p className="text-xs mb-2 pt-2" style={{ color: '#64748B' }}>
                Telephone the clinician, then record it here. This is the entry an
                assessor asks to see.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input value={toName} onChange={(e) => setToName(e.target.value)}
                  placeholder="Who did you tell?" />
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="phone">By telephone</option>
                  <option value="in_person">In person</option>
                  <option value="message">By message</option>
                </Select>
                <Input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)" />
              </div>
              {error && <p className="text-xs mt-2" style={{ color: '#DC2626' }}>{error}</p>}
              <div className="flex gap-2 justify-end mt-2">
                <button onClick={() => setOpenId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
                <button onClick={() => save(c.id)} disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: saving ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
