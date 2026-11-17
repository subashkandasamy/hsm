import { createElement } from 'react'
import { getPortalLabReport, getPortalLabAnalytes } from '@/app/actions/patientPortal'
import { LabReportPdf, type ReportPatient, type ReportAnalyte } from '@/lib/pdf/LabReportPdf'
import { loadLogo, shortRef } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import type { LabOrder, TenantProfile } from '@/lib/types'
import { asFileCopy } from '@/lib/pdf/letterhead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /portal/print/lab/:orderId/pdf — patient-facing lab report PDF.
// Ownership is verified inside getPortalLabReport against the portal session.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const data = await getPortalLabReport(orderId)
  if (!data) return new Response('Report not found', { status: 404 })
  const order = data.order as LabOrder
  // The patient's own copy, on a phone or their printer: always the full header.
  const profile = asFileCopy(data.tenantProfile as TenantProfile | null)
  const patient = (data.patient ?? { full_name: order.patient?.full_name ?? '—', uhid: order.patient?.uhid ?? '—' }) as ReportPatient
  const [logo, analytes] = await Promise.all([
    loadLogo(profile?.logo_url),
    getPortalLabAnalytes(orderId) as Promise<ReportAnalyte[]>,
  ])
  return renderPdfResponse(request, createElement(LabReportPdf, { order, patient, profile, logo, analytes }),
    `Lab-report_${fileSafe(patient.full_name)}_${order.accession_no ?? shortRef('LAB', order.id)}.pdf`)
}
