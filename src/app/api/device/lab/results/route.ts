import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { tenantHasModule } from '@/lib/tenantModule'
import { processMessage } from '@/lib/lab/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where an analyzer's results arrive.
 *
 *   POST /api/device/lab/results
 *   Authorization: Bearer <connector token>
 *   { "raw": "<the message exactly as it came off the wire>" }
 *
 * This route does three things and no more: authenticate the connector, store
 * the bytes, refuse a duplicate. Understanding the message is processMessage's
 * job, because that has to be runnable again later — when a person has mapped
 * a code or attached a barcode — without the analyzer being involved.
 *
 * The rules this exists to keep, in the order they matter:
 *
 * 1. Store the raw message first. Before parsing, before matching, before
 *    anything can go wrong. A parser bug then costs a debugging session rather
 *    than a patient's result, and an instrument we have never seen can be
 *    supported later from traffic it already sent us.
 *
 * 2. Never lose a result to a billing rule. A machine only reports on a sample
 *    that was physically drawn and run, so an uncollected or unpaid order is a
 *    bookkeeping problem, not a reason to discard a real measurement.
 *
 * 3. Never guess a patient. A barcode that matches no sample goes to a queue a
 *    human resolves. Nothing is attached to the nearest plausible order.
 *
 * 4. Nothing is auto-released. Results land unverified regardless, so a person
 *    authorises before anyone outside the laboratory sees them — which is also
 *    what NABL's own automated-reporting algorithm requires, since we have no
 *    quality-control state to gate on.
 *
 * This route runs as the service role, so RLS does not apply: the tenant comes
 * from the connector's token and is written explicitly onto every row.
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'Missing connector token' })

  const svc = createServiceClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: connector } = await svc
    .from('connectors')
    .select('id, tenant_id, status')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!connector) return json(401, { error: 'Unknown connector token' })
  if (connector.status === 'revoked') return json(403, { error: 'This connector has been revoked' })

  // The proxy skips /api/device/* entirely — a connector carries a bearer
  // token and no cookie — so there is no x-tenant-plan header here and the
  // plan has to be read from the database. Without this, a tenant that
  // downgraded off Growth kept sending lab results indefinitely: the only
  // check was 'revoked'.
  if (!(await tenantHasModule(connector.tenant_id as string, 'lab'))) {
    return json(402, { error: 'This hospital\u2019s plan does not include this module' })
  }

  const tenantId = connector.tenant_id as string
  const connectorId = connector.id as string

  let body: {
    raw?: string; idempotencyKey?: string; machineName?: string
    lanIp?: string; version?: string
    /** Where the connector heard it — 'tcp 192.168.1.50', 'serial COM3'. */
    source?: string
  }
  try { body = await request.json() } catch { return json(400, { error: 'Body must be JSON' }) }

  const raw = (body.raw ?? '').toString()
  if (!raw.trim()) return json(400, { error: 'No message' })

  // An analyzer retransmits on a timeout, on a reconnect, whenever a technician
  // presses send again. The same bytes must never become a second result.
  const idempotencyKey = body.idempotencyKey
    ?? request.headers.get('idempotency-key')
    ?? createHash('sha256').update(raw).digest('hex')

  // The connector tells us where it lives, so the settings screen can show the
  // engineer which address to type into the analyzer.
  await svc.from('connectors').update({
    last_seen_at: new Date().toISOString(),
    status: 'online',
    ...(body.lanIp ? { lan_ip: body.lanIp } : {}),
    ...(body.machineName ? { machine_name: body.machineName } : {}),
    ...(body.version ? { version: body.version } : {}),
  }).eq('id', connectorId)

  // ── Store it, before understanding it ────────────────────────────────────
  const messageId = crypto.randomUUID()
  const { error: insErr } = await svc.from('analyzer_messages').insert({
    id: messageId, tenant_id: tenantId, connector_id: connectorId,
    raw_message: raw, idempotency_key: idempotencyKey, status: 'received',
    source: body.source ?? null,
  })
  if (insErr) {
    if (insErr.code === '23505') {
      // Already have it. Acknowledge, so the analyzer stops resending.
      return json(200, { status: 'duplicate', message: 'Already received' })
    }
    return json(500, { error: insErr.message })
  }

  const outcome = await processMessage(svc, {
    tenantId, connectorId, messageId, raw, source: body.source ?? null,
  })
  return json(outcome.status === 'matched' ? 200 : 202, { ...outcome })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
