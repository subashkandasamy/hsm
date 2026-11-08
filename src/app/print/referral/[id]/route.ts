import { createElement } from 'react'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { markReferralPrinted } from '@/app/actions/referOut'
import { ReferralLetterPdf, type ReferralLetterData } from '@/lib/pdf/ReferralLetterPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import { actorCan } from '@/lib/server-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/referral/:id — the letter the patient carries to the next hospital.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!(await actorCan('patients:read'))) {
    return new Response('Not permitted', { status: 403 })
  }

  const supabase = await createClient()
  const { data: rec } = await supabase.from('referrals_out').select('*').eq('id', id).maybeSingle()
  if (!rec) return new Response('Referral not found', { status: 404 })

  // Note that a copy has left the building, the first time only. A later
  // correction then has something to supersede.
  await markReferralPrinted(id)

  const profile = await getTenantProfile()
  const logo = await loadLogo(profile?.logo_url)
  const data = rec as unknown as ReferralLetterData

  return renderPdfResponse(
    request,
    createElement(ReferralLetterPdf, { data, profile, logo }),
    `Referral_${data.ref_no.replace(/\//g, '-')}_${fileSafe(data.patient_name)}.pdf`,
  )
}
