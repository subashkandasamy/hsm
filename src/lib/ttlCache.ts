/**
 * A small bounded TTL cache, for values that are read on every request and
 * change almost never — a tenant's plan, the platform messaging switch, a
 * profile's tenant.
 *
 * Written once because the thing it replaces was written three times: the
 * proxy's `tenantCache` was a module-level `Map` with a 60-second TTL and **no
 * eviction at all**, so on a long-lived instance it grew without bound (F-20).
 * This audit has already produced four findings about duplicated logic that
 * drifted (F-17, F-31, F-67, and the two route lists), so the fix is one
 * implementation rather than three careful ones.
 *
 * Caveats that come with caching in a serverless process, and are deliberate:
 *
 * - Each instance keeps its own copy, so a change takes effect between 0 and
 *   `ttlMs` later, per instance, unpredictably. That is acceptable for a
 *   billing gate — suspending a tenant is not the thing keeping their data
 *   safe, RLS is — and it is not acceptable for anything a clinician reads, so
 *   nothing clinical goes in here.
 * - Eviction is insertion-order (FIFO), not LRU. For a few hundred tenants on
 *   one instance the distinction does not pay for the bookkeeping.
 */
export interface TtlCache<V> {
  get(key: string): V | undefined
  set(key: string, value: V): void
  /** Entries currently held, expired ones included. Exposed for tests. */
  readonly size: number
}

export function createTtlCache<V>(opts: { ttlMs: number; max: number }): TtlCache<V> {
  const map = new Map<string, { value: V; at: number }>()

  return {
    get(key) {
      const hit = map.get(key)
      if (!hit) return undefined
      if (Date.now() - hit.at >= opts.ttlMs) {
        map.delete(key)
        return undefined
      }
      return hit.value
    },

    set(key, value) {
      if (!map.has(key) && map.size >= opts.max) {
        // Drop whatever has expired first — that is free and usually enough.
        const now = Date.now()
        for (const [k, v] of map) {
          if (now - v.at >= opts.ttlMs) map.delete(k)
        }
        // Still full: drop the oldest insertions until there is room. Without
        // this the map was unbounded, which is the actual defect.
        while (map.size >= opts.max) {
          const oldest = map.keys().next()
          if (oldest.done) break
          map.delete(oldest.value)
        }
      }
      map.set(key, { value, at: Date.now() })
    },

    get size() {
      return map.size
    },
  }
}
