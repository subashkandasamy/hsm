import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getLabOrder } from '@/app/actions/lab'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { LabReportPdf, type ReportPatient } from '@/lib/pdf/LabReportPdf'
import { loadLogo, shortRef } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/lab/:orderId/pdf — lab report as a PDF (?download=1 to save).
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const [order, profile] = await Promise.all([getLabOrder(orderId), getTenantProfile()])
  if (!order) return new Response('Lab order not found', { status: 404 })

  const supabase = await createClient()
  const [{ data: demo }, logo] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, dob, gender, phone').eq('id', order.patient_id).maybeSingle(),
    loadLogo(profile?.logo_url),
  ])
  const patient = (demo ?? { full_name: order.patient?.full_name ?? '—', uhid: order.patient?.uhid ?? '—' }) as ReportPatient

  return renderPdfResponse(request, createElement(LabReportPdf, { order, patient, profile, logo }),
    `Lab-report_${fileSafe(patient.full_name)}_${order.accession_no ?? shortRef('LAB', order.id)}.pdf`)
}
