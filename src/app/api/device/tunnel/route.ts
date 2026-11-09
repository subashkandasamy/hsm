import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { CloudflareError, tunnelRunToken } from '@/lib/cloudflare/tunnel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * What a connector needs to put itself on the internet.
 *
 *   GET /api/device/tunnel
 *   Authorization: Bearer <connector token>
 *   →  { enabled: false }
 *   →  { enabled: true, hostname: "c-….example", token: "…" }
 *
 * Asked whenever the heartbeat says internet access is on and cloudflared is
 * not yet running. The run token comes straight from Cloudflare and is never
 * stored here — a database dump holds nothing that can run a tunnel — and it
 * goes only to the connector whose own bearer token proves which one it is.
 *
 * Whether to be on the internet is an admin's decision, made in Settings →
 * Devices (setInternetAccess). This route only reports it.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'Missing connector token' })

  const svc = createServiceClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: connector } = await svc
    .from('connectors')
    .select('id, status, internet_access, tunnel_id, tunnel_hostname, tunnel_dns_record_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!connector) return json(401, { error: 'Unknown connector token' })
  if (connector.status === 'revoked') return json(403, { error: 'This connector has been revoked' })

  const ready = !!connector.internet_access && !!connector.tunnel_id
    && !!connector.tunnel_hostname && !!connector.tunnel_dns_record_id
  if (!ready) return json(200, { enabled: false })

  try {
    const runToken = await tunnelRunToken(connector.tunnel_id as string)
    return json(200, { enabled: true, hostname: connector.tunnel_hostname, token: runToken })
  } catch (e) {
    // Cloudflare unreachable or the API token revoked: the connector keeps
    // asking on its heartbeat, so this heals itself once Cloudflare answers.
    const why = e instanceof CloudflareError ? e.message : 'Could not reach Cloudflare'
    return json(503, { error: why })
  }
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
