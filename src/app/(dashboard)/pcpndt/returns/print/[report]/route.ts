import { createElement } from 'react'
import { redirect } from 'next/navigation'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'
import { createClient } from '@/lib/supabase/server'
import {
  getMonthlyReturn, getMtpDrugStatus, listFormFForReturn, listMtpForReturn,
  listReferralsForReturn,
} from '@/app/actions/pcpndt'
import {
  ReportIPdf, ReportIIPdf, ReportIIIPdf, ReportIVPdf, ReportVPdf,
  ReferralReturnPdf, type ReturnsData,
} from '@/lib/pdf/PcpndtReturnsPdf'
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
  // Reports II and IV are registers rather than summaries — one line per scan
  // or per termination — so their rows are fetched only when asked for.
  const needsForms     = report.toLowerCase() === 'ii'
  const needsMtp       = report.toLowerCase() === 'iv'
  const needsReferrals = report.toLowerCase() === 'referral'
  const [summary, drugs, { data: profile }, formRows, mtpRows, referralRows] = await Promise.all([
    getMonthlyReturn(month),
    getMtpDrugStatus(month),
    supabase.from('tenant_profiles').select('*').maybeSingle(),
    needsForms ? listFormFForReturn(month) : Promise.resolve([]),
    needsMtp ? listMtpForReturn(month) : Promise.resolve([]),
    needsReferrals ? listReferralsForReturn(month) : Promise.resolve([]),
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
    i:   createElement(ReportIPdf,   { data }),
    ii:  createElement(ReportIIPdf,  { data, rows: formRows }),
    iii: createElement(ReportIIIPdf, { data }),
    iv:  createElement(ReportIVPdf,  { data, rows: mtpRows }),
    v:   createElement(ReportVPdf,   { data }),
    referral: createElement(ReferralReturnPdf, { data, rows: referralRows }),
  }
  const doc = docs[report.toLowerCase()]
  if (!doc) return new Response('Unknown report', { status: 404 })

  return renderPdfResponse(request, doc, `Report-${report.toUpperCase()}_${month}.pdf`)
}
