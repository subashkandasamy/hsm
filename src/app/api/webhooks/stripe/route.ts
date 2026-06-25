import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/service'
import type Stripe from 'stripe'

// STRIPE_WEBHOOK_SECRET must be set in .env.local
// Get it from: stripe listen --forward-to localhost:3000/api/webhooks/stripe (local dev)
// Or from the Stripe Dashboard for production.

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const tenantId = session.metadata?.tenant_id
        const plan     = session.metadata?.plan ?? 'starter'
        if (!tenantId || !session.customer) break

        const customerId      = typeof session.customer === 'string' ? session.customer : session.customer.id
        const subscriptionId  = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

        // Upsert the subscriptions row
        const { data: stripeSub } = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId).then((s) => ({ data: s })).catch(() => ({ data: null }))
          : { data: null }

        const periodEnd = stripeSub?.billing_schedules?.[0]?.bill_until?.computed_timestamp
        await service.from('subscriptions').upsert({
          id: crypto.randomUUID(),
          tenant_id:              tenantId,
          stripe_customer_id:     customerId,
          stripe_subscription_id: subscriptionId ?? null,
          plan,
          status:                 'active',
          current_period_end:     periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        }, { onConflict: 'tenant_id' })

        // Flip tenant status to active
        await service.from('tenants').update({ status: 'active' }).eq('id', tenantId)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (!customerId) break

        const { data: sub } = await service
          .from('subscriptions')
          .select('tenant_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (sub?.tenant_id) {
          await service.from('subscriptions').update({ status: 'past_due' }).eq('tenant_id', sub.tenant_id)
          await service.from('tenants').update({ status: 'past_due' }).eq('id', sub.tenant_id)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

        const { data: sub } = await service
          .from('subscriptions')
          .select('tenant_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (sub?.tenant_id) {
          const newStatus = subscription.status === 'active' ? 'active'
            : subscription.status === 'past_due' ? 'past_due'
            : subscription.status === 'canceled' ? 'cancelled'
            : 'past_due'

          const updatedPeriodEnd = subscription.billing_schedules?.[0]?.bill_until?.computed_timestamp
          await service.from('subscriptions').update({
            status:             subscription.status,
            current_period_end: updatedPeriodEnd ? new Date(updatedPeriodEnd * 1000).toISOString() : null,
          }).eq('tenant_id', sub.tenant_id)

          await service.from('tenants').update({ status: newStatus }).eq('id', sub.tenant_id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

        const { data: sub } = await service
          .from('subscriptions')
          .select('tenant_id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (sub?.tenant_id) {
          await service.from('subscriptions').update({ status: 'canceled' }).eq('tenant_id', sub.tenant_id)
          await service.from('tenants').update({ status: 'cancelled' }).eq('id', sub.tenant_id)
        }
        break
      }

      default:
        // Unhandled event type — no-op
        break
    }
  } catch (err) {
    console.error('[stripe webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
