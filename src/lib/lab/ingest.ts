import { createServiceClient } from '@/lib/supabase/service'
import { parseAstm, detectProtocol } from './astm'

type Svc = ReturnType<typeof createServiceClient>

/**
 * How the connector heard this, from the label it sent.
 *
 * Recorded so the settings screen can say "over the network" or "on COM3"
 * rather than guessing — a hospital tracing a silent analyzer needs to know
 * which cable to look at.
 */
function transportOf(source?: string | null): string {
  if (!source) return 'tcp'
  if (source.startsWith('serial')) return 'serial'
  if (source.startsWith('file')) return 'file'
  return 'tcp'
}

export interface IngestOutcome {
  status: 'matched' | 'unmatched' | 'unmapped' | 'failed' | 'stored'
  order?: string
  written?: number
  unmapped?: string[]
  barcode?: string | null
  protocol?: string | null
  error?: string
}

/**
 * Turn one stored raw message into results.
 *
 * Deliberately separated from the HTTP route, because this has to run twice.
 * The first time is when an analyzer sends it. The second is when a human has
 * since fixed whatever stopped it landing — mapped an unknown code, attached a
 * barcode to the right order — and the message needs to be tried again.
 *
 * That is the whole reason the raw message is stored before it is understood.
 * A message that failed is not lost work, it is work waiting for a person, and
 * replaying it costs nothing because the analyzer is not involved.
 *
 * The caller has already created the analyzer_messages row. This function owns
 * that row's status from here on.
 */
export async function processMessage(
  svc: Svc,
  { tenantId, connectorId, messageId, raw, source }: {
    tenantId: string
    connectorId: string | null
    messageId: string
    raw: string
    /** Where the connector heard it: 'tcp 192.168.1.50', 'serial COM3'. */
    source?: string | null
  },
): Promise<IngestOutcome> {
  // ── Parse ────────────────────────────────────────────────────────────────
  const protocol = detectProtocol(raw)
  if (protocol !== 'astm') {
    const error = protocol === 'hl7'
      ? 'HL7 is not parsed yet — the message is stored and can be replayed once it is'
      : 'Could not tell what protocol this is'
    await svc.from('analyzer_messages').update({ status: 'failed', error }).eq('id', messageId)
    return { status: 'stored', protocol, error }
  }

  const parsed = parseAstm(raw)

  // ── Which instrument? ────────────────────────────────────────────────────
  //
  // Most instruments name themselves in the header, which is what makes this
  // list discovered rather than configured. Some do not — an older machine, a
  // vendor who left the field blank, a serial link that dropped the first
  // frame.
  //
  // Registering those under a stand-in identity rather than skipping them:
  // without it, no analyzer row is created, so no code is ever recorded, so
  // the hospital is told "these codes are not mapped yet" with nothing on the
  // screen to map. The message then sits in the queue for ever. A machine we
  // cannot name is still a machine whose codes a technician can identify.
  //
  // Keyed on where the connector heard it, so two unnamed machines on one lab
  // PC stay separate. If the connector could not say, they merge — visible to
  // the hospital, and better than the dead end.
  const fingerprint = parsed.fingerprint
    ?? `Unidentified${source ? ` (${source})` : ''}`

  let analyzerId: string | null = null
  {
    const { data: known } = await svc.from('lab_analyzers')
      .select('id, status').eq('tenant_id', tenantId)
      .eq('fingerprint', fingerprint).maybeSingle()

    if (known) {
      analyzerId = known.id as string
    } else {
      // First time we have seen it. Recognise it from the shared library if we
      // can; either way it is recorded as 'discovered' and nothing it sends
      // goes anywhere near a patient until a person has looked at it.
      //
      // Only a real, self-declared identity is worth looking up — a stand-in
      // built from a port number will never be in a library of instruments.
      const { data: lib } = parsed.fingerprint
        ? await svc.from('device_library')
            .select('id, manufacturer, model, protocol, framing')
            .eq('fingerprint', parsed.fingerprint).maybeSingle()
        : { data: null }

      analyzerId = crypto.randomUUID()
      await svc.from('lab_analyzers').insert({
        id: analyzerId, tenant_id: tenantId, connector_id: connectorId,
        device_library_id: lib?.id ?? null,
        fingerprint,
        manufacturer: parsed.manufacturer ?? lib?.manufacturer ?? null,
        model: parsed.model ?? lib?.model ?? null,
        protocol: 'astm', transport: transportOf(source), status: 'discovered',
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

  // ── Which sample? ────────────────────────────────────────────────────────
  //
  // A person resolving an unmatched message may have written the barcode onto
  // the row by hand, and that correction outranks what the machine said.
  const { data: row } = await svc.from('analyzer_messages')
    .select('sample_barcode').eq('id', messageId).maybeSingle()
  const barcode = (row?.sample_barcode as string | null) ?? parsed.sampleId

  let sample: { lab_order_id: string } | null = null
  if (barcode) {
    // Barcodes repeat across hospitals — accession numbers restart at 0001
    // daily per tenant — so this filter is what keeps one hospital's results
    // off another's patient.
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
    const error = barcode ? `No sample with barcode ${barcode}` : 'Message carried no sample id'
    await svc.from('analyzer_messages').update({ status: 'unmatched', error }).eq('id', messageId)
    return { status: 'unmatched', barcode, error }
  }

  // ── Map the codes ────────────────────────────────────────────────────────
  const { data: maps } = await svc.from('analyzer_mappings')
    .select('analyzer_code, analyte_id, factor')
    .eq('analyzer_id', analyzerId ?? '')
    .not('analyte_id', 'is', null).eq('enabled', true)

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
    const error = `None of these codes are mapped yet: ${[...new Set(unmapped)].join(', ')}`
    // Not 'unmatched' — the patient WAS found. Saying otherwise sends the
    // hospital to re-type a barcode that was already right.
    await svc.from('analyzer_messages').update({ status: 'unmapped', error }).eq('id', messageId)
    return { status: 'unmapped', unmapped: [...new Set(unmapped)], error }
  }

  // ── Write ────────────────────────────────────────────────────────────────
  const { error: saveErr } = await svc.rpc('save_lab_analyte_results', {
    p_order_id: sample.lab_order_id,
    p_items: items,
    p_source: 'analyzer',
    p_analyzer: analyzerId,
    // Checked by the database, so a mistake here is refused rather than
    // written onto a stranger's chart.
    p_tenant_id: tenantId,
  })

  if (saveErr) {
    await svc.from('analyzer_messages').update({ status: 'failed', error: saveErr.message }).eq('id', messageId)
    return { status: 'failed', error: saveErr.message }
  }

  await svc.from('analyzer_messages').update({
    status: 'matched',
    error: unmapped.length ? `Unmapped codes ignored: ${[...new Set(unmapped)].join(', ')}` : null,
  }).eq('id', messageId)

  return {
    status: 'matched',
    order: sample.lab_order_id,
    written: items.length,
    unmapped: [...new Set(unmapped)],
  }
}
