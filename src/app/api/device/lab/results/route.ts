import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { parseAstm, detectProtocol } from '@/lib/lab/astm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where an analyzer's results arrive.
 *
 *   POST /api/device/lab/results
 *   Authorization: Bearer <connector token>
 *   { "raw": "<the message exactly as it came off the wire>" }
 *
 * The rules this route exists to keep, in the order they matter:
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

  const tenantId = connector.tenant_id as string
  const connectorId = connector.id as string

  let body: { raw?: string; idempotencyKey?: string }
  try { body = await request.json() } catch { return json(400, { error: 'Body must be JSON' }) }

  const raw = (body.raw ?? '').toString()
  if (!raw.trim()) return json(400, { error: 'No message' })

  // An analyzer retransmits on a timeout, on a reconnect, whenever a technician
  // presses send again. The same bytes must never become a second result.
  const idempotencyKey = body.idempotencyKey
    ?? request.headers.get('idempotency-key')
    ?? createHash('sha256').update(raw).digest('hex')

  await svc.from('connectors')
    .update({ last_seen_at: new Date().toISOString(), status: 'online' })
    .eq('id', connectorId)

  // ── 1. Store it, before understanding it ─────────────────────────────────
  const messageId = crypto.randomUUID()
  const { error: insErr } = await svc.from('analyzer_messages').insert({
    id: messageId, tenant_id: tenantId, connector_id: connectorId,
    raw_message: raw, idempotency_key: idempotencyKey, status: 'received',
  })
  if (insErr) {
    if (insErr.code === '23505') {
      // Already have it. Acknowledge, so the analyzer stops resending.
      return json(200, { status: 'duplicate', message: 'Already received' })
    }
    return json(500, { error: insErr.message })
  }

  // ── 2. Parse ─────────────────────────────────────────────────────────────
  const protocol = detectProtocol(raw)
  if (protocol !== 'astm') {
    await svc.from('analyzer_messages').update({
      status: 'failed',
      error: protocol === 'hl7'
        ? 'HL7 is not parsed yet — the message is stored and can be replayed once it is'
        : 'Could not tell what protocol this is',
    }).eq('id', messageId)
    return json(202, { status: 'stored', parsed: false, protocol })
  }

  const parsed = parseAstm(raw)

  // ── 3. Which instrument? ─────────────────────────────────────────────────
  let analyzerId: string | null = null
  if (parsed.fingerprint) {
    const { data: known } = await svc.from('lab_analyzers')
      .select('id, status').eq('tenant_id', tenantId).eq('fingerprint', parsed.fingerprint).maybeSingle()

    if (known) {
      analyzerId = known.id as string
    } else {
      // First time we have seen it. Recognise it from the shared library if we
      // can; either way it is recorded as 'discovered' and nothing it sends
      // goes anywhere near a patient until a person has looked at it.
      const { data: lib } = await svc.from('device_library')
        .select('id, manufacturer, model, protocol, framing')
        .eq('fingerprint', parsed.fingerprint).maybeSingle()

      analyzerId = crypto.randomUUID()
      await svc.from('lab_analyzers').insert({
        id: analyzerId, tenant_id: tenantId, connector_id: connectorId,
        device_library_id: lib?.id ?? null,
        fingerprint: parsed.fingerprint,
        manufacturer: parsed.manufacturer ?? lib?.manufacturer ?? null,
        model: parsed.model ?? lib?.model ?? null,
        protocol: 'astm', transport: 'tcp', status: 'discovered',
      })

      // Seed this hospital's code map from the library, where we have one.
      if (lib?.id) {
        const { data: codes } = await svc.from('device_library_codes')
          .select('analyzer_code, analyte_id, unit_ucum, decimals, factor')
          .eq('device_library_id', lib.id)
        if (codes?.length) {
          await svc.from('analyzer_mappings').insert(codes.map((c) => ({
            id: crypto.randomUUID(), tenant_id: tenantId, analyzer_id: analyzerId,
            analyzer_code: c.analyzer_code, analyte_id: c.analyte_id,
            unit_ucum: c.unit_ucum, decimals: c.decimals, factor: c.factor,
            source: 'library',
          })))
        }
      }
    }

    await svc.from('lab_analyzers')
      .update({ last_message_at: new Date().toISOString() }).eq('id', analyzerId)
  }

  // Record every code this instrument uses, mapped or not, so an unknown one
  // becomes a short list to confirm rather than a mystery.
  if (analyzerId && parsed.results.length) {
    await svc.from('analyzer_mappings').upsert(
      parsed.results.map((r) => ({
        id: crypto.randomUUID(), tenant_id: tenantId, analyzer_id: analyzerId!,
        analyzer_code: r.code, unit_ucum: r.unit, source: 'library', analyte_id: null,
      })),
      { onConflict: 'analyzer_id,analyzer_code', ignoreDuplicates: true },
    )
  }

  // ── 4. Which sample? ─────────────────────────────────────────────────────
  const barcode = parsed.sampleId
  let sample: { lab_order_id: string } | null = null
  if (barcode) {
    const { data } = await svc.from('lab_samples')
      .select('lab_order_id').eq('tenant_id', tenantId).eq('barcode', barcode).maybeSingle()
    sample = (data as { lab_order_id: string } | null) ?? null
  }

  await svc.from('analyzer_messages').update({
    analyzer_id: analyzerId,
    sample_barcode: barcode,
    parsed_json: parsed as unknown as Record<string, unknown>,
    status: 'parsed',
  }).eq('id', messageId)

  if (!sample) {
    await svc.from('analyzer_messages').update({
      status: 'unmatched',
      error: barcode ? `No sample with barcode ${barcode}` : 'Message carried no sample id',
    }).eq('id', messageId)
    return json(202, { status: 'unmatched', barcode, results: parsed.results.length })
  }

  // ── 5. Map the codes ─────────────────────────────────────────────────────
  const { data: maps } = await svc.from('analyzer_mappings')
    .select('analyzer_code, analyte_id, factor')
    .eq('analyzer_id', analyzerId ?? '').not('analyte_id', 'is', null).eq('enabled', true)

  const byCode = new Map((maps ?? []).map((m) => [m.analyzer_code as string, m]))

  // Which test on the order each analyte belongs to.
  const { data: onOrder } = await svc.rpc('get_order_analyte_form', { p_order_id: sample.lab_order_id })
  const testOf = new Map(
    ((onOrder ?? []) as Array<{ analyte_id: string; test_id: string }>)
      .map((r) => [r.analyte_id, r.test_id]),
  )

  const items: Array<{ test_id: string; analyte_id: string; value_num: number | null; value_text: string | null }> = []
  const unmapped: string[] = []
  for (const r of parsed.results) {
    const m = byCode.get(r.code)
    if (!m?.analyte_id) { unmapped.push(r.code); continue }
    const testId = testOf.get(m.analyte_id as string)
    if (!testId) { unmapped.push(r.code); continue }   // not on this order
    const n = Number(r.value)
    items.push({
      test_id: testId, analyte_id: m.analyte_id as string,
      value_num: Number.isFinite(n) ? n * Number(m.factor ?? 1) : null,
      value_text: Number.isFinite(n) ? null : r.value,
    })
  }

  if (!items.length) {
    await svc.from('analyzer_messages').update({
      status: 'unmatched',
      error: `None of these codes are mapped yet: ${[...new Set(unmapped)].join(', ')}`,
    }).eq('id', messageId)
    return json(202, { status: 'unmapped', codes: [...new Set(unmapped)] })
  }

  // ── 6. Write. Source 'analyzer', so the collection gate does not refuse it ─
  const { error: saveErr } = await svc.rpc('save_lab_analyte_results', {
    p_order_id: sample.lab_order_id,
    p_items: items,
    p_source: 'analyzer',
    p_analyzer: analyzerId,
  })

  if (saveErr) {
    await svc.from('analyzer_messages').update({ status: 'failed', error: saveErr.message }).eq('id', messageId)
    return json(500, { error: saveErr.message })
  }

  await svc.from('analyzer_messages').update({
    status: 'matched',
    error: unmapped.length ? `Unmapped codes ignored: ${[...new Set(unmapped)].join(', ')}` : null,
  }).eq('id', messageId)

  return json(200, {
    status: 'matched',
    order: sample.lab_order_id,
    written: items.length,
    unmapped: [...new Set(unmapped)],
  })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
