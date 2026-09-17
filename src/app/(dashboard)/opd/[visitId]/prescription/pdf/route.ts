import { createElement } from 'react'
import { listAllergies } from '@/app/actions/allergies'
import { listTreatmentHistory } from '@/app/actions/dental'
import { getPaediatricAssessment } from '@/app/actions/pediatrics'
import { getObgynContext } from '@/app/actions/obstetrics'
import { istDate } from '@/lib/istDate'
import { getVisit } from '@/app/actions/opd'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { resolveVisitTemplate } from '@/lib/clinicalTemplates'
import { loadLogo } from '@/lib/pdf/parts'
import { PrescriptionPdf, type RxPatient } from '@/lib/pdf/PrescriptionPdf'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import type { ClinicalTemplate, DentalTreatment } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /opd/:visitId/prescription/pdf — the visit's prescription as a PDF (saved data only).
export async function GET(request: Request, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params
  const visit = await getVisit(visitId)
  if (!visit) return new Response('Visit not found', { status: 404 })

  let template: ClinicalTemplate = 'general'
  try {
    template = await resolveVisitTemplate({ id: visit.id, appointment_id: visit.appointment_id, doctor_id: visit.doctor_id })
  } catch { /* fall back to general, same as the consultation page */ }

  const supabase = await createClient()
  const [{ data: patient }, allergies, profile, dental] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, phone, dob, gender, blood_group').eq('id', visit.patient_id).maybeSingle(),
    listAllergies(visit.patient_id),
    getTenantProfile(),
    template === 'dental'
      ? listTreatmentHistory(visit.patient_id).then((t) => t.filter((x) => x.visit_id === visit.id)).catch(() => [] as DentalTreatment[])
      : Promise.resolve([] as DentalTreatment[]),
  ])
  if (!patient) return new Response('Patient not found', { status: 404 })
  const [logo, paediatric, obgyn] = await Promise.all([
    loadLogo(profile?.logo_url),
    template === 'paediatrics' ? getPaediatricAssessment(visit.patient_id, visit.id).catch(() => null) : Promise.resolve(null),
    template === 'obgyn' ? getObgynContext(visit.patient_id, visit.id).catch(() => null) : Promise.resolve(null),
  ])

  return renderPdfResponse(request,
    createElement(PrescriptionPdf, {
      visit, patient: patient as RxPatient, prescriptions: visit.prescriptions ?? [], allergies, template, dental, profile, logo, paediatric, obgyn,
    }),
    `Prescription_${fileSafe(patient.full_name)}_${istDate(visit.visit_date)}.pdf`)
}
