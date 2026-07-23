'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import FormField from '@/components/ui/FormField'
import Input from '@/components/ui/Input'
import DateText from '@/components/ui/DateText'
import { recordCrossMatch, listCompatibleUnits } from '@/app/actions/blood'
import type { BloodRequest, BloodUnit } from '@/lib/types'

const COMPONENT_LABELS: Record<string, string> = {
  whole: 'Whole Blood', prbc: 'PRBC', plasma: 'Plasma', platelets: 'Platelets',
}
type XmResult = 'compatible' | 'incompatible'

interface Props {
  request: BloodRequest
  onClose: () => void
  onSuccess: () => void
}

export default function CrossMatchModal({ request, onClose, onSuccess }: Props) {
  const [units, setUnits] = useState<BloodUnit[]>([])
  const [selected, setSelected] = useState<BloodUnit | null>(null)
  const [sampleNo, setSampleNo] = useState(request.recipient_sample_no ?? '')
  const [major, setMajor] = useState<XmResult>('compatible')
  const [minor, setMinor] = useState<XmResult>('compatible')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setFetching(true)
    listCompatibleUnits(request.id).then((u) => { setUnits(u); setSelected(null); setFetching(false) })
  }, [request.id])

  async function save() {
    if (!selected) { setError('Select a unit to cross-match'); return }
    setSaving(true); setError(null)
    const res = await recordCrossMatch(request.id, selected.id, {
      recipient_sample_no: sampleNo.trim() || null,
      major_result: major,
      minor_result: minor,
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    onSuccess()
  }

  return (
    <Modal open onClose={onClose}
      title={`Cross-match — ${request.blood_group} ${COMPONENT_LABELS[request.component] ?? request.component}`}
      maxWidth="38rem">
      <div className="space-y-4">
        <div className="p-3 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
            {request.patient?.full_name}
            <span className="ml-2 font-mono text-xs font-normal" style={{ color: '#94A3B8' }}>{request.patient?.uhid}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
            Recipient {request.blood_group} · compatible donor units shown (incl. valid substitutions)
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: '#0F172A' }}>Select Compatible Unit</p>
          {fetching ? (
            <p className="text-sm text-center py-4" style={{ color: '#94A3B8' }}>Loading…</p>
          ) : units.length === 0 ? (
            <div className="py-6 text-center rounded-xl" style={{ border: '1px solid #E2E8F0', background: 'rgba(248,250,252,0.6)' }}>
              <p className="text-sm font-medium" style={{ color: '#64748B' }}>No compatible, screened units available</p>
            </div>
          ) : (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '0.75rem', overflow: 'hidden', maxHeight: '13rem', overflowY: 'auto' }}>
              {units.map((u, i) => {
                const substitute = u.blood_group !== request.blood_group
                return (
                  <button key={u.id} type="button" onClick={() => setSelected(u)}
                    className="w-full flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: i < units.length - 1 ? '1px solid #F1F5F9' : 'none',
                      background: selected?.id === u.id ? 'rgba(13,148,136,0.07)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs px-2 py-0.5 rounded" style={{ background: '#FEE2E2', color: '#DC2626' }}>{u.blood_group}</span>
                        {u.bag_number && <span className="font-mono text-xs" style={{ color: '#64748B' }}>{u.bag_number}</span>}
                        {substitute && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>Substitute</span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#64748B' }}>Expires: <DateText date={u.expiry} /></div>
                    </div>
                    {selected?.id === u.id && (
                      <span className="text-xs px-2 py-1 rounded-lg font-semibold" style={{ background: '#0D9488', color: '#fff' }}>Selected</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <FormField label="Recipient Sample No.">
          <Input value={sampleNo} onChange={(e) => setSampleNo(e.target.value)} placeholder="e.g. XM-2026-0042" />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          {([['Major', major, setMajor], ['Minor', minor, setMinor]] as const).map(([label, val, set]) => (
            <FormField key={label} label={`${label} Cross-match`}>
              <div className="flex gap-2">
                {(['compatible', 'incompatible'] as XmResult[]).map((r) => {
                  const active = val === r
                  const bad = r === 'incompatible'
                  return (
                    <button key={r} type="button" onClick={() => set(r)}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: active ? (bad ? '#FEE2E2' : '#DCFCE7') : '#fff',
                        color: active ? (bad ? '#DC2626' : '#15803D') : '#94A3B8',
                        border: `1px solid ${active ? (bad ? '#FECACA' : '#BBF7D0') : '#E2E8F0'}`, cursor: 'pointer' }}>
                      {bad ? 'Incompatible' : 'Compatible'}
                    </button>
                  )
                })}
              </div>
            </FormField>
          ))}
        </div>

        {major === 'incompatible' && (
          <div className="text-sm rounded-xl px-3 py-2 font-medium" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>
            ⚠ Major incompatible — this unit cannot be issued.
          </div>
        )}

        {error && <div className="text-sm rounded-xl px-3 py-2" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA' }}>{error}</div>}

        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>Cancel</button>
          <button onClick={save} disabled={saving || !selected}
            className="px-5 py-2 rounded-xl text-sm font-semibold"
            style={{ background: (saving || !selected) ? '#94A3B8' : '#0D9488', color: '#fff', border: 'none', cursor: (saving || !selected) ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Record Cross-match'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
