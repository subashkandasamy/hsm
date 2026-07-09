'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { razorpay, PLANS } from '@/lib/razorpay'
import type { PlanKey } from '@/lib/razorpay'
import type { Subscription } from '@/lib/types'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'

function mapRazorpayStatus(rzpStatus: string): string | null {
  switch (rzpStatus) {
    case 'active':    return 'active'
    case 'halted':    return 'past_due'
    case 'cancelled': return 'cancelled'
    case 'completed': return 'cancelled'
    default:          return null  // unknown status — don't overwrite DB
  }
}

export async function getSubscription(): Promise<Subscription | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'account:subscription')

  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()
  return data as Subscription | null
}

export async function getTenant() {
  const actor = await getActorProfile()
  // Use service client — tenants RLS blocks the anon/user client for this read
  const service = createServiceClient()
  const { data } = await service
    .from('tenants')
    .select('*')
    .eq('id', actor.tenant_id)
    .single()
  return data
}

// Creates a Razorpay subscription and returns the hosted short_url for payment.
// DB columns stripe_customer_id / stripe_subscription_id are reused for Razorpay IDs.
export async function createCheckoutSession(
  plan: PlanKey
): Promise<{ success: true; url: string; subscriptionId: string; keyId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'account:subscription')

  if (!PLANS[plan]?.planId) {
    return { success: false, error: 'Razorpay plan ID not configured — contact support' }
  }

  const service = createServiceClient()

  // Reuse existing Razorpay customer if already created
  const { data: existingSub } = await service
    .from('subscriptions')
    .select('stripe_customer_id, status, current_period_end')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()

  // Block re-subscription if already active — user must cancel first
  if (existingSub?.status === 'active') {
    return { success: false, error: 'You already have an active subscription. Cancel it first to switch plans.' }
  }

  let customerId: string
  if (existingSub?.stripe_customer_id?.startsWith('cust_')) {
    customerId = existingSub.stripe_customer_id
  } else {
    const { data: tenant }   = await service.from('tenants').select('name').eq('id', actor.tenant_id).single()
    const { data: authUser } = await service.auth.admin.getUserById(actor.id)

    const customer = await razorpay.customers.create({
      name:          tenant?.name ?? 'Unknown Hospital',
      email:         authUser.user?.email ?? '',
      fail_existing: '0', // return existing customer if email matches
    } as any)
    customerId = (customer as any).id
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const { data: tenantRow } = await service.from('tenants').select('slug').eq('id', actor.tenant_id).single()
  const baseUrl = tenantRow
    ? `https://${tenantRow.slug}.${rootDomain}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')

  const subscription = await razorpay.subscriptions.create({
    plan_id:         PLANS[plan].planId,
    customer_notify: 1,
    quantity:        1,
    total_count:     120, // 10 years of monthly billing
    notes: {
      tenant_id: actor.tenant_id,
      plan,
    },
  } as any)

  const sub = subscription as any

  // Pre-save subscription row so the webhook can find it by subscription ID.
  // Preserve existing status/period_end — never reset an already-paid tenant back to trial.
  await service.from('subscriptions').upsert({
    id:                      crypto.randomUUID(),
    tenant_id:               actor.tenant_id,
    stripe_customer_id:      customerId,
    stripe_subscription_id:  sub.id,
    plan,
    status:                  existingSub?.status      ?? 'trial',
    current_period_end:      existingSub?.current_period_end ?? null,
  }, { onConflict: 'tenant_id' })

  return {
    success:        true,
    url:            sub.short_url as string,
    subscriptionId: sub.id       as string,
    keyId:          process.env.RAZORPAY_KEY_ID ?? '',
  }
}

// Fetches live subscription state from Razorpay and writes it to the DB.
// Called server-side on the ?success=1 redirect so the page shows correct
// status even when the webhook hasn't fired yet (e.g. local dev).
export async function syncSubscription(): Promise<{ success: boolean }> {
  const actor   = await getActorProfile()
  const service = createServiceClient()

  const { data: row } = await service
    .from('subscriptions')
    .select('stripe_subscription_id, stripe_customer_id')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()

  if (!row?.stripe_subscription_id) return { success: false }

  try {
    // Fetch the stored subscription first
    let rzpSub = await (razorpay.subscriptions as any).fetch(row.stripe_subscription_id) as any

    // If the stored sub is not yet paid, the user tested checkout but a newer
    // unactivated sub_id was saved over the real active one.
    // Fall back: list recent subs for the account and match by notes.tenant_id.
    // 'authenticated' = mandate approved but first charge not collected yet.
    if (rzpSub.status === 'created' || rzpSub.status === 'pending' || rzpSub.status === 'authenticated') {
      const list = await (razorpay.subscriptions as any).all({ count: 100 }) as any
      const activeSub = (list?.items ?? []).find(
        (s: any) => s.status === 'active' && s.notes?.tenant_id === actor.tenant_id
      )
      if (!activeSub) return { success: false }
      rzpSub = activeSub
    }

    const plan      = (rzpSub.notes?.plan as string) ?? 'starter'
    const status    = mapRazorpayStatus(rzpSub.status as string)
    const periodEnd = rzpSub.current_end
      ? new Date((rzpSub.current_end as number) * 1000).toISOString()
      : null

    // Unknown Razorpay status — don't touch the DB, preserving last known good state
    if (status === null) return { success: false }

    // Also store the correct active subscription ID if we found a different one
    await service.from('subscriptions').update({
      stripe_subscription_id: rzpSub.id,
      plan,
      status,
      current_period_end: periodEnd,
    }).eq('tenant_id', actor.tenant_id)

    await service.from('tenants').update({ plan, status }).eq('id', actor.tenant_id)

    return { success: true }
  } catch (err: any) {
    console.error('[syncSubscription]', err?.message ?? err)
    return { success: false }
  }
}

// Cancels the Razorpay subscription at end of current billing period.
export async function cancelSubscription(): Promise<
  { success: true } | { success: false; error: string }
> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'account:subscription')

  const supabase = await createClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) {
    return { success: false, error: 'No active subscription found' }
  }

  if (sub.status === 'cancelled') {
    return { success: false, error: 'Subscription is already cancelled' }
  }

  try {
    // cancel at end of current billing period (true = at cycle end)
    await (razorpay.subscriptions as any).cancel(sub.stripe_subscription_id, true)

    const service = createServiceClient()
    await service.from('subscriptions').update({ status: 'cancelled' }).eq('tenant_id', actor.tenant_id)
    await service.from('tenants').update({ status: 'cancelled' }).eq('id', actor.tenant_id)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.error?.description ?? err?.message ?? 'Failed to cancel' }
  }
}
