import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The key the connector needs to check a viewer link.
 *
 *   GET /api/device/viewer-key
 *   Authorization: Bearer <connector token>
 *
 * Fetched at startup rather than handed over during pairing, so connectors
 * already installed are protected without anybody reinstalling them.
 *
 * Giving this out is safe in a way the bearer token would not be: it only
 * authorises reading images that are already sitting on that hospital's own
 * network, and only to somebody who could already reach the connector. It
 * cannot send a result, claim a machine, or read anything from Uyirly.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return json(401, { error: 'Missing connector token' })

  const svc = createServiceClient()
  const tokenHash = createHash('sha256').update(token).digest('hex')

  const { data: connector } = await svc
    .from('connectors')
    .select('id, viewer_key, status')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!connector) return json(401, { error: 'Unknown connector token' })
  if (connector.status === 'revoked') return json(403, { error: 'This connector has been revoked' })

  // A connector paired before this existed has no key yet; make one now rather
  // than leave its viewer unable to verify anything.
  let key = connector.viewer_key as string | null
  if (!key) {
    key = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
    await svc.from('connectors').update({ viewer_key: key }).eq('id', connector.id)
  }

  return json(200, { viewerKey: key })
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}
