import { createElement } from 'react'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { createClient } from '@/lib/supabase/server'
import { getMonthlyReturn, getMtpDrugStatus } from '@/app/actions/pcpndt'
import { ReportIIIPdf, ReportVPdf, type ReturnsData } from '@/lib/pdf/PcpndtReturnsPdf'
import { renderPdfResponse } from '@/lib/pdf/render'
import type { TenantProfile } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /pcpndt/returns/print/:report?month=YYYY-MM
 *
 * The district's own forms, with this hospital's figures written in. Behind
 * pcpndt:report because filing is the owner's job, and the forms name a
 * reporting person.
 */
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'pcpndt:report')) redirect('/pcpndt')

  const { report } = await params
  const url = new URL(request.url)
  const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7)

  const supabase = await createClient()
  const [summary, drugs, { data: profile }] = await Promise.all([
    getMonthlyReturn(month),
    getMtpDrugStatus(month),
    supabase.from('tenant_profiles').select('*').maybeSingle(),
  ])
  if (!summary) return new Response('No register for that month', { status: 404 })

  const p = profile as TenantProfile | null
  const data: ReturnsData = {
    month,
    profile: p,
    reportingPerson: p?.pcpndt_reporting_person_name ?? null,
    reportingPhone: p?.pcpndt_reporting_person_phone ?? null,
    reportI: summary.report_i,
    reportIII: summary.report_iii,
    reportV: drugs,
  }

  const docs: Record<string, React.ReactElement> = {
    iii: createElement(ReportIIIPdf, { data }),
    v:   createElement(ReportVPdf,   { data }),
  }
  const doc = docs[report.toLowerCase()]
  if (!doc) return new Response('Unknown report', { status: 404 })

  return renderPdfResponse(request, doc, `Report-${report.toUpperCase()}_${month}.pdf`)
}
