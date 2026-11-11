import { createElement } from 'react'
import { listAllergies } from '@/app/actions/allergies'
import { getVisit } from '@/app/actions/opd'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { EmergencyRecordPdf, type EmergencyRecordData } from '@/lib/pdf/EmergencyRecordPdf'
import { loadLogo } from '@/lib/pdf/parts'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import type { EmergencyCase } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/emergency/:caseId/pdf — ER case sheet, or the discharge / referral note once resolved.
export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const supabase = await createClient()
  const { data: ec } = await supabase
    .from('emergency_cases').select('*, attendant:profiles(id, full_name)').eq('id', caseId).maybeSingle()
  if (!ec) return new Response('Emergency case not found', { status: 404 })
  const erCase = ec as unknown as EmergencyCase

  // The ER consultation visit for this case: the patient's emergency visit opened after arrival.
  const since = new Date(new Date(erCase.arrived_at).getTime() - 5 * 60_000).toISOString()
  const [{ data: patient }, { data: visitRow }, recorded, profile, { data: adm }, { data: evalRow }] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, dob, gender, phone, blood_group, allergies').eq('id', erCase.patient_id).maybeSingle(),
    supabase.from('visits').select('id').eq('patient_id', erCase.patient_id).eq('type', 'emergency')
      .gte('created_at', since).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    listAllergies(erCase.patient_id),
    getTenantProfile(),
    supabase.from('admissions').select('ip_no, ward:wards(name), bed:beds(bed_no)').eq('source_emergency_case_id', caseId).limit(1).maybeSingle(),
    // The ER Initial Evaluation (clinical roles only — RLS returns nothing to others, and the sheet prints its write-in lines).
    supabase.from('initial_assessments').select('data').eq('emergency_case_id', caseId).maybeSingle(),
  ])
  if (!patient) return new Response('Patient not found', { status: 404 })

  const visit = visitRow ? await getVisit(visitRow.id as string) : null
  const investigations: EmergencyRecordData['investigations'] = []
  if (visit) {
    const [{ data: labs }, { data: rads }] = await Promise.all([
      supabase.from('lab_orders').select('status, items:lab_order_items(test:lab_tests_catalog(name))').eq('visit_id', visit.id).neq('status', 'cancelled'),
      supabase.from('radiology_orders').select('status, test:radiology_catalog(name)').eq('visit_id', visit.id).neq('status', 'cancelled'),
    ])
    for (const o of (labs ?? []) as unknown as Array<{ status: string; items: Array<{ test: { name: string } | null }> }>) {
      for (const it of o.items ?? []) investigations.push({ name: it.test?.name ?? 'Lab test', kind: 'Lab', status: o.status })
    }
    for (const o of (rads ?? []) as unknown as Array<{ status: string; test: { name: string } | null }>) {
      investigations.push({ name: o.test?.name ?? 'Imaging', kind: 'Imaging', status: o.status })
    }
  }

  type AdmRow = { ip_no: string | null; ward: { name: string } | null; bed: { bed_no: string } | null }
  const a = adm as unknown as AdmRow | null
  const allergies = recorded.length ? recorded.map((x) => x.allergen) : patient.allergies?.trim() ? [patient.allergies.trim()] : []
  const logo = await loadLogo(profile?.logo_url)

  return renderPdfResponse(request, createElement(EmergencyRecordPdf, {
    profile, logo,
    data: {
      ec: erCase, patient, allergies, visit, prescriptions: visit?.prescriptions ?? [], investigations,
      admission: a ? { ip_no: a.ip_no, ward: a.ward?.name ?? null, bed: a.bed?.bed_no ?? null } : null,
      evaluation: (evalRow?.data as import('@/lib/initialAssessment').AssessmentData | undefined) ?? null,
      ageYears: patient.dob ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 86_400_000)) : null,
    },
  }), `Emergency-${erCase.status === 'referred' ? 'referral' : erCase.status === 'discharged' ? 'discharge' : 'case-sheet'}_${fileSafe(patient.full_name)}.pdf`)
}
