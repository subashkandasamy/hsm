'use client'

import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder: string
  busy?: boolean
  className?: string
}

/** The search box above a paged list. The list searches the server, not just the rows on screen. */
export default function ListSearch({ value, onChange, placeholder, busy, className = '' }: Props) {
  return (
    <div className={`relative w-full md:max-w-sm ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-9 pr-16 py-2.5 rounded-xl text-sm"
        style={{ minHeight: '44px', background: 'rgba(255,255,255,0.85)', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#0D9488' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = '#E2E8F0' }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {busy && <span className="text-xs" style={{ color: '#94A3B8' }}>Searching…</span>}
        {!busy && value && (
          <button type="button" aria-label="Clear search" onClick={() => onChange('')}
            style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: 2 }}>
            <X className="w-4 h-4" />
          </button>
        )}
      </span>
    </div>
  )
}
