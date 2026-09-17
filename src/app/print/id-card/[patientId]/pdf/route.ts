import { createElement } from 'react'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { IdCardPdf } from '@/lib/pdf/IdCardPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/id-card/:patientId/pdf — CR80 card (?layout=a4 for a cut-out sheet).
export async function GET(request: Request, { params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params
  const supabase = await createClient()
  const [{ data: patient }, profile] = await Promise.all([
    supabase.from('patients')
      .select('full_name, uhid, dob, gender, phone, blood_group, created_at, emergency_contact_name, emergency_contact_phone')
      .eq('id', patientId).maybeSingle(),
    getTenantProfile(),
  ])
  if (!patient) return new Response('Patient not found', { status: 404 })
  const logo = await loadLogo(profile?.logo_url)
  const layout = new URL(request.url).searchParams.get('layout') === 'a4' ? 'a4' : 'card'
  return renderPdfResponse(request, createElement(IdCardPdf, { data: { patient, profile, logo }, layout }),
    `ID-card_${patient.uhid}.pdf`)
}
