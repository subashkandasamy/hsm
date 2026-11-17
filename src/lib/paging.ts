/**
 * Long lists are read one page at a time on the server: 25 rows to start, and
 * the viewer may ask for 50 or 100 — never the whole history at once (KMCH's
 * lab list carried 1 MB of old reports into every visit before this).
 */
export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25

export type Paged<T> = { rows: T[]; total: number; page: number; size: number }

/** A page number and size made safe, and the row range PostgREST wants. */
export function pageWindow(page?: unknown, size?: unknown): { page: number; size: number; from: number; to: number } {
  const s = (PAGE_SIZES as readonly number[]).includes(Number(size)) ? Number(size) : DEFAULT_PAGE_SIZE
  const p = Math.max(1, Math.floor(Number(page) || 1))
  return { page: p, size: s, from: (p - 1) * s, to: p * s - 1 }
}

/**
 * A search term safe to put inside a PostgREST filter: the characters that
 * separate or group filters (, ( ) :), its wildcards and quotes are dropped.
 */
export function searchTerm(q: unknown): string {
  return String(q ?? '').replace(/[,()*%\\:"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** A name to look for (letters only), as opposed to a number or code. */
export const isNameSearch = (s: string) => !!s && !/\d/.test(s)

/** YYYY-MM-DD, or null. */
export function ymdOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}
