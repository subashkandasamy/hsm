/**
 * A pretend Mindray BC-5130, speaking the real ASTM handshake.
 *
 * Used to prove an analyzer can actually reach the connector once it is
 * installed — which on Windows means the firewall rule worked and the
 * scheduled task really is listening, neither of which can be checked from a
 * developer's machine.
 *
 *   node fake-analyzer.mjs [host] [port] [barcode] [haemoglobin]
 *
 * It follows the protocol properly rather than dumping bytes: ENQ, wait for
 * ACK, one frame at a time with a real checksum, resend on NAK, EOT at the
 * end. A test that skipped the handshake would pass against a connector that
 * could never talk to a real instrument.
 */

import net from 'node:net'

const STX = 0x02, ETX = 0x03, EOT = 0x04, ENQ = 0x05, ACK = 0x06, NAK = 0x15

const host = process.argv[2] ?? '127.0.0.1'
const port = Number(process.argv[3] ?? 5150)
const barcode = process.argv[4] ?? '260923000101'
const hgb = process.argv[5] ?? '13.4'

const checksum = (buf) => {
  let s = 0
  for (const b of buf) s = (s + b) & 0xff
  return s.toString(16).toUpperCase().padStart(2, '0')
}

function frame(text, seq) {
  const withSeq = Buffer.concat([
    Buffer.from(String(seq), 'latin1'),
    Buffer.from(text, 'latin1'),
    Buffer.from([ETX]),
  ])
  return Buffer.concat([
    Buffer.from([STX]),
    withSeq,
    Buffer.from(checksum(withSeq), 'latin1'),
    Buffer.from('\r\n', 'latin1'),
  ])
}

// Each record carries its own trailing CR, as a real instrument sends it.
const records = [
  'H|\\^&|||BC-5130^Mindray|||||||P|1\r',
  'P|1||||CI TEST PATIENT\r',
  `O|1|${barcode}||^^^CBC\r`,
  `R|1|^^^HGB|${hgb}|g/dL||N\r`,
  'R|2|^^^PLT|305|10*9/L||N\r',
  'R|3|^^^WBC|7.2|10*9/L||N\r',
  'L|1|N\r',
]

const sock = net.connect(port, host, () => {
  console.log(`analyzer: connected to ${host}:${port}`)
  sock.write(Buffer.from([ENQ]))
})

let step = -1
sock.on('data', (d) => {
  for (const b of d) {
    if (b === ACK) {
      step++
      if (step < records.length) {
        sock.write(frame(records[step], step % 8))
      } else {
        console.log('analyzer: all frames acknowledged, sending EOT')
        sock.write(Buffer.from([EOT]))
        setTimeout(() => { sock.end(); process.exit(0) }, 500)
      }
    } else if (b === NAK) {
      console.log(`analyzer: NAK on frame ${step}, resending`)
      sock.write(frame(records[step], step % 8))
    }
  }
})

sock.on('error', (e) => { console.error(`analyzer: ${e.message}`); process.exit(1) })
setTimeout(() => { console.error('analyzer: timed out'); process.exit(1) }, 30_000)
