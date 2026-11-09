import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { clientKey } from '@/lib/rateLimit'

const TUNNEL_STATES = new Set(['off', 'starting', 'up', 'down', 'missing'])

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * "Is this thing on?"
 *
 *   GET /api/device/ping
 *   Authorization: Bearer <connector token>
 *
 * Exists so the connector can prove its credential works without sending a
 * result. Until now the only way to find out was to wait for an analyzer to
 * produce one, which is a poor thing to discover at eight in the morning with
 * a full rack of samples.
 *
 * It answers the three questions a support call opens with: does the token
 * still work, which hospital does this computer belong to, and has anything
 * ever reached us from it.
 *
 * Deliberately read-only apart from the heartbeat. A diagnostic that changes
 * state is a diagnostic nobody trusts to run twice.
 *
 * Since 1.0.8 the connector also calls this every minute as its heartbeat,
 * with `x-connector-tunnel` saying what its Cloudflare Tunnel is doing. That
 * records two things the scan links need: the address the hospital reaches
 * the internet from (a browser from the same address is inside the hospital)
 * and whether the tunnel is up. The reply's `internetAccess` is how an admin
 * switching it on or off in Settings reaches the computer within a minute.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'Missing connector token' })

  const svc = createServiceClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: connector } = await svc
    .from('connectors')
    .select('id, tenant_id, name, listen_port, status, internet_access, tunnel_id, tunnel_dns_record_id, keep_uploads')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!connector) {
    return json(401, {
      error: 'This computer is not recognised. It may have been removed in '
        + 'Settings → Analyzers — pair it again to reconnect.',
    })
  }
  if (connector.status === 'revoked') {
    return json(403, {
      error: 'This computer has been disconnected in Settings → Analyzers. '
        + 'Results already here are safe; pair it again to resume sending.',
    })
  }

  const [{ data: tenant }, { count: analyzers }, { count: waiting }] = await Promise.all([
    svc.from('tenants').select('name').eq('id', connector.tenant_id).maybeSingle(),
    svc.from('lab_analyzers')
      .select('id', { count: 'exact', head: true })
      .eq('connector_id', connector.id),
    // Work the hospital still has to do, so the report can say so before a
    // technician goes looking for a result that is sitting in a queue.
    svc.from('analyzer_messages')
      .select('id', { count: 'exact', head: true })
      .eq('connector_id', connector.id)
      .in('status', ['unmatched', 'unmapped', 'failed']),
  ])

  const reported = request.headers.get('x-connector-version')?.trim() || null
  const tunnel = request.headers.get('x-connector-tunnel')?.trim().toLowerCase() || null
  const ip = clientKey(request.headers)
  // The computer's own address inside the hospital. Until 1.0.12 it was only
  // sent at pairing and with lab results, so an X-ray PC whose router handed
  // it a new address (Karur, 9 Nov 2026: .106 → .102) kept the old one, and
  // every "View scan" link pointed at a computer that was not there.
  const lan = request.headers.get('x-connector-lan')?.trim() || null
  const now = new Date().toISOString()
  await svc.from('connectors')
    .update({
      last_seen_at: now,
      ...(reported ? { version: reported } : {}),
      ...(ip && ip !== 'unknown' ? { public_ip: ip } : {}),
      ...(lan && isPrivateIpv4(lan) ? { lan_ip: lan } : {}),
      ...(tunnel && TUNNEL_STATES.has(tunnel) ? { tunnel_state: tunnel, tunnel_state_at: now } : {}),
    })
    .eq('id', connector.id)

  // On only once the hostname exists at Cloudflare; a switch flipped while
  // that failed must not send the computer looking for a tunnel to run.
  const internetAccess = !!connector.internet_access && !!connector.tunnel_id
    && !!connector.tunnel_dns_record_id

  return json(200, {
    ok: true,
    hospital: tenant?.name ?? null,
    connectorName: connector.name,
    listenPort: connector.listen_port ?? 5150,
    analyzersSeen: analyzers ?? 0,
    needingAttention: waiting ?? 0,
    internetAccess,
    // Whether this computer collects the hospital's uploaded files (0275).
    keepUploads: !!connector.keep_uploads,
    serverTime: now,
  })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

/** Only an address a browser inside the hospital could reach — never a public one. */
function isPrivateIpv4(v: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if ([m[1], m[2], m[3], m[4]].some((x) => Number(x) > 255)) return false
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}
