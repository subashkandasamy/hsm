export const dynamic = 'force-dynamic'

import { getDayBook, getShiftSummary, listShiftCloses } from '@/app/actions/cashRegister'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import CashBookClient from './_components/CashBookClient'

export default async function CashBookPage() {
  const today = new Date().toISOString().split('T')[0]
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
