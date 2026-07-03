import { notFound } from 'next/navigation'
import { getCombinedBillData } from '@/app/actions/billing'
import CombinedBillView from '../_components/CombinedBillView'

export default async function CombinedBillPage({ params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const data = await getCombinedBillData(admissionId)
  if (!data) notFound()
  return <CombinedBillView data={data} />
}
