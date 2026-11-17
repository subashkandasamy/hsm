'use client'

import { useEffect, useState } from 'react'
import { PAGE_SIZES } from '@/lib/paging'

/**
 * A list's place — tab, search, page, rows per page — kept in the address, so
 * a refresh or Back lands on the same page. Replaces the current history entry
 * (Next.js keeps useSearchParams in step), so paging does not fill the history.
 */
export function writeListUrl(params: Record<string, string | number | null | undefined>, defaults: Record<string, string | number> = {}) {
  const sp = new URLSearchParams(window.location.search)
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '' || String(v) === String(defaults[k] ?? '')) sp.delete(k)
    else sp.set(k, String(v))
  }
  const qs = sp.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
}

/** Rows per page the viewer chose on this list before (this browser only). */
export function rememberedSize(list: string): number | null {
  try {
    const n = Number(localStorage.getItem(`uyirly:page-size:${list}`))
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : null
  } catch { return null }
}
export function rememberSize(list: string, size: number) {
  try { localStorage.setItem(`uyirly:page-size:${list}`, String(size)) } catch { /* private window */ }
}

/** The value once it has stopped changing for `ms` (typing in a search box). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}
