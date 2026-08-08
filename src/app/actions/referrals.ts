'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getActorProfile } from '@/lib/server-utils'
import { DEFAULT_COMMISSION_PCT, referralLink } from '@/lib/referral'
import type { ReferralOverview, ReferredHospital } from '@/lib/types'

// tenants that are still "alive" (referrer still earns / could earn)
const ALIVE = new Set(['trial', 'active', 'past_due'])

function makeCode(slug: string): string {
  const base = (slug || 'ref').replace(/[^a-z0-9]/g, '').slice(0, 14) || 'ref'
  const rand = Math.random().toString(36).slice(2, 6)
  return `${base}${rand}`
}

/**
 * The current tenant's referral overview — creates the tenant's partner row
 * (with a unique referral code) on first access, then returns the code, link,
 * commission terms, and the hospitals they've referred so far.
 */
export async function getMyReferralOverview(): Promise<ReferralOverview> {
  const actor = await getActorProfile()
  const svc = createServiceClient()

  const { data: tenant } = await svc.from('tenants').select('name, slug').eq('id', actor.tenant_id).single()

  // Find or create this tenant's partner row.
  let { data: partner } = await svc.from('partners')
    .select('*').eq('tenant_id', actor.tenant_id).maybeSingle()

  if (!partner) {
    let created = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const code = makeCode(tenant?.slug ?? '')
      const { data, error } = await svc.from('partners').insert({
        tenant_id: actor.tenant_id,
        name: tenant?.name ?? 'Hospital',
        type: 'tenant',
        referral_code: code,
      }).select('*').single()
      if (!error) { created = data; break }
      if (error.code !== '23505') break   // not a duplicate-code collision → stop
    }
    // If a partner already existed (race), re-read it.
    partner = created ?? (await svc.from('partners').select('*').eq('tenant_id', actor.tenant_id).maybeSingle()).data
  }

  const pct = (partner?.commission_pct as number | null) ?? DEFAULT_COMMISSION_PCT
  const months = partner?.commission_duration_months as number | null
  const durationLabel = months ? `for ${months} months` : 'for as long as they stay subscribed'

  // Referred hospitals (names + status live in other tenants → service read).
  const refs: ReferredHospital[] = []
  let referredCount = 0, activeCount = 0
  if (partner) {
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
  }

  // Total earned = accrued + paid commissions (reversed excluded), from live charges.
  let totalEarned = 0
  if (partner) {
    const { data: comms } = await svc.from('partner_commissions')
      .select('commission_amount, status').eq('partner_id', partner.id).in('status', ['accrued', 'paid'])
    totalEarned = (comms ?? []).reduce((s, c) => s + Number(c.commission_amount ?? 0), 0)
  }

  const code = (partner?.referral_code as string) ?? ''
  return {
    referral_code: code,
    referral_link: referralLink(code),
    commission_pct: pct,
    duration_label: durationLabel,
    referred_count: referredCount,
    active_count: activeCount,
    total_earned: Math.round(totalEarned * 100) / 100,
    referrals: refs,
  }
}
