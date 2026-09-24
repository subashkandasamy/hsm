import { Queue, type QueuedMessage } from './queue.js'
import { lanIp, type Config } from './config.js'
import { log } from './log.js'
import os from 'node:os'

const VERSION = '1.0.0'

/**
 * Getting what is on disk to the server, and knowing when to stop trying.
 *
 * ── What counts as delivered ───────────────────────────────────────────────
 *
 * Only an answer from the server. Not "the request did not throw" — a captive
 * portal in a hospital's guest wifi will happily return 200 and an HTML login
 * page, and treating that as success deletes a patient's result.
 *
 * A 'duplicate' reply is delivered. The server keys on the same hash we do, so
 * it is telling us it already has this exact message; sending it forever would
 * be the connector's own fault.
 *
 * ── What is worth retrying ─────────────────────────────────────────────────
 *
 * Anything that is the network's fault, or ours, or a server that is down:
 * retried for as long as the program runs, with a widening gap. Nothing is
 * ever dropped for being old, because a result from Tuesday is still that
 * patient's result.
 *
 * A 401 is different. The token has been revoked, or the hospital's connector
 * was removed. Retrying cannot fix it, and hammering an endpoint with a dead
 * credential is how an IP ends up blocked — so it backs off hard and says
 * plainly what a person has to do.
 */
export class Uploader {
  private running = false
  private timer: NodeJS.Timeout | null = null
  private delayMs = 0
  private unauthorised = false

  constructor(private queue: Queue, private config: Config) {}

  start(): void {
    this.running = true
    void this.tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  /** Called the moment a message is queued, so an idle lab is not waiting. */
  nudge(): void {
    if (!this.running || this.unauthorised) return
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    void this.tick()
  }

  private schedule(ms: number): void {
    if (!this.running) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.tick(), ms)
  }

  private async tick(): Promise<void> {
    if (!this.running) return

    let pending: QueuedMessage[]
    try {
      pending = await this.queue.list()
    } catch (e) {
      log.error(`Could not read the queue: ${describe(e)}`)
      return this.schedule(30_000)
    }

    if (!pending.length) {
      this.delayMs = 0
      return this.schedule(15_000)     // idle poll, also acts as a heartbeat
    }

    for (const msg of pending) {
      if (!this.running) return
      const outcome = await this.send(msg)

      if (outcome === 'delivered') {
        await this.queue.remove(msg.id)
        this.delayMs = 0
        continue
      }

      if (outcome === 'unauthorised') {
        this.unauthorised = true
        log.error('The server does not recognise this computer any more. '
          + 'Someone may have removed or disconnected it in Settings → Analyzers. '
          + 'Results are safe on this machine and will be sent once it is paired again.')
        return this.schedule(10 * 60_000)
      }

      // Network down, server down, or a bug at our end. Widen the gap and try
      // the whole queue again rather than grinding through it while offline.
      this.delayMs = this.delayMs === 0 ? 5_000 : Math.min(this.delayMs * 2, 5 * 60_000)
      return this.schedule(this.delayMs)
    }

    this.schedule(5_000)
  }

  private async send(msg: QueuedMessage): Promise<'delivered' | 'retry' | 'unauthorised'> {
    const url = `${this.config.serverUrl.replace(/\/$/, '')}/api/device/lab/results`

    let res: Response
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000)
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify({
          raw: msg.raw,
          idempotencyKey: msg.id,
          // Which port or cable this came off, so an unnamed machine can still
          // be told apart from the other unnamed machine in the same room.
          source: msg.source,
          lanIp: lanIp(),
          machineName: os.hostname(),
          version: VERSION,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch (e) {
      await this.queue.noteFailure(msg, describe(e))
      log.warn(`Could not reach the server (${describe(e)}). Holding ${await this.queue.size()} result(s).`)
      return 'retry'
    }

    if (res.status === 401 || res.status === 403) return 'unauthorised'

    let body: { status?: string; written?: number; error?: string } = {}
    try { body = await res.json() as typeof body } catch { /* not JSON */ }

    if (!res.ok && res.status !== 202) {
      await this.queue.noteFailure(msg, body.error ?? `HTTP ${res.status}`)
      log.warn(`Server refused a result (${res.status}: ${body.error ?? 'no reason given'}). Will try again.`)
      return 'retry'
    }

    // 202 means stored but not placed — an unknown barcode, a code nobody has
    // mapped. The server has it and a person will resolve it on the website,
    // so from here it is delivered.
    switch (body.status) {
      case 'matched':
        log.info(`Sent — ${body.written} result(s) reached a patient.`)
        return 'delivered'
      case 'duplicate':
        log.info('Already had this one. Removed from the queue.')
        return 'delivered'
      case 'unmatched':
      case 'unmapped':
      case 'stored':
        log.info(`Sent — waiting for someone at the hospital (${body.status}).`)
        return 'delivered'
      default:
        await this.queue.noteFailure(msg, `Unexpected reply: ${JSON.stringify(body)}`)
        return 'retry'
    }
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return 'the server took too long to answer'
    return e.message
  }
  return String(e)
}
