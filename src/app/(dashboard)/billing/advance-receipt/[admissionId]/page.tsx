import { notFound } from 'next/navigation'
import { getAdmissionAdvanceReceipt } from '@/app/actions/admissionBilling'
import AdvanceReceiptView from '../_components/AdvanceReceiptView'

export default async function AdvanceReceiptPage({ params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const data = await getAdmissionAdvanceReceipt(admissionId)
  if (!data) notFound()
  return <AdvanceReceiptView data={data} />
}
