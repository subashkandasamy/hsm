export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getBillingRules } from '@/app/actions/billingSettings'
import PageHeader from '@/components/ui/PageHeader'
import BillingRulesClient from './_components/BillingRulesClient'

export default async function BillingSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')

  const { rules, readable } = await getBillingRules()

  return (
    <div>
      <PageHeader
        title="Billing & Collections"
        subtitle="Choose which services your patients pay for before they receive them."
      />
      <BillingRulesClient initialRules={rules} readable={readable} />
    </div>
  )
}
