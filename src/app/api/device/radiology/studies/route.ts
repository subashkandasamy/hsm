import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A study has arrived on the hospital's disk.
 *
 *   POST /api/device/radiology/studies
 *   Authorization: Bearer <connector token>
 *
 * Note what does NOT come through here: the images. A CT study is hundreds of
 * megabytes and a busy hospital makes several gigabytes a day. The bytes stay
 * on the machine that received them and this records what exists, how much of
 * it there is, and where to find it.
 *
 * The rules, which are the lab connector's rules because the same things go
 * wrong:
 *
 * 1. Idempotent. DICOM gives every study a globally unique identifier, so the
 *    same study arriving twice — a re-send, a retry, a technologist pushing
 *    again — updates one row rather than making a second. Series counts grow
 *    rather than duplicate, because a machine often sends a study in pieces.
 *
 * 2. Never guess a patient. A study whose accession number matches no order
 *    waits for a person. Attaching images to the nearest plausible patient is
 *    the error this whole design exists to prevent.
 *
 * 3. Nothing is reported. Images arriving moves the order to 'performed' and
 *    no further. A scanner cannot read a scan; only a radiologist can, and the
 *    report still waits for one and is still authorised before release.
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'Missing connector token' })

  const svc = createServiceClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: connector } = await svc
    .from('connectors').select('id, tenant_id, status')
    .eq('token_hash', tokenHash).maybeSingle()

  if (!connector) return json(401, { error: 'Unknown connector token' })
  if (connector.status === 'revoked') return json(403, { error: 'This connector has been revoked' })

  const tenantId = connector.tenant_id as string

  interface SeriesIn {
    seriesInstanceUid: string; seriesNumber?: number | null
    modality?: string | null; description?: string | null
    instanceCount?: number; storagePath?: string | null
  }
  interface Body {
    studyInstanceUid?: string; accessionNumber?: string | null
    aeTitle?: string; manufacturer?: string | null; model?: string | null
    stationName?: string | null
    patientNameRaw?: string | null; patientIdRaw?: string | null
    modality?: string | null; studyDescription?: string | null
    studyDateTime?: string | null
    instanceCount?: number; sizeBytes?: number; storagePath?: string | null
    series?: SeriesIn[]
  }

  let body: Body
  try { body = await request.json() } catch { return json(400, { error: 'Body must be JSON' }) }

  const studyUid = (body.studyInstanceUid ?? '').trim()
  if (!studyUid) return json(400, { error: 'studyInstanceUid is required' })

  await svc.from('connectors')
    .update({ last_seen_at: new Date().toISOString(), status: 'online' })
    .eq('id', connector.id)

  // ── Which machine? ───────────────────────────────────────────────────────
  //
  // DICOM identifies a machine by an AE title somebody typed into it, not by
  // anything it announces about itself — so unlike an analyzer we cannot
  // recognise the model. We accept whatever connects and record it as
  // discovered, which keeps our side configuration-free.
  let modalityId: string | null = null
  const ae = (body.aeTitle ?? '').trim()
  if (ae) {
    const { data: known } = await svc.from('radiology_modalities')
      .select('id').eq('tenant_id', tenantId).eq('ae_title', ae).maybeSingle()

    if (known) {
      modalityId = known.id as string
      await svc.from('radiology_modalities').update({
        last_study_at: new Date().toISOString(),
        // The images know the modality more reliably than the AE title does.
        ...(body.modality ? { modality: body.modality.toUpperCase() } : {}),
        ...(body.manufacturer ? { manufacturer: body.manufacturer } : {}),
        ...(body.model ? { model: body.model } : {}),
      }).eq('id', modalityId)
    } else {
      const { data: made } = await svc.from('radiology_modalities').insert({
        tenant_id: tenantId, connector_id: connector.id, ae_title: ae,
        modality: body.modality?.toUpperCase() ?? null,
        manufacturer: body.manufacturer ?? null,
        model: body.model ?? null,
        station_name: body.stationName ?? null,
        status: 'discovered',
        last_study_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      modalityId = (made?.id as string) ?? null
    }
  }

  // ── Which order? ─────────────────────────────────────────────────────────
  const accession = (body.accessionNumber ?? '').trim() || null
  let orderId: string | null = null
  if (accession) {
    const { data: order } = await svc.from('radiology_orders')
      .select('id, status').eq('tenant_id', tenantId).eq('accession_no', accession).maybeSingle()
    orderId = (order?.id as string) ?? null
  }

  // ── Record the study ─────────────────────────────────────────────────────
  const { data: existing } = await svc.from('radiology_studies')
    .select('id, instance_count, size_bytes')
    .eq('tenant_id', tenantId).eq('study_instance_uid', studyUid).maybeSingle()

  const row = {
    tenant_id: tenantId,
    radiology_order_id: orderId,
    modality_id: modalityId,
    study_instance_uid: studyUid,
    accession_number: accession,
    patient_name_raw: body.patientNameRaw ?? null,
    patient_id_raw: body.patientIdRaw ?? null,
    modality: body.modality?.toUpperCase() ?? null,
    study_description: body.studyDescription ?? null,
    study_datetime: body.studyDateTime ?? null,
    series_count: body.series?.length ?? 0,
    // A machine commonly sends a study in pieces, so counts are the connector's
    // running total for what it holds rather than this message's contribution.
    instance_count: body.instanceCount ?? 0,
    size_bytes: body.sizeBytes ?? 0,
    storage_path: body.storagePath ?? null,
    status: orderId ? 'matched' : 'unmatched',
    error: orderId ? null
      : accession ? `No radiology order with accession ${accession}`
      : 'The study carried no accession number',
  }

  let studyId: string
  if (existing) {
    studyId = existing.id as string
    await svc.from('radiology_studies').update(row).eq('id', studyId)
  } else {
    const { data: made, error: insErr } = await svc.from('radiology_studies')
      .insert(row).select('id').maybeSingle()
    if (insErr || !made) return json(500, { error: insErr?.message ?? 'Could not record the study' })
    studyId = made.id as string
  }

  // Series are replaced wholesale: the connector knows what it holds on disk,
  // and that is the truth worth keeping.
  if (body.series?.length) {
    await svc.from('radiology_series').delete().eq('study_id', studyId)
    await svc.from('radiology_series').insert(body.series.map((s) => ({
      tenant_id: tenantId,
      study_id: studyId,
      series_instance_uid: s.seriesInstanceUid,
      series_number: s.seriesNumber ?? null,
      modality: s.modality?.toUpperCase() ?? null,
      description: s.description ?? null,
      instance_count: s.instanceCount ?? 0,
      storage_path: s.storagePath ?? null,
    })))
  }

  // ── Advance the order, and no further ────────────────────────────────────
  //
  // Images existing means the scan happened. It does not mean anybody has read
  // it, so this stops at 'performed' and the report is still written and
  // authorised by a person.
  if (orderId) {
    await svc.from('radiology_orders')
      .update({ status: 'performed' })
      .eq('id', orderId).eq('status', 'ordered')
  }

  return json(200, {
    status: orderId ? 'matched' : 'unmatched',
    studyId,
    accession,
    order: orderId,
    series: body.series?.length ?? 0,
    instances: body.instanceCount ?? 0,
  })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
