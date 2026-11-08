import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { cookies, headers } from 'next/headers'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

/**
 * Server side of the PIN switch (0272). Nothing here is reachable from a
 * screen except through the checks in src/app/actions/counter.ts.
 */

/** httpOnly cookie on an approved computer: "<device id>.<random key>". */
export const DEVICE_COOKIE = 'uyirly_counter'
/** Set when a session was started by PIN; staff-account changes refuse such a session. */
export const PIN_SESSION_COOKIE = 'uyirly_pin_session'

const KEEP_SECONDS = 400 * 24 * 60 * 60     // the most a browser keeps a cookie
const cookieBase = () => ({ httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' })

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** The hospital this request is for, from the subdomain (stamped by proxy.ts). */
export async function requestTenantId(): Promise<string | null> {
  return (await headers()).get('x-tenant-id')
}

// PIN hashing lives in lib/pinHash (no Next.js imports) so it can be tested directly.
export { hashPin, verifyPin } from '@/lib/pinHash'

// ── The approved computer ──────────────────────────────────────────────────
export function newDeviceKey(): { key: string; hash: string } {
  const key = randomBytes(32).toString('base64url')
  return { key, hash: sha256(key) }
}

export async function setDeviceCookie(deviceId: string, key: string): Promise<void> {
  const jar = await cookies()
  jar.set(DEVICE_COOKIE, `${deviceId}.${key}`, { ...cookieBase(), maxAge: KEEP_SECONDS })
}

export async function clearDeviceCookie(): Promise<void> {
  const jar = await cookies()
  jar.set(DEVICE_COOKIE, '', { ...cookieBase(), maxAge: 0 })
}

export interface CounterDevice {
  id: string; tenant_id: string; name: string; failed_attempts: number; locked_until: string | null
}

/** The device id named in this browser's cookie (unverified) — to tell an admin "this computer". */
export async function deviceIdInCookie(): Promise<string | null> {
  const raw = (await cookies()).get(DEVICE_COOKIE)?.value ?? ''
  const id = raw.slice(0, raw.indexOf('.'))
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

/**
 * The approved computer this request comes from, or null. The key in the
 * cookie must hash to the stored hash, the device must be live, and it must
 * belong to the hospital whose address this is.
 */
export async function readDevice(): Promise<CounterDevice | null> {
  const raw = (await cookies()).get(DEVICE_COOKIE)?.value
  if (!raw) return null
  const dot = raw.indexOf('.')
  const id = raw.slice(0, dot), key = raw.slice(dot + 1)
  if (dot < 1 || !/^[0-9a-f-]{36}$/i.test(id) || !key) return null
  const tenantId = await requestTenantId()
  if (!tenantId) return null
  const { data } = await createServiceClient().from('shared_devices')
    .select('id, tenant_id, name, key_hash, failed_attempts, locked_until, revoked_at')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data || data.revoked_at) return null
  const a = Buffer.from(sha256(key), 'hex'), b = Buffer.from(data.key_hash as string, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { id: data.id, tenant_id: data.tenant_id, name: data.name, failed_attempts: data.failed_attempts, locked_until: data.locked_until }
}

// ── Sessions ───────────────────────────────────────────────────────────────
/**
 * Make `userId` the signed-in person on this browser. Supabase has no "sign in
 * as" call, so: a one-time sign-in link is made for them server-side (no email
 * is sent), redeemed here at once, and the resulting session written to the
 * cookies — an ordinary session, so every permission, grant and RLS rule
 * applies unchanged. The previous person's session on this browser ends first.
 */
export async function startSessionFor(userId: string, opts: { viaPin: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceClient()
  const { data: u, error: uErr } = await service.auth.admin.getUserById(userId)
  const email = u?.user?.email
  if (uErr || !email) return { ok: false, error: 'This staff member has no login email.' }
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email })
  if (linkErr || !link?.properties?.hashed_token) return { ok: false, error: 'Could not start the session. Try again.' }
  const anon = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: v, error: vErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
  if (vErr || !v.session) return { ok: false, error: 'Could not start the session. Try again.' }

  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  const { error: setErr } = await supabase.auth.setSession({ access_token: v.session.access_token, refresh_token: v.session.refresh_token })
  if (setErr) return { ok: false, error: 'Could not start the session. Try again.' }
  await markPinSession(opts.viaPin)
  return { ok: true }
}

export async function markPinSession(on: boolean): Promise<void> {
  const jar = await cookies()
  jar.set(PIN_SESSION_COOKIE, on ? '1' : '', { ...cookieBase(), maxAge: on ? 12 * 60 * 60 : 0 })
}

export async function isPinSession(): Promise<boolean> {
  return (await cookies()).get(PIN_SESSION_COOKIE)?.value === '1'
}
