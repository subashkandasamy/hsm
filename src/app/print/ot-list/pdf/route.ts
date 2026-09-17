import { createElement } from 'react'
import { listSchedules } from '@/app/actions/ot'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { istToday } from '@/lib/istDate'
import { OtListPdf, type OtListRow } from '@/lib/pdf/OtListPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/ot-list/pdf?date=YYYY-MM-DD — the day's theatre list (IST day; defaults to today).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('date')
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : istToday()
  const [schedules, profile] = await Promise.all([listSchedules({ date }), getTenantProfile()])

  const admissionIds = [...new Set(schedules.map((s) => s.admission_id).filter(Boolean))] as string[]
  const supabase = await createClient()
  const { data: adms } = admissionIds.length
    ? await supabase.from('admissions').select('id, ip_no, direct_ot, ward:wards(name), bed:beds(bed_no)').in('id', admissionIds)
    : { data: [] }
  type AdmRow = { id: string; ip_no: string | null; direct_ot: boolean; ward: { name: string } | null; bed: { bed_no: string } | null }
  const byId = new Map(((adms ?? []) as unknown as AdmRow[]).map((a) => [a.id, a]))
  const rows: OtListRow[] = schedules.map((s) => {
    const a = s.admission_id ? byId.get(s.admission_id) : undefined
    return { ...s, ipNo: a?.ip_no ?? null, ward: a ? (a.direct_ot ? 'Direct to OT' : [a.ward?.name, a.bed?.bed_no].filter(Boolean).join(' / ') || null) : null }
  })

  const logo = await loadLogo(profile?.logo_url)
  return renderPdfResponse(request, createElement(OtListPdf, { date, rows, profile, logo }), `OT-list_${date}.pdf`)
}
