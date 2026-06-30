import { listBills, getBillingStats } from '@/app/actions/billing'
import { listPendingAdvanceDeposits } from '@/app/actions/admissionBilling'
import BillingClient from './_components/BillingClient'

export default async function BillingPage() {
  const [bills, stats, pendingDeposits] = await Promise.all([
    listBills(),
    getBillingStats(),
    listPendingAdvanceDeposits(),
  ])
  return <BillingClient initialBills={bills} initialStats={stats} initialPendingDeposits={pendingDeposits} />
}
