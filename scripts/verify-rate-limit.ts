/**
 * The rate limiter, including the mistake it would be easy to make.
 *
 *   npm run verify:rate-limit
 *
 * A limiter is worth testing because its failure modes are quiet in both
 * directions: too loose and it does nothing, too tight and it turns away real
 * users. The interesting case is the third one — a limiter that can be held
 * open forever by the very traffic it is supposed to stop.
 */

import { createRateLimiter, clientKey } from '../src/lib/rateLimit'

let failed = 0
function check(ok: boolean, label: string, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** A failed expectation inside a tight loop, counted without 300 lines of output. */
let silentFailures = 0
function check_silent(ok: boolean) {
  if (!ok) silentFailures++
}

async function main() {
  console.log('\nThe budget')
  {
    const limit = createRateLimiter({ name: 't', limit: 3, windowMs: 1000 })
    const verdicts = [limit('a'), limit('a'), limit('a'), limit('a')]
    check(verdicts.slice(0, 3).every((v) => v.ok), 'the first three are allowed')
    check(verdicts[3].ok === false, 'the fourth is refused')
    check(verdicts[0].remaining === 2 && verdicts[2].remaining === 0,
      'remaining counts down to zero', verdicts.map((v) => v.remaining))
    check(verdicts[3].retryAfter >= 1, 'a refusal carries a Retry-After', verdicts[3].retryAfter)
  }

  console.log('\nCallers are independent')
  {
    const limit = createRateLimiter({ name: 't', limit: 2, windowMs: 1000 })
    limit('a'); limit('a')
    check(limit('a').ok === false, 'caller a is spent')
    check(limit('b').ok === true, 'caller b is unaffected')
  }

  console.log('\nNamespaces do not share a budget')
  {
    const one = createRateLimiter({ name: 'one', limit: 1, windowMs: 1000 })
    const two = createRateLimiter({ name: 'two', limit: 1, windowMs: 1000 })
    one('a'); two('a')
    check(one('a').ok === false && two('a').ok === false,
      'each endpoint spends its own budget for the same caller')
  }

  console.log('\nThe window reopens')
  {
    const limit = createRateLimiter({ name: 't', limit: 2, windowMs: 300 })
    limit('a'); limit('a')
    check(limit('a').ok === false, 'spent inside the window')
    await sleep(350)
    check(limit('a').ok === true, 'and allowed again once it has passed')
  }

  // The trap: if a refused request re-set the cache entry, its TTL would
  // restart, so a caller hammering the endpoint would keep its own window alive
  // and never be let back in — a limiter that punishes retries indefinitely.
  // The implementation mutates the stored window in place for this reason.
  console.log('\nKnocking must not extend the window (the trap)')
  {
    // Fill the budget at t=0, then knock continuously until t=300 — as a client
    // retrying in a loop would. The window is 400ms from t=0, so at t=450 the
    // caller must be served again. If a refused request re-set the cache entry,
    // its TTL would restart on every knock and the window would end at
    // 300 + 400 = 700ms, so this would still be refused — the caller would be
    // locked out for as long as it kept trying.
    const WINDOW = 400
    const limit = createRateLimiter({ name: 't', limit: 2, windowMs: WINDOW })
    const t0 = Date.now()
    limit('a'); limit('a')
    while (Date.now() - t0 < 300) {
      check_silent(limit('a').ok === false)
      await sleep(10)
    }
    await sleep(Math.max(0, t0 + WINDOW + 50 - Date.now()))
    const after = limit('a')
    check(after.ok === true,
      'served again one window after the FIRST request, not after the last knock', {
        elapsedMs: Date.now() - t0, windowMs: WINDOW,
      })
  }

  console.log('\nMemory is bounded (the keys are attacker-chosen)')
  {
    const limit = createRateLimiter({ name: 't', limit: 1, windowMs: 60_000, max: 50 })
    for (let i = 0; i < 5000; i++) limit(`ip-${i}`)
    // Nothing to assert beyond "it did not grow without bound"; the cap lives in
    // createTtlCache and verify:ttl-cache covers eviction. This asserts the
    // limiter still answers correctly after a flood of distinct keys.
    check(limit('ip-fresh').ok === true, 'a new caller is still served after 5,000 distinct keys')
  }

  console.log('\nThe client key')
  {
    const h = (init: Record<string, string>) => new Headers(init)
    check(clientKey(h({ 'x-forwarded-for': '1.2.3.4' })) === '1.2.3.4', 'reads x-forwarded-for')
    check(clientKey(h({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' })) === '1.2.3.4',
      'takes the leftmost entry — the original client, not the proxies')
    check(clientKey(h({ 'x-forwarded-for': '  1.2.3.4  ' })) === '1.2.3.4', 'and trims it')
    check(clientKey(h({ 'x-real-ip': '5.6.7.8' })) === '5.6.7.8', 'falls back to x-real-ip')
    check(clientKey(h({})) === 'unknown', 'and to a single shared bucket when there is nothing')
    check(clientKey(h({ 'x-forwarded-for': '' })) === 'unknown',
      'an empty header does not become an empty key')
  }

  check(silentFailures === 0, 'every knock inside the window was refused', { silentFailures })

  console.log(failed === 0 ? '\nThe limiter behaves.\n' : `\n${failed} check(s) FAILED.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

void main()
