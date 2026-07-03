import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import PageHeader from '@/components/ui/PageHeader'
import TenantProfileForm from './_components/TenantProfileForm'

export default async function HospitalProfilePage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')

  const profile = await getTenantProfile()

  return (
    <div>
      <PageHeader
        title="Hospital Profile"
        subtitle="Branding and contact details shown on bills, receipts, and printed documents"
      />
      <TenantProfileForm initialProfile={profile} />
    </div>
  )
}
