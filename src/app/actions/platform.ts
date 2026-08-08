'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { razorpay, PLANS } from '@/lib/razorpay'
import type { TenantWithStats } from '@/lib/types'

// ── Auth guard ────────────────────────────────────────────────────────────────

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')

  // Use service client to bypass RLS on platform_admins.
  // The RLS policy requires you to already be in the table to read it —
  // using the anon client creates a circular block for first-time checks.
  const service = createServiceClient()
  const { data } = await service
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!data) throw new Error('FORBIDDEN: not a platform admin')
  return user
}

// Write to the platform_admin_audit table (separate from tenant audit_logs).
async function logAdminAction(
  service: ReturnType<typeof createServiceClient>,
  adminId: string,
  action: string,
  targetTenantId: string | null,
  meta?: Record<string, unknown>,
) {
  await service.from('platform_admin_audit').insert({
    admin_id:         adminId,
    action,
    target_tenant_id: targetTenantId,
    meta:             meta ?? null,
  })
}

// ── Tenant listing ────────────────────────────────────────────────────────────

export async function listTenants(params?: { status?: string }): Promise<TenantWithStats[]> {
  await requirePlatformAdmin()

  const service = createServiceClient()
  let q = service.from('tenants').select('*').order('created_at', { ascending: false })
  if (params?.status) q = q.eq('status', params.status)
  const { data: tenants } = await q

  if (!tenants) return []

  const stats = await Promise.all(
    tenants.map(async (t) => {
      const [userRes, patientRes] = await Promise.all([
        service.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
        service.from('patients').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
      ])
      return {
        ...t,
        user_count:    userRes.count ?? 0,
        patient_count: patientRes.count ?? 0,
        last_activity: null as string | null,
      }
    })
  )

  return stats as TenantWithStats[]
}

// ── Tenant status ops ─────────────────────────────────────────────────────────

export async function suspendTenant(
  tenantId: string, reason: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { error } = await service
    .from('tenants')
    .update({ status: 'suspended' })
    .eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(service, actor.id, 'suspend_tenant', tenantId, { reason })
  return { success: true }
}

export async function reactivateTenant(
  tenantId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenant } = await service
    .from('tenants').select('status').eq('id', tenantId).single()

  const { data: sub } = await service
    .from('subscriptions').select('status').eq('tenant_id', tenantId).maybeSingle()

  const newStatus = sub?.status === 'active' ? 'active' : 'trial'

  const { error } = await service
    .from('tenants').update({ status: newStatus }).eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(service, actor.id, 'reactivate_tenant', tenantId, {
    previous_status: tenant?.status,
    new_status: newStatus,
  })
  return { success: true }
}

export async function setTenantAccessOverride(
  tenantId: string,
  until: string | null
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { error } = await service
    .from('tenants')
    .update({ override_access_until: until })
    .eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(service, actor.id, 'access_override', tenantId, { override_access_until: until })
  return { success: true }
}

// ── Impersonation (real Supabase magic link) ──────────────────────────────────

export interface ImpersonateResult {
  success: true; magicLink: string; adminEmail: string
}

export async function impersonateTenant(
  tenantId: string
): Promise<ImpersonateResult | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenant } = await service
    .from('tenants').select('slug, name').eq('id', tenantId).single()
  if (!tenant) return { success: false, error: 'Tenant not found' }

  const { data: adminProfile } = await service
    .from('profiles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!adminProfile) return { success: false, error: 'No active admin found for this tenant' }

  const { data: authUser } = await service.auth.admin.getUserById(adminProfile.id)
  const adminEmail = authUser.user?.email
  if (!adminEmail) return { success: false, error: 'Admin email not found' }

  // Generate a one-time magic link — clicking it logs in as the tenant admin
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const redirectTo = `https://${tenant.slug}.${rootDomain}/dashboard`

  const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
    type:       'magiclink',
    email:      adminEmail,
    options:    { redirectTo },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    return { success: false, error: linkErr?.message ?? 'Failed to generate magic link' }
  }

  await logAdminAction(service, actor.id, 'impersonate_tenant', tenantId, {
    target_admin_email: adminEmail,
    target_slug:        tenant.slug,
  })

  return { success: true, magicLink: linkData.properties.action_link, adminEmail }
}

// ── Plan management ───────────────────────────────────────────────────────────

export async function changeTenantPlan(
  tenantId: string,
  newPlan: 'starter' | 'growth',
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenant } = await service
    .from('tenants').select('plan, status').eq('id', tenantId).single()
  if (!tenant) return { success: false, error: 'Tenant not found' }

  const { data: sub } = await service
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // If active Razorpay subscription exists, update the plan on Razorpay too
  if (sub?.stripe_subscription_id && sub.status === 'active') {
    const planId = PLANS[newPlan]?.planId
    if (!planId) return { success: false, error: 'Razorpay plan ID not configured for this plan' }

    try {
      // Razorpay: update subscription plan
      await (razorpay.subscriptions as any).update(sub.stripe_subscription_id, {
        plan_id: planId,
        quantity: 1,
        schedule_change_at: 'cycle_end',
      })
    } catch (err: any) {
      return { success: false, error: err?.error?.description ?? err?.message ?? 'Razorpay plan change failed' }
    }
  }

  // Always update DB regardless of Razorpay result (admin override)
  await Promise.all([
    service.from('tenants').update({ plan: newPlan }).eq('id', tenantId),
    service.from('subscriptions').update({ plan: newPlan }).eq('tenant_id', tenantId),
  ])

  await logAdminAction(service, actor.id, 'change_plan', tenantId, {
    previous_plan: tenant.plan,
    new_plan:      newPlan,
  })
  return { success: true }
}

// ── Trial extension ───────────────────────────────────────────────────────────

export async function extendTrial(
  tenantId: string,
  days: number,
): Promise<{ success: true; new_trial_ends_at: string } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenant } = await service
    .from('tenants').select('trial_ends_at, status').eq('id', tenantId).single()
  if (!tenant) return { success: false, error: 'Tenant not found' }

  // Extend from now if trial already expired, otherwise from current end date
  const base = tenant.trial_ends_at && new Date(tenant.trial_ends_at) > new Date()
    ? new Date(tenant.trial_ends_at)
    : new Date()

  const newEnd = new Date(base.getTime() + days * 86_400_000).toISOString()

  const { error } = await service
    .from('tenants')
    .update({ trial_ends_at: newEnd, status: 'trial' })
    .eq('id', tenantId)

  if (error) return { success: false, error: error.message }

  await logAdminAction(service, actor.id, 'extend_trial', tenantId, {
    days_added:        days,
    new_trial_ends_at: newEnd,
  })
  return { success: true, new_trial_ends_at: newEnd }
}

// ── Tenant creation ───────────────────────────────────────────────────────────

export async function createTenant(params: {
  name:       string
  slug:       string
  adminEmail: string
  plan:       'starter' | 'growth'
  trialDays?: number
}): Promise<{ success: true; tenantId: string } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { name, slug, adminEmail, plan, trialDays = 30 } = params

  // Validate slug uniqueness
  const { data: existing } = await service
    .from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing) return { success: false, error: `Slug "${slug}" is already taken` }

  const tenantId    = crypto.randomUUID()
  const trialEndsAt = new Date(Date.now() + trialDays * 86_400_000).toISOString()

  // 1. Create the tenant row
  const { error: tenantErr } = await service.from('tenants').insert({
    id:            tenantId,
    name,
    slug,
    plan,
    status:        'trial',
    trial_ends_at: trialEndsAt,
  })
  if (tenantErr) return { success: false, error: tenantErr.message }

  // 2. Invite the admin user (creates auth user + sends invite email)
  const { data: invited, error: inviteErr } = await service.auth.admin.inviteUserByEmail(adminEmail, {
    data: { tenant_id: tenantId, role: 'admin' },
    redirectTo: `https://${slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'}/onboarding`,
  })
  if (inviteErr || !invited?.user) {
    await service.from('tenants').delete().eq('id', tenantId)
    return { success: false, error: inviteErr?.message ?? 'Failed to invite user' }
  }

  // 3. Create the profiles row so the user can log in immediately
  await service.from('profiles').insert({
    id:         invited.user.id,
    tenant_id:  tenantId,
    full_name:  name + ' Admin',
    role:       'admin',
    is_active:  true,
  })

  await logAdminAction(service, actor.id, 'create_tenant', tenantId, {
    name, slug, admin_email: adminEmail, plan, trial_days: trialDays,
  })
  return { success: true, tenantId }
}

// ── Tenant data purge ─────────────────────────────────────────────────────────

export async function purgeTenantData(
  tenantId: string,
  confirmSlug: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  // Verify the caller typed the tenant slug correctly
  const { data: tenant } = await service
    .from('tenants').select('slug, name').eq('id', tenantId).single()
  if (!tenant) return { success: false, error: 'Tenant not found' }
  if (confirmSlug !== tenant.slug) return { success: false, error: 'Slug confirmation does not match' }

  // Capture the tenant's auth users BEFORE the RPC deletes their profiles rows.
  const { data: profs } = await service.from('profiles').select('id').eq('tenant_id', tenantId)
  const userIds = (profs ?? []).map((p) => p.id as string)

  const { error } = await service.rpc('purge_tenant_data', { p_tenant_id: tenantId })
  if (error) return { success: false, error: error.message }

  // Remove the auth users too — auth.users lives outside the schema the purge
  // function can reach. Best-effort: log failures but don't fail the purge.
  let authFailures = 0
  for (const uid of userIds) {
    const { error: delErr } = await service.auth.admin.deleteUser(uid)
    if (delErr) { authFailures++; console.error('[purgeTenantData] auth delete failed', uid, delErr.message) }
  }

  await logAdminAction(service, actor.id, 'purge_tenant_data', tenantId, {
    tenant_name: tenant.name,
    tenant_slug: tenant.slug,
    auth_users_deleted: userIds.length - authFailures,
    auth_delete_failures: authFailures,
  })
  return { success: true }
}

// ── Subscription ops ──────────────────────────────────────────────────────────

export interface AdminSubscriptionRow {
  tenant_id:      string
  tenant_name:    string
  tenant_slug:    string
  plan:           string
  status:         string
  current_period_end: string | null
  razorpay_sub_id: string | null
}

export async function listSubscriptions(): Promise<AdminSubscriptionRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: subs } = await service
    .from('subscriptions')
    .select('tenant_id, plan, status, current_period_end, stripe_subscription_id')
    .order('tenant_id')

  if (!subs || !subs.length) return []

  const tenantIds = subs.map(s => s.tenant_id as string)
  const { data: tenants } = await service
    .from('tenants')
    .select('id, name, slug')
    .in('id', tenantIds)

  const tenantMap = Object.fromEntries((tenants ?? []).map(t => [t.id, t]))

  return subs.map(s => ({
    tenant_id:          s.tenant_id as string,
    tenant_name:        (tenantMap[s.tenant_id as string] as any)?.name ?? '—',
    tenant_slug:        (tenantMap[s.tenant_id as string] as any)?.slug ?? '—',
    plan:               s.plan as string,
    status:             s.status as string,
    current_period_end: s.current_period_end as string | null,
    razorpay_sub_id:    s.stripe_subscription_id as string | null,
  }))
}

export async function adminCancelSubscription(
  tenantId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: sub } = await service
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) {
    return { success: false, error: 'No subscription found' }
  }

  try {
    const rzp = await (razorpay.subscriptions as any).cancel(sub.stripe_subscription_id, true) as any
    const periodEnd = rzp?.current_end
      ? new Date((rzp.current_end as number) * 1000).toISOString()
      : null

    await service.from('subscriptions').update({
      status: 'cancelled',
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
    }).eq('tenant_id', tenantId)
    await service.from('tenants').update({ status: 'cancelled' }).eq('id', tenantId)
  } catch (err: any) {
    return { success: false, error: err?.error?.description ?? err?.message ?? 'Razorpay cancel failed' }
  }

  await logAdminAction(service, actor.id, 'cancel_subscription', tenantId, {})
  return { success: true }
}

export async function adminRetryPayment(
  tenantId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: sub } = await service
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) {
    return { success: false, error: 'No subscription found' }
  }

  try {
    // Resume a halted subscription — triggers Razorpay to retry the payment
    await (razorpay.subscriptions as any).resume(sub.stripe_subscription_id) as any
  } catch (err: any) {
    return { success: false, error: err?.error?.description ?? err?.message ?? 'Razorpay retry failed' }
  }

  await logAdminAction(service, actor.id, 'retry_payment', tenantId, {})
  return { success: true }
}

// ── MRR stats ─────────────────────────────────────────────────────────────────

export interface AdminStats {
  total_tenants:     number
  active_tenants:    number
  trial_tenants:     number
  past_due_tenants:  number
  mrr_inr:           number
}

export async function getAdminStats(): Promise<AdminStats> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: tenants } = await service.from('tenants').select('status, plan')
  const rows = tenants ?? []

  const active  = rows.filter(t => t.status === 'active')
  const starter = active.filter(t => t.plan === 'starter').length
  const growth  = active.filter(t => t.plan === 'growth').length

  return {
    total_tenants:    rows.length,
    active_tenants:   active.length,
    trial_tenants:    rows.filter(t => t.status === 'trial').length,
    past_due_tenants: rows.filter(t => t.status === 'past_due').length,
    mrr_inr:          starter * PLANS.starter.price + growth * PLANS.growth.price,
  }
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export interface AuditRow {
  id:              string
  admin_id:        string
  action:          string
  target_tenant_id: string | null
  tenant_name:     string | null
  meta:            Record<string, unknown> | null
  created_at:      string
}

export async function listPlatformAudit(limit = 100): Promise<AuditRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const { data: rows } = await service
    .from('platform_admin_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!rows || !rows.length) return []

  const tenantIds = [...new Set(rows.map(r => r.target_tenant_id as string).filter(Boolean))]
  const { data: tenants } = tenantIds.length
    ? await service.from('tenants').select('id, name').in('id', tenantIds)
    : { data: [] }
  const tenantMap = Object.fromEntries((tenants ?? []).map(t => [t.id, t.name as string]))

  return rows.map(r => ({
    id:               r.id as string,
    admin_id:         r.admin_id as string,
    action:           r.action as string,
    target_tenant_id: r.target_tenant_id as string | null,
    tenant_name:      r.target_tenant_id ? (tenantMap[r.target_tenant_id as string] ?? null) : null,
    meta:             r.meta as Record<string, unknown> | null,
    created_at:       r.created_at as string,
  }))
}

// ── Referral partners & commissions (payout view) ─────────────────────────────

export interface PartnerPayoutRow {
  id: string
  name: string
  type: 'tenant' | 'external'
  referral_code: string
  status: string
  commission_pct: number | null
  commission_duration_months: number | null
  payout_type: 'credit' | 'cash'
  referred_count: number
  accrued_amount: number   // unpaid (owed)
  paid_amount: number      // already paid/credited
}

export async function listPartnerPayouts(): Promise<PartnerPayoutRow[]> {
  await requirePlatformAdmin()
  const service = createServiceClient()

  const [{ data: partners }, { data: comms }, { data: refs }] = await Promise.all([
    service.from('partners').select('id, name, type, referral_code, status, commission_pct, commission_duration_months').order('created_at', { ascending: false }),
    service.from('partner_commissions').select('partner_id, commission_amount, status, payout_type'),
    service.from('referrals').select('partner_id'),
  ])

  const refCount = new Map<string, number>()
  for (const r of refs ?? []) refCount.set(r.partner_id as string, (refCount.get(r.partner_id as string) ?? 0) + 1)

  const accrued = new Map<string, number>()
  const paid = new Map<string, number>()
  const payoutType = new Map<string, 'credit' | 'cash'>()
  for (const c of comms ?? []) {
    const pid = c.partner_id as string
    const amt = Number(c.commission_amount ?? 0)
    if (c.status === 'accrued') accrued.set(pid, (accrued.get(pid) ?? 0) + amt)
    else if (c.status === 'paid') paid.set(pid, (paid.get(pid) ?? 0) + amt)
    payoutType.set(pid, (c.payout_type as 'credit' | 'cash') ?? 'cash')
  }

  return (partners ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    type: (p.type as 'tenant' | 'external') ?? 'tenant',
    referral_code: p.referral_code as string,
    status: (p.status as string) ?? 'active',
    commission_pct: (p.commission_pct as number | null) ?? null,
    commission_duration_months: (p.commission_duration_months as number | null) ?? null,
    payout_type: payoutType.get(p.id as string) ?? ((p.type as string) === 'tenant' ? 'credit' : 'cash'),
    referred_count: refCount.get(p.id as string) ?? 0,
    accrued_amount: Math.round((accrued.get(p.id as string) ?? 0) * 100) / 100,
    paid_amount: Math.round((paid.get(p.id as string) ?? 0) * 100) / 100,
  }))
}

// Mark all of a partner's currently-accrued commissions as paid/credited.
export async function markPartnerCommissionsPaid(
  partnerId: string
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()
  const { data, error } = await service.from('partner_commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('partner_id', partnerId).eq('status', 'accrued').select('id')
  if (error) return { success: false, error: error.message }
  await logAdminAction(service, actor.id, 'partner_payout', null, { partner_id: partnerId, count: (data ?? []).length })
  return { success: true, count: (data ?? []).length }
}

// Set a partner's commission % / duration override or status.
export async function updatePartnerTerms(
  partnerId: string,
  input: { commission_pct?: number | null; commission_duration_months?: number | null; status?: 'active' | 'suspended' }
): Promise<{ success: true } | { success: false; error: string }> {
  const actor = await requirePlatformAdmin()
  const service = createServiceClient()
  const { error } = await service.from('partners').update(input).eq('id', partnerId)
  if (error) return { success: false, error: error.message }
  await logAdminAction(service, actor.id, 'partner_update_terms', null, { partner_id: partnerId, ...input })
  return { success: true }
}
