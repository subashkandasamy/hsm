import { createHash, randomBytes } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { normalisePairingCode } from '@/lib/lab/pairing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where a freshly installed connector claims its identity.
 *
 *   POST /api/device/pair
 *   { "code": "K7M-3QRX", "machineName": "LAB-PC-01", "lanIp": "192.168.1.14" }
 *   →  { "token": "…", "hospital": "…", "listenPort": 5150 }
 *
 * The code is short because somebody types it standing at a laboratory bench.
 * The token is long because nobody ever sees it: the installer stores it, and
 * only its SHA-256 lives here, so there is nothing in a database dump to steal.
 *
 * Single use. The code is destroyed as it is claimed, in the same statement
 * that writes the token, so two machines cannot race for one code. It is never
 * reissued — a hospital that needs another connector creates another.
 *
 * Unauthenticated by necessity: the connector has no session and no token yet.
 * The code is the credential, which is why it expires.
 */
export async function POST(request: Request) {
  let body: { code?: string; machineName?: string; lanIp?: string; version?: string }
  try { body = await request.json() } catch { return json(400, { error: 'Body must be JSON' }) }

  const code = normalisePairingCode(body.code ?? '')
  if (!code) return json(400, { error: 'No pairing code' })

  const svc = createServiceClient()

  const { data: connector } = await svc
    .from('connectors')
    .select('id, tenant_id, name, listen_port, status, pairing_expires_at')
    .eq('pairing_code', code)
    .maybeSingle()

  // The same message whether the code is wrong or spent, so this cannot be
  // used to discover which codes exist.
  if (!connector) return json(404, { error: 'That pairing code is not valid. Ask for a new one.' })
  if (connector.status === 'revoked') return json(403, { error: 'This connector has been revoked' })

  const expiry = connector.pairing_expires_at as string | null
  if (expiry && new Date(expiry) < new Date()) {
    return json(410, { error: 'That pairing code has expired. Ask for a new one.' })
  }

  const token = randomBytes(32).toString('hex')
  const tokenHash = createHash('sha256').update(token).digest('hex')

  // Conditional on the code still being present: whichever machine gets here
  // first claims it, and the second finds nothing to update.
  const { data: claimed, error } = await svc
    .from('connectors')
    .update({
      token_hash: tokenHash,
      pairing_code: null,
      pairing_expires_at: null,
      paired_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      status: 'online',
      machine_name: body.machineName ?? null,
      lan_ip: body.lanIp ?? null,
      version: body.version ?? null,
    })
    .eq('id', connector.id)
    .eq('pairing_code', code)
    .select('id')
    .maybeSingle()

  if (error) return json(500, { error: error.message })
  if (!claimed) return json(409, { error: 'That pairing code has just been used' })

  const { data: tenant } = await svc
    .from('tenants').select('name').eq('id', connector.tenant_id).maybeSingle()

  return json(200, {
    token,
    connectorId: connector.id,
    connectorName: connector.name,
    hospital: tenant?.name ?? null,
    listenPort: connector.listen_port ?? 5150,
    resultsUrl: '/api/device/lab/results',
  })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
