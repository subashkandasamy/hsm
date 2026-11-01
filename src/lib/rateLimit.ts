/**
 * A small fixed-window rate limiter for unauthenticated endpoints.
 *
 * Built on `createTtlCache`, so it inherits that cache's bound: entries are
 * capped and evicted, and a flood of distinct keys cannot grow memory without
 * limit. That matters here more than usual, because the keys are attacker-chosen
 * (client IPs).
 *
 * ## What this does not do, stated plainly
 *
 * The counters live in the process. On a serverless platform each instance keeps
 * its own, so the effective limit is `limit × instances`, and an instance that
 * spins up fresh starts every caller at zero. It is therefore **not** a defence
 * against a distributed flood, and it is not a security control — it is a cost
 * brake on the ordinary case: one client, one loop, one instance.
 *
 * Doing better needs shared state (Upstash/Redis, or a Postgres counter). A
 * Postgres counter was the obvious reach here and is the wrong tool for this
 * particular endpoint: it would add a write to every request to protect against
 * reads, making the cost problem worse at low volume to improve it at high
 * volume. If this endpoint ever justifies real limiting, the fix is a shared
 * store, not a bigger version of this.
 */

import { createTtlCache } from './ttlCache'

export interface RateLimitResult {
  ok: boolean
  /** Requests left in the current window (0 when limited). */
  remaining: number
  /** Whole seconds until the window resets — for `Retry-After`. */
  retryAfter: number
}

interface Window {
  count: number
  resetAt: number
}

/**
 * @param name    Namespace, so two endpoints never share a budget.
 * @param limit   Requests allowed per window.
 * @param windowMs Window length.
 * @param max     Distinct keys held at once; beyond this the oldest are evicted.
 */
export function createRateLimiter(opts: {
  name: string
  limit: number
  windowMs: number
  max?: number
}) {
  // TTL is the window: an expired entry is indistinguishable from a caller who
  // has not been seen, which is exactly the semantics of a fixed window.
  const windows = createTtlCache<Window>({ ttlMs: opts.windowMs, max: opts.max ?? 5000 })

  return function check(key: string): RateLimitResult {
    const now = Date.now()
    const k = `${opts.name}:${key}`
    const hit = windows.get(k)

    if (!hit || hit.resetAt <= now) {
      windows.set(k, { count: 1, resetAt: now + opts.windowMs })
      return { ok: true, remaining: opts.limit - 1, retryAfter: 0 }
    }

    // Mutated in place: the cache stores the object, and re-setting it would
    // restart the TTL and so extend the window every time a limited caller
    // knocked — which would let a fast enough loop hold the window open.
    hit.count++
    if (hit.count > opts.limit) {
      return { ok: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) }
    }
    return { ok: true, remaining: opts.limit - hit.count, retryAfter: 0 }
  }
}

/**
 * Best-effort client address. `x-forwarded-for` is the proxy's record of the
 * caller and is trusted only because the app is served from behind one; the
 * leftmost entry is the original client. A spoofed value lets a caller choose
 * its own bucket, which is another reason this is a cost brake and not a
 * security control.
 */
export function clientKey(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0].trim()
    if (first) return first
  }
  return headers.get('x-real-ip') ?? 'unknown'
}
