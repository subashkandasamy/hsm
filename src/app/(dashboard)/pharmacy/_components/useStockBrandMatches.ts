'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { matchStockBrands } from '@/app/actions/pharmacy'
import { useDebounced } from '@/lib/listUrl'
import type { DrugWithStock } from '@/lib/types'

/**
 * Brands from the whole catalogue that match what is typed, for the medicines
 * in stock: medicine id → one matching brand. The stock list carries only the
 * brands on the shelf, so "Calpol" finds the paracetamol on the shelf even
 * when it was bought as Dolo. Empty until the server answers for this text.
 */
export function useStockBrandMatches(query: string, drugs: DrugWithStock[]): Record<string, string> {
  const live = query.trim().toLowerCase()
  const typed = useDebounced(live, 250)
  const ids = useMemo(() => drugs.filter((d) => d.is_global).map((d) => d.id), [drugs])
  const [found, setFound] = useState<{ q: string; ids: string[]; map: Record<string, string> }>({ q: '', ids: [], map: {} })
  const ask = useRef(0)

  useEffect(() => {
    const mine = ++ask.current
    if (typed.length < 2 || !ids.length) return
    matchStockBrands(typed, ids)
      .then((map) => { if (mine === ask.current) setFound({ q: typed, ids, map }) })
      .catch(() => { /* brand search is extra; names and shelf brands still match */ })
  }, [typed, ids])

  // An answer for an earlier text still holds while it is being extended
  // ("dol" → "dolo"), but only for the brands that still contain it.
  return useMemo(() => {
    const out: Record<string, string> = {}
    if (live.length < 2 || !found.q || !live.startsWith(found.q) || found.ids !== ids) return out
    for (const [id, brand] of Object.entries(found.map)) if (brand.toLowerCase().includes(live)) out[id] = brand
    return out
  }, [live, found, ids])
}
