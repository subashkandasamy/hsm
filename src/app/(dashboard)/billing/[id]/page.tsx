import { notFound } from 'next/navigation'
import { getBill } from '@/app/actions/billing'
import BillDetailClient from '../_components/BillDetailClient'

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bill = await getBill(id)
  if (!bill) notFound()
  return <BillDetailClient bill={bill} />
}
