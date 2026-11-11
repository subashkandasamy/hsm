import { createElement } from 'react'
import { getAdmission } from '@/app/actions/ipd'
import { getIcuDay } from '@/app/actions/icuDay'
import { listAllergies } from '@/app/actions/allergies'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { IcuDayPdf } from '@/lib/pdf/IcuDayPdf'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import { sheetDayOf } from '@/lib/fluids'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/ipd/:admissionId/icu-day/pdf?day=YYYY-MM-DD — the ICU chart for one day, A3 landscape.
export async function GET(request: Request, { params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const q = new URL(request.url).searchParams.get('day')
  const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : sheetDayOf(new Date())
  const [admission, data, profile] = await Promise.all([getAdmission(admissionId), getIcuDay(admissionId, day), getTenantProfile()])
  if (!admission || !data) return new Response('Admission not found', { status: 404 })
  const supabase = await createClient()
  const [{ data: patient }, recorded, { data: icu }] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, dob, gender, blood_group, allergies').eq('id', admission.patient_id).maybeSingle(),
    listAllergies(admission.patient_id),
    supabase.from('icu_stays').select('entered_at').eq('admission_id', admissionId).order('entered_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!patient) return new Response('Patient not found', { status: 404 })
  const allergies = recorded.length ? recorded.map((a) => a.allergen) : patient.allergies?.trim() ? [patient.allergies.trim()] : []
  return renderPdfResponse(request, createElement(IcuDayPdf, {
    data, admission, profile, allergies, icuSince: (icu?.entered_at as string | undefined) ?? null,
    patient: { full_name: patient.full_name, uhid: patient.uhid, dob: patient.dob, gender: patient.gender, blood_group: patient.blood_group },
  }), `ICU-chart_${fileSafe(patient.full_name)}_${day}.pdf`)
}
