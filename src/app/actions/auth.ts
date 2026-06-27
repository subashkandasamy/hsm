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

// ── 2. Magic-link / PKCE callback ─────────────────────────────────────────────

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
