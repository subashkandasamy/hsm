import assert from 'node:assert/strict'
import { AstmLink, VT, FS, CR } from '../src/astm-link.js'

/**
 * MLLP, tested against the failure it exists to prevent.
 *
 * Before this, an HL7 instrument's bytes fell through to the unframed path,
 * where nothing says where a message ends. Two samples sent within the idle
 * window were concatenated into one message — two patients' results in one
 * envelope, which is the worst thing this layer could do.
 */

let failures = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

/** Wrap a message the way an analyzer does: <VT> message <FS><CR>. */
function mllp(message: string): Buffer {
  return Buffer.concat([
    Buffer.from([VT]),
    Buffer.from(message.replace(/\n/g, '\r'), 'latin1'),
    Buffer.from([FS, CR]),
  ])
}

function harness(idleMs = 50) {
  const sent: number[] = []
  const messages: string[] = []
  const link = new AstmLink({
    onMessage: (raw) => messages.push(raw),
    send: (d) => sent.push(...d),
  }, idleMs)
  return { link, sent, messages, sentText: () => Buffer.from(sent).toString('latin1') }
}

const ORU = [
  'MSH|^~\\&|H360|ERBA|UYIRLY|KMC|20261024120000||ORU^R01|42|P|2.3.1',
  'PID|1||UH-0007||KUMAR^RAVI||19900101|M',
  'OBR|1||2610240017|CBC',
  'OBX|1|NM|WBC||8.4|10*3/uL||N|||F',
].join('\n')

console.log('\nMLLP framing')

test('a complete message is released at once, not on the idle timeout', () => {
  const h = harness(10_000)   // a timeout long enough that it cannot be the cause
  h.link.push(mllp(ORU))
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /MSH\|/)
  assert.match(h.messages[0], /OBX\|1\|NM\|WBC/)
})

test('two samples on one connection stay two messages', () => {
  const h = harness(10_000)
  h.link.push(mllp(ORU))
  h.link.push(mllp(ORU.replace('2610240017', '2610240018').replace('|42|', '|43|')))
  assert.equal(h.messages.length, 2, 'the two must not be concatenated')
  assert.match(h.messages[0], /2610240017/)
  assert.match(h.messages[1], /2610240018/)
  assert.ok(!h.messages[0].includes('2610240018'), 'no leakage between samples')
})

test('a message split across TCP packets is reassembled', () => {
  const h = harness(10_000)
  const whole = mllp(ORU)
  // Split mid-segment, as a network will.
  h.link.push(whole.subarray(0, 37))
  assert.equal(h.messages.length, 0, 'nothing released while it is still arriving')
  h.link.push(whole.subarray(37))
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /OBX\|1\|NM\|WBC/)
})

test('an HL7 acknowledgement goes back, echoing the control id', () => {
  const h = harness()
  h.link.push(mllp(ORU))
  const reply = h.sentText()
  assert.ok(reply.startsWith('\x0b'), 'the ACK is MLLP-wrapped')
  assert.ok(reply.endsWith('\x1c\r'), 'and properly terminated')
  assert.match(reply, /MSA\|AA\|42/, 'accepted, against the control id the machine sent')
})

test('a message with no control id still gets an acknowledgement', () => {
  const h = harness()
  h.link.push(mllp('MSH|^~\\&|X|Y|A|B|2026||ORU^R01|||2.3\rOBX|1|NM|WBC||8.4||||||F'))
  assert.match(h.sentText(), /MSA\|AA\|/)
})

test('ASTM is untouched — a plain unframed dump still works', () => {
  const h = harness(30)
  h.link.push(Buffer.from('H|\\^&|||BC-5130^Mindray\rR|1|^^^WBC|8.4|10*9/L||N\r', 'latin1'))
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(h.messages.length, 1)
      assert.match(h.messages[0], /BC-5130/)
      resolve()
    }, 60)
  }) as unknown as void
})

setTimeout(() => {
  console.log(failures === 0 ? '\nAll MLLP checks passed.\n' : `\n${failures} FAILED\n`)
  process.exit(failures ? 1 : 0)
}, 150)
