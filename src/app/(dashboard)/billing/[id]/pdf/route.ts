import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { getBill } from '@/app/actions/billing'
import { listCreditNotes } from '@/app/actions/refunds'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { BillPdf } from '@/lib/pdf/BillPdf'
import { loadLogo, pdfResponse } from '@/lib/pdf/parts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /billing/:id/pdf — the bill as a PDF (?download=1 to save instead of view).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [bill, profile, creditNotes] = await Promise.all([getBill(id), getTenantProfile(), listCreditNotes(id)])
  if (!bill) return new Response('Bill not found', { status: 404 })
  const logo = await loadLogo(profile?.logo_url)
  const buffer = await renderToBuffer(createElement(BillPdf, { bill, profile, creditNotes, logo }) as Parameters<typeof renderToBuffer>[0])
  const download = new URL(request.url).searchParams.get('download') === '1'
  return pdfResponse(buffer, `${bill.bill_no}.pdf`, download)
}
