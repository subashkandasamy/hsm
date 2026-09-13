export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { createServiceClient } from '@/lib/supabase/service'
import { getEnabledModules } from '@/app/actions/tenantSettings'
import type { PlanKey, TenantStatus } from '@/lib/plans'
import PageHeader from '@/components/ui/PageHeader'
import ModuleVisibility from './_components/ModuleVisibility'

export default async function ModulesSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:modules')) redirect('/dashboard')

  const enabled = await getEnabledModules()

  // Plan + status decide which modules are unlockable vs upgrade-gated.
  const svc = createServiceClient()
  const { data: tenant } = await svc
    .from('tenants').select('plan, status').eq('id', actor.tenant_id).maybeSingle()
  const plan = (tenant?.plan ?? 'starter') as PlanKey
  const status = (tenant?.status ?? 'trial') as TenantStatus

  return (
    <div>
      <PageHeader
        title="Module Visibility"
        subtitle="Toggle modules on or off for all users in this tenant. Defaults to all enabled."
      />
      <ModuleVisibility initialEnabled={enabled} plan={plan} status={status} />
    </div>
  )
}
