import { notFound } from 'next/navigation'
import { getOpdCombinedBillData } from '@/app/actions/billing'
import CombinedBillView from '../../_components/CombinedBillView'

export default async function OpdCombinedBillPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params
  const data = await getOpdCombinedBillData(visitId)
  if (!data) notFound()
  return <CombinedBillView data={data} />
}
