import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Uploaded files moving from the cloud to the hospital computer (0275).
 *
 *   GET  /api/device/files            → { files: [{ id, url, ext, size }] }
 *   POST /api/device/files            { id, ok: true, size, sha256 }
 *                                     { id, ok: false, error }
 *   Authorization: Bearer <connector token>
 *
 * GET hands the computer short-lived download links for files waiting for it.
 * POST is the computer saying it now holds an identical copy — the size it
 * received must equal the size in the cloud — and only after that is recorded
 * is the cloud copy deleted. The record changes first, so from that instant the
 * file opens from the computer; if the delete then fails, the cloud copy is a
 * harmless leftover rather than the only copy gone.
 *
 * Nothing here ever asks the computer to delete a file.
 */

const BATCH = 10
const MAX_ATTEMPTS = 10
const LINK_SECONDS = 10 * 60

async function connectorFor(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return { error: json(401, { error: 'Missing connector token' }) }
  const svc = createServiceClient()
  const { data: c } = await svc.from('connectors')
    .select('id, tenant_id, status, keep_uploads')
    .eq('token_hash', createHash('sha256').update(token).digest('hex'))
    .maybeSingle()
  if (!c) return { error: json(401, { error: 'Unknown connector token' }) }
  if (c.status === 'revoked') return { error: json(403, { error: 'This connector has been revoked' }) }
  return { svc, c }
}

/** Size of an object in storage, from its listing; null when it is not there. */
async function cloudSize(svc: ReturnType<typeof createServiceClient>, bucket: string, path: string): Promise<number | null> {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash) : ''
  const name = slash >= 0 ? path.slice(slash + 1) : path
  const { data } = await svc.storage.from(bucket).list(dir, { search: name, limit: 10 })
  const hit = (data ?? []).find((o) => o.name === name)
  const size = (hit?.metadata as { size?: number } | undefined)?.size
  return typeof size === 'number' ? size : null
}

export async function GET(request: Request) {
  const got = await connectorFor(request)
  if ('error' in got) return got.error
  const { svc, c } = got
  if (!c.keep_uploads) return json(200, { files: [] })

  const { data: rows } = await svc.from('local_files')
    .select('id, bucket, path, attempts')
    .eq('connector_id', c.id).in('status', ['waiting', 'failed']).lt('attempts', MAX_ATTEMPTS)
    .order('created_at').limit(BATCH)

  const files: Array<{ id: string; url: string; ext: string; size: number | null }> = []
  for (const r of rows ?? []) {
    const { data: signed } = await svc.storage.from(r.bucket as string).createSignedUrl(r.path as string, LINK_SECONDS)
    if (!signed?.signedUrl) {
      // Gone from the cloud — the document was deleted before it moved.
      // Nothing to collect; stop offering it.
      await svc.from('local_files').update({
        status: 'failed', attempts: MAX_ATTEMPTS, last_error: 'No longer in the cloud (deleted before it moved)',
      }).eq('id', r.id)
      continue
    }
    const ext = ((r.path as string).split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
    files.push({ id: r.id as string, url: signed.signedUrl, ext, size: await cloudSize(svc, r.bucket as string, r.path as string) })
  }
  return json(200, { files })
}

export async function POST(request: Request) {
  const got = await connectorFor(request)
  if ('error' in got) return got.error
  const { svc, c } = got

  let body: { id?: string; ok?: boolean; size?: number; sha256?: string; error?: string }
  try { body = await request.json() } catch { return json(400, { error: 'Body must be JSON' }) }
  if (!body.id) return json(400, { error: 'No file id' })

  const { data: f } = await svc.from('local_files')
    .select('id, bucket, path, status, attempts')
    .eq('id', body.id).eq('connector_id', c.id).maybeSingle()
  if (!f) return json(404, { error: 'Not a file for this computer' })
  if (f.status === 'on_computer') return json(200, { ok: true, already: true })

  if (!body.ok) {
    await svc.from('local_files').update({
      status: 'failed', attempts: (f.attempts as number) + 1,
      last_error: String(body.error ?? 'unknown').slice(0, 300),
    }).eq('id', f.id)
    return json(200, { ok: true })
  }

  // The copy must be whole before the cloud one goes.
  const expected = await cloudSize(svc, f.bucket as string, f.path as string)
  if (expected === null || typeof body.size !== 'number' || body.size !== expected || !/^[0-9a-f]{64}$/.test(body.sha256 ?? '')) {
    await svc.from('local_files').update({
      status: 'failed', attempts: (f.attempts as number) + 1,
      last_error: `Size check failed (cloud ${expected ?? 'missing'}, computer ${body.size ?? 'none'})`,
    }).eq('id', f.id)
    return json(409, { error: 'The copy does not match the cloud file; it will be fetched again.' })
  }

  const now = new Date().toISOString()
  const { error } = await svc.from('local_files').update({
    status: 'on_computer', size_bytes: body.size, sha256: body.sha256, moved_at: now, last_error: null,
  }).eq('id', f.id)
  if (error) return json(500, { error: error.message })

  const { error: delErr } = await svc.storage.from(f.bucket as string).remove([f.path as string])
  if (!delErr) await svc.from('local_files').update({ cloud_deleted_at: now }).eq('id', f.id)

  return json(200, { ok: true, cloudDeleted: !delErr })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
