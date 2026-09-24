/**
 * A pretend Uyirly, for testing the Windows install without a real one.
 *
 * The point of the Windows test is the install: the PowerShell script, the
 * firewall rule, the scheduled task, and whether an analyzer can actually
 * reach the connector afterwards. None of that needs the real server, and
 * pointing continuous integration at production would mean a live pairing
 * code in a repository secret and test rows appearing in a hospital's account.
 *
 * So this implements the three endpoints the connector talks to, records what
 * arrives, and writes it to a file the workflow asserts against.
 *
 *   node mock-server.mjs <port> <received.json>
 */

import http from 'node:http'
import { writeFileSync } from 'node:fs'

const port = Number(process.argv[2] ?? 8787)
const outFile = process.argv[3] ?? 'received.json'

const TOKEN = 'mock-token-for-windows-ci'
const received = { paired: null, messages: [], pings: 0 }

const save = () => writeFileSync(outFile, JSON.stringify(received, null, 2))
save()

const read = (req) => new Promise((resolve) => {
  let b = ''
  req.on('data', (c) => { b += c })
  req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
})

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  const auth = (req.headers.authorization ?? '').replace('Bearer ', '')

  if (url.pathname === '/api/device/pair' && req.method === 'POST') {
    const body = await read(req)
    // Mirrors the real endpoint: any code is accepted here, because what is
    // under test is the installer handing one over, not the code itself.
    received.paired = { code: body.code, machineName: body.machineName, lanIp: body.lanIp, version: body.version }
    save()
    return send(res, 200, {
      token: TOKEN,
      connectorId: '00000000-0000-0000-0000-00000000ci01',
      connectorName: 'CI test PC',
      hospital: 'CI Mock Hospital',
      listenPort: 5150,
      resultsUrl: '/api/device/lab/results',
    })
  }

  if (url.pathname === '/api/device/ping' && req.method === 'GET') {
    if (auth !== TOKEN) return send(res, 401, { error: 'bad token' })
    received.pings++
    save()
    return send(res, 200, {
      ok: true, hospital: 'CI Mock Hospital', connectorName: 'CI test PC',
      listenPort: 5150, analyzersSeen: 0, needingAttention: 0,
      serverTime: new Date().toISOString(),
    })
  }

  if (url.pathname === '/api/device/lab/results' && req.method === 'POST') {
    if (auth !== TOKEN) return send(res, 401, { error: 'bad token' })
    const body = await read(req)
    if (received.messages.some((m) => m.idempotencyKey === body.idempotencyKey)) {
      return send(res, 200, { status: 'duplicate', message: 'Already received' })
    }
    received.messages.push({
      idempotencyKey: body.idempotencyKey,
      source: body.source,
      lanIp: body.lanIp,
      machineName: body.machineName,
      version: body.version,
      raw: body.raw,
    })
    save()
    return send(res, 200, { status: 'matched', written: 3, unmapped: [] })
  }

  send(res, 404, { error: 'not found' })
// Bound explicitly to IPv4 loopback. Left to itself Node binds the
// unspecified address, and on Windows that is an IPv6 socket whose IPv4
// mapping is not something to rely on when the client asks for 127.0.0.1.
}).listen(port, '127.0.0.1', () => console.log(`mock Uyirly listening on 127.0.0.1:${port}`))
