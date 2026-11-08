export const dynamic = 'force-dynamic'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { listSharedDevices } from '@/app/actions/counter'
import PageHeader from '@/components/ui/PageHeader'
import CountersClient from './_components/CountersClient'

export default async function SharedCountersPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'settings:write')) redirect('/dashboard')
  const devices = await listSharedDevices().catch(() => null)
  return (
    <div>
      <PageHeader title="Shared counters" subtitle="Computers where staff switch in with their own PIN instead of sharing one login." />
      <CountersClient initial={devices} />
    </div>
  )
}
