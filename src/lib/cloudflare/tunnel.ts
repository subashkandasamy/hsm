/**
 * Cloudflare Tunnels for hospital connectors.
 *
 * A tunnel lets the connector on a hospital PC be reached from the internet
 * without opening a port on the hospital's router: cloudflared on that PC
 * dials out to Cloudflare, and Cloudflare forwards requests for the
 * connector's hostname down that connection.
 *
 * Remotely managed: the ingress rules live at Cloudflare, set here, so the
 * hospital PC holds nothing but a run token — and that token is not stored in
 * our database either. It is fetched from Cloudflare each time the connector
 * asks (GET /api/device/tunnel), so a database dump cannot run a tunnel.
 *
 * The hostnames live on a domain of their own (UYIRLY_FILES_DOMAIN), not on
 * uyirly.com: uyirly.com's DNS is at Vercel, and a tunnel can only route a
 * hostname whose zone Cloudflare manages. Keeping them apart also means a
 * mistake here can never touch a hospital's login address.
 *
 * Endpoints are from Cloudflare's "Create a tunnel (API)" guide and API
 * reference, checked 9 Nov 2026:
 *   POST   /accounts/{account}/cfd_tunnel                    { name, config_src: 'cloudflare' }
 *   PUT    /accounts/{account}/cfd_tunnel/{id}/configurations { config: { ingress: [...] } }
 *   GET    /accounts/{account}/cfd_tunnel/{id}/token          → result is the token string
 *   POST   /zones/{zone}/dns_records                          CNAME → <id>.cfargotunnel.com, proxied
 *   DELETE /zones/{zone}/dns_records/{record}
 * The API token needs Account · Cloudflare Tunnel · Edit and Zone · DNS · Edit.
 *
 * Server code only. The credentials come from non-public environment
 * variables, which Next never sends to a browser, so a stray client import
 * would find no account rather than leak one.
 */

const API = 'https://api.cloudflare.com/client/v4'

/** What the connector serves. Only the scan viewer — never the status page. */
export const TUNNEL_ORIGIN = 'http://localhost:5152'

interface CfEnv { token: string; account: string; zone: string; domain: string }

function env(): CfEnv | null {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const zone = process.env.CLOUDFLARE_ZONE_ID
  const domain = process.env.UYIRLY_FILES_DOMAIN
  if (!token || !account || !zone || !domain) return null
  return { token, account, zone, domain: domain.replace(/^\.+|\.+$/g, '').toLowerCase() }
}

/** Whether this deployment can create tunnels at all. */
export function tunnelsAvailable(): boolean {
  return env() !== null
}

/**
 * The public name for a connector.
 *
 * Opaque on purpose. DNS names are public and listable, so a name built from
 * the hospital's slug would publish a list of our customers; the connector's
 * id says nothing to anyone but us.
 */
export function hostnameFor(connectorId: string, domain: string): string {
  const short = connectorId.replace(/-/g, '').slice(0, 12).toLowerCase()
  return `c-${short}.${domain}`
}

export class CloudflareError extends Error {}

async function cf<T>(e: CfEnv, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${e.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new CloudflareError(`Could not reach Cloudflare: ${(err as Error).message}`)
  }
  const json = await res.json().catch(() => null) as
    | { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> }
    | null
  if (!res.ok || !json?.success) {
    const why = json?.errors?.map((x) => x.message).filter(Boolean).join('; ') || `HTTP ${res.status}`
    throw new CloudflareError(`Cloudflare refused ${method} ${path.split('/').slice(0, 4).join('/')}: ${why}`)
  }
  return json.result as T
}

export interface ProvisionedTunnel { tunnelId: string; hostname: string; dnsRecordId: string }

/**
 * Make sure a connector has a tunnel and a public hostname.
 *
 * Idempotent: whatever already exists (from an earlier, perhaps half-finished
 * attempt) is reused, and only the missing pieces are made. The ingress rules
 * are rewritten every time, which is harmless and repairs a tunnel whose
 * configuration was changed at Cloudflare by hand.
 */
export async function provisionTunnel(existing: {
  connectorId: string
  tunnelId: string | null
  dnsRecordId: string | null
}, persist?: (step: Partial<ProvisionedTunnel>) => Promise<void>): Promise<ProvisionedTunnel> {
  const e = env()
  if (!e) throw new CloudflareError('Internet access is not set up on this Uyirly server yet.')

  const hostname = hostnameFor(existing.connectorId, e.domain)

  let tunnelId = existing.tunnelId
  if (!tunnelId) {
    const made = await cf<{ id: string }>(e, 'POST', `/accounts/${e.account}/cfd_tunnel`, {
      name: `uyirly-${existing.connectorId}`,
      config_src: 'cloudflare',
    })
    tunnelId = made.id
    // Saved before the next call can fail, so a retry reuses this tunnel
    // instead of leaving one behind at Cloudflare for every attempt.
    await persist?.({ tunnelId })
  }

  await cf(e, 'PUT', `/accounts/${e.account}/cfd_tunnel/${tunnelId}/configurations`, {
    config: {
      ingress: [
        { hostname, service: TUNNEL_ORIGIN },
        // Required catch-all: anything not for this hostname is refused here,
        // before it ever reaches the hospital.
        { service: 'http_status:404' },
      ],
    },
  })

  let dnsRecordId = existing.dnsRecordId
  if (!dnsRecordId) {
    const rec = await cf<{ id: string }>(e, 'POST', `/zones/${e.zone}/dns_records`, {
      type: 'CNAME',
      name: hostname,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      comment: `Uyirly connector ${existing.connectorId}`,
    })
    dnsRecordId = rec.id
    await persist?.({ dnsRecordId, hostname })
  }

  return { tunnelId, hostname, dnsRecordId }
}

/** The token cloudflared runs with. A secret: never logged, never stored. */
export async function tunnelRunToken(tunnelId: string): Promise<string> {
  const e = env()
  if (!e) throw new CloudflareError('Internet access is not set up on this Uyirly server yet.')
  return cf<string>(e, 'GET', `/accounts/${e.account}/cfd_tunnel/${tunnelId}/token`)
}

/**
 * Take a connector off the internet.
 *
 * Deleting the DNS record is what closes the door, and it takes effect at
 * Cloudflare's edge at once, whatever the hospital PC is doing. The tunnel
 * itself is kept so switching back on reuses it; Cloudflare will not delete a
 * tunnel that still has a live connection anyway.
 */
export async function removeTunnelHostname(dnsRecordId: string): Promise<void> {
  const e = env()
  if (!e) throw new CloudflareError('Internet access is not set up on this Uyirly server yet.')
  try {
    await cf(e, 'DELETE', `/zones/${e.zone}/dns_records/${dnsRecordId}`)
  } catch (err) {
    // Already gone is the outcome we wanted.
    if (!/not found|does not exist|81044/i.test((err as Error).message)) throw err
  }
}

/**
 * Delete a connector's tunnel at Cloudflare, when the connector itself is
 * removed. Best effort: Cloudflare refuses while the hospital PC is still
 * connected, and a leftover tunnel with no hostname serves nothing.
 */
export async function deleteTunnel(tunnelId: string): Promise<boolean> {
  const e = env()
  if (!e) return false
  try {
    await cf(e, 'DELETE', `/accounts/${e.account}/cfd_tunnel/${tunnelId}`)
    return true
  } catch {
    return false
  }
}
