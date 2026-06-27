'use server'

import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { getActorProfile } from '@/lib/server-utils'
import { sendAuthSms, maskPhone } from '@/lib/smsAuth'
import { buildSessionCookie, SESSION_COOKIE } from '@/lib/sessionCookie'

// ── Shared helpers ────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Best-effort in-process rate limiter for password-reset requests.
// Not clustered — acceptable for this use case (Supabase has its own limits too).
const resetRateLimit = new Map<string, number>()
const RESET_COOLDOWN_MS = 60_000

// ── 13.1  Forgot / Reset password ────────────────────────────────────────────

/**
 * Request a password-reset email.
 * Always returns the same neutral response — never reveals whether the email exists.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ success: true }> {
  const trimmed = email.trim().toLowerCase()

  // In-process rate limit (best-effort)
  const key = `reset:${trimmed}`
  const last = resetRateLimit.get(key) ?? 0
  if (Date.now() - last < RESET_COOLDOWN_MS) return { success: true }
  resetRateLimit.set(key, Date.now())

  const hdrs = await headers()
  const slug = hdrs.get('x-tenant-slug')
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const redirectTo = slug
    ? `https://${slug}.${rootDomain}/reset-password`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? `https://${rootDomain}`}/reset-password`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })

  // Log only when the call succeeded (so we don't enumerate non-existent emails)
  if (!error) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await logAudit(user.id, 'password_reset_requested', 'auth', user.id, { email: trimmed })
  }

  return { success: true }
}

/**
 * Complete a password reset (called after Supabase sets the recovery session).
 * Audit-logs the completion so the event appears in the tenant's audit trail.
 */
export async function completePasswordReset(): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await logAudit(user.id, 'password_reset_completed', 'auth', user.id)
  } catch {
    // Non-fatal — page already shows success to the user
  }
}

// ── 13.2  SMS 2FA ─────────────────────────────────────────────────────────────

const MAX_OTP_ATTEMPTS = 5
const OTP_TTL_MS = 5 * 60 * 1000  // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 30_000

type Initiate2FAResult =
  | { status: 'otp_sent'; maskedPhone: string }
  | { status: 'disabled' }
  | { status: 'no_phone' }
  | { status: 'error'; error: string }

async function _sendOtp(profileId: string, tenantId: string, phone: string): Promise<void> {
  const supabase = await createClient()
  const code = generateOtp()
  const codeHash = await sha256(code)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Delete any prior unconsumed codes for this profile to keep the table clean
  await supabase
    .from('auth_otp_codes')
    .delete()
    .eq('profile_id', profileId)
    .is('consumed_at', null)

  await supabase.from('auth_otp_codes').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    profile_id: profileId,
    purpose: 'login_2fa',
    code_hash: codeHash,
    expires_at: expiresAt,
  })

  await sendAuthSms(phone, code)
}

async function _setSessionCookie(userId: string): Promise<void> {
  const cookieValue = await buildSessionCookie(userId)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 26 * 60 * 60,
    path: '/',
  })
}

export async function initiate2FA(): Promise<Initiate2FAResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', error: 'Not authenticated' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, tenant_id, phone')
      .eq('id', user.id)
      .single()

    if (!profile) return { status: 'error', error: 'Profile not found' }

    // Read 2FA flag from the proxy-injected header (avoids an extra DB round-trip).
    // Falls back to checking the DB directly if header is missing (e.g. local dev).
    const hdrs = await headers()
    const twoFAHeader = hdrs.get('x-tenant-2fa')
    let sms2faEnabled: boolean
    if (twoFAHeader !== null) {
      sms2faEnabled = twoFAHeader === '1'
    } else {
      const { createServiceClient } = await import('@/lib/supabase/service')
      const service = createServiceClient()
      const { data: tenant } = await service
        .from('tenants')
        .select('sms_2fa_enabled')
        .eq('id', profile.tenant_id)
        .single()
      sms2faEnabled = tenant?.sms_2fa_enabled ?? false
    }

    if (!sms2faEnabled) {
      // 2FA disabled — the proxy bypasses the session-cookie gate for this tenant,
      // so no cookie is needed. Avoid setting it because Next.js automatically
      // re-renders the current page after any cookieStore.set(), which adds an
      // extra middleware round-trip (~400 ms) to every login.
      // Fire-and-forget the audit log so it never blocks the redirect.
      Promise.resolve()
        .then(() => logAudit(user.id, 'login_success', 'auth', user.id, { method: 'password', two_fa: 'disabled' }))
        .catch(() => {})
      redirect('/dashboard')
    }

    if (!profile.phone) return { status: 'no_phone' }

    await _sendOtp(profile.id, profile.tenant_id, profile.phone)
    await logAudit(user.id, '2fa_sent', 'auth', user.id)

    return { status: 'otp_sent', maskedPhone: maskPhone(profile.phone) }
  } catch (e) {
    console.error('[initiate2FA]', e)
    return { status: 'error', error: 'Failed to send code' }
  }
}

export async function resend2FA(): Promise<
  | { status: 'sent'; maskedPhone: string }
  | { status: 'cooldown'; retryAfterMs: number }
  | { status: 'error'; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', error: 'Not authenticated' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, tenant_id, phone')
      .eq('id', user.id)
      .single()

    if (!profile?.phone) return { status: 'error', error: 'No phone on file' }

    // Cooldown: check most recent OTP
    const { data: recent } = await supabase
      .from('auth_otp_codes')
      .select('created_at')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      const elapsed = Date.now() - new Date(recent.created_at).getTime()
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        return { status: 'cooldown', retryAfterMs: OTP_RESEND_COOLDOWN_MS - elapsed }
      }
    }

    await _sendOtp(profile.id, profile.tenant_id, profile.phone)
    await logAudit(user.id, '2fa_sent', 'auth', user.id, { resend: true })

    return { status: 'sent', maskedPhone: maskPhone(profile.phone) }
  } catch (e) {
    console.error('[resend2FA]', e)
    return { status: 'error', error: 'Failed to resend code' }
  }
}

export async function verify2FA(code: string): Promise<
  | { status: 'verified' }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'locked' }
  | { status: 'error'; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', error: 'Not authenticated' }

    const actor = await getActorProfile()

    // Fetch the most recent unconsumed OTP
    const { data: otp } = await supabase
      .from('auth_otp_codes')
      .select('id, code_hash, expires_at, attempts')
      .eq('profile_id', actor.id)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otp) return { status: 'invalid' }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await logAudit(actor.id, '2fa_locked', 'auth', actor.id)
      return { status: 'locked' }
    }

    if (new Date(otp.expires_at) < new Date()) return { status: 'expired' }

    const enteredHash = await sha256(code.trim())

    if (enteredHash !== otp.code_hash) {
      // Increment attempts
      await supabase
        .from('auth_otp_codes')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id)

      if (otp.attempts + 1 >= MAX_OTP_ATTEMPTS) {
        await logAudit(actor.id, '2fa_locked', 'auth', actor.id)
        return { status: 'locked' }
      }

      await logAudit(actor.id, '2fa_failed_attempt', 'auth', actor.id,
        { attempts: otp.attempts + 1 })
      return { status: 'invalid' }
    }

    // ── Success ───────────────────────────────────────────────────────────────
    // Mark consumed and set phone_verified
    await supabase
      .from('auth_otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', otp.id)

    await supabase
      .from('profiles')
      .update({ phone_verified: true })
      .eq('id', actor.id)

    // Set the session cookie that the proxy checks on every request
    const cookieValue = await buildSessionCookie(actor.id)
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 26 * 60 * 60, // 26h so it outlasts the 24h window
      path: '/',
    })

    await logAudit(actor.id, '2fa_verified', 'auth', actor.id)
    await logAudit(actor.id, 'login_success', 'auth', actor.id)

    return { status: 'verified' }
  } catch (e) {
    console.error('[verify2FA]', e)
    return { status: 'error', error: 'Verification failed' }
  }
}

export async function addPhoneAndSend(phone: string): Promise<Initiate2FAResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', error: 'Not authenticated' }

    const cleanPhone = phone.trim()
    if (!/^\+?\d{7,15}$/.test(cleanPhone)) {
      return { status: 'error', error: 'Enter a valid phone number (7–15 digits, optional +)' }
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .update({ phone: cleanPhone })
      .eq('id', user.id)
      .select('id, tenant_id')
      .single()

    if (profileErr || !profile) {
      return { status: 'error', error: 'Could not save phone number' }
    }

    await _sendOtp(profile.id, profile.tenant_id, cleanPhone)
    await logAudit(user.id, '2fa_sent', 'auth', user.id, { phone_added: true })

    return { status: 'otp_sent', maskedPhone: maskPhone(cleanPhone) }
  } catch (e) {
    console.error('[addPhoneAndSend]', e)
    return { status: 'error', error: 'Failed to save phone and send code' }
  }
}

/**
 * Sets the session cookie for magic-link / PKCE callback flows.
 * Called after the client has already established the Supabase session.
 * Skips OTP for email-verified links (the email link acts as the second factor).
 */
export async function markMagicLinkLogin(): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }

    const cookieValue = await buildSessionCookie(user.id)
    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 26 * 60 * 60,
      path: '/',
    })

    await logAudit(user.id, 'login_success', 'auth', user.id, { method: 'magic_link' })
    return { success: true }
  } catch {
    return { success: false }
  }
}
