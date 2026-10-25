export const dynamic = 'force-dynamic'

import { getDayEndSheet } from '@/app/actions/accounts'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { istToday } from '@/lib/istDate'
import DayEndClient from './_components/DayEndClient'

export default async function AccountsPage() {
  const today = istToday()
  const [sheet, profile] = await Promise.all([
    getDayEndSheet(today),
    getTenantProfile(),
  ])
  return (
    <DayEndClient
      today={today}
      initialSheet={sheet}
      hospitalName={profile?.name ?? 'Hospital'}
    />
  )
}
