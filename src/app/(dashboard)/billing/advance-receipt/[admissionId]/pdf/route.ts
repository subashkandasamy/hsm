import { createElement } from 'react'
import { getAdmissionAdvanceReceipt } from '@/app/actions/admissionBilling'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { AdvanceReceiptPdf } from '@/lib/pdf/AdvanceReceiptPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /billing/advance-receipt/:admissionId/pdf — advance deposits receipt as a PDF.
export async function GET(request: Request, { params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [data, profile] = await Promise.all([getAdmissionAdvanceReceipt(admissionId), getTenantProfile()])
  if (!data) return new Response('Admission not found', { status: 404 })
  const logo = await loadLogo(profile?.logo_url)
  return renderPdfResponse(request, createElement(AdvanceReceiptPdf, { data, profile, logo }),
    `Advance-receipt_${fileSafe(data.patient.full_name)}.pdf`)
}
