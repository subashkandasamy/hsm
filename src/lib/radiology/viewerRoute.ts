/**
 * Which address to hand out for a scan stored on a hospital computer.
 *
 * Two ways to reach the connector's viewer:
 *
 *   hospital  http://<lan ip>:5152 — instant, works with the internet down,
 *             but only from a computer on the hospital's own network.
 *   internet  https://<tunnel hostname> — through Cloudflare, from anywhere,
 *             only when an admin has switched internet access on and the
 *             connector says its tunnel is up.
 *
 * The browser asking is inside the hospital when its public address is the
 * one the connector's heartbeat came from: both sit behind the same router.
 * Inside gets the local link even when the tunnel is up, so a ward round does
 * not send every X-ray out to the internet and back in.
 *
 * When neither can be shown to work, the local link is still returned. That
 * is what happened before the tunnel existed, and inside the hospital it is
 * right; we only stop guessing once we know better.
 *
 * Pure, so the rule can be tested without a request or a database.
 */

export interface ConnectorReach {
  lan_ip: string | null
  public_ip: string | null
  internet_access: boolean | null
  tunnel_hostname: string | null
  tunnel_state: string | null
  tunnel_state_at: string | null
}

export interface ViewerRoute {
  base: string
  where: 'hospital' | 'internet'
  ttlSeconds: number
}

/** The viewer port on the connector (connector/src/config.ts viewerPort). */
export const VIEWER_PORT = 5152

/** A heartbeat older than this means we no longer know the tunnel is up. */
export const TUNNEL_FRESH_MS = 3 * 60_000

/** Inside the hospital: long enough for a ward round. */
export const HOSPITAL_LINK_TTL = 8 * 60 * 60
/**
 * From the internet: shorter. A link that leaves the building can be
 * forwarded; one hour is enough to look at an X-ray and little use to anyone
 * it is passed on to.
 */
export const INTERNET_LINK_TTL = 60 * 60

export function tunnelIsUp(c: ConnectorReach, now: number = Date.now()): boolean {
  if (!c.internet_access || !c.tunnel_hostname || c.tunnel_state !== 'up') return false
  const at = c.tunnel_state_at ? Date.parse(c.tunnel_state_at) : Number.NaN
  return Number.isFinite(at) && now - at <= TUNNEL_FRESH_MS
}

export function chooseViewerRoute(
  c: ConnectorReach, requestIp: string | null, now: number = Date.now(),
): ViewerRoute | null {
  const hospital: ViewerRoute | null = c.lan_ip
    ? { base: `http://${c.lan_ip}:${VIEWER_PORT}`, where: 'hospital', ttlSeconds: HOSPITAL_LINK_TTL }
    : null
  const internet: ViewerRoute | null = tunnelIsUp(c, now)
    ? { base: `https://${c.tunnel_hostname}`, where: 'internet', ttlSeconds: INTERNET_LINK_TTL }
    : null

  const inside = !!requestIp && !!c.public_ip && requestIp === c.public_ip
  if (inside) return hospital ?? internet
  return internet ?? hospital
}
