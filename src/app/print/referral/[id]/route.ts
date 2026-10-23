import { createElement } from 'react'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { ReferralLetterPdf, type ReferralLetterData } from '@/lib/pdf/ReferralLetterPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import { getActorProfile } from '@/lib/server-utils'
import { hasPermission } from '@/lib/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/referral/:id — the letter the patient carries to the next hospital.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const actor = await getActorProfile()
  if (!hasPermission(actor.role, 'patients:read')) {
    return new Response('Not permitted', { status: 403 })
  }

  const supabase = await createClient()
  const { data: rec } = await supabase.from('referrals_out').select('*').eq('id', id).maybeSingle()
  if (!rec) return new Response('Referral not found', { status: 404 })

  const profile = await getTenantProfile()
  const logo = await loadLogo(profile?.logo_url)
  const data = rec as unknown as ReferralLetterData

  return renderPdfResponse(
    request,
    createElement(ReferralLetterPdf, { data, profile, logo }),
    `Referral_${data.ref_no.replace(/\//g, '-')}_${fileSafe(data.patient_name)}.pdf`,
  )
}
