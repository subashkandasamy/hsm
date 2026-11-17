import { createElement } from 'react'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { LetterheadTestPdf } from '@/lib/pdf/LetterheadTestPdf'
import { LETTERHEAD_BOTTOM_MM, LETTERHEAD_TOP_MM, paperOf } from '@/lib/pdf/letterhead'
import { renderPdfResponse } from '@/lib/pdf/render'
import { actorCan } from '@/lib/server-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A whole number of mm within the setting's range, or the fallback. */
function mm(raw: string | null, range: { min: number; max: number }, fallback: number): number {
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
  return Number.isInteger(n) && n >= range.min && n <= range.max ? n : fallback
}

// GET /print/letterhead-test/pdf?top=40&bottom=0 — one sheet to line up the
// letterhead setting. Takes the numbers typed in the settings form, so they can
// be tried before they are saved; without them, the saved setting.
export async function GET(request: Request) {
  if (!(await actorCan('settings:write'))) return new Response('Not permitted', { status: 403 })
  const profile = await getTenantProfile()
  const q = new URL(request.url).searchParams
  const top = mm(q.get('top'), LETTERHEAD_TOP_MM, profile?.letterhead_top_mm ?? LETTERHEAD_TOP_MM.default)
  const bottom = mm(q.get('bottom'), LETTERHEAD_BOTTOM_MM, profile?.letterhead_bottom_mm ?? LETTERHEAD_BOTTOM_MM.default)
  return renderPdfResponse(
    request,
    createElement(LetterheadTestPdf, { paper: paperOf(top, bottom), hospital: profile?.name ?? 'Hospital' }),
    `Letterhead_test_${top}mm.pdf`,
  )
}
