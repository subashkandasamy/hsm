import { notFound } from 'next/navigation'
import { getOpdCombinedBillData } from '@/app/actions/billing'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import CombinedBillView from '../../_components/CombinedBillView'

export default async function OpdCombinedBillPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params
  const [data, profile] = await Promise.all([
    getOpdCombinedBillData(visitId),
    getTenantProfile(),
  ])
  if (!data) notFound()
  return <CombinedBillView data={data} profile={profile} />
}
