import { notFound } from 'next/navigation'
import { getEstimate } from '@/app/actions/costEstimates'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import EstimateView from './_components/EstimateView'

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [estimate, profile] = await Promise.all([getEstimate(id), getTenantProfile()])
  if (!estimate) notFound()
  return <EstimateView estimate={estimate} profile={profile} />
}
