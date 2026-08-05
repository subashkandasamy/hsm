'use client'

import { useMemo, useState } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { DRUGS, RULES, type Schedule } from './drugs'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

const FILTERS: { key: 'all' | Schedule; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'H', label: 'H' },
  { key: 'H1', label: 'H1' },
  { key: 'X', label: 'X' },
  { key: 'OTC', label: 'OTC' },
]

export default function DrugLookup() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | Schedule>('all')

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    return DRUGS.filter((d) => {
      if (filter !== 'all' && d.schedule !== filter) return false
      if (!term) return true
      return d.name.toLowerCase().includes(term) || (d.aka?.toLowerCase().includes(term) ?? false)
    }).sort((a, b) => a.name.localeCompare(b.name))
  }, [q, filter])

  return (
    <div>
      {/* Search + filters */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: SLATE4 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a medicine (e.g. Cefixime, Alprazolam, Amoxicillin)…"
          className="w-full pl-10 pr-3 py-3 rounded-xl text-sm" style={{ background: '#fff', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' }} />
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={filter === f.key ? { background: TEAL, color: '#fff', border: 'none' } : { background: '#fff', color: SLATE6, border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: SLATE4 }}>
            No match in this reference list. Verify against the current official schedule.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
            {results.map((d) => {
              const r = RULES[d.schedule]
              return (
                <div key={d.name} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-[11px] font-bold px-2 py-1 rounded-md flex-shrink-0" style={{ background: r.bg, color: r.color, minWidth: 78, textAlign: 'center' }}>
                    {r.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: SLATE9 }}>{d.name}{d.aka && <span className="font-normal" style={{ color: SLATE4 }}> · {d.aka}</span>}</p>
                    <p className="text-xs leading-relaxed mt-0.5" style={{ color: SLATE6 }}>{r.rule}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <p className="text-xs mt-2" style={{ color: SLATE4 }}>{results.length} result{results.length !== 1 ? 's' : ''}</p>

      {/* Disclaimer */}
      <div className="mt-4 rounded-xl px-3.5 py-3 flex items-start gap-2 text-xs leading-relaxed"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: SLATE6 }}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
        <span>This is a curated reference of common drugs, not the full official list. The Schedule H1 list is updated periodically — always confirm a drug’s current schedule against the Drugs and Cosmetics Rules before dispensing.</span>
      </div>
    </div>
  )
}
