import { createElement } from 'react'
import { getPortalLabReport } from '@/app/actions/patientPortal'
import { LabReportPdf, type ReportPatient } from '@/lib/pdf/LabReportPdf'
import { loadLogo, shortRef } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import type { LabOrder, TenantProfile } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /portal/print/lab/:orderId/pdf — patient-facing lab report PDF.
// Ownership is verified inside getPortalLabReport against the portal session.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const data = await getPortalLabReport(orderId)
  if (!data) return new Response('Report not found', { status: 404 })
  const order = data.order as LabOrder
  const profile = data.tenantProfile as TenantProfile | null
  const patient = (data.patient ?? { full_name: order.patient?.full_name ?? '—', uhid: order.patient?.uhid ?? '—' }) as ReportPatient
  const logo = await loadLogo(profile?.logo_url)
  return renderPdfResponse(request, createElement(LabReportPdf, { order, patient, profile, logo }),
    `Lab-report_${fileSafe(patient.full_name)}_${shortRef('LAB', order.id)}.pdf`)
}
