'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo })

  if (!error) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await logAudit(user.id, 'password_reset_requested', 'auth', user.id, { email: trimmed })
  }

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
