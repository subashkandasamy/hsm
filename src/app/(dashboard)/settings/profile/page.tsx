export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { getTenantProfile, getDirectoryListing } from '@/app/actions/tenantProfile'
import PageHeader from '@/components/ui/PageHeader'
import TenantProfileForm from './_components/TenantProfileForm'
import DirectoryListingCard from './_components/DirectoryListingCard'

export default async function HospitalProfilePage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')

  const [profile, directory] = await Promise.all([getTenantProfile(), getDirectoryListing()])

  return (
    <div>
      <PageHeader
        title="Hospital Profile"
        subtitle="Branding and contact details shown on bills, receipts, and printed documents"
      />
      <div style={{ marginBottom: 24 }}>
        <DirectoryListingCard initial={directory} />
      </div>
      <TenantProfileForm initialProfile={profile} />
    </div>
  )
}
