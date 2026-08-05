'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

const num = (s: string) => { const n = parseFloat(s); return isFinite(n) ? n : 0 }
const fmt = (n: number) => '₹' + (isFinite(n) ? n : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const inputStyle = { background: '#fff', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' } as const

export default function GstCalculator() {
  const [roomType, setRoomType] = useState<'non_icu' | 'icu'>('non_icu')
  const [rentPerDay, setRentPerDay] = useState('6000')
  const [days, setDays] = useState('3')
  const [otherCharges, setOtherCharges] = useState('12000')

  const rent = num(rentPerDay)
  const nDays = Math.max(0, num(days))
  const roomTotal = rent * nDays
  const other = num(otherCharges)

  // Rule: non-ICU room rent above ₹5,000/day → 5% GST. ICU exempt. Other healthcare exempt.
  const roomTaxable = roomType === 'non_icu' && rent > 5000
  const roomGst = roomTaxable ? roomTotal * 0.05 : 0
  const subtotal = roomTotal + other
  const total = subtotal + roomGst

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="rounded-2xl p-5" style={{ background: '#F8FAFC', border: `1px solid ${BORDER}` }}>
        <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>Room type</label>
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
          {([['non_icu', 'Non-ICU room'], ['icu', 'ICU / CCU']] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setRoomType(k)} className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={roomType === k ? { background: TEAL, color: '#fff', border: 'none' } : { background: 'transparent', color: SLATE6, border: 'none', cursor: 'pointer' }}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>Room rent / day (₹)</label>
            <input inputMode="decimal" value={rentPerDay} onChange={(e) => setRentPerDay(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>Number of days</label>
            <input inputMode="decimal" value={days} onChange={(e) => setDays(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
          </div>
        </div>

        <label className="block text-xs font-medium mb-1" style={{ color: SLATE6 }}>Other healthcare charges (₹)</label>
        <input inputMode="decimal" value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} className="w-full px-3 py-2.5 rounded-lg text-sm" style={inputStyle} />
        <p className="text-[11px] mt-1" style={{ color: SLATE4 }}>Consultation, treatment, lab, in-patient medicines — treated as exempt.</p>
      </div>

      {/* Result */}
      <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: SLATE4 }}>Result</p>

        <div className="rounded-xl px-3.5 py-3 mb-3 flex items-start gap-2 text-xs leading-relaxed"
          style={{ background: roomTaxable ? '#FEF9C3' : 'rgba(13,148,136,0.06)', border: `1px solid ${roomTaxable ? '#FDE68A' : 'rgba(13,148,136,0.15)'}`, color: SLATE6 }}>
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: roomTaxable ? '#B45309' : TEAL }} />
          <span>
            {roomType === 'icu'
              ? 'ICU / CCU room rent is exempt from GST regardless of amount.'
              : roomTaxable
                ? `Room rent is above ₹5,000/day, so 5% GST applies to the room rent (₹${roomTotal.toLocaleString('en-IN')}).`
                : 'Room rent is ₹5,000/day or below, so it is exempt from GST.'}
          </span>
        </div>

        <div className="text-sm space-y-1.5">
          <div className="flex justify-between" style={{ color: SLATE6 }}><span>Room rent ({nDays || 0} days)</span><span className="tabular-nums">{fmt(roomTotal)}</span></div>
          <div className="flex justify-between" style={{ color: SLATE6 }}><span>Other charges (exempt)</span><span className="tabular-nums">{fmt(other)}</span></div>
          <div className="flex justify-between" style={{ color: SLATE6 }}><span>GST on room rent {roomTaxable ? '(5%)' : ''}</span><span className="tabular-nums">{fmt(roomGst)}</span></div>
          <div className="flex justify-between pt-2 text-base font-bold" style={{ color: SLATE9, borderTop: `1px solid ${BORDER}` }}><span>Total bill</span><span className="tabular-nums" style={{ color: TEAL }}>{fmt(total)}</span></div>
        </div>

        <p className="text-[11px] mt-4 leading-relaxed" style={{ color: SLATE4 }}>
          Based on the current rule: 5% GST (no input tax credit) on non-ICU room rent above ₹5,000/day; core healthcare exempt. This is a guide, not tax advice — confirm with your advisor.
        </p>
      </div>
    </div>
  )
}
