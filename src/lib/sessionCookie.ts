// Session cookie — tracks that the current browser session has completed
// both password login AND SMS 2FA.
//
// Uses the Web Crypto HMAC-SHA256 API, which works in both Edge (proxy)
// and Node.js (server actions) without any import.
//
// Cookie value format: {userId}.{timestampMs}.{sig32hex}

export const SESSION_COOKIE = '_uyirly_la'
export const SESSION_MAX_MS = 24 * 60 * 60 * 1000   // 24 hours hard limit
export const SESSION_WARN_MS = 10 * 60 * 1000        // show warning 10 min before expiry

function secret(): string {
  return process.env.COOKIE_SECRET ?? 'dev-secret-please-change-in-production'
}

async function computeSig(userId: string, ts: number): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(`${userId}:${ts}`))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export async function buildSessionCookie(userId: string): Promise<string> {
  const ts = Date.now()
  const sig = await computeSig(userId, ts)
  return `${userId}.${ts}.${sig}`
}

/**
 * Verify the cookie value and check it belongs to expectedUserId.
 * Returns the loginAt timestamp (ms) on success, or null if invalid/tampered.
 */
export async function verifySessionCookie(
  value: string | undefined,
  expectedUserId: string
): Promise<number | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 3) return null
  const [userId, tsStr, sig] = parts
  if (userId !== expectedUserId) return null
  const ts = parseInt(tsStr, 10)
  if (isNaN(ts)) return null
  const expected = await computeSig(userId, ts)
  if (sig !== expected) return null
  return ts
}
