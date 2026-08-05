'use client'

import { useState } from 'react'
import { Users } from 'lucide-react'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

// NABH-aligned nurse : patient ratios (per shift). Denominator = patients/nurse.
const WARDS: { key: string; label: string; ratio: number }[] = [
  { key: 'general',  label: 'General ward',            ratio: 6 },
  { key: 'private',  label: 'Private / semi-private',  ratio: 4 },
  { key: 'hdu',      label: 'HDU / step-down',         ratio: 3 },
  { key: 'postop',   label: 'Post-operative / recovery', ratio: 3 },
  { key: 'paeds',    label: 'Paediatric ward',         ratio: 4 },
  { key: 'nicu',     label: 'Nursery / NICU',          ratio: 2 },
  { key: 'icu',      label: 'ICU / critical care',     ratio: 1 },
  { key: 'labour',   label: 'Labour / maternity',      ratio: 3 },
]

const RELIEF = 1.4 // weekly-off + leave relief factor for round-the-clock cover

export default function RatioCalculator() {
  const [wardKey, setWardKey] = useState('general')
  const [patients, setPatients] = useState('24')

  const ward = WARDS.find((w) => w.key === wardKey)!
  const n = Math.max(0, parseInt(patients || '0', 10) || 0)
  const perShift = Math.ceil(n / ward.ratio)
  const threeShifts = perShift * 3
  const total24x7 = Math.ceil(threeShifts * RELIEF)

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="rounded-2xl p-5" style={{ background: '#F8FAFC', border: `1px solid ${BORDER}` }}>
        <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>Ward type</label>
        <select value={wardKey} onChange={(e) => setWardKey(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg text-sm mb-4" style={{ background: '#fff', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' }}>
          {WARDS.map((w) => <option key={w.key} value={w.key}>{w.label} — 1:{w.ratio}</option>)}
        </select>

        <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>Number of patients (or occupied beds)</label>
        <input type="number" min={0} value={patients} onChange={(e) => setPatients(e.target.value)} inputMode="numeric"
          className="w-full px-3 py-2.5 rounded-lg text-sm" style={{ background: '#fff', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' }} />

        <div className="mt-4 flex items-start gap-2 text-xs" style={{ color: SLATE6 }}>
          <Users className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: TEAL }} />
          <span>Using a <strong>1 : {ward.ratio}</strong> nurse-to-patient ratio for a {ward.label.toLowerCase()}.</span>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: SLATE4 }}>Nurses required</p>

        <div className="rounded-xl p-4 mb-3" style={{ background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)' }}>
          <p className="text-3xl font-bold leading-none" style={{ color: TEAL }}>{perShift}</p>
          <p className="text-xs mt-1" style={{ color: SLATE6 }}>nurses per shift</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4" style={{ background: '#F8FAFC', border: `1px solid ${BORDER}` }}>
            <p className="text-2xl font-bold leading-none" style={{ color: SLATE9 }}>{threeShifts}</p>
            <p className="text-xs mt-1" style={{ color: SLATE6 }}>for 3 shifts</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: '#F8FAFC', border: `1px solid ${BORDER}` }}>
            <p className="text-2xl font-bold leading-none" style={{ color: SLATE9 }}>{total24x7}</p>
            <p className="text-xs mt-1" style={{ color: SLATE6 }}>for 24×7 cover*</p>
          </div>
        </div>

        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: SLATE4 }}>
          *Includes ~1.4× relief for weekly-offs and leave, so the ward stays staffed round the clock. Ratios are NABH-aligned for planning — confirm against the current standard and your hospital policy.
        </p>
      </div>
    </div>
  )
}
