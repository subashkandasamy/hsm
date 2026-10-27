'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Edit3 } from 'lucide-react'

const PRESETS = [
  { label: 'Before food',   emoji: '🍽️' },
  { label: 'After food',    emoji: '🍽️' },
  { label: 'With food',     emoji: '🥗' },
  { label: 'Empty stomach', emoji: '⏰' },
  { label: 'With water',    emoji: '💧' },
]

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}

export default function InstructionsPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen]     = useState(false)
  const [custom, setCustom] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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

  function pick(label: string) {
    onChange(label)
    setOpen(false)
    setCustom(false)
  }

  if (disabled) {
    return (
      <div
        className="px-3 py-2.5 rounded-xl text-sm"
        style={{
          background: 'rgba(255,255,255,0.5)',
          border: '1px solid #E2E8F0',
          color: '#475569',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {value || '—'}
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setCustom(false) }}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all"
        style={{
          background: 'rgba(255,255,255,0.85)',
          border: `1px solid ${open ? '#0D9488' : '#E2E8F0'}`,
          boxShadow: open ? '0 0 0 3px rgba(13,148,136,0.1)' : 'none',
          minHeight: '44px',
        }}
      >
        <span className="truncate text-sm" style={{ color: value ? '#0F172A' : '#94A3B8' }}>
          {value || 'Choose…'}
        </span>
        <ChevronDown
          className="w-4 h-4 flex-shrink-0 ml-1 transition-transform"
          style={{ color: '#94A3B8', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-xl overflow-hidden"
          style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            minWidth: '200px',
            width: '100%',
          }}
        >
          <div className="py-1">
            {PRESETS.map((p) => {
              const active = value === p.label && !custom
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => pick(p.label)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-all"
                  style={{
                    background: active ? 'rgba(13,148,136,0.08)' : 'transparent',
                    color: active ? '#0D9488' : '#0F172A',
                    fontWeight: active ? 600 : 400,
                    minHeight: '40px',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  <span>{p.emoji}</span>
                  {p.label}
                </button>
              )
            })}
          </div>

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
                Custom…
              </button>
            ) : (
              <div className="px-2 py-2">
                <input
                  autoFocus
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setOpen(false) } }}
                  placeholder="Type instructions…"
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
