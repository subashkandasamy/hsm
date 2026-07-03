import { notFound } from 'next/navigation'
import { getPatientCombinedBillData } from '@/app/actions/billing'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import CombinedBillView from '../../_components/CombinedBillView'

export default async function PatientCombinedBillPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const [data, profile] = await Promise.all([
    getPatientCombinedBillData(patientId),
    getTenantProfile(),
  ])
  if (!data) notFound()
  return <CombinedBillView data={data} profile={profile} />
}
