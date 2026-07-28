'use client'

import { useState, useEffect, useCallback } from 'react'
import { Baby, Syringe, Plus } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import DateText from '@/components/ui/DateText'
import { listGrowth, recordGrowth, getImmunizationStatus, recordImmunization } from '@/app/actions/pediatrics'
import type { GrowthRecord, ImmunizationStatusItem, ImmunizationState } from '@/lib/types'

const IMMUN_STYLE: Record<ImmunizationState, { bg: string; color: string; label: string }> = {
  given:    { bg: '#DCFCE7', color: '#15803D', label: 'Given' },
  due:      { bg: '#FEF3C7', color: '#B45309', label: 'Due' },
  overdue:  { bg: '#FEE2E2', color: '#DC2626', label: 'Overdue' },
  upcoming: { bg: '#F1F5F9', color: '#64748B', label: 'Upcoming' },
}

function ageAt(dob: string | null, at: string): string {
  if (!dob) return '—'
  const months = Math.floor((new Date(at).getTime() - new Date(dob).getTime()) / (30.4375 * 86400000))
  if (months < 0) return '—'
  if (months < 24) return `${months} mo`
  return `${Math.floor(months / 12)}y ${months % 12}m`
}

interface Props {
  patientId: string
  dob: string | null
  canWrite: boolean
}

export default function PediatricsTab({ patientId, dob, canWrite }: Props) {
  const [growth, setGrowth] = useState<GrowthRecord[]>([])
  const [immun, setImmun] = useState<ImmunizationStatusItem[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    listGrowth(patientId).then(setGrowth)
    getImmunizationStatus(patientId).then(setImmun)
  }, [patientId])
  useEffect(() => { load() }, [load])

  async function saveGrowth() {
    setBusy(true)
    const num = (k: string) => form[k] ? parseFloat(form[k]) : null
    const res = await recordGrowth(patientId, {
      recorded_at: form.date || null, weight_kg: num('weight'), height_cm: num('height'),
      head_circ_cm: num('head'), muac_cm: num('muac'), notes: form.notes || null,
    })
    setBusy(false)
    if (res.success) { setForm({}); setShowAdd(false); load() }
  }

  async function markGiven(i: ImmunizationStatusItem) {
    await recordImmunization(patientId, { vaccine: i.vaccine, dose_label: i.dose_label })
    load()
  }

  const latest = growth[growth.length - 1]

  return (
    <div className="space-y-4">
      {/* Growth */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
            <Baby className="w-4 h-4" style={{ color: '#0D9488' }} /> Growth Monitoring
          </h3>
          {canWrite && (
            <button onClick={() => setShowAdd((s) => !s)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
              <Plus className="w-3 h-3" /> Measurement
            </button>
          )}
        </div>

        {showAdd && (
          <div className="rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-3 gap-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
            {[['date', 'Date', 'date'], ['weight', 'Weight (kg)', 'number'], ['height', 'Height (cm)', 'number'], ['head', 'Head circ. (cm)', 'number'], ['muac', 'MUAC (cm)', 'number']].map(([k, label, type]) => (
              <div key={k}><label className="text-xs block mb-1" style={{ color: '#94A3B8' }}>{label}</label>
                <Input type={type} step="0.1" value={form[k] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
            ))}
            <div className="flex items-end"><button onClick={saveGrowth} disabled={busy} className="w-full px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>{busy ? 'Saving…' : 'Save'}</button></div>
          </div>
        )}

        {latest && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[['Weight', latest.weight_kg, 'kg'], ['Height', latest.height_cm, 'cm'], ['Head', latest.head_circ_cm, 'cm'], ['MUAC', latest.muac_cm, 'cm']].map(([l, v, u]) => (
              <div key={l as string} className="rounded-xl px-3 py-2" style={{ background: 'rgba(248,250,252,0.8)', border: '1px solid #E2E8F0' }}>
                <p className="text-lg font-bold" style={{ color: '#0D9488' }}>{v != null ? `${v}` : '—'}<span className="text-xs font-normal" style={{ color: '#94A3B8' }}> {v != null ? u as string : ''}</span></p>
                <p className="text-xs" style={{ color: '#64748B' }}>{l as string}</p>
              </div>
            ))}
          </div>
        )}

        {growth.length === 0 ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>No measurements recorded.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>
                {['Date', 'Age', 'Weight', 'Height', 'Head', 'MUAC'].map((h) => <th key={h} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {growth.slice().reverse().map((g) => (
                  <tr key={g.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td className="px-2 py-1.5" style={{ color: '#94A3B8' }}><DateText date={g.recorded_at} /></td>
                    <td className="px-2 py-1.5">{ageAt(dob, g.recorded_at)}</td>
                    <td className="px-2 py-1.5">{g.weight_kg ?? '—'}</td>
                    <td className="px-2 py-1.5">{g.height_cm ?? '—'}</td>
                    <td className="px-2 py-1.5">{g.head_circ_cm ?? '—'}</td>
                    <td className="px-2 py-1.5">{g.muac_cm ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Immunization */}
      <GlassCard className="p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: '#0F172A' }}>
          <Syringe className="w-4 h-4" style={{ color: '#1D4ED8' }} /> Immunization Schedule
        </h3>
        {!dob ? (
          <p className="text-xs" style={{ color: '#94A3B8' }}>Set the patient’s date of birth to compute the schedule.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'rgba(248,250,252,0.9)' }}>
                {['Vaccine', 'Dose', 'Due', 'Status', ''].map((h, i) => <th key={i} className="text-left px-2 py-1.5 font-semibold" style={{ color: '#475569' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {immun.map((it, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                    <td className="px-2 py-1.5 font-medium" style={{ color: '#0F172A' }}>{it.vaccine}</td>
                    <td className="px-2 py-1.5" style={{ color: '#64748B' }}>{it.dose_label}</td>
                    <td className="px-2 py-1.5" style={{ color: '#94A3B8' }}>{it.given_date ? <DateText date={it.given_date} /> : <DateText date={it.due_date} />}</td>
                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: IMMUN_STYLE[it.status].bg, color: IMMUN_STYLE[it.status].color }}>{IMMUN_STYLE[it.status].label}</span></td>
                    <td className="px-2 py-1.5">
                      {canWrite && it.status !== 'given' && (
                        <button onClick={() => markGiven(it)} className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>Mark given</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  )
}
