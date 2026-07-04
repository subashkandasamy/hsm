import { notFound } from 'next/navigation'
import { getBill } from '@/app/actions/billing'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import BillDetailClient from '../_components/BillDetailClient'

export default async function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [bill, tenantProfile] = await Promise.all([getBill(id), getTenantProfile()])
  if (!bill) notFound()
  return <BillDetailClient bill={bill} tenantProfile={tenantProfile} />
}
