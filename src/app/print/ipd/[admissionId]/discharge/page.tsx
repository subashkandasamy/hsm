import { notFound } from 'next/navigation'
import { getAdmission } from '@/app/actions/ipd'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import PrintDischargeSummary from './PrintDischargeSummary'

interface Props { params: Promise<{ admissionId: string }> }

export default async function PrintDischargeSummaryPage({ params }: Props) {
  const { admissionId } = await params

  const [admission, tenantProfile] = await Promise.all([
    getAdmission(admissionId),
    getTenantProfile(),
  ])

  if (!admission) notFound()

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <PrintDischargeSummary admission={admission as any} tenantProfile={tenantProfile} />
  )
}
