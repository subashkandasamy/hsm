import { notFound } from 'next/navigation'
import { getAdmissionAdvanceReceipt } from '@/app/actions/admissionBilling'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import AdvanceReceiptView from '../_components/AdvanceReceiptView'

export default async function AdvanceReceiptPage({ params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [data, profile] = await Promise.all([
    getAdmissionAdvanceReceipt(admissionId),
    getTenantProfile(),
  ])
  if (!data) notFound()
  return <AdvanceReceiptView data={data} profile={profile} />
}
