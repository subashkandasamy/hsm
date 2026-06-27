'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DentalTooth, ToothStatus } from '@/lib/types'

const STATUS_COLORS: Record<ToothStatus, { bg: string; border: string; label: string }> = {
  healthy:    { bg: '#F0FDF4', border: '#86EFAC', label: 'Healthy' },
  decayed:    { bg: '#FEF2F2', border: '#FCA5A5', label: 'Decayed' },
  filled:     { bg: '#CCFBF1', border: '#5EEAD4', label: 'Filled' },
  crowned:    { bg: '#EDE9FE', border: '#C4B5FD', label: 'Crowned' },
  root_canal: { bg: '#FEF3C7', border: '#FCD34D', label: 'Root Canal' },
  missing:    { bg: '#F8FAFC', border: '#CBD5E1', label: 'Missing' },
  extracted:  { bg: '#F1F5F9', border: '#94A3B8', label: 'Extracted' },
  implant:    { bg: '#EFF6FF', border: '#93C5FD', label: 'Implant' },
}

// Universal Numbering System layout
// Upper: Right side 1-8 (displayed right→left), Left side 9-16 (displayed left→right)
// Lower: Left side 17-24 (mirrored), Right side 25-32 (mirrored)
const UPPER_RIGHT = [1, 2, 3, 4, 5, 6, 7, 8] as const    // patient's right — shown on display left
const UPPER_LEFT  = [9, 10, 11, 12, 13, 14, 15, 16] as const
const LOWER_LEFT  = [24, 23, 22, 21, 20, 19, 18, 17] as const // mirrored
const LOWER_RIGHT = [32, 31, 30, 29, 28, 27, 26, 25] as const

type Quadrant = 'UR' | 'UL' | 'LL' | 'LR'
const QUADRANT_TEETH: Record<Quadrant, readonly number[]> = {
  UR: UPPER_RIGHT,
  UL: UPPER_LEFT,
  LL: [17, 18, 19, 20, 21, 22, 23, 24],
  LR: [25, 26, 27, 28, 29, 30, 31, 32],
}
const QUADRANT_LABELS: Record<Quadrant, string> = {
  UR: 'Upper Right', UL: 'Upper Left', LL: 'Lower Left', LR: 'Lower Right',
}

interface Props {
  teeth: DentalTooth[]
  onToothClick: (toothNumber: number) => void
  disabled?: boolean
}

export default function ToothChart({ teeth, onToothClick, disabled }: Props) {
  const [mobileQuadrant, setMobileQuadrant] = useState<Quadrant>('UR')
  const byNumber = new Map(teeth.map((t) => [t.tooth_number, t.current_status]))

  const toothStatus = (n: number): ToothStatus => byNumber.get(n) ?? 'healthy'

  function Tooth({ n }: { n: number }) {
    const status = toothStatus(n)
    const { bg, border } = STATUS_COLORS[status]
    return (
      <button
        type="button"
        onClick={() => !disabled && onToothClick(n)}
        title={`#${n} — ${STATUS_COLORS[status].label}`}
        style={{
          background: bg, border: `2px solid ${border}`,
          borderRadius: '0.5rem', cursor: disabled ? 'default' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '2px',
          padding: '4px 2px', transition: 'transform 0.1s, box-shadow 0.1s',
          minWidth: '32px', minHeight: '40px',
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.transform = 'scale(1.1)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.15)'
            e.currentTarget.style.zIndex = '10'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.zIndex = 'auto'
        }}
      >
        <span style={{ fontSize: '9px', color: '#475569', fontWeight: 600, lineHeight: 1 }}>{n}</span>
        {/* Tooth shape indicator */}
        <div style={{
          width: '18px', height: '20px', borderRadius: '40% 40% 50% 50%',
          background: border, opacity: 0.7,
        }} />
      </button>
    )
  }

  function ArchRow({ numbers, label }: { numbers: readonly number[]; label?: string }) {
    return (
      <div>
        {label && (
          <p className="text-xs mb-1 text-center" style={{ color: '#94A3B8' }}>{label}</p>
        )}
        <div className="flex gap-1 justify-center flex-wrap sm:flex-nowrap">
          {numbers.map((n) => <Tooth key={n} n={n} />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Desktop: full arch layout */}
      <div className="hidden sm:block space-y-1">
        <div className="flex items-end mb-0.5">
          <span className="text-xs mr-2 w-16 text-right" style={{ color: '#94A3B8' }}>Upper R →</span>
          <div className="flex-1" />
          <span className="text-xs ml-2 w-16" style={{ color: '#94A3B8' }}>← Upper L</span>
        </div>
        {/* Upper arch */}
        <div className="flex gap-1 justify-center">
          {[...UPPER_RIGHT].reverse().map((n) => <Tooth key={n} n={n} />)}
          <div className="w-3 flex-shrink-0 border-r-2 mx-1" style={{ borderColor: '#CBD5E1' }} />
          {UPPER_LEFT.map((n) => <Tooth key={n} n={n} />)}
        </div>

        {/* Midline gap */}
        <div className="flex items-center gap-2 my-1 px-4">
          <div className="flex-1 border-t border-dashed" style={{ borderColor: '#E2E8F0' }} />
          <span className="text-xs" style={{ color: '#94A3B8' }}>midline</span>
          <div className="flex-1 border-t border-dashed" style={{ borderColor: '#E2E8F0' }} />
        </div>

        {/* Lower arch — mirrored */}
        <div className="flex gap-1 justify-center">
          {LOWER_RIGHT.map((n) => <Tooth key={n} n={n} />)}
          <div className="w-3 flex-shrink-0 border-r-2 mx-1" style={{ borderColor: '#CBD5E1' }} />
          {[...LOWER_LEFT].reverse().map((n) => <Tooth key={n} n={n} />)}
        </div>
        <div className="flex items-end mt-0.5">
          <span className="text-xs mr-2 w-16 text-right" style={{ color: '#94A3B8' }}>Lower R →</span>
          <div className="flex-1" />
          <span className="text-xs ml-2 w-16" style={{ color: '#94A3B8' }}>← Lower L</span>
        </div>
      </div>

      {/* Mobile: quadrant selector */}
      <div className="sm:hidden">
        {/* Quadrant tabs */}
        <div className="grid grid-cols-2 gap-1 mb-3 p-1 rounded-xl" style={{ background: '#F1F5F9' }}>
          {(['UR', 'UL', 'LL', 'LR'] as Quadrant[]).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setMobileQuadrant(q)}
              className="py-2 rounded-lg text-xs font-semibold"
              style={mobileQuadrant === q
                ? { background: '#0D9488', color: '#fff' }
                : { background: 'transparent', color: '#64748B' }}
            >
              {QUADRANT_LABELS[q]}
            </button>
          ))}
        </div>

        {/* Active quadrant teeth */}
        <div className="flex gap-2 justify-center flex-wrap">
          {QUADRANT_TEETH[mobileQuadrant].map((n) => (
            <div key={n} className="flex flex-col items-center">
              <Tooth n={n} />
              <span className="text-xs mt-1" style={{ color: '#94A3B8' }}>{n}</span>
            </div>
          ))}
        </div>

        {/* Quadrant navigation */}
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            onClick={() => {
              const order: Quadrant[] = ['UR', 'UL', 'LL', 'LR']
              const idx = order.indexOf(mobileQuadrant)
              setMobileQuadrant(order[(idx - 1 + 4) % 4])
            }}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <span className="text-xs font-semibold" style={{ color: '#0D9488' }}>
            {QUADRANT_LABELS[mobileQuadrant]}
          </span>
          <button
            type="button"
            onClick={() => {
              const order: Quadrant[] = ['UR', 'UL', 'LL', 'LR']
              const idx = order.indexOf(mobileQuadrant)
              setMobileQuadrant(order[(idx + 1) % 4])
            }}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg"
            style={{ background: '#F1F5F9', color: '#475569', border: 'none', cursor: 'pointer' }}
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.entries(STATUS_COLORS) as [ToothStatus, { bg: string; border: string; label: string }][]).map(([status, { bg, border, label }]) => (
          <span key={status} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: bg, border: `1px solid ${border}`, color: '#475569' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: border, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
