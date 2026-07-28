'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search } from 'lucide-react'
import { searchIcd } from '@/app/actions/emrHistory'
import type { IcdCode } from '@/lib/types'

interface Props {
  onPick: (code: string, title: string) => void
  placeholder?: string
  initialQuery?: string
}

// Debounced ICD-10 autocomplete. On select, calls onPick(code, title).
export default function IcdPicker({ onPick, placeholder = 'Search ICD-10 (code or diagnosis)…', initialQuery = '' }: Props) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<IcdCode[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (query: string) => {
    const r = await searchIcd(query)
    setResults(r); setOpen(r.length > 0)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) doSearch(q); else { setResults([]); setOpen(false) } }, 250)
    return () => clearTimeout(t)
  }, [q, doSearch])

  return (
    <div className="relative" ref={boxRef}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#94A3B8' }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        onFocus={() => setOpen(results.length > 0)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem', borderRadius: '0.75rem', fontSize: '0.875rem', background: '#fff', border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none' }} />
      {open && results.length > 0 && (
        <ul className="mt-1 absolute z-50 left-0 right-0 rounded-xl overflow-hidden shadow-lg"
          style={{ background: '#fff', border: '1px solid #E2E8F0', maxHeight: '14rem', overflowY: 'auto' }}>
          {results.map((r) => (
            <li key={r.code}>
              <button type="button"
                onMouseDown={() => { onPick(r.code, r.title); setQ(`${r.code} — ${r.title}`); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(13,148,136,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(13,148,136,0.08)', color: '#0D9488' }}>{r.code}</span>
                <span style={{ color: '#0F172A' }}>{r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
