import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { tenantHasModule } from '@/lib/tenantModule'
import { toDicomModality, modalityMatches } from '@/lib/radiology/modality'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * What the scanner should be doing today.
 *
 *   GET /api/device/radiology/worklist?modality=CT
 *   Authorization: Bearer <connector token>
 *
 * The connector answers a machine's DICOM Modality Worklist query from this.
 * It is the single most useful thing in radiology integration and it has
 * nothing to do with images: today a technologist types the patient's name and
 * hospital number into the console by hand, and a typo there produces a study
 * filed against the wrong patient — the most dangerous routine error in a
 * radiology department, and one nobody notices until somebody reads the wrong
 * chest.
 *
 * With this, the list appears on the machine and they choose from it. Every
 * image is then born carrying the right identifiers and the right accession
 * number, which is also what lets the study find its way back to the order.
 *
 * Deliberately small: a worklist is a promise about the next few hours, not a
 * database export. A machine asking for it does not need last month.
 */
export async function GET(request: Request) {
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
  // downgraded off Growth kept sending a radiology worklist indefinitely: the only
  // check was 'revoked'.
  if (!(await tenantHasModule(connector.tenant_id as string, 'radiology'))) {
    return json(402, { error: 'This hospital\u2019s plan does not include this module' })
  }

  const url = new URL(request.url)
  const wantModality = url.searchParams.get('modality')?.toUpperCase() ?? null
  const callingAe = url.searchParams.get('ae')?.trim() || null

  // The version travels as a header on every device call. It used to be sent
  // only in the body of a lab result upload, so a computer wired to a scanner
  // and nothing else reported its version once, at pairing, and never again —
  // and Uyirly went on offering an upgrade that had already been installed.
  const reported = request.headers.get('x-connector-version')?.trim() || null

  const now = new Date().toISOString()
  await svc.from('connectors')
    .update({ last_seen_at: now, status: 'online', ...(reported ? { version: reported } : {}) })
    .eq('id', connector.id)

  // A machine that asks for its worklist has announced itself as surely as one
  // that sends images, and a hospital should not have to take a picture before
  // its scanner appears in Uyirly. `last_study_at` stays null until it does —
  // the screen then says it has been seen but has sent nothing yet, which is
  // the honest and more useful thing to show during an installation.
  if (callingAe) {
    const { data: known } = await svc.from('radiology_modalities')
      .select('id').eq('tenant_id', connector.tenant_id).eq('ae_title', callingAe).maybeSingle()
    if (known) {
      await svc.from('radiology_modalities')
        .update({ last_worklist_at: now, ...(wantModality ? { modality: wantModality } : {}) })
        .eq('id', known.id)
    } else {
      await svc.from('radiology_modalities').insert({
        tenant_id: connector.tenant_id, connector_id: connector.id,
        ae_title: callingAe, modality: wantModality, status: 'discovered',
        last_worklist_at: now,
      })
    }
  }

  // Anything not yet performed. A scan scheduled for tomorrow is on the list
  // too, because a patient who turns up early should not be turned away for
  // want of an entry — the technologist can see the date beside the name.
  const { data: orders, error } = await svc
    .from('radiology_orders')
    .select(`
      id, accession_no, status, priority, scheduled_for, ordered_at,
      patient:patients!radiology_orders_patient_id_fkey(id, uhid, full_name, dob, gender),
      orderer:profiles!radiology_orders_ordered_by_fkey(full_name),
      test:radiology_catalog(name, modality, body_part)
    `)
    .eq('tenant_id', connector.tenant_id)
    // 'ordered' is the only pre-scan state this schema has — scheduled_for is
    // a time, not a status. An order stays 'ordered' until it is performed.
    .eq('status', 'ordered')
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .limit(200)

  if (error) return json(500, { error: error.message })

  type Row = {
    id: string; accession_no: string | null; status: string; priority: string | null
    scheduled_for: string | null; ordered_at: string
    patient: { uhid: string; full_name: string; dob: string | null; gender: string | null } | null
    orderer: { full_name: string } | null
    test: { name: string; modality: string | null; body_part: string | null } | null
  }

  const items = ((orders ?? []) as unknown as Row[])
    .filter((o) => o.accession_no && o.patient)
    // The catalogue stores our slug; a machine asks by DICOM code.
    .filter((o) => modalityMatches(toDicomModality(o.test?.modality), wantModality))
    .map((o) => ({
      accessionNumber: o.accession_no,
      // The hospital number, not our internal id. It is what a technologist
      // reads off the patient's card to check they picked the right line.
      patientId: o.patient!.uhid,
      patientName: o.patient!.full_name,
      patientBirthDate: o.patient!.dob,
      patientSex: (o.patient!.gender ?? '').toUpperCase().startsWith('M') ? 'M'
        : (o.patient!.gender ?? '').toUpperCase().startsWith('F') ? 'F' : 'O',
      modality: toDicomModality(o.test?.modality),
      studyDescription: o.test?.name ?? null,
      bodyPart: o.test?.body_part ?? null,
      scheduledFor: o.scheduled_for ?? o.ordered_at,
      referringPhysician: o.orderer?.full_name ?? null,
      // A machine cannot show urgency, but the list is ordered by it and some
      // consoles display the priority field.
      priority: o.priority === 'stat' ? 'STAT' : 'ROUTINE',
    }))

  return json(200, { count: items.length, items })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
