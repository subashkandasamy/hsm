import { redirect } from 'next/navigation'
import { CreditCard } from 'lucide-react'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getSubscription, getTenant } from '@/app/actions/subscription'
import SubscriptionClient from './_components/SubscriptionClient'

export const metadata = { title: 'Subscription — Uyirly' }

export default async function SubscriptionPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'account:subscription')) redirect('/dashboard')

  const [subscription, tenant] = await Promise.all([
    getSubscription(),
    getTenant(),
  ])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0D9488, #0891B2)' }}>
          <CreditCard className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: '#F8FAFC' }}>Subscription</h1>
          <p className="text-xs" style={{ color: '#64748B' }}>
            {tenant?.name ?? 'Your hospital'}
          </p>
        </div>
      </div>

      <SubscriptionClient subscription={subscription} tenant={tenant} />
    </div>
  )
}
