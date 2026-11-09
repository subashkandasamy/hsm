import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Config } from './config.js'
import { log } from './log.js'
import { VERSION } from './version.js'

/**
 * Putting this computer's scan viewer on the internet, when an admin says so.
 *
 * Uses Cloudflare's own program, cloudflared, which ships beside this one
 * (cloudflared.exe in the install folder). It dials OUT to Cloudflare, so the
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

/** cloudflared beside this program, or where UYIRLY_CLOUDFLARED points. */
export function findCloudflared(): string | null {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared'
  const candidates = [
    process.env.UYIRLY_CLOUDFLARED,
    path.join(path.dirname(process.execPath), name),
  ].filter((p): p is string => !!p)
  return candidates.find((p) => existsSync(p)) ?? null
}

export interface TunnelOptions {
  /** Overridable for tests. */
  findBinary?: () => string | null
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
      const bin = (this.opts.findBinary ?? findCloudflared)()
      if (!bin) {
        // Not an error the hospital can fix by waiting: an old install
        // without cloudflared. Reported so Settings can say "run the new
        // installer"; looked for again on the next heartbeat.
        if (this._state !== 'missing') {
          log.warn('Internet access is switched on in Uyirly, but cloudflared is not installed '
            + 'beside this program. Run the latest installer to add it.')
        }
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
