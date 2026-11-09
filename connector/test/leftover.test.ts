import assert from 'node:assert/strict'
import { AstmLink, readable } from '../src/astm-link.js'

/**
 * Bytes that never become a complete frame must not vanish on disconnect.
 *
 * Seen at Karur, 9 Nov 2026: the Erba ECL 105 connected, sent, disconnected
 * and retried every few seconds, and the connector logged nothing it had
 * sent — partial data was dropped on close. Now it is kept as a message and
 * the log says, readably, how the conversation began.
 */

let failures = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${name}`) } catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

function harness() {
  const messages: string[] = []
  const warns: string[] = []
  const sent: Buffer[] = []
  const link = new AstmLink({
    onMessage: (m) => messages.push(m),
    send: (b) => sent.push(b),
    onWarn: (w) => warns.push(w),
  }, 60_000)
  return { link, messages, warns, sent }
}

console.log('\nLeftover bytes on disconnect\n')

test('an MLLP message with no <FS> is kept, not dropped', () => {
  const h = harness()
  h.link.push(Buffer.from('\x0bMSH|^~\\&|ECL105|ERBA\rOBR|1||S1\rOBX|1|NM|APTT||27.1|s'))
  h.link.close()
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /APTT/)
  assert.ok(h.warns.some((w) => /unrecognised byte/.test(w) && /<VT>MSH/.test(w)), h.warns.join(' | '))
})

test('text with no line ending is kept', () => {
  const h = harness()
  h.link.push(Buffer.from('APTT;27.1;sec'))
  h.link.close()
  assert.deepEqual(h.messages, ['APTT;27.1;sec'])
})

test('a frame with no <ETX> is kept', () => {
  const h = harness()
  h.link.push(Buffer.from('\x021H|\\^&|||ECL105\r'))
  h.link.close()
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /ECL105/)
})

test('a complete MLLP message is unchanged (no duplicate on close)', () => {
  const h = harness()
  h.link.push(Buffer.from('\x0bMSH|^~\\&|X|Y|||||ORU^R01|1|P|2.5\rOBX|1|NM|WBC||7|x\r\x1c\r'))
  h.link.close()
  assert.equal(h.messages.length, 1)
  assert.equal(h.warns.length, 0)
})

test('nothing sent → nothing queued', () => {
  const h = harness()
  h.link.close()
  assert.equal(h.messages.length, 0)
  assert.deepEqual(h.link.summary(), { bytes: 0, began: '' })
})

test('summary names control characters so a photo of the log can be read', () => {
  const h = harness()
  h.link.push(Buffer.from([0x05]))
  h.link.push(Buffer.from('\x021H|\\^&\r\x03A1\r\n'))
  const s = h.link.summary()
  assert.equal(s.bytes, 14)
  assert.ok(s.began.startsWith('<ENQ><STX>1H|'), s.began)
  assert.equal(readable(Buffer.from([0xff, 0x41])), '<ff>A')
})

// Async: needs real silence. Run after the synchronous checks.
await (async () => {
  const messages: string[] = []
  const link = new AstmLink({ onMessage: (m) => messages.push(m), send: () => {} }, 40)
  link.push(Buffer.from('Na 140 K 4.1 Cl 102'))   // no CR, no LF — the port stays open
  await new Promise((r) => setTimeout(r, 120))
  test('text with no line ending is released after silence, port still open', () => {
    assert.deepEqual(messages, ['Na 140 K 4.1 Cl 102'])
  })
})()

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
