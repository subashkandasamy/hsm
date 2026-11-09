import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import { dataDir, type Config } from './config.js'
import { log } from './log.js'
import { VERSION } from './version.js'

/**
 * Putting this computer's scan viewer on the internet, when an admin says so.
 *
 * Uses Cloudflare's own program, cloudflared. It is NOT in the download — that
 * made the installer too big to publish — so the first time an admin switches
 * internet access on, it is fetched from Cloudflare's GitHub release and
 * checked against the SHA-256 Cloudflare publishes before it is ever run
 * (ensureCloudflared). A computer that never has internet access switched on
 * never downloads it. It dials OUT to Cloudflare, so the
 * hospital opens no port on its router and needs no public address; requests
 * for this computer's hostname come back down that connection to the viewer
 * on port 5152 — and only the viewer, which refuses anything Uyirly did not
 * sign. The ingress rule saying so lives at Cloudflare, set by Uyirly, not
 * here.
 *
 * Nothing about the tunnel is stored on this computer. The run token is asked
 * for from Uyirly each time cloudflared starts and handed to it through its
 * environment, never on the command line where any program could read it.
 *
 * Supervised like the uploader: if cloudflared exits it is started again,
 * waiting longer each time, and its health is read from its own /ready
 * endpoint (200 once it holds a connection to Cloudflare, 503 before —
 * cloudflared metrics/readiness.go).
 */

export type TunnelState = 'off' | 'starting' | 'up' | 'down' | 'missing'

/** Where cloudflared reports its health. Loopback only. */
export const TUNNEL_METRICS_PORT = 5153

const READY_POLL_MS = 15_000
/** How long a fresh start may take to connect before we call it down. */
const STARTUP_GRACE_MS = 60_000
const MIN_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 5 * 60_000

/**
 * The cloudflared we run: pinned, and checked before use. Release 2026.10.7,
 * cloudflared-windows-amd64.exe, SHA-256 from Cloudflare's release notes,
 * checked 9 Nov 2026.
 */
export const CLOUDFLARED_VERSION = '2026.10.7'
export const CLOUDFLARED_WIN_SHA256 = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343'
const CLOUDFLARED_WIN_URL =
  `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`

/** Where a downloaded cloudflared is kept: beside the settings, not in Program Files. */
export function cloudflaredHome(): string {
  return path.join(dataDir(), 'bin')
}

/** cloudflared where UYIRLY_CLOUDFLARED points, downloaded earlier, or beside this program. */
export function findCloudflared(): string | null {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
  const candidates = [
    process.env.UYIRLY_CLOUDFLARED,
    path.join(cloudflaredHome(), name),
    path.join(path.dirname(process.execPath), name),
  ].filter((p): p is string => !!p)
  return candidates.find((p) => existsSync(p)) ?? null
}

/**
 * Make sure cloudflared is on this computer, downloading it if not.
 *
 * Written to a .part file, hashed, and only renamed into place when the
 * SHA-256 matches the pinned one — a download that does not match is deleted
 * and never run. Windows only: that is the only build hospitals are given.
 */
export async function ensureCloudflared(opts: {
  fetchImpl?: typeof fetch
  dir?: string
  url?: string
  sha256?: string
  platform?: NodeJS.Platform
} = {}): Promise<{ path: string } | { error: string }> {
  const existing = opts.dir ? null : findCloudflared()
  if (existing) return { path: existing }
  if ((opts.platform ?? process.platform) !== 'win32') {
    return { error: 'cloudflared can only be downloaded automatically on Windows' }
  }
  const dir = opts.dir ?? cloudflaredHome()
  const final = path.join(dir, 'cloudflared.exe')
  if (existsSync(final)) return { path: final }
  const part = `${final}.part`
  try {
    await fs.mkdir(dir, { recursive: true })
    log.info(`Downloading Cloudflare's internet-link program (cloudflared ${CLOUDFLARED_VERSION}, about 55 MB)…`)
    const res = await (opts.fetchImpl ?? fetch)(opts.url ?? CLOUDFLARED_WIN_URL, { signal: AbortSignal.timeout(10 * 60_000) })
    if (!res.ok) throw new Error(`the download answered ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const got = createHash('sha256').update(bytes).digest('hex')
    if (got !== (opts.sha256 ?? CLOUDFLARED_WIN_SHA256)) {
      throw new Error('the download does not match the fingerprint Cloudflare published, so it was thrown away')
    }
    await fs.writeFile(part, bytes)
    await fs.rename(part, final)
    log.info('cloudflared downloaded and checked.')
    return { path: final }
  } catch (e) {
    await fs.rm(part, { force: true }).catch(() => {})
    return { error: (e as Error).message }
  }
}

export interface TunnelOptions {
  /** Overridable for tests: where cloudflared is, downloading it if needed. */
  findBinary?: () => string | null | Promise<string | null>
  fetchImpl?: typeof fetch
  metricsPort?: number
  /** Told whenever the state changes, for the status page. */
  onState?: (s: TunnelState) => void
}

export class TunnelSupervisor {
  private wanted = false
  private child: ChildProcess | null = null
  private startedAt = 0
  private backoff = MIN_BACKOFF_MS
  private restartTimer: NodeJS.Timeout | null = null
  private readyTimer: NodeJS.Timeout | null = null
  private _state: TunnelState = 'off'
  private hostname: string | null = null
  private starting = false
  private lastDownloadTry = 0

  constructor(private config: Config, private opts: TunnelOptions = {}) {}

  get state(): TunnelState { return this._state }
  get publicHostname(): string | null { return this.hostname }

  private set(s: TunnelState) {
    if (s === this._state) return
    this._state = s
    this.opts.onState?.(s)
  }

  /**
   * Called on every heartbeat with what the admin has chosen. Repeating the
   * same answer is harmless; a 'missing' cloudflared is looked for again each
   * time, so one copied in after install is picked up without a restart.
   */
  setWanted(on: boolean): void {
    if (!on) {
      if (this.wanted || this.child || this._state !== 'off') this.stop()
      return
    }
    this.wanted = true
    if (this.child || this.starting || this.restartTimer) return
    void this.start()
  }

  private async start(): Promise<void> {
    if (!this.wanted || this.child || this.starting) return
    this.starting = true
    try {
      const bin = this.opts.findBinary
        ? await this.opts.findBinary()
        : await this.binary()
      if (!bin) {
        // Not downloaded (no internet, GitHub blocked, or a fingerprint
        // mismatch). Reported so Settings can say so; tried again on a later
        // heartbeat, at most every ten minutes.
        this.set('missing')
        return
      }

      const token = await this.fetchToken()
      if (!token) { this.scheduleRestart(); return }
      if (!this.wanted) return

      if (process.platform === 'win32') await killStrays(bin)

      const port = this.opts.metricsPort ?? TUNNEL_METRICS_PORT
      this.set('starting')
      this.startedAt = Date.now()
      const child = spawn(bin, [
        'tunnel', '--no-autoupdate', '--metrics', `127.0.0.1:${port}`, 'run',
      ], {
        // The token goes in the environment, not argv: argv is readable by
        // every process on the machine, the environment is not.
        env: { ...process.env, TUNNEL_TOKEN: token },
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      })
      this.child = child
      log.info(`Internet link starting for ${this.hostname ?? 'this computer'}.`)

      let lastLogged = 0
      child.stderr?.on('data', (buf: Buffer) => {
        // cloudflared is chatty. Keep only its errors, at most one a minute,
        // so a dead network does not fill the log.
        const text = buf.toString()
        if (/\bERR\b|error/i.test(text) && Date.now() - lastLogged > 60_000) {
          lastLogged = Date.now()
          log.warn(`Internet link: ${text.split('\n').find((l) => /ERR|error/i.test(l))?.slice(0, 300) ?? ''}`)
        }
      })
      child.on('error', (e) => log.warn(`Could not start cloudflared: ${e.message}`))
      child.on('exit', (code) => {
        this.child = null
        this.stopReadyPoll()
        if (!this.wanted) { this.set('off'); return }
        log.warn(`Internet link stopped (code ${code ?? 'none'}); starting it again shortly.`)
        this.set('down')
        this.scheduleRestart()
      })
      this.startReadyPoll()
    } finally {
      this.starting = false
    }
  }

  stop(): void {
    this.wanted = false
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null }
    this.stopReadyPoll()
    const child = this.child
    this.child = null
    if (child) {
      child.kill()
      log.info('Internet link stopped: switched off in Uyirly.')
    }
    this.backoff = MIN_BACKOFF_MS
    this.set('off')
  }

  /** cloudflared, downloading it on first use; null when that is not possible yet. */
  private async binary(): Promise<string | null> {
    const found = findCloudflared()
    if (found) return found
    if (Date.now() - this.lastDownloadTry < 10 * 60_000) return null
    this.lastDownloadTry = Date.now()
    const got = await ensureCloudflared({ fetchImpl: this.opts.fetchImpl })
    if ('path' in got) return got.path
    log.warn(`Internet access is switched on, but Cloudflare's program could not be downloaded: ${got.error}. `
      + 'Check that this computer can reach github.com. Will try again in ten minutes.')
    return null
  }

  private scheduleRestart(): void {
    if (!this.wanted || this.restartTimer) return
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.start()
    }, wait)
    this.restartTimer.unref?.()
  }

  private startReadyPoll(): void {
    this.stopReadyPoll()
    const tick = async () => {
      if (!this.child) return
      const ready = await this.checkReady()
      if (ready) {
        if (this._state !== 'up') log.info(`Internet link is up: ${this.hostname ?? ''}`)
        this.set('up')
        this.backoff = MIN_BACKOFF_MS
      } else if (Date.now() - this.startedAt > STARTUP_GRACE_MS) {
        this.set('down')
      }
    }
    // Soon after start, then on a steady beat.
    setTimeout(() => void tick(), 3_000).unref?.()
    this.readyTimer = setInterval(() => void tick(), READY_POLL_MS)
    this.readyTimer.unref?.()
  }

  private stopReadyPoll(): void {
    if (this.readyTimer) { clearInterval(this.readyTimer); this.readyTimer = null }
  }

  private async checkReady(): Promise<boolean> {
    const port = this.opts.metricsPort ?? TUNNEL_METRICS_PORT
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(`http://127.0.0.1:${port}/ready`, {
        signal: AbortSignal.timeout(5_000),
      })
      return res.status === 200
    } catch {
      return false
    }
  }

  private async fetchToken(): Promise<string | null> {
    const url = `${this.config.serverUrl.replace(/\/$/, '')}/api/device/tunnel`
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(url, {
        headers: { authorization: `Bearer ${this.config.token}`, 'x-connector-version': VERSION },
        signal: AbortSignal.timeout(20_000),
      })
      const body = await res.json().catch(() => null) as
        | { enabled?: boolean; token?: string; hostname?: string; error?: string } | null
      if (!res.ok) {
        log.warn(`Uyirly could not hand over the internet link (${res.status}): ${body?.error ?? 'no reason given'}`)
        this.set('down')
        return null
      }
      if (!body?.enabled || !body.token) {
        // Switched off between the heartbeat and this call.
        this.wanted = false
        this.set('off')
        return null
      }
      this.hostname = body.hostname ?? null
      return body.token
    } catch (e) {
      log.warn(`Could not reach Uyirly for the internet link: ${(e as Error).message}`)
      this.set('down')
      return null
    }
  }
}

/**
 * A cloudflared left running by an earlier copy of this program.
 *
 * On Windows a child outlives a parent that crashed, and the orphan would hold
 * the health port and keep serving after internet access was switched off.
 * Only the copy at our own path is stopped — a hospital may run its own
 * cloudflared for something else.
 */
async function killStrays(bin: string): Promise<void> {
  const quoted = bin.replace(/'/g, "''")
  await new Promise<void>((resolve) => {
    execFile('powershell', ['-NoProfile', '-Command',
      `Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${quoted}' } | Stop-Process -Force -ErrorAction SilentlyContinue`,
    ], { windowsHide: true, timeout: 15_000 }, () => resolve())
  })
}
