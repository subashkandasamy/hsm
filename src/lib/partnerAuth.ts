// Server-only partner session helpers. External partners are NOT Supabase auth
// users — they get a custom HMAC-signed cookie (same approach as patients),
// scoped to `.uyirly.com` so the partner portal works on any host.
import { cookies } from 'next/headers'
import crypto from 'crypto'

const COOKIE_NAME = 'uyirly_partner'
const SECRET = process.env.COOKIE_SECRET ?? ''
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const isProd = process.env.NODE_ENV === 'production'
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'

interface PartnerClaims { sub: string; iat: number; exp: number }

function sign(payload: PartnerClaims): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verify(token: string): PartnerClaims | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as PartnerClaims
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch { return null }
}

// Hash a raw login token for at-rest storage (never store the raw token).
export function hashLoginToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

// Password hashing via Node's built-in scrypt (no external dependency).
// Stored as "salt:hash" (both hex).
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = crypto.scryptSync(pw, salt, 64).toString('hex')
  const a = Buffer.from(hash, 'hex'), b = Buffer.from(test, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function setPartnerSession(partnerId: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  const token = sign({ sub: partnerId, iat: now, exp: now + MAX_AGE })
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true, secure: isProd, sameSite: 'lax', path: '/',
    domain: isProd ? `.${ROOT}` : undefined,
    maxAge: MAX_AGE,
  })
}

export async function clearPartnerSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}

export async function getPartnerSession(): Promise<{ partnerId: string } | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const claims = verify(token)
  return claims ? { partnerId: claims.sub } : null
}
