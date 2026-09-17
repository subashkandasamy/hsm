import { createElement } from 'react'
import { getAdmission } from '@/app/actions/ipd'
import { getIpdConfig } from '@/app/actions/ipdConfig'
import { getDeclaration } from '@/app/actions/ipdDeclaration'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { DEFAULT_DECLARATION_TEMPLATE } from '@/lib/ipdDeclarationTemplate'
import { DeclarationPdf } from '@/lib/pdf/DeclarationPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/ipd/:admissionId/declaration/pdf — admission consent/declaration as a PDF.
export async function GET(request: Request, { params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [admission, declaration, config, profile] = await Promise.all([
    getAdmission(admissionId), getDeclaration(admissionId), getIpdConfig(), getTenantProfile(),
  ])
  if (!admission) return new Response('Admission not found', { status: 404 })
  // Once a declaration exists, print the exact text that was signed, not today's template.
  const text = declaration?.declaration_text_snapshot || config?.declaration_template || DEFAULT_DECLARATION_TEMPLATE
  const logo = await loadLogo(profile?.logo_url)
  return renderPdfResponse(request, createElement(DeclarationPdf, { admission, declaration, text, profile, logo }),
    `Consent_${fileSafe(admission.patient?.full_name)}.pdf`)
}
