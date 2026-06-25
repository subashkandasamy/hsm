'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { stripe, PLANS } from '@/lib/stripe'
import type { PlanKey } from '@/lib/stripe'
import type { Subscription } from '@/lib/types'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'

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
  const supabase = await createClient()
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', actor.tenant_id)
    .single()
  return data
}

// Returns a Stripe Checkout session URL for the tenant to upgrade/subscribe.
export async function createCheckoutSession(
  plan: PlanKey
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'account:subscription')

  if (!PLANS[plan]?.priceId) {
    return { success: false, error: 'STRIPE_PRICE_ID not configured for this plan' }
  }

  const service = createServiceClient()

  // Get or create Stripe customer for this tenant
  const { data: existingSub } = await service
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()

  let customerId: string
  if (existingSub?.stripe_customer_id) {
    customerId = existingSub.stripe_customer_id
  } else {
    const { data: tenant } = await service
      .from('tenants').select('name').eq('id', actor.tenant_id).single()

    const { data: authUser } = await service.auth.admin.getUserById(actor.id)
    const customer = await stripe.customers.create({
      name: tenant?.name ?? 'Unknown Hospital',
      email: authUser.user?.email ?? undefined,
      metadata: { tenant_id: actor.tenant_id },
    })
    customerId = customer.id
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const { data: tenantRow } = await service
    .from('tenants').select('slug').eq('id', actor.tenant_id).single()
  const baseUrl = tenantRow
    ? `https://${tenantRow.slug}.${rootDomain}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: PLANS[plan].priceId, quantity: 1 }],
    success_url: `${baseUrl}/account/subscription?checkout=success`,
    cancel_url:  `${baseUrl}/account/subscription`,
    metadata: { tenant_id: actor.tenant_id, plan },
  })

  return { success: true, url: session.url! }
}

// Returns a Stripe Customer Portal link so the tenant admin can manage their billing directly.
export async function createBillingPortalSession(): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'account:subscription')

  const supabase = await createClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return { success: false, error: 'No billing account found — subscribe first' }
  }

  const service = createServiceClient()
  const { data: tenantRow } = await service
    .from('tenants').select('slug').eq('id', actor.tenant_id).single()
  const rootDomain  = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'uyirly.com'
  const returnUrl   = tenantRow
    ? `https://${tenantRow.slug}.${rootDomain}/account/subscription`
    : `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/account/subscription`

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  })

  return { success: true, url: portalSession.url }
}
