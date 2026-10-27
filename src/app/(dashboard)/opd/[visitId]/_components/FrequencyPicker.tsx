'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Edit3 } from 'lucide-react'

const PRESETS = [
  { code: '1-0-0', short: 'OD Morning', desc: 'Once — morning'   },
  { code: '0-1-0', short: 'OD Noon',    desc: 'Once — afternoon' },
  { code: '0-0-1', short: 'OD Night',   desc: 'Once — night'     },
  { code: '1-0-1', short: 'BD',         desc: 'Morning & night'  },
  { code: '1-1-0', short: 'BD AM/PM',   desc: 'Morning & noon'   },
  { code: '0-1-1', short: 'BD PM/N',    desc: 'Noon & night'     },
  { code: '1-1-1', short: 'TDS',        desc: 'Three times daily'},
  { code: '1-1-1-1', short: 'QID',      desc: 'Four times daily' },
]

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

export default function FrequencyPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen]     = useState(false)
  const [custom, setCustom] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const preset = PRESETS.find((p) => p.code === value)
  const displayValue = preset ? `${preset.code}  ·  ${preset.short}` : value || ''

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCustom(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function pick(code: string) {
    onChange(code)
    setOpen(false)
    setCustom(false)
  }

  if (disabled) {
    return (
      <div className="px-3 py-2.5 rounded-xl text-sm"
        style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid #E2E8F0', color: '#475569', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
        {displayValue || '—'}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger — looks like a normal input */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setCustom(false) }}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all"
        style={{
          background: 'rgba(255,255,255,0.85)',
          border: `1px solid ${open ? '#0D9488' : '#E2E8F0'}`,
          boxShadow: open ? '0 0 0 3px rgba(13,148,136,0.1)' : 'none',
          color: value ? '#0F172A' : '#94A3B8',
          minHeight: '44px',
        }}
      >
        <span className="truncate font-mono text-xs font-semibold" style={{ color: value ? '#0D9488' : '#94A3B8' }}>
          {displayValue || 'Choose…'}
        </span>
        <ChevronDown className="w-4 h-4 flex-shrink-0 ml-1 transition-transform"
          style={{ color: '#94A3B8', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
          style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            minWidth: '260px',
            width: 'max-content',
          }}
        >
          {/* M – A – E header */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            {[['M','#FEF3C7','#B45309'],['A','#DBEAFE','#1D4ED8'],['E','#EDE9FE','#7C3AED']].map(([l,bg,fg]) => (
              <span key={l} className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: bg, color: fg }}>{l}</span>
            ))}
            <span className="text-xs" style={{ color: '#94A3B8' }}>Morning · Afternoon · Evening</span>
          </div>

          {/* Preset grid */}
          <div className="grid grid-cols-2 gap-1 px-2 pb-2">
            {PRESETS.map((p) => {
              const active = value === p.code && !custom
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => pick(p.code)}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: active ? 'rgba(13,148,136,0.08)' : 'transparent',
                    border: active ? '1px solid rgba(13,148,136,0.3)' : '1px solid transparent',
                    minHeight: '40px',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <span className="font-mono text-xs font-bold" style={{ color: active ? '#0D9488' : '#0F172A' }}>
                    {p.code}
                  </span>
                  <span className="text-xs" style={{ color: '#64748B' }}>{p.short}</span>
                </button>
              )
            })}
          </div>

          {/* Custom divider + button */}
          <div style={{ borderTop: '1px solid #F1F5F9' }}>
            {!custom ? (
              <button
                type="button"
                onClick={() => { setCustom(true); onChange('') }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-all"
                style={{ color: '#64748B', minHeight: '40px' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Custom frequency…
              </button>
            ) : (
              <div className="px-2 py-2">
                <input
                  autoFocus
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setOpen(false) } }}
                  placeholder="e.g. SOS, once weekly, before meals…"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #0D9488',
                    color: '#0F172A',
                    outline: 'none',
                    minHeight: '38px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#0D9488', color: '#fff' }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
