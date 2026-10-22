export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import PageHeader from '@/components/ui/PageHeader'
import { getMonthlyReturn, getMtpDrugStatus, listAncReferrals } from '@/app/actions/pcpndt'
import MonthlyReturns from '../_components/MonthlyReturns'
import { istToday } from '@/lib/istDate'

/**
 * The screen a hospital opens on the 1st.
 *
 * Behind pcpndt:report: filing is the owner's responsibility and the forms
 * name a reporting person, so this is not a screen for whoever happens to be
 * at the machine.
 */
export default async function ReturnsPage() {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:report')) redirect('/pcpndt')

  // Last month, because that is the one being filed. A hospital opening this
  // on the 2nd wants October, not a half-finished November.
  const today = istToday()
  const [y, m] = today.slice(0, 7).split('-').map(Number)
  const month = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`

  const [summary, drugs, referrals] = await Promise.all([
    getMonthlyReturn(month), getMtpDrugStatus(month), listAncReferrals(month),
  ])

  return (
    <div>
      <PageHeader
        title="Monthly returns"
        subtitle="Due with the Appropriate Authority by the 5th."
      />
      <MonthlyReturns
        initialMonth={month}
        initialSummary={summary}
        initialDrugs={drugs}
        initialReferrals={referrals.length}
      />
    </div>
  )
}
