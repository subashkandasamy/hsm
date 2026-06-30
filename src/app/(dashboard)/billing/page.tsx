import { listBills, getBillingStats } from '@/app/actions/billing'
import { listAllAdvanceDeposits } from '@/app/actions/admissionBilling'
import BillingClient from './_components/BillingClient'

export default async function BillingPage() {
  const [bills, stats, deposits] = await Promise.all([
    listBills(),
    getBillingStats(),
    listAllAdvanceDeposits(),
  ])
  return <BillingClient initialBills={bills} initialStats={stats} initialDeposits={deposits} />
}
