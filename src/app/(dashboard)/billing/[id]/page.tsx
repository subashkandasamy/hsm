export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getBill } from '@/app/actions/billing'
import { getPendingDiscountForBill } from '@/app/actions/discounts'
import { listCreditNotes, getRefundable } from '@/app/actions/refunds'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import BillDetailClient from '../_components/BillDetailClient'

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [bill, tenantProfile, pendingDiscount, creditNotes, refundable] = await Promise.all([
    getBill(id), getTenantProfile(), getPendingDiscountForBill(id), listCreditNotes(id), getRefundable(id),
  ])
  if (!bill) notFound()
  return (
    <BillDetailClient
      bill={bill}
      tenantProfile={tenantProfile}
      pendingDiscount={pendingDiscount}
      creditNotes={creditNotes}
      refundable={refundable}
    />
  )
}
