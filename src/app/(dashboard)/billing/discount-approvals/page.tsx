export const dynamic = 'force-dynamic'

import { listDiscountRequests } from '@/app/actions/discounts'
import DiscountApprovalsClient from './_components/DiscountApprovalsClient'

export default async function DiscountApprovalsPage() {
  const pending = await listDiscountRequests('pending')
  return <DiscountApprovalsClient initial={pending} />
}
