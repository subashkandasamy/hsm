import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { getOpdCombinedBillData } from '@/app/actions/billing'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { SummaryBillPdf } from '@/lib/pdf/SummaryBillPdf'
import { loadLogo, pdfResponse } from '@/lib/pdf/parts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Bill summary as a PDF. ?detail=1 lists every charge line; the default combines
// identical daily charges. ?download=1 saves instead of opening.
export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params
  const [data, profile] = await Promise.all([getOpdCombinedBillData(visitId), getTenantProfile()])
  if (!data) return new Response('Not found', { status: 404 })
  const url = new URL(request.url)
  const detailed = url.searchParams.get('detail') === '1'
  const logo = await loadLogo(profile?.logo_url)
  const buffer = await renderToBuffer(createElement(SummaryBillPdf, { data, profile, detailed, logo }) as Parameters<typeof renderToBuffer>[0])
  return pdfResponse(buffer, `${data.combinedBillNo}${detailed ? '-detailed' : ''}.pdf`, url.searchParams.get('download') === '1')
}
