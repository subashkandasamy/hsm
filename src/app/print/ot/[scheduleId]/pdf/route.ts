import { createElement } from 'react'
import { listAllergies } from '@/app/actions/allergies'
import { getSchedule } from '@/app/actions/ot'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { OtRecordPdf } from '@/lib/pdf/OtRecordPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/ot/:scheduleId/pdf — operation record for one surgery.
export async function GET(request: Request, { params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params
  const [schedule, profile] = await Promise.all([getSchedule(scheduleId), getTenantProfile()])
  if (!schedule) return new Response('Surgery not found', { status: 404 })
  const supabase = await createClient()
  const [{ data: patient }, { data: adm }, recorded, logo] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, dob, gender, blood_group, allergies').eq('id', schedule.patient_id).maybeSingle(),
    schedule.admission_id
      ? supabase.from('admissions').select('ip_no').eq('id', schedule.admission_id).maybeSingle()
      : Promise.resolve({ data: null }),
    listAllergies(schedule.patient_id),
    loadLogo(profile?.logo_url),
  ])
  if (!patient) return new Response('Patient not found', { status: 404 })
  const allergies = recorded.length ? recorded.map((a) => a.allergen) : patient.allergies?.trim() ? [patient.allergies.trim()] : []
  return renderPdfResponse(request, createElement(OtRecordPdf, {
    schedule, profile, logo,
    extra: { patient, ipNo: (adm as { ip_no?: string } | null)?.ip_no ?? null, allergies },
  }), `Operation-record_${fileSafe(patient.full_name)}.pdf`)
}
