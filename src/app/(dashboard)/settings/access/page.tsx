export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getRoleAccess } from '@/app/actions/roleAccess'
import PageHeader from '@/components/ui/PageHeader'
import RoleAccessClient from './_components/RoleAccessClient'

export default async function RoleAccessPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')
  const grid = await getRoleAccess()
  return (
    <div>
      <PageHeader
        title="Roles & access"
        subtitle="Add access to a role. Everyone with that role gets it — no shared logins needed."
      />
      <RoleAccessClient initial={grid} />
    </div>
  )
}
