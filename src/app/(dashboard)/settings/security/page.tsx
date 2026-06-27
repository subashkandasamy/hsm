import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { get2FAEnabled } from '@/app/actions/tenantSettings'
import PageHeader from '@/components/ui/PageHeader'
import SecuritySettings from './_components/SecuritySettings'

export default async function SecuritySettingsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')

  const enabled = await get2FAEnabled()

  return (
    <div>
      <PageHeader
        title="Security"
        subtitle="Control authentication requirements for all staff in this tenant."
      />
      <SecuritySettings initialEnabled={enabled} />
    </div>
  )
}
