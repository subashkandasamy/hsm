import { createServiceClient } from '@/lib/supabase/service'
import { signViewerLink } from '@/lib/lab/viewerLink'
import { chooseFileRoute, type ConnectorReach } from '@/lib/radiology/viewerRoute'

/**
 * Uploaded files kept on the hospital's own computer (0275).
 *
 * Three kinds move there when an admin has switched it on for a computer:
 * patient-profile documents, IPD declaration uploads and radiology report
 * images. The upload itself is unchanged — it goes to the cloud — and the file
 * is noted here. The computer collects it on its next heartbeat, confirms it
 * holds an identical copy, and only then is the cloud copy deleted
 * (/api/device/files). Until then everything below answers "cloud", and the
 * caller signs a cloud URL exactly as before.
 *
 * Server code only: uses the service client, and the rows it reads are
 * server-only.
 */

export type LocalFileKind = 'patient_document' | 'ipd_declaration' | 'radiology_image'
export type LocalBucket = 'documents' | 'radiology'

/** What a viewer link to a kept file signs. Distinct from a study id, so a
 *  scan link can never be replayed as a file link or the other way round. */
export const fileLinkSubject = (id: string) => `file:${id}`

/**
 * Note an upload for the hospital computer, if this hospital keeps uploads
 * there. Never throws: an upload that was saved must not fail because the
 * bookkeeping for moving it did — it simply stays in the cloud.
 */
export async function queueForHospitalComputer(
  tenantId: string, bucket: LocalBucket, path: string, kind: LocalFileKind,
): Promise<void> {
  try {
    if (!path || /^https?:\/\//i.test(path)) return
    const svc = createServiceClient()
    const { data: c } = await svc.from('connectors').select('id')
      .eq('tenant_id', tenantId).eq('keep_uploads', true).neq('status', 'revoked').maybeSingle()
    if (!c) return
    await svc.from('local_files').upsert(
      { tenant_id: tenantId, connector_id: c.id, bucket, path, kind },
      { onConflict: 'bucket,path', ignoreDuplicates: true },
    )
  } catch (e) {
    console.error('[queueForHospitalComputer]', (e as Error).message)
  }
}

export type HospitalFileLink =
  /** Not on the hospital computer: sign a cloud URL as usual. */
  | { state: 'cloud' }
  /** On the hospital computer. `url` is null when nothing can reach it now. */
  | { state: 'computer'; url: string | null; where: 'hospital' | 'internet' | null }

/**
 * Where to open a stored file from.
 *
 * `embeddableOnly` for callers that are never inside the hospital or must
 * embed the file: the patient portal and server-side PDF printing.
 */
export async function hospitalFileLink(
  tenantId: string, bucket: LocalBucket, path: string,
  opts: { embeddableOnly?: boolean } = {},
): Promise<HospitalFileLink> {
  if (!path || /^https?:\/\//i.test(path)) return { state: 'cloud' }
  const svc = createServiceClient()
  const { data: f } = await svc.from('local_files').select('id, connector_id, status')
    .eq('tenant_id', tenantId).eq('bucket', bucket).eq('path', path).maybeSingle()
  if (!f || f.status !== 'on_computer') return { state: 'cloud' }
  if (!f.connector_id) return { state: 'computer', url: null, where: null }

  const { data: c } = await svc.from('connectors')
    .select('lan_ip, public_ip, viewer_key, status, internet_access, tunnel_hostname, tunnel_state, tunnel_state_at')
    .eq('tenant_id', tenantId).eq('id', f.connector_id).maybeSingle()
  if (!c || c.status === 'revoked' || !c.viewer_key) return { state: 'computer', url: null, where: null }

  const route = chooseFileRoute(c as unknown as ConnectorReach, opts)
  if (!route) return { state: 'computer', url: null, where: null }

  const expiresAt = Math.floor(Date.now() / 1000) + route.ttlSeconds
  const sig = signViewerLink(c.viewer_key as string, fileLinkSubject(f.id as string), expiresAt)
  return {
    state: 'computer',
    url: `${route.base}/file/${f.id}?e=${expiresAt}&s=${sig}`,
    where: route.where,
  }
}
