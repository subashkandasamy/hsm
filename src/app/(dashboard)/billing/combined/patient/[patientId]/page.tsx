import { notFound } from 'next/navigation'
import { getPatientCombinedBillData } from '@/app/actions/billing'
import CombinedBillView from '../../_components/CombinedBillView'

export default async function PatientCombinedBillPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const data = await getPatientCombinedBillData(patientId)
  if (!data) notFound()
  return <CombinedBillView data={data} />
}
