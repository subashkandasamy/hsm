import { notFound } from 'next/navigation'
import { getPortalRadiologyReport } from '@/app/actions/patientPortal'
import PrintRadiologyReport from '@/app/print/radiology/[orderId]/PrintRadiologyReport'
import type { RadiologyOrder, Patient, TenantProfile } from '@/lib/types'

interface Props { params: Promise<{ orderId: string }> }

// Patient-facing printable radiology report (with signed scan image).
// Ownership is verified inside getPortalRadiologyReport.
export default async function PortalPrintRadiologyPage({ params }: Props) {
  const { orderId } = await params
  const data = await getPortalRadiologyReport(orderId)
  if (!data) notFound()
  return (
    <PrintRadiologyReport
      order={data.order as RadiologyOrder}
      patient={data.patient as Patient | null}
      tenantProfile={data.tenantProfile as TenantProfile | null}
      imageUrl={data.imageUrl}
      imageIsPdf={data.imageIsPdf}
    />
  )
}
