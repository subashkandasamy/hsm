'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, Clock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import { listDoctorAvailability, setDoctorAvailability } from '@/app/actions/doctorAvailability'

const TEAL = '#0D9488'
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Display order Mon→Sun
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface Session { day_of_week: number; start_time: string; end_time: string; label: string; token_cap: string }
const blank = (): Session => ({ day_of_week: 1, start_time: '09:00', end_time: '13:00', label: 'Morning', token_cap: '' })

export default function DoctorHoursPanel({ doctors }: { doctors: { id: string; full_name: string }[] }) {
  const [doctorId, setDoctorId] = useState('')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function pickDoctor(id: string) {
    setDoctorId(id); setError(null); setSaved(false)
    if (!id) { setSessions([]); return }
    setLoading(true)
    const rows = await listDoctorAvailability(id)
    setLoading(false)
    setSessions(rows.map((r) => ({
      day_of_week: r.day_of_week,
      start_time: (r.start_time || '09:00').slice(0, 5),
      end_time: (r.end_time || '13:00').slice(0, 5),
      label: r.label ?? '',
      token_cap: r.token_cap != null ? String(r.token_cap) : '',
    })))
  }

  function update(i: number, patch: Partial<Session>) {
    setSessions((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x))); setSaved(false)
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    const res = await setDoctorAvailability({
      doctor_id: doctorId,
      sessions: sessions.map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        label: s.label.trim() || null,
        token_cap: s.token_cap.trim() ? parseInt(s.token_cap) : null,
      })),
    })
    setSaving(false)
    if (!res.success) { setError(res.error); return }
    setSaved(true)
  }

  const sorted = [...sessions].map((s, i) => ({ s, i })).sort((a, b) => DAY_ORDER.indexOf(a.s.day_of_week) - DAY_ORDER.indexOf(b.s.day_of_week))

  return (
    <div>
      <GlassCard className="p-4 mb-4">
        <label className="text-xs font-semibold mb-1 block" style={{ color: '#475569' }}>Doctor</label>
        <Select value={doctorId} onChange={(e) => pickDoctor(e.target.value)} className="w-full sm:w-80">
          <option value="">Select a doctor…</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.full_name}</option>)}
        </Select>
        <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
          Set the OPD days &amp; sessions this doctor sees patients. This drives the patient app&apos;s booking calendar (days a doctor isn&apos;t in are greyed out).
        </p>
      </GlassCard>

      {doctorId && (
        <GlassCard className="p-4">
          {loading ? (
            <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>Loading…</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: '#0F172A' }}>
                  <Clock className="w-4 h-4" style={{ color: TEAL }} /> OPD sessions
                </h3>
                <button onClick={() => setSessions((s) => [...s, blank()])}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                  style={{ background: 'rgba(13,148,136,0.08)', color: TEAL, border: '1px solid rgba(13,148,136,0.15)', cursor: 'pointer' }}>
                  <Plus className="w-3.5 h-3.5" /> Add session
                </button>
              </div>

              {sessions.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: '#94A3B8' }}>No OPD sessions yet — add one so patients can book.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sorted.map(({ s, i }) => (
                    <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_1fr_1.2fr_0.9fr_auto] gap-2 items-end p-2 rounded-xl" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                      <div>
                        <label className="text-[11px] block mb-0.5" style={{ color: '#94A3B8' }}>Day</label>
                        <Select value={s.day_of_week} onChange={(e) => update(i, { day_of_week: parseInt(e.target.value) })}>
                          {DAY_ORDER.map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}
                        </Select>
                      </div>
                      <div>
                        <label className="text-[11px] block mb-0.5" style={{ color: '#94A3B8' }}>Start</label>
                        <Input type="time" value={s.start_time} onChange={(e) => update(i, { start_time: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[11px] block mb-0.5" style={{ color: '#94A3B8' }}>End</label>
                        <Input type="time" value={s.end_time} onChange={(e) => update(i, { end_time: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-[11px] block mb-0.5" style={{ color: '#94A3B8' }}>Label</label>
                        <Input value={s.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Morning" />
                      </div>
                      <div>
                        <label className="text-[11px] block mb-0.5" style={{ color: '#94A3B8' }}>Token cap</label>
                        <Input type="number" min="0" value={s.token_cap} onChange={(e) => update(i, { token_cap: e.target.value })} placeholder="∞" />
                      </div>
                      <button onClick={() => setSessions((arr) => arr.filter((_, j) => j !== i))}
                        className="p-2 rounded-lg self-end" style={{ background: '#FEF2F2', color: '#DC2626', border: 'none', cursor: 'pointer' }} title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-xs mt-3" style={{ color: '#DC2626' }}>{error}</p>}

              <div className="flex items-center gap-3 mt-4">
                <button onClick={save} disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: saving ? '#94A3B8' : TEAL, color: '#fff', border: 'none', cursor: 'pointer' }}>
                  {saving ? 'Saving…' : 'Save OPD hours'}
                </button>
                {saved && <span className="text-sm flex items-center gap-1" style={{ color: '#15803D' }}><Check className="w-4 h-4" /> Saved</span>}
              </div>
            </>
          )}
        </GlassCard>
      )}
    </div>
  )
}
