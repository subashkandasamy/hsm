'use server'

import crypto from 'crypto'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { hashLoginToken, getPartnerSession, clearPartnerSession } from '@/lib/partnerAuth'
import { sendPartnerLoginEmail } from '@/lib/email'
import { DEFAULT_COMMISSION_PCT, referralLink } from '@/lib/referral'
import type { ReferralOverview, ReferredHospital } from '@/lib/types'

const SITE = 'https://www.uyirly.com'
const ALIVE = new Set(['trial', 'active', 'past_due'])

// Step 1: email a one-time sign-in link. Always returns success so we never
// reveal whether an email belongs to a partner.
export async function requestPartnerLogin(email: string): Promise<{ success: true }> {
  const e = (email ?? '').trim().toLowerCase()
  if (e && e.includes('@')) {
    const svc = createServiceClient()
    const { data: partner } = await svc.from('partners')
      .select('id, email, status').ilike('email', e).maybeSingle()
    if (partner && partner.status === 'active' && partner.email) {
      const raw = crypto.randomBytes(32).toString('base64url')
      const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString()
      await svc.from('partner_login_tokens').insert({
        partner_id: partner.id, token_hash: hashLoginToken(raw), expires_at: expires,
      })
      await sendPartnerLoginEmail(partner.email as string, `${SITE}/partner/verify?token=${raw}`)
    }
  }
  return { success: true }
}

export interface PartnerPortalData { name: string; overview: ReferralOverview }

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
  const totalEarned = (comms ?? []).reduce((s, c) => s + Number(c.commission_amount ?? 0), 0)

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
  return { name: partner.name as string, overview }
}

export async function signOutPartner(): Promise<void> {
  await clearPartnerSession()
  redirect('/partner/login')
}
