import type { Config } from './config.js'
import { log } from './log.js'
import type { TunnelSupervisor } from './tunnel.js'
import type { FileMover } from './files.js'
import { VERSION } from './version.js'

/**
 * Telling Uyirly this computer is alive, once a minute.
 *
 * Before this the connector only spoke when it had something to send, so a
 * quiet weekend looked exactly like a dead PC. The beat carries the version
 * and what the internet link is doing, and its reply carries whether an admin
 * wants the link on — so switching it in Settings reaches this computer
 * within a minute, with nothing to configure here.
 *
 * Uses the existing ping endpoint, which already records last_seen_at.
 * Failure is quiet and retried on the next beat: being offline is something
 * the uploader already handles and reports, and a heartbeat that shouted
 * every minute would bury the messages that matter.
 */

export const HEARTBEAT_MS = 60_000

export function startHeartbeat(
  config: Config,
  tunnel: TunnelSupervisor,
  fetchImpl: typeof fetch = fetch,
  /** Collects uploaded files when the reply says this computer keeps them. */
  files?: Pick<FileMover, 'sync'>,
): { stop: () => void; beat: () => Promise<void> } {
  const url = `${config.serverUrl.replace(/\/$/, '')}/api/device/ping`
  let failing = false

  const beat = async () => {
    try {
      const res = await fetchImpl(url, {
        headers: {
          authorization: `Bearer ${config.token}`,
          'x-connector-version': VERSION,
          'x-connector-tunnel': tunnel.state,
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (res.status === 401 || res.status === 403) {
        // Disconnected in Settings: nothing should stay on the internet.
        tunnel.setWanted(false)
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json().catch(() => ({})) as { internetAccess?: boolean; keepUploads?: boolean }
      tunnel.setWanted(body.internetAccess === true)
      // Not awaited: a slow download must not hold up the next beat.
      if (body.keepUploads === true && files) void files.sync()
      if (failing) log.info('Back in touch with Uyirly.')
      failing = false
    } catch (e) {
      if (!failing) log.warn(`Could not reach Uyirly for the heartbeat: ${(e as Error).message}. Will keep trying.`)
      failing = true
      // The link is left as it is. If the hospital's internet is down the
      // tunnel is down too and comes back with it; if only Uyirly is
      // unreachable, scans already linked should keep opening.
    }
  }

  const first = setTimeout(() => void beat(), 3_000)
  const timer = setInterval(() => void beat(), HEARTBEAT_MS)
  first.unref?.()
  timer.unref?.()
  return { stop: () => { clearTimeout(first); clearInterval(timer) }, beat }
}
