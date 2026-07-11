export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getEnabledModules } from '@/app/actions/tenantSettings'
import PageHeader from '@/components/ui/PageHeader'
import ModuleVisibility from './_components/ModuleVisibility'

export default async function ModulesSettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:modules')) redirect('/dashboard')

  const enabled = await getEnabledModules()

  return (
    <div>
      <PageHeader
        title="Module Visibility"
        subtitle="Toggle modules on or off for all users in this tenant. Defaults to all enabled."
      />
      <ModuleVisibility initialEnabled={enabled} />
    </div>
  )
}
