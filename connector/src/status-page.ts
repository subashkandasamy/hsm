import http from 'node:http'
import os from 'node:os'
import { lanIp, dataDir, type Config } from './config.js'
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
}

export function startStatusPage(
  port: number,
  config: Config,
  state: LiveState,
): { close: () => void } {
  const queue = new Queue(`${dataDir()}/queue`)

  const server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return }

    // The scan viewer shares this port. Uyirly links straight to it, and a
    // plain navigation to a private address is not subject to the mixed
    // content and local-network rules that would block a fetch.
    try {
      if (await handleViewer(req, res)) return
    } catch (e) {
      log.warn(`Viewer request failed: ${(e as Error).message}`)
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('Could not open that study.')
      return
    }
    let waiting = 0
    let oldest: string | null = null
    try {
      const pending = await queue.list()
      waiting = pending.length
      oldest = pending[0]?.receivedAt ?? null
    } catch { /* shown as unknown below */ }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(render(config, state, waiting, oldest))
  })

  server.on('error', (e) => {
    // Not being able to show a page is a nuisance; it must never stop results
    // being collected, so this is logged and otherwise ignored.
    log.warn(`Could not open the status page on port ${port}: ${(e as Error).message}`)
  })

  server.listen(port, '127.0.0.1', () => {
    log.info(`Status page at http://localhost:${port}`)
  })

  return { close: () => server.close() }
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

function render(config: Config, state: LiveState, waiting: number, oldest: string | null): string {
  const ip = lanIp()
  const address = `${ip ?? "this computer's IP"} : ${config.listenPort}`

  // Only present once a scanner has connected — a laboratory with no imaging
  // has no disk of ours to care about.
  const disk: DiskState | null = diskWatch?.current ?? null

  // One headline, because a technician should not have to read a table to
  // learn whether to worry.
  const good = state.tcpBound && !disk?.refusing
  const headline = good ? 'Working'
    : disk?.refusing ? 'Disk almost full — scans are being refused'
    : 'Not receiving from network analyzers'
  const detail = good
    ? `Connected to ${config.hospital ?? config.serverUrl}`
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
  ]

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
