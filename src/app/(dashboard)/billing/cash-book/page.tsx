export const dynamic = 'force-dynamic'

import { getDayBook, getShiftSummary, listShiftCloses } from '@/app/actions/cashRegister'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import CashBookClient from './_components/CashBookClient'
import { istToday } from '@/lib/istDate'

export default async function CashBookPage() {
  const today = istToday()
  const [dayBook, shift, closes, profile] = await Promise.all([
    getDayBook({ date: today }),
    getShiftSummary(),
    listShiftCloses(),
    getTenantProfile(),
  ])
  return (
    <CashBookClient
      today={today}
      initialDayBook={dayBook}
      initialShift={shift}
      initialCloses={closes}
      hospitalName={profile?.name ?? 'Hospital'}
    />
  )
}
