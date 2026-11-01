/**
 * verify:ttl-cache — the bounded cache must actually stay bounded.
 *
 * F-20 was a module-level Map with a TTL check on read and no eviction ever, so
 * a long-lived serverless instance grew without limit. "It has a TTL" is not
 * the same as "it forgets things" — an entry only expired if somebody asked for
 * that exact key again, and nobody asks for a slug that stopped being used.
 *
 * Run: npm run verify:ttl-cache
 */
import { createTtlCache } from '../src/lib/ttlCache'

async function main() {
let bad = 0
const check = (label: string, got: unknown, want: unknown) => {
  const ok = got === want
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} -> ${JSON.stringify(got)}`)
  if (!ok) bad++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── it caches ───────────────────────────────────────────────────────────────
const c = createTtlCache<string>({ ttlMs: 60_000, max: 3 })
c.set('a', 'A')
check('a hit returns the value', c.get('a'), 'A')
check('a miss returns undefined', c.get('nope'), undefined)

// ── it stays bounded, which is the whole point ──────────────────────────────
for (let i = 0; i < 50; i++) c.set(`k${i}`, `v${i}`)
check('50 inserts into a max-3 cache leaves 3', c.size, 3)
check('the newest survives', c.get('k49'), 'v49')
check('the oldest is gone', c.get('k0'), undefined)

// ── TTL still expires on read ───────────────────────────────────────────────
const t = createTtlCache<string>({ ttlMs: 40, max: 10 })
t.set('x', 'X')
check('fresh entry is readable', t.get('x'), 'X')
await sleep(60)
check('expired entry is not returned', t.get('x'), undefined)
check('and is dropped from the map on read', t.size, 0)

// ── expired entries are reclaimed before the oldest live one is evicted ─────
const r = createTtlCache<string>({ ttlMs: 40, max: 4 })
r.set('old1', '1'); r.set('old2', '2')
await sleep(60)                       // both now expired but still held
r.set('new1', 'A'); r.set('new2', 'B'); r.set('new3', 'C')
r.set('new4', 'D')                    // triggers the sweep
check('expired entries were reclaimed, live ones kept', r.get('new1'), 'A')
check('still bounded after the sweep', r.size <= 4, true)

console.log(bad === 0 ? '\nthe cache is bounded and expires' : `\n${bad} FAILED`)
process.exit(bad === 0 ? 0 : 1)
}

void main()
