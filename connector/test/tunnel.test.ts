import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { TunnelSupervisor, ensureCloudflared, type TunnelState } from '../src/tunnel.js'
import { createHash } from 'node:crypto'
import { startHeartbeat } from '../src/heartbeat.js'
import type { Config } from '../src/config.js'

/**
 * The internet link, tested without the internet.
 *
 * cloudflared is replaced by a small fake that answers /ready the way the real
 * one does (200 once connected, cloudflared metrics/readiness.go) and records
 * how it was started. Uyirly's /api/device/tunnel is replaced by a stub. So
 * nothing here opens a tunnel or touches Cloudflare.
 *
 * What matters: the token never appears on the command line, switching off
 * really stops the process, a missing cloudflared is reported rather than
 * crashing, and a crash is restarted.
 */

let failures = 0
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn())
    .then(() => console.log(`  ok    ${name}`))
    .catch((e: Error) => { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`) })
}

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uyirly-tunnel-'))
const record = path.join(dir, 'started.json')
const fake = path.join(dir, 'fake-cloudflared')
// Behaves like cloudflared for our purposes: reads --metrics, serves /ready,
// and exits on SIGTERM. FAKE_MODE=crash exits at once, like a bad token.
await fs.writeFile(fake, `#!/usr/bin/env node
const http = require('node:http')
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args, token: process.env.TUNNEL_TOKEN ?? null }))
if (process.env.FAKE_MODE === 'crash') process.exit(1)
const addr = args[args.indexOf('--metrics') + 1]
const port = Number(addr.split(':')[1])
http.createServer((req, res) => {
  if (req.url === '/ready') { res.writeHead(200); res.end(JSON.stringify({ status: 200, readyConnections: 4 })) }
  else { res.writeHead(404); res.end() }
}).listen(port, '127.0.0.1')
process.on('SIGTERM', () => process.exit(0))
`, { mode: 0o755 })

const config: Config = {
  token: 'connector-bearer', serverUrl: 'https://demo.example', connectorId: 'c1',
  connectorName: 'Lab PC', hospital: 'Demo', listenPort: 5150, serial: [], watchFolders: [],
  pairedAt: new Date().toISOString(),
}

let tunnelReply: { status: number; body: Record<string, unknown> } = {
  status: 200, body: { enabled: true, token: 'secret-run-token', hostname: 'c-abc.files.test' },
}
const stubFetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url)
  if (u.endsWith('/api/device/tunnel')) {
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer connector-bearer')
    return new Response(JSON.stringify(tunnelReply.body), { status: tunnelReply.status })
  }
  return fetch(url, init)   // the fake's /ready on loopback
}) as typeof fetch

async function waitFor(pred: () => boolean, ms: number, what: string) {
  const until = Date.now() + ms
  while (Date.now() < until) { if (pred()) return; await new Promise((r) => setTimeout(r, 100)) }
  throw new Error(`timed out waiting for ${what}`)
}

console.log('\nInternet link (tunnel supervisor)\n')

await test('no cloudflared beside the program → "missing", nothing started', async () => {
  const states: TunnelState[] = []
  const t = new TunnelSupervisor(config, { findBinary: () => null, fetchImpl: stubFetch, onState: (s) => states.push(s) })
  t.setWanted(true)
  await waitFor(() => t.state === 'missing', 2_000, 'missing')
  t.stop()
  assert.equal(t.state, 'off')
})

await test('switched on → starts cloudflared, reports up once /ready says 200', async () => {
  await fs.rm(record, { force: true })
  const t = new TunnelSupervisor(config, { findBinary: () => fake, fetchImpl: stubFetch, metricsPort: 55153 })
  t.setWanted(true)
  await waitFor(() => t.state === 'up', 10_000, 'up')
  assert.equal(t.publicHostname, 'c-abc.files.test')
  const started = JSON.parse(await fs.readFile(record, 'utf8')) as { args: string[]; token: string | null }
  assert.equal(started.token, 'secret-run-token', 'token handed over in TUNNEL_TOKEN')
  assert.ok(!started.args.join(' ').includes('secret-run-token'), 'token must never be on the command line')
  assert.deepEqual(started.args, ['tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:55153', 'run'])

  t.setWanted(true)   // the next heartbeat repeats itself
  assert.equal(t.state, 'up', 'repeating "on" must not restart it')

  t.setWanted(false)
  assert.equal(t.state, 'off')
  // The process is really gone: /ready stops answering.
  await waitFor(() => false, 600, 'settle').catch(() => {})
  let answered = true
  try { await fetch('http://127.0.0.1:55153/ready', { signal: AbortSignal.timeout(1_000) }) } catch { answered = false }
  assert.equal(answered, false, 'switching off must stop cloudflared')
})

await test('switched off at Uyirly between heartbeat and token → stays off', async () => {
  tunnelReply = { status: 200, body: { enabled: false } }
  const t = new TunnelSupervisor(config, { findBinary: () => fake, fetchImpl: stubFetch, metricsPort: 55154 })
  t.setWanted(true)
  await waitFor(() => t.state === 'off', 3_000, 'off')
  t.stop()
  tunnelReply = { status: 200, body: { enabled: true, token: 'secret-run-token', hostname: 'c-abc.files.test' } }
})

await test('Uyirly cannot hand over the token → down, retried later (no crash)', async () => {
  tunnelReply = { status: 503, body: { error: 'Could not reach Cloudflare' } }
  const t = new TunnelSupervisor(config, { findBinary: () => fake, fetchImpl: stubFetch, metricsPort: 55155 })
  t.setWanted(true)
  await waitFor(() => t.state === 'down', 3_000, 'down')
  t.stop()
  assert.equal(t.state, 'off')
  tunnelReply = { status: 200, body: { enabled: true, token: 'secret-run-token', hostname: 'c-abc.files.test' } }
})

await test('cloudflared exits on its own → down, then started again', async () => {
  process.env.FAKE_MODE = 'crash'
  await fs.rm(record, { force: true })
  const t = new TunnelSupervisor(config, { findBinary: () => fake, fetchImpl: stubFetch, metricsPort: 55156 })
  t.setWanted(true)
  await waitFor(() => t.state === 'down', 5_000, 'down after crash')
  // Restart is scheduled after the first backoff (5 s); let the fake behave now.
  delete process.env.FAKE_MODE
  await waitFor(() => t.state === 'up', 15_000, 'up after restart')
  t.stop()
})

console.log('\nDownloading cloudflared on first use\n')

await test('downloads, checks the fingerprint, then puts it in place', async () => {
  const body = Buffer.from('pretend cloudflared binary')
  const sha = createHash('sha256').update(body).digest('hex')
  const binDir = path.join(dir, 'bin-ok')
  const got = await ensureCloudflared({
    dir: binDir, platform: 'win32', sha256: sha, url: 'https://example/cf.exe',
    fetchImpl: (async () => new Response(body)) as unknown as typeof fetch,
  })
  assert.ok('path' in got, JSON.stringify(got))
  assert.deepEqual(await fs.readFile(path.join(binDir, 'cloudflared.exe')), body)
  assert.ok(!(await fs.readdir(binDir)).some((f) => f.endsWith('.part')))
})

await test('a download that does not match is thrown away and never run', async () => {
  const binDir = path.join(dir, 'bin-bad')
  const got = await ensureCloudflared({
    dir: binDir, platform: 'win32', sha256: 'a'.repeat(64), url: 'https://example/cf.exe',
    fetchImpl: (async () => new Response('tampered')) as unknown as typeof fetch,
  })
  assert.ok('error' in got && /fingerprint/.test(got.error), JSON.stringify(got))
  const left = await fs.readdir(binDir).catch(() => [] as string[])
  assert.equal(left.length, 0, 'nothing left behind')
})

await test('a failed download is reported, not thrown', async () => {
  const got = await ensureCloudflared({
    dir: path.join(dir, 'bin-404'), platform: 'win32', url: 'https://example/cf.exe',
    fetchImpl: (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch,
  })
  assert.ok('error' in got && /404/.test(got.error))
})

await test('not Windows → no download attempted', async () => {
  let called = false
  const got = await ensureCloudflared({
    dir: path.join(dir, 'bin-mac'), platform: 'darwin',
    fetchImpl: (async () => { called = true; return new Response('') }) as unknown as typeof fetch,
  })
  assert.ok('error' in got)
  assert.equal(called, false)
})

console.log('\nHeartbeat\n')

await test('carries version + tunnel state, and passes on the admin\'s choice', async () => {
  const seen: Array<Record<string, string>> = []
  const wanted: boolean[] = []
  const fakeTunnel = { state: 'up', setWanted: (on: boolean) => wanted.push(on) } as unknown as TunnelSupervisor
  let reply: { status: number; body: unknown } = { status: 200, body: { ok: true, internetAccess: true } }
  const f = (async (_u: string | URL, init?: RequestInit) => {
    seen.push(init?.headers as Record<string, string>)
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }) as typeof fetch
  const hb = startHeartbeat(config, fakeTunnel, f)
  await hb.beat()
  assert.equal(seen[0]['x-connector-tunnel'], 'up')
  assert.ok(seen[0]['x-connector-version'])
  assert.deepEqual(wanted, [true])

  reply = { status: 200, body: { ok: true, internetAccess: false } }
  await hb.beat()
  assert.deepEqual(wanted, [true, false])

  reply = { status: 403, body: { error: 'disconnected' } }
  await hb.beat()
  assert.deepEqual(wanted, [true, false, false], 'a disconnected computer must come off the internet')

  reply = { status: 500, body: {} }
  await hb.beat()
  assert.equal(wanted.length, 3, 'a server error leaves the link as it is')
  hb.stop()
})

await fs.rm(dir, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n')
process.exit(failures ? 1 : 0)
