import { createElement } from 'react'
import { getPortalRadiologyReport } from '@/app/actions/patientPortal'
import type { ReportPatient } from '@/lib/pdf/LabReportPdf'
import { RadiologyReportPdf } from '@/lib/pdf/RadiologyReportPdf'
import { loadImage, loadLogo, shortRef } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import type { RadiologyOrder, TenantProfile } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /portal/print/radiology/:orderId/pdf — patient-facing radiology report PDF.
// Ownership is verified inside getPortalRadiologyReport.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const data = await getPortalRadiologyReport(orderId)
  if (!data) return new Response('Report not found', { status: 404 })
  const order = data.order as RadiologyOrder
  const profile = data.tenantProfile as TenantProfile | null
  const patient = (data.patient ?? { full_name: order.patient?.full_name ?? '—', uhid: order.patient?.uhid ?? '—' }) as ReportPatient
  const [logo, image] = await Promise.all([
    loadLogo(profile?.logo_url),
    data.imageUrl && !data.imageIsPdf ? loadImage(data.imageUrl, 1400) : Promise.resolve(null),
  ])
  return renderPdfResponse(request,
    createElement(RadiologyReportPdf, { order, patient, profile, logo, image, attachmentIsPdf: !!data.imageUrl && data.imageIsPdf }),
    `Radiology-report_${fileSafe(patient.full_name)}_${shortRef('RAD', order.id)}.pdf`)
}
