import assert from 'node:assert/strict'
import { AstmLink, checksum, ENQ, ACK, NAK, STX, ETX, ETB, EOT } from '../src/astm-link.js'

/**
 * The handshake, tested against the failure that matters.
 *
 * A connector that mangles a frame silently is worse than one that does not
 * run: the analyzer believes it delivered a result, and a wrong number reaches
 * a report with nothing to show anything went wrong. So the case worth the
 * most care is the corrupt frame — it must be refused, not quietly kept.
 */

let failures = 0
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${name}`) }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${(e as Error).message}`) }
}

/** Build a well-formed frame the way an analyzer would. */
function frame(text: string, seq = 1, terminator = ETX): Buffer {
  const body = Buffer.concat([Buffer.from(text, 'latin1'), Buffer.from([terminator])])
  return Buffer.concat([
    Buffer.from([STX]),
    Buffer.from(String(seq), 'latin1'),
    body,
    Buffer.from(checksum(Buffer.concat([Buffer.from(String(seq), 'latin1'), body])), 'latin1'),
    Buffer.from('\r\n', 'latin1'),
  ])
}

function harness() {
  const sent: number[] = []
  const messages: string[] = []
  const warnings: string[] = []
  const link = new AstmLink({
    onMessage: (raw) => messages.push(raw),
    send: (d) => sent.push(...d),
    onWarn: (m) => warnings.push(m),
  }, 50)
  return { link, sent, messages, warnings }
}

console.log('\nASTM link layer\n')

test('answers ENQ with ACK, or the analyzer gives up', () => {
  const h = harness()
  h.link.push(Buffer.from([ENQ]))
  assert.deepEqual(h.sent, [ACK])
})

test('acknowledges a good frame and keeps its text', () => {
  const h = harness()
  h.link.push(Buffer.from([ENQ]))
  h.link.push(frame('H|\\^&|||BC-5130^Mindray'))
  h.link.push(Buffer.from([EOT]))
  assert.deepEqual(h.sent, [ACK, ACK])
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /BC-5130\^Mindray/)
})

test('REFUSES a frame whose checksum is wrong', () => {
  const h = harness()
  const good = frame('R|1|^^^HGB|14.1|g/dL||N')
  // Corrupt the value on the wire, leaving the original checksum in place —
  // exactly what a bad cable does.
  const bad = Buffer.from(good.toString('latin1').replace('14.1', '99.9'), 'latin1')

  h.link.push(bad)
  assert.equal(h.sent[0], NAK, 'must NAK so the analyzer resends')
  h.link.push(Buffer.from([EOT]))
  assert.equal(h.messages.length, 0, 'a corrupt frame must not become a result')
})

test('a resend after NAK is accepted', () => {
  const h = harness()
  const good = frame('R|1|^^^HGB|14.1|g/dL||N')
  const bad = Buffer.from(good.toString('latin1').replace('14.1', '99.9'), 'latin1')

  h.link.push(bad)
  h.link.push(good)
  h.link.push(Buffer.from([EOT]))
  assert.deepEqual(h.sent, [NAK, ACK])
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /14\.1/)
  assert.doesNotMatch(h.messages[0], /99\.9/)
})

test('assembles a multi-frame transmission into one message', () => {
  const h = harness()
  h.link.push(Buffer.from([ENQ]))
  h.link.push(frame('H|\\^&|||BC-5130^Mindray', 1))
  h.link.push(frame('O|1|260923000101||^^^CBC', 2))
  h.link.push(frame('R|1|^^^HGB|14.1|g/dL||N', 3))
  h.link.push(Buffer.from([EOT]))
  assert.equal(h.messages.length, 1)
  const m = h.messages[0]
  assert.match(m, /^H\|/)
  assert.match(m, /260923000101/)
  assert.match(m, /HGB/)
})

test('keeps each record on its own line when frames carry no trailing CR', () => {
  // The bug an end-to-end run found and these tests did not: joining frames
  // end to end fused "…|P|1" and "P|1||||NAME" into one line, the O record
  // vanished, and results arrived attached to no patient. Substring assertions
  // all still passed, so this one checks the shape.
  const h = harness()
  h.link.push(frame('H|\\^&|||BC-5130^Mindray|||||||P|1', 1))
  h.link.push(frame('P|1||||SAMPLE PATIENT', 2))
  h.link.push(frame('O|1|260923000101||^^^CBC', 3))
  h.link.push(frame('R|1|^^^HGB|14.1|g/dL||N', 4))
  h.link.push(Buffer.from([EOT]))

  const lines = h.messages[0].split('\n').map((l) => l.trim()).filter(Boolean)
  assert.equal(lines.length, 4, `expected 4 records, got: ${JSON.stringify(lines)}`)
  assert.equal(lines[0][0], 'H')
  assert.equal(lines[1][0], 'P')
  assert.equal(lines[2][0], 'O')
  assert.equal(lines[3][0], 'R')
  // The specific fusion that broke it.
  assert.doesNotMatch(h.messages[0], /P\|1P\|1/)
})

test('records that already end in CR are not given a second one', () => {
  const h = harness()
  h.link.push(frame('H|\\^&|||BC-5130^Mindray\r', 1))
  h.link.push(frame('O|1|260923000101||^^^CBC\r', 2))
  h.link.push(Buffer.from([EOT]))
  const lines = h.messages[0].split('\n').map((l) => l.trim()).filter(Boolean)
  assert.equal(lines.length, 2, `expected 2 records, got: ${JSON.stringify(lines)}`)
})

test('a record split across ETB frames is rejoined, not broken apart', () => {
  // ETB means the record continues in the next frame. Inserting a separator
  // here would split one result into two unreadable halves.
  const h = harness()
  h.link.push(frame('R|1|^^^HGB|14', 1, ETB))
  h.link.push(frame('.1|g/dL||N', 2, ETX))
  h.link.push(Buffer.from([EOT]))
  const lines = h.messages[0].split('\n').map((l) => l.trim()).filter(Boolean)
  assert.equal(lines.length, 1, `expected 1 rejoined record, got: ${JSON.stringify(lines)}`)
  assert.match(lines[0], /\|14\.1\|/)
})

test('handles a frame split across two reads', () => {
  const h = harness()
  const f = frame('R|1|^^^PLT|250|10\\*9/L||N')
  h.link.push(f.subarray(0, 9))
  assert.equal(h.messages.length, 0)
  h.link.push(f.subarray(9))
  h.link.push(Buffer.from([EOT]))
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /250/)
})

test('accepts an analyzer that sends no handshake at all', () => {
  const h = harness()
  h.link.push(Buffer.from('H|\\^&|||Chem-5|||||||P|1\r', 'latin1'))
  h.link.push(Buffer.from('R|1|^^^GLU|96|mg/dL||N\r', 'latin1'))
  h.link.push(Buffer.from([EOT]))
  assert.equal(h.messages.length, 1)
  assert.match(h.messages[0], /GLU/)

  // The records must still be separable. This used to pass while every record
  // ran into the next, because it only looked for the code: the server splits
  // on newlines, so one joined line is a header with no results and the whole
  // message is silently lost.
  const records = h.messages[0].split('\n').filter(Boolean)
  assert.equal(records.length, 2, `expected two records, got ${JSON.stringify(records)}`)
  assert.ok(records[0].startsWith('H|'), 'the header is its own record')
  assert.ok(records[1].startsWith('R|'), 'and the result is its own')
})

test('a dropped line still delivers what was received', () => {
  const h = harness()
  h.link.push(frame('R|1|^^^WBC|8.4|10\\*9/L||N'))
  h.link.close()
  assert.equal(h.messages.length, 1, 'a real measurement must not be lost to a hangup')
  assert.match(h.warnings.join(' '), /not EOT/)
})

test('two analyzers cannot have their records interleaved', () => {
  // Separate links, as tcp.ts gives each connection.
  const a = harness()
  const b = harness()
  a.link.push(frame('O|1|AAA111||^^^CBC'))
  b.link.push(frame('O|1|BBB222||^^^CBC'))
  a.link.push(Buffer.from([EOT]))
  b.link.push(Buffer.from([EOT]))
  assert.match(a.messages[0], /AAA111/)
  assert.doesNotMatch(a.messages[0], /BBB222/)
  assert.match(b.messages[0], /BBB222/)
})

test('checksum matches the worked example in the standard', () => {
  // Sum of bytes mod 256, two uppercase hex digits.
  assert.equal(checksum(Buffer.from([0x01, 0x02, 0x03])), '06')
  assert.equal(checksum(Buffer.from([0xff, 0x02])), '01')
})

console.log(failures ? `\n${failures} failing\n` : '\nall passing\n')
process.exit(failures ? 1 : 0)
