'use server'

import crypto from 'crypto'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { hashLoginToken, hashPassword, verifyPassword, getPartnerSession, setPartnerSession, clearPartnerSession } from '@/lib/partnerAuth'
import { sendPartnerPasswordEmail } from '@/lib/email'
import { DEFAULT_COMMISSION_PCT, referralLink } from '@/lib/referral'
import type { ReferralOverview, ReferredHospital } from '@/lib/types'

const SITE = 'https://www.uyirly.com'
const ALIVE = new Set(['trial', 'active', 'past_due'])

// Public self-registration — anyone can apply to become a referral partner.
// They choose a password now; an admin approves before they can sign in.
export async function registerPartner(input: {
  name: string; email: string; password: string; phone?: string; note?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const name = (input.name ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()
  const password = input.password ?? ''
  if (name.length < 2) return { success: false, error: 'Please enter your name' }
  if (!email.includes('@')) return { success: false, error: 'Please enter a valid email' }
  if (password.length < 8) return { success: false, error: 'Password must be at least 8 characters' }

  const svc = createServiceClient()
  const { data: existing } = await svc.from('partners').select('id, status').ilike('email', email).maybeSingle()
  if (existing) {
    return existing.status === 'pending'
      ? { success: false, error: 'This email has already applied — we’re reviewing it.' }
      : { success: false, error: 'This email is already registered as a partner. Try signing in.' }
  }

  const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'partner'
  for (let i = 0; i < 6; i++) {
    const code = `${base}${Math.random().toString(36).slice(2, 6)}`
    const { error } = await svc.from('partners').insert({
      name, type: 'external', status: 'pending',
      email, phone: (input.phone ?? '').trim() || null,
      referral_code: code,
      password_hash: hashPassword(password),
      payout_method: (input.note ?? '').trim() || null,
    })
    if (!error) return { success: true }
    if (error.code !== '23505') return { success: false, error: error.message }
  }
  return { success: false, error: 'Could not create your application — please try again.' }
}

// Sign in with email + password. Starts the partner session on success.
export async function loginPartner(
  email: string, password: string
): Promise<{ success: true } | { success: false; error: string }> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e.includes('@') || !password) return { success: false, error: 'Enter your email and password' }
  const svc = createServiceClient()
  const { data: partner } = await svc.from('partners')
    .select('id, status, password_hash').ilike('email', e).maybeSingle()

  // Uniform failure message (don't reveal which part was wrong).
  const bad = { success: false, error: 'Incorrect email or password' } as const
  if (!partner) return bad
  if (partner.status === 'pending') return { success: false, error: 'Your partner application is awaiting approval.' }
  if (partner.status !== 'active') return { success: false, error: 'This partner account is not active.' }
  if (!partner.password_hash) return { success: false, error: 'No password set — use “Forgot password” to create one.' }
  if (!verifyPassword(password, partner.password_hash as string)) return bad

  await setPartnerSession(partner.id as string)
  return { success: true }
}

// Email a set/reset-password link. Always returns success (no email disclosure).
export async function requestPartnerPasswordReset(email: string): Promise<{ success: true }> {
  const e = (email ?? '').trim().toLowerCase()
  if (e.includes('@')) {
    const svc = createServiceClient()
    const { data: partner } = await svc.from('partners')
      .select('id, name, email, status').ilike('email', e).maybeSingle()
    if (partner && partner.status !== 'rejected' && partner.email) {
      const raw = crypto.randomBytes(32).toString('base64url')
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await svc.from('partner_login_tokens').insert({
        partner_id: partner.id, token_hash: hashLoginToken(raw), expires_at: expires,
      })
      await sendPartnerPasswordEmail(partner.email as string, partner.name as string, `${SITE}/partner/reset?token=${raw}`)
    }
  }
  return { success: true }
}

// Set a new password from a valid reset/set token, then sign the partner in.
export async function setPartnerPassword(
  token: string, password: string
): Promise<{ success: true } | { success: false; error: string }> {
  if ((password ?? '').length < 8) return { success: false, error: 'Password must be at least 8 characters' }
  const svc = createServiceClient()
  const { data: row } = await svc.from('partner_login_tokens')
    .select('id, partner_id, expires_at, consumed_at').eq('token_hash', hashLoginToken(token)).maybeSingle()
  if (!row || row.consumed_at || new Date(row.expires_at as string) < new Date())
    return { success: false, error: 'This link is invalid or has expired — request a new one.' }

  await svc.from('partners').update({ password_hash: hashPassword(password) }).eq('id', row.partner_id)
  await svc.from('partner_login_tokens').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)

  // Log them in only if their account is active (pending stays out until approved).
  const { data: partner } = await svc.from('partners').select('status').eq('id', row.partner_id).maybeSingle()
  if (partner?.status === 'active') await setPartnerSession(row.partner_id as string)
  return { success: true }
}

export interface PartnerPayoutDetails {
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  upi_id: string | null
  pan_number: string | null
}
export interface PartnerPortalData {
  name: string
  email: string | null
  phone: string | null
  overview: ReferralOverview
  owed: number
  paid: number
  payout: PartnerPayoutDetails
}

export async function getPartnerPortalData(): Promise<PartnerPortalData | null> {
  const session = await getPartnerSession()
  if (!session) return null
  const svc = createServiceClient()

  const { data: partner } = await svc.from('partners').select('*').eq('id', session.partnerId).maybeSingle()
  if (!partner) return null

  const pct = (partner.commission_pct as number | null) ?? DEFAULT_COMMISSION_PCT
  const months = partner.commission_duration_months as number | null
  const durationLabel = months ? `for ${months} months` : 'for as long as they stay subscribed'

  const refs: ReferredHospital[] = []
  let referredCount = 0, activeCount = 0
  const { data: rows } = await svc.from('referrals')
    .select('referred_tenant_id, signup_at').eq('partner_id', partner.id).order('signup_at', { ascending: false })
  const ids = (rows ?? []).map(r => r.referred_tenant_id as string)
  referredCount = ids.length
  if (ids.length) {
    const { data: ts } = await svc.from('tenants').select('id, name, status').in('id', ids)
    const tMap = new Map((ts ?? []).map(t => [t.id as string, t]))
    for (const r of rows ?? []) {
      const t = tMap.get(r.referred_tenant_id as string)
      const status = (t?.status as string) ?? 'unknown'
      if (ALIVE.has(status)) activeCount++
      refs.push({ name: (t?.name as string) ?? 'Hospital', status, signup_at: r.signup_at as string })
    }
  }

  const { data: comms } = await svc.from('partner_commissions')
    .select('commission_amount, status').eq('partner_id', partner.id).in('status', ['accrued', 'paid'])
  let owed = 0, paid = 0
  for (const c of comms ?? []) {
    const amt = Number(c.commission_amount ?? 0)
    if (c.status === 'accrued') owed += amt; else if (c.status === 'paid') paid += amt
  }
  const totalEarned = owed + paid

  const code = partner.referral_code as string
  const overview: ReferralOverview = {
    referral_code: code,
    referral_link: referralLink(code),
    commission_pct: pct,
    duration_label: durationLabel,
    referred_count: referredCount,
    active_count: activeCount,
    total_earned: Math.round(totalEarned * 100) / 100,
    referrals: refs,
  }
  return {
    name: partner.name as string,
    email: (partner.email as string | null) ?? null,
    phone: (partner.phone as string | null) ?? null,
    overview,
    owed: Math.round(owed * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    payout: {
      bank_account_name: (partner.bank_account_name as string | null) ?? null,
      bank_account_number: (partner.bank_account_number as string | null) ?? null,
      bank_ifsc: (partner.bank_ifsc as string | null) ?? null,
      upi_id: (partner.upi_id as string | null) ?? null,
      pan_number: (partner.pan_number as string | null) ?? null,
    },
  }
}

// Partner updates their own bank/payout details (from the partner portal).
export async function updatePartnerBankDetails(input: {
  bank_account_name?: string; bank_account_number?: string; bank_ifsc?: string; upi_id?: string; pan_number?: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getPartnerSession()
  if (!session) return { success: false, error: 'Please sign in again' }
  const svc = createServiceClient()
  const { error } = await svc.from('partners').update({
    bank_account_name: input.bank_account_name?.trim() || null,
    bank_account_number: input.bank_account_number?.trim() || null,
    bank_ifsc: input.bank_ifsc?.trim().toUpperCase() || null,
    upi_id: input.upi_id?.trim() || null,
    pan_number: input.pan_number?.trim().toUpperCase() || null,
  }).eq('id', session.partnerId)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function signOutPartner(): Promise<void> {
  await clearPartnerSession()
  redirect('/partner/login')
}
