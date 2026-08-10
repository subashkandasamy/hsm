'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendPasswordResetEmail } from '@/lib/email'
import { logAudit } from '@/lib/audit'

// ── 1. Forgot / Reset password ────────────────────────────────────────────────

const resetRateLimit = new Map<string, number>()
const RESET_COOLDOWN_MS = 60_000

export async function requestPasswordReset(
  email: string
): Promise<{ success: true }> {
  const trimmed = email.trim().toLowerCase()

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
  const hospitalName = hdrs.get('x-tenant-name') ?? 'your hospital'

  // Generate the recovery link via the admin API and deliver it through Resend
  // (branded + reliable) instead of Supabase's built-in recovery email.
  const service = createServiceClient()
  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email: trimmed,
    options: { redirectTo },
  })

  // Always return success — never reveal whether an account exists.
  if (error || !data?.properties?.action_link) return { success: true }

  await sendPasswordResetEmail(trimmed, hospitalName, data.properties.action_link)
  if (data.user?.id) {
    await logAudit(data.user.id, 'password_reset_requested', 'auth', data.user.id, { email: trimmed })
  }

  return { success: true }
}

/**
 * Sets a new password for the currently signed-in user and clears the
 * force-change flag. Used by the /change-password page that a staff member is
 * sent to on first login (while holding a temporary password). Runs the auth
 * update via the service role so it also works for the profile-flag write.
 */
export async function forcePasswordChange(
  newPassword: string
): Promise<{ success: true } | { success: false; error: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Your session has expired. Please sign in again.' }

  const service = createServiceClient()
  const { error: pwErr } = await service.auth.admin.updateUserById(user.id, { password: newPassword })
  if (pwErr) return { success: false, error: pwErr.message }

  const { error: profErr } = await service
    .from('profiles')
    .update({ must_change_password: false, temp_password_expires_at: null })
    .eq('id', user.id)
  if (profErr) return { success: false, error: profErr.message }

  await logAudit(user.id, 'password_changed', 'auth', user.id)
  return { success: true }
}

export async function completePasswordReset(): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await logAudit(user.id, 'password_reset_completed', 'auth', user.id)
  } catch {
    // Non-fatal
  }
}

// ── 2. Post-login redirect with tenant membership check ──────────────────────

type PostLoginResult =
  | { redirect: string }
  | { error: 'wrong_tenant'; tenantName: string }
  | { error: 'no_hospital_url' }

export async function getPostLoginRedirect(): Promise<PostLoginResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { redirect: '/login' }

    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()

    // Read tenant context first — it determines routing for dual-role users
    const hdrs = await headers()
    const tenantId   = hdrs.get('x-tenant-id')
    const tenantName = hdrs.get('x-tenant-name') ?? 'this hospital'
    const host       = hdrs.get('host') ?? ''
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
    const isApex     = host === rootDomain || host === `www.${rootDomain}`

    const { data: pa } = await service
      .from('platform_admins')
      .select('id')
      .eq('id', user.id)
      .single()

    if (pa) {
      // Platform admin on a tenant subdomain with a valid profile there → let them
      // into the tenant dashboard (they explicitly chose that subdomain)
      if (tenantId) {
        const { data: profile } = await service
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .eq('tenant_id', tenantId)
          .single()
        if (profile) return { redirect: '/dashboard' }
      }
      // No tenant context (apex / localhost) → platform admin panel
      return { redirect: '/platform-admin' }
    }

    // Regular tenant user — no tenant subdomain context
    if (!tenantId) {
      if (isApex) return { error: 'no_hospital_url' }
      return { redirect: '/dashboard' } // bare localhost dev
    }

    // Check the user has a profile for THIS specific tenant
    const { data: profile } = await service
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .eq('tenant_id', tenantId)
      .single()

    if (!profile) return { error: 'wrong_tenant', tenantName }
    return { redirect: '/dashboard' }
  } catch {
    return { redirect: '/dashboard' }
  }
}

// ── 3. Magic-link / PKCE callback ─────────────────────────────────────────────

export async function markMagicLinkLogin(): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false }
    await logAudit(user.id, 'login_success', 'auth', user.id, { method: 'magic_link' })
    return { success: true }
  } catch {
    return { success: false }
  }
}
