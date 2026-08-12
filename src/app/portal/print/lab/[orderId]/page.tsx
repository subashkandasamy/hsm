import { notFound } from 'next/navigation'
import { getPortalLabReport } from '@/app/actions/patientPortal'
import PrintLabReport from '@/app/print/lab/[orderId]/PrintLabReport'
import type { LabOrder, Patient, TenantProfile } from '@/lib/types'

interface Props { params: Promise<{ orderId: string }> }

// Patient-facing printable lab report. Ownership is verified inside
// getPortalLabReport against the logged-in family session.
export default async function PortalPrintLabPage({ params }: Props) {
  const { orderId } = await params
  const data = await getPortalLabReport(orderId)
  if (!data) notFound()
  return (
    <PrintLabReport
      order={data.order as LabOrder}
      patient={data.patient as Patient | null}
      tenantProfile={data.tenantProfile as TenantProfile | null}
    />
  )
}
