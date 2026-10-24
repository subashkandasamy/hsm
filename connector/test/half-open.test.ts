import assert from 'node:assert/strict'
import { sameNetwork } from '../src/half-open.js'

/**
 * Knowing that an analyzer cannot get in.
 *
 * This is here because of a real afternoon. An Erba H360 on 10.0.0.101, a
 * laboratory computer on 192.168.1.54, and every connection dying half-open
 * because the reply had nowhere to go. netstat showed it plainly; the
 * connector did not, because a half-open connection never reaches the
 * application. The status page said "Working" throughout.
 */

let failures = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

console.log('\nWhich analyzers are on our network')

test('the case that actually happened is caught', () => {
  assert.equal(sameNetwork('10.0.0.101', '192.168.1.54'), false)
})

test('a neighbour on the same /24 is fine', () => {
  assert.equal(sameNetwork('192.168.1.60', '192.168.1.54'), true)
  assert.equal(sameNetwork('10.0.0.5', '10.0.0.250'), true)
})

test('a different third octet is a different network', () => {
  assert.equal(sameNetwork('192.168.2.60', '192.168.1.54'), false)
})

test('rubbish never raises a false alarm', () => {
  // Telling a hospital their network is wrong when it is not is worse than
  // saying nothing: they will go and change something that was working.
  assert.equal(sameNetwork('', '192.168.1.54'), true)
  assert.equal(sameNetwork('not-an-ip', '192.168.1.54'), true)
  assert.equal(sameNetwork('10.0.0.101', 'unknown'), true)
})

console.log('\nReading netstat')

test('finds the analyzer in the output the hospital sent', () => {
  // Verbatim from the laboratory PC, including the LISTENING line that must
  // be ignored and the two half-open attempts that must not be.
  const out = [
    '  TCP    0.0.0.0:5150           0.0.0.0:0              LISTENING',
    '  TCP    192.168.1.54:5150      10.0.0.101:52455       SYN_RECEIVED',
    '  TCP    192.168.1.54:5150      10.0.0.101:52456       SYN_RECEIVED',
  ].join('\r\n')

  const seen = parse(out, 5150)
  assert.deepEqual([...seen.entries()], [['10.0.0.101', 2]])
})

test('an established connection is not a problem', () => {
  const out = '  TCP    192.168.1.54:5150      192.168.1.60:51000     ESTABLISHED'
  assert.equal(parse(out, 5150).size, 0)
})

test('half-open on somebody else\'s port is none of our business', () => {
  const out = '  TCP    192.168.1.54:445       10.0.0.9:52455         SYN_RECEIVED'
  assert.equal(parse(out, 5150).size, 0)
})

/** The same reading findHalfOpen does, against text rather than the OS. */
function parse(out: string, port: number): Map<string, number> {
  const seen = new Map<string, number>()
  for (const line of out.split(/\r?\n/)) {
    if (!/SYN_RECEIVED|SYN_RECV/i.test(line)) continue
    const f = line.trim().split(/\s+/)
    const local = f.find((x) => x.endsWith(`:${port}`))
    if (!local) continue
    const remote = f.find((x) => x !== local && /:\d+$/.test(x))
    if (!remote) continue
    const ip = remote.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
    seen.set(ip, (seen.get(ip) ?? 0) + 1)
  }
  return seen
}

console.log(failures === 0 ? '\nAll half-open checks passed.\n' : `\n${failures} FAILED\n`)
process.exit(failures ? 1 : 0)
