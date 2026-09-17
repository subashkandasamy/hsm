import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getRadiologyImageUrl, getRadiologyOrder } from '@/app/actions/radiology'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import type { ReportPatient } from '@/lib/pdf/LabReportPdf'
import { RadiologyReportPdf } from '@/lib/pdf/RadiologyReportPdf'
import { loadImage, loadLogo, shortRef } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/radiology/:orderId/pdf — radiology report (with the scan image) as a PDF.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const [order, profile, stored] = await Promise.all([getRadiologyOrder(orderId), getTenantProfile(), getRadiologyImageUrl(orderId)])
  if (!order) return new Response('Radiology order not found', { status: 404 })

  const supabase = await createClient()
  const [{ data: demo }, logo, image] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, dob, gender, phone').eq('id', order.patient_id).maybeSingle(),
    loadLogo(profile?.logo_url),
    stored.url && !stored.isPdf ? loadImage(stored.url, 1400) : Promise.resolve(null),
  ])
  const patient = (demo ?? { full_name: order.patient?.full_name ?? '—', uhid: order.patient?.uhid ?? '—' }) as ReportPatient

  return renderPdfResponse(request,
    createElement(RadiologyReportPdf, { order, patient, profile, logo, image, attachmentIsPdf: !!stored.url && stored.isPdf }),
    `Radiology-report_${fileSafe(patient.full_name)}_${shortRef('RAD', order.id)}.pdf`)
}
