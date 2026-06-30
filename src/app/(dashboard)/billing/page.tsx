import { listBills, getBillingStats } from '@/app/actions/billing'
import BillingClient from './_components/BillingClient'

export default async function BillingPage() {
  const [bills, stats] = await Promise.all([listBills(), getBillingStats()])
  return <BillingClient initialBills={bills} initialStats={stats} />
}
