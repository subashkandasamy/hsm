import http from 'node:http'
import os from 'node:os'
import { lanIp, dataDir, type Config } from './config.js'
import type { HalfOpen } from './half-open.js'
import { Queue } from './queue.js'
import { log } from './log.js'
import { VERSION } from './version.js'
import { diskWatch } from './dicom/server.js'
import { humanBytes, WARN_FREE_BYTES, type DiskState } from './dicom/disk.js'
import { handleViewer } from './viewer/page.js'

/**
 * A window onto a program that otherwise has none.
 *
 * The connector runs as a scheduled task under SYSTEM so it starts before
 * anyone logs in and survives a power cut. That is right for the service, but
 * it left a laboratory with no way to see whether anything was working: the
 * only answer was Command Prompt and a long path, which a technician will
 * never type. They would telephone instead.
 *
 * So: a page on this computer, opened by a desktop shortcut. It answers the
 * three questions somebody standing at the bench actually has — is it working,
 * is anything stuck, and what address does my engineer need.
 *
 * ── Two deliberate limits ──────────────────────────────────────────────────
 *
 * Bound to 127.0.0.1, so it is reachable from this PC and from nowhere else on
 * the hospital network. It is a diagnostic, not a service.
 *
 * No patient names. The queue holds real messages with real names in them, and
 * this page may sit open on a laboratory desk all day where anyone walking
 * past can read it. Counts and times answer the question without that.
 */

export interface LiveState {
  /** Whether the analyzer port was actually taken. */
  tcpBound: boolean
  /** When a message was last received from any analyzer. */
  lastMessageAt: Date | null
  /** How many have arrived since the program started. */
  receivedCount: number
  /** Most recent trouble worth showing, in plain words. */
  lastProblem: string | null
  /** The internet link (tunnel.ts): off unless an admin switched it on. */
  tunnelState?: string
  tunnelHostname?: string | null
}

export function startStatusPage(
  port: number,
  config: Config,
  state: LiveState,
  viewerPort = port + 1,
  /** Read fresh each request: it is fetched from Uyirly after startup. */
  viewerKey: () => string | null = () => null,
): { close: () => void } {
  const queue = new Queue(`${dataDir()}/queue`)

  const server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return }
    let waiting = 0
    let oldest: string | null = null
    try {
      const pending = await queue.list()
      waiting = pending.length
      oldest = pending[0]?.receivedAt ?? null
    } catch { /* shown as unknown below */ }

    // Who is knocking and cannot get in. Cached, because the page refreshes
    // itself and asking the operating system every few seconds for something
    // that changes slowly is pointless.
    const knocking = await halfOpenCached(config.listenPort)

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(render(config, state, waiting, oldest, knocking))
  })

  server.on('error', (e) => {
    // Not being able to show a page is a nuisance; it must never stop results
    // being collected, so this is logged and otherwise ignored.
    log.warn(`Could not open the status page on port ${port}: ${(e as Error).message}`)
  })

  server.listen(port, '127.0.0.1', () => {
    log.info(`Status page at http://localhost:${port}`)
  })

  // ── The viewer needs a different door ──────────────────────────────────
  //
  // The status page is bound to loopback on purpose: it is a diagnostic for
  // whoever is sitting at this computer, and it has no business being readable
  // from the rest of the hospital.
  //
  // The scan viewer is the opposite. A doctor looking at an X-ray is at their
  // own desk, not in the laboratory, so binding it to loopback would mean only
  // the person beside the connector could ever see an image — which defeats
  // the point of receiving them at all.
  const viewer = http.createServer(async (req, res) => {
    try {
      if (await handleViewer(req, res, viewerKey())) return
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('Not found')
    } catch (e) {
      log.warn(`Viewer request failed: ${(e as Error).message}`)
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Could not open that study.')
    }
  })
  viewer.on('error', (e) => log.warn(`Could not open the scan viewer: ${(e as Error).message}`))
  viewer.listen(viewerPort, '0.0.0.0', () => {
    log.info(`Scan viewer at http://${lanIp() ?? 'this computer'}:${viewerPort}`)
  })

  return { close: () => { server.close(); viewer.close() } }
}

function ago(d: Date | string | null): string {
  if (!d) return 'never'
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? '' : 's'} ago`
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Analyzers stuck mid-handshake, asked for at most once every fifteen seconds.
 *
 * A half-open connection never reaches this program, so without this the page
 * says "Working" while a machine two feet away fails on every sample. That is
 * what happened in Karur: the analyzer on 10.0.0.101, the computer on
 * 192.168.1.54, and nothing on this page to suggest anything was wrong.
 */
let knockCache: { at: number; rows: HalfOpen[] } = { at: 0, rows: [] }
async function halfOpenCached(port: number): Promise<HalfOpen[]> {
  if (Date.now() - knockCache.at < 15_000) return knockCache.rows
  try {
    const { findHalfOpen } = await import('./half-open.js')
    knockCache = { at: Date.now(), rows: await findHalfOpen(port, lanIp()) }
  } catch {
    knockCache = { at: Date.now(), rows: [] }
  }
  return knockCache.rows
}

function render(config: Config, state: LiveState, waiting: number, oldest: string | null,
                knocking: HalfOpen[] = []): string {
  const ip = lanIp()
  const address = `${ip ?? "this computer's IP"} : ${config.listenPort}`

  // Only present once a scanner has connected — a laboratory with no imaging
  // has no disk of ours to care about.
  const disk: DiskState | null = diskWatch?.current ?? null

  // One headline, because a technician should not have to read a table to
  // learn whether to worry.
  // An analyzer that cannot complete a connection is a failure, however
  // healthy everything else looks. Saying "Working" over the top of it is
  // what sent a hospital hunting in the wrong place for an afternoon.
  const blocked = knocking.length > 0
  const good = state.tcpBound && !disk?.refusing && !blocked
  const headline = good ? 'Working'
    : blocked ? 'An analyzer cannot get in'
    : disk?.refusing ? 'Disk almost full — scans are being refused'
    : 'Not receiving from network analyzers'
  const detail = good
    ? `Connected to ${config.hospital ?? config.serverUrl}`
    : blocked
      ? `${knocking.map((k) => k.remoteIp).join(', ')} is trying to reach this computer `
        + 'and cannot complete the connection.'
        + (knocking.some((k) => k.differentNetwork)
          ? ` It is on a different network — this computer is ${ip}. `
            + 'Put both on the same network.'
          : ' They are on the same network, so look at a firewall or switch between them.')
    : disk?.refusing
      ? `Only ${humanBytes(disk.freeBytes)} left on this computer. Free space or move old studies off it.`
      : `Port ${config.listenPort} could not be opened — another program may be using it`

  const rows: Array<[string, string, boolean?]> = [
    ['Give your analyzer engineer', address],
    ['Results waiting to send', waiting === 0
      ? 'none — everything has gone through'
      : `${waiting}, oldest ${ago(oldest)}`, waiting > 20],
    ['Last result received', ago(state.lastMessageAt)],
    ['Received since starting', String(state.receivedCount)],
    ['This computer', `${os.hostname()} · connector ${VERSION}`],
    // The drive chosen for scans and kept uploads (storage.ts).
    ['Scans and files kept in', config.storageRoot ?? 'not chosen yet'],
  ]

  // Only once an admin has switched it on: a row saying "off" on every
  // laboratory PC would raise a question nobody needs to ask.
  const t = state.tunnelState ?? 'off'
  if (t !== 'off') {
    const words: Record<string, [string, boolean]> = {
      up:       [`on — ${state.tunnelHostname ?? 'connected'}`, false],
      starting: ['starting…', false],
      down:     ['cannot reach Cloudflare right now — scans still open inside the hospital', true],
      missing:  ['switched on, but Cloudflare\'s program could not be downloaded yet — check this computer can reach github.com', true],
    }
    const [text, bad] = words[t] ?? [t, true]
    rows.splice(rows.length - 1, 0, ['Opening scans from outside', text, bad])
  }

  if (disk) {
    rows.splice(3, 0, ['Scan images stored here',
      `${humanBytes(disk.usedByImagesBytes)} used · ${humanBytes(disk.freeBytes)} free`,
      disk.freeBytes < WARN_FREE_BYTES])
  }

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>Uyirly Lab Connector</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:32px 20px; background:#F8FAFC; color:#0F172A;
         font:16px/1.5 -apple-system,"Segoe UI",system-ui,sans-serif; }
  .card { max-width:620px; margin:0 auto; background:#fff; border:1px solid #E2E8F0;
          border-radius:14px; overflow:hidden; }
  .head { padding:22px 24px; border-bottom:1px solid #E2E8F0;
          background:${good ? '#ECFDF5' : '#FEF2F2'}; }
  .dot  { display:inline-block; width:10px; height:10px; border-radius:50%;
          background:${good ? '#059669' : '#DC2626'}; margin-right:9px; }
  h1    { margin:0; font-size:20px; color:${good ? '#065F46' : '#991B1B'}; }
  .sub  { margin:6px 0 0; font-size:14px; color:${good ? '#047857' : '#B91C1B'}; }
  table { width:100%; border-collapse:collapse; }
  td    { padding:13px 24px; border-top:1px solid #F1F5F9; vertical-align:top; }
  td.k  { color:#64748B; font-size:14px; width:46%; }
  td.v  { font-weight:600; }
  td.v.warn { color:#B45309; }
  .addr { font-family:ui-monospace,Consolas,monospace; font-size:17px; }
  .note { max-width:620px; margin:14px auto 0; font-size:13px; color:#94A3B8; }
  .prob { margin:0; padding:13px 24px; background:#FFFBEB; color:#92400E;
          font-size:14px; border-top:1px solid #FDE68A; }
</style></head><body>
<div class="card">
  <div class="head">
    <h1><span class="dot"></span>${esc(headline)}</h1>
    <p class="sub">${esc(detail)}</p>
  </div>
  <table>
${rows.map(([k, v, warn]) => `    <tr><td class="k">${esc(k)}</td><td class="v${
      warn ? ' warn' : ''}${k.startsWith('Give') ? ' addr' : ''}">${esc(v)}</td></tr>`).join('\n')}
  </table>
  ${state.lastProblem ? `<p class="prob">${esc(state.lastProblem)}</p>` : ''}
</div>
<p class="note">This page is only visible on this computer. It refreshes by itself.
Results and patient names are never shown here.</p>
</body></html>`
}
