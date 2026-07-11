export const dynamic = 'force-dynamic'
import { listBills, getBillingStats } from '@/app/actions/billing'
import { listAllAdvanceDeposits, listAdvanceSummariesBatch } from '@/app/actions/admissionBilling'
import BillingClient from './_components/BillingClient'

export default async function BillingPage() {
  const [bills, stats, deposits] = await Promise.all([
    listBills(),
    getBillingStats(),
    listAllAdvanceDeposits(),
  ])

  const admissionIds = [...new Set(
    bills.filter((b) => b.admission_id).map((b) => b.admission_id!)
  )]
  const advanceSummaries = await listAdvanceSummariesBatch(admissionIds)

  return (
    <BillingClient
      initialBills={bills}
      initialStats={stats}
      initialDeposits={deposits}
      initialAdvanceSummaries={advanceSummaries}
    />
  )
}
