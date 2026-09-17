import { createElement } from 'react'
import { listAllergies } from '@/app/actions/allergies'
import { getAdmission } from '@/app/actions/ipd'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { DischargeSummaryPdf } from '@/lib/pdf/DischargeSummaryPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/ipd/:admissionId/discharge/pdf — discharge summary as a PDF.
export async function GET(request: Request, { params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [admission, profile] = await Promise.all([getAdmission(admissionId), getTenantProfile()])
  if (!admission) return new Response('Admission not found', { status: 404 })
  const [allergies, logo] = await Promise.all([listAllergies(admission.patient_id), loadLogo(profile?.logo_url)])
  return renderPdfResponse(request, createElement(DischargeSummaryPdf, { admission, allergies, profile, logo }),
    `Discharge-summary_${fileSafe(admission.patient?.full_name)}.pdf`)
}
