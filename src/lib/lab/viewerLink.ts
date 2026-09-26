import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signing a link to a patient's scans.
 *
 * The images are served by the connector on the hospital's own network, and
 * before this anyone there who had a study's identifier could read them. A
 * study id is long and unguessable, but it is also permanent — once it has
 * been in a browser history or a chat message it is a key that never expires.
 *
 * So the link carries an expiry and a signature over it. A link that leaks
 * stops working, and one that is guessed never worked.
 *
 * Deliberately not JWT: both ends of this are ours, the payload is two
 * strings, and a dependency-free HMAC is easier to reason about than a library
 * with algorithm negotiation in it.
 */

/** Long enough for a ward round, short enough that a stale link is useless. */
export const VIEWER_LINK_TTL_SECONDS = 8 * 60 * 60

const payload = (studyUid: string, expiresAt: number) => `${studyUid}:${expiresAt}`

export function signViewerLink(
  viewerKey: string, studyUid: string, expiresAt: number,
): string {
  // 128 bits is far beyond guessing and keeps the URL readable.
  return createHmac('sha256', viewerKey)
    .update(payload(studyUid, expiresAt))
    .digest('hex')
    .slice(0, 32)
}

export function verifyViewerLink(
  viewerKey: string, studyUid: string, expiresAt: number, signature: string,
): boolean {
  if (!viewerKey || !signature) return false
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false

  const expected = Buffer.from(signViewerLink(viewerKey, studyUid, expiresAt))
  const given = Buffer.from(signature)
  // Compared in constant time: a length check first, because timingSafeEqual
  // throws on a mismatch and that throw would itself leak the length.
  if (expected.length !== given.length) return false
  return timingSafeEqual(expected, given)
}
