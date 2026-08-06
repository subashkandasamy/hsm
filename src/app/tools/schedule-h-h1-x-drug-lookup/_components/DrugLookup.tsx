'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, AlertTriangle, Loader2 } from 'lucide-react'
import { RULES, type Schedule } from '@/lib/drugs/catalogue'

const TEAL = '#0D9488'
const SLATE9 = '#0F172A'
const SLATE6 = '#475569'
const SLATE4 = '#94A3B8'
const BORDER = '#E2E8F0'

type Brand = { name: string; mrp: number | null }
type Result = {
  generic: string
  schedule: string | null
  form: string | null
  strength: string | null
  brands: Brand[]
  priceMin: number | null
  priceMax: number | null
}

const SCHEDULES = new Set<string>(['H', 'H1', 'X', 'G', 'OTC'])
const money = (n: number) => `₹${n % 1 === 0 ? n : n.toFixed(2)}`

export default function DrugLookup() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tools/drug-search?q=${encodeURIComponent(term)}`)
        const json = await res.json()
        if (id === seq.current) { setResults(json.results ?? []); setLoading(false) }
      } catch {
        if (id === seq.current) { setResults([]); setLoading(false) }
      }
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: SLATE4 }} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setTouched(true) }}
          placeholder="Search any medicine — brand or generic (e.g. Augmentin, Dolo 650, Pan 40, Cefixime)…"
          className="w-full pl-10 pr-3 py-3 rounded-xl text-sm" style={{ background: '#fff', border: `1px solid ${BORDER}`, color: SLATE9, outline: 'none' }} />
        {loading && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: SLATE4 }} />}
      </div>

      {/* Results */}
      {q.trim().length >= 2 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
          {results.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm" style={{ color: SLATE4 }}>
              No medicine found for “{q.trim()}”. Try a different brand or generic name.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F1F5F9' }}>
              {results.map((d, i) => {
                const sched = d.schedule && SCHEDULES.has(d.schedule) ? RULES[d.schedule as Schedule] : null
                return (
                  <div key={`${d.generic}-${i}`} className="flex items-start gap-3 px-4 py-3">
                    <span className="text-[11px] font-bold px-2 py-1 rounded-md flex-shrink-0"
                      style={sched
                        ? { background: sched.bg, color: sched.color, minWidth: 78, textAlign: 'center' }
                        : { background: '#F1F5F9', color: SLATE4, minWidth: 78, textAlign: 'center' }}>
                      {sched ? sched.label : 'Unlisted'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: SLATE9 }}>
                        {d.generic}
                        {d.strength && <span className="font-normal" style={{ color: SLATE6 }}> · {d.strength}</span>}
                        {d.form && <span className="font-normal" style={{ color: SLATE4 }}> · {d.form}</span>}
                      </p>
                      {d.brands.length > 0 && (
                        <p className="text-xs mt-1" style={{ color: SLATE6 }}>
                          <span style={{ color: SLATE4 }}>Brands: </span>
                          {d.brands.slice(0, 6).map((b, j) => (
                            <span key={j}>
                              {j > 0 && ', '}
                              {b.name}{b.mrp != null && <span style={{ color: SLATE4 }}> ({money(b.mrp)})</span>}
                            </span>
                          ))}
                          {d.brands.length > 6 && <span style={{ color: SLATE4 }}> +{d.brands.length - 6} more</span>}
                        </p>
                      )}
                      {sched && <p className="text-xs leading-relaxed mt-1" style={{ color: SLATE6 }}>{sched.rule}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {!touched && (
        <p className="text-sm" style={{ color: SLATE4 }}>Start typing a medicine name to search the catalogue.</p>
      )}

      {/* Disclaimer */}
      <div className="mt-4 rounded-xl px-3.5 py-3 flex items-start gap-2 text-xs leading-relaxed"
        style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: SLATE6 }}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
        <span>Searches a catalogue of Indian medicines with representative brand names and MRPs. Schedule labels are shown where classified; drugs marked “Unlisted” are not yet schedule-tagged — always confirm a drug’s current schedule against the Drugs and Cosmetics Rules before dispensing. Prices are indicative MRPs, not live.</span>
      </div>
    </div>
  )
}
