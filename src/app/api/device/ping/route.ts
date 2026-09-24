import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

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
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'Missing connector token' })

  const svc = createServiceClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: connector } = await svc
    .from('connectors')
    .select('id, tenant_id, name, listen_port, status')
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

  await svc.from('connectors')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', connector.id)

  return json(200, {
    ok: true,
    hospital: tenant?.name ?? null,
    connectorName: connector.name,
    listenPort: connector.listen_port ?? 5150,
    analyzersSeen: analyzers ?? 0,
    needingAttention: waiting ?? 0,
    serverTime: new Date().toISOString(),
  })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
