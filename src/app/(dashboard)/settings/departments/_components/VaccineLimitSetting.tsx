'use client'

import { useState, useTransition } from 'react'
import { Syringe } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { setVaccineDailyWarnLimit } from '@/app/actions/vaccination'

/** Clinic preference for the Paediatrics vaccination panel. */
export default function VaccineLimitSetting({ initial }: { initial: number | null }) {
  const [value, setValue] = useState(initial == null ? '' : String(initial))
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function save() {
    setMsg(null)
    const limit = value.trim() === '' ? null : Number(value)
    startTransition(async () => {
      const res = await setVaccineDailyWarnLimit(limit)
      setMsg(res.success ? { ok: true, text: limit == null ? 'Saved — no daily warning' : `Saved — warn after ${limit} vaccine${limit === 1 ? '' : 's'} in a day` } : { ok: false, text: res.error })
    })
  }

  return (
    <GlassCard className="p-4 mt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#0F172A' }}>
        <Syringe className="w-4 h-4" style={{ color: '#0D9488' }} /> Vaccinations
      </h3>
      <p className="text-xs mt-1" style={{ color: '#64748B' }}>
        Several vaccines can safely be given on the same day. If your doctors prefer fewer per visit, set a number and staff are asked to confirm before giving more.
      </p>
      <div className="flex items-center gap-2 flex-wrap mt-3 text-sm" style={{ color: '#334155' }}>
        <label htmlFor="vaccine-limit">Warn when more than</label>
        <input id="vaccine-limit" type="number" inputMode="numeric" min={1} max={20} value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="—" className="w-16 px-2 py-1.5 rounded-lg" style={{ border: '1px solid #E2E8F0', background: '#fff' }} />
        <span>vaccines are given to a child in one day</span>
        <button type="button" onClick={save} disabled={isPending} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#0D9488', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className="text-xs" style={{ color: msg.ok ? '#15803D' : '#B91C1C' }}>{msg.text}</span>}
      </div>
      <p className="text-[11px] mt-1" style={{ color: '#94A3B8' }}>Leave blank for no warning.</p>
    </GlassCard>
  )
}
