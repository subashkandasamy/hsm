export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getCombinedBillData } from '@/app/actions/billing'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import CombinedBillView from '../_components/CombinedBillView'

export default async function CombinedBillPage({ params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [data, profile] = await Promise.all([
    getCombinedBillData(admissionId),
    getTenantProfile(),
  ])
  if (!data) notFound()
  return <CombinedBillView data={data} profile={profile} />
}
