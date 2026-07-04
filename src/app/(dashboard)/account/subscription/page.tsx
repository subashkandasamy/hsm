import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getSubscription, getTenant, syncSubscription } from '@/app/actions/subscription'
import SubscriptionClient from './_components/SubscriptionClient'

export const metadata = { title: 'Subscription — Uyirly' }

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; upgrade?: string }>
}) {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'account:subscription')) redirect('/dashboard')

  const params = await searchParams

  // Always sync from Razorpay before rendering — this page is low-traffic
  // and the sync ensures the status is never stale (handles both the
  // post-payment redirect and ordinary visits when the webhook is delayed).
  await syncSubscription()

  const [subscription, tenant] = await Promise.all([
    getSubscription(),
    getTenant(),
  ])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Subscription & Billing</h1>
        <p className="text-sm mt-1" style={{ color: '#64748B' }}>
          Manage your plan, payment method, and billing for {tenant?.name ?? 'your hospital'}.
        </p>
      </div>
      <SubscriptionClient subscription={subscription} tenant={tenant} success={params.success === '1'} />
    </div>
  )
}
