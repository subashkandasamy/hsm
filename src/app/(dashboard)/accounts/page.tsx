export const dynamic = 'force-dynamic'

import { getDayEndSheet } from '@/app/actions/accounts'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { istToday } from '@/lib/istDate'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import DayEndClient from './_components/DayEndClient'

export default async function AccountsPage() {
  const today = istToday()
  // The register opens on the month so far, which is the range an accountant
  // asks for far more often than any other.
  const monthStart = today.slice(0, 8) + '01'
  const [sheet, profile, actor] = await Promise.all([
    getDayEndSheet(today),
    getTenantProfile(),
    getActorProfile(),
  ])
  return (
    <DayEndClient
      today={today}
      monthStart={monthStart}
      initialSheet={sheet}
      hospitalName={profile?.name ?? 'Hospital'}
      canManage={hasPermission(actor.role, 'billing:manage')}
    />
  )
}
