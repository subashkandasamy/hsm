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
  // BUG-011: the tests ordered and the follow-up the doctor recommended belong
  // on the patient's copy — they were only on the screen.
  const [{ data: labs }, { data: scans }, { data: fu }] = await Promise.all([
    supabase.from('lab_orders').select('status, items:lab_order_items(test:lab_tests_catalog(name))').eq('visit_id', visit.id).neq('status', 'cancelled'),
    supabase.from('radiology_orders').select('status, test:radiology_catalog(name)').eq('visit_id', visit.id).neq('status', 'cancelled'),
    supabase.from('follow_ups').select('suggested_date, reason').eq('source_visit_id', visit.id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  type Named = { name?: string | null } | Array<{ name?: string | null }> | null
  const nameOf = (t: Named) => (Array.isArray(t) ? t[0]?.name : t?.name) ?? null
  const investigations = [
    ...(labs ?? []).flatMap((o) => ((o.items ?? []) as Array<{ test: Named }>).map((i) => nameOf(i.test))),
    ...(scans ?? []).map((o) => nameOf(o.test as Named)),
  ].filter((n): n is string => !!n)
  const followUp = fu ? { date: (fu.suggested_date as string | null) ?? null, reason: (fu.reason as string | null) ?? null } : null
  const [logo, paediatric, obgyn] = await Promise.all([
    loadLogo(profile?.logo_url),
    template === 'paediatrics' ? getPaediatricAssessment(visit.patient_id, visit.id).catch(() => null) : Promise.resolve(null),
    template === 'obgyn' ? getObgynContext(visit.patient_id, visit.id).catch(() => null) : Promise.resolve(null),
  ])

  return renderPdfResponse(request,
    createElement(PrescriptionPdf, {
      visit, patient: patient as RxPatient, prescriptions: visit.prescriptions ?? [], allergies, template, dental, profile, logo, paediatric, obgyn,
      investigations, followUp,
    }),
    `Prescription_${fileSafe(patient.full_name)}_${istDate(visit.visit_date)}.pdf`)
}
