export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getBillingRules, getCollectionSetup } from '@/app/actions/billingSettings'
import PageHeader from '@/components/ui/PageHeader'
import BillingRulesClient from './_components/BillingRulesClient'
import CollectionAccountsClient from './_components/CollectionAccountsClient'

export default async function BillingSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')

  const [{ rules, readable }, collection] = await Promise.all([getBillingRules(), getCollectionSetup()])

  return (
    <div>
      <PageHeader
        title="Billing & Collections"
        subtitle="Choose which services are paid for first, and which account each department's money goes into."
      />
      <div className="space-y-6">
        <BillingRulesClient initialRules={rules} readable={readable} />
        <CollectionAccountsClient initialSetup={collection.setup} loadError={collection.error} />
      </div>
    </div>
  )
}
