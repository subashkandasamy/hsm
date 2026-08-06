'use client'

import { useEffect, useState } from 'react'
import { searchDrugs } from '@/app/actions/pharmacy'
import type { Drug } from '@/lib/types'

// Debounced server-side drug typeahead. Replaces the old pattern of shipping the
// whole catalogue to the client and filtering in memory — the catalogue is now
// too large (~15k molecules / ~250k brands) for that.
export function useDrugSearch(query: string, limit = 20): Drug[] {
  const [results, setResults] = useState<Drug[]>([])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let active = true
    const t = setTimeout(() => {
      searchDrugs(q, limit)
        .then(r => { if (active) setResults(r) })
        .catch(() => { if (active) setResults([]) })
    }, 200)
    return () => { active = false; clearTimeout(t) }
  }, [query, limit])

  return results
}
