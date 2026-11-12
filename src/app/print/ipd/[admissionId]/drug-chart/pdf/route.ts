import { createElement } from 'react'
import { getAdmission } from '@/app/actions/ipd'
import { listOrders, listSchedule } from '@/app/actions/ipdTreatment'
import { listAllergies } from '@/app/actions/allergies'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { DrugChartPdf } from '@/lib/pdf/DrugChartPdf'
import { buildDrugChart } from '@/lib/drugChart'
import { fileSafe, renderPdfResponse } from '@/lib/pdf/render'
import { createClient } from '@/lib/supabase/server'
import { istToday } from '@/lib/istDate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/ipd/:admissionId/drug-chart/pdf — KMCH's Drug & Fluid Chart for the stay, A4 landscape.
export async function GET(request: Request, { params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [admission, orders, schedule, profile] = await Promise.all([getAdmission(admissionId), listOrders(admissionId), listSchedule(admissionId), getTenantProfile()])
  if (!admission) return new Response('Admission not found', { status: 404 })
  const supabase = await createClient()
  const [{ data: patient }, recorded, { data: problems }, { data: ots }] = await Promise.all([
    supabase.from('patients').select('full_name, uhid, dob, gender, allergies').eq('id', admission.patient_id).maybeSingle(),
    listAllergies(admission.patient_id),
    supabase.from('patient_problems').select('problem').eq('patient_id', admission.patient_id).in('status', ['active', 'chronic']).order('noted_at'),
    supabase.from('ot_schedules').select('procedure_name').eq('admission_id', admissionId).neq('status', 'cancelled').order('scheduled_start'),
  ])
  if (!patient) return new Response('Patient not found', { status: 404 })
  const allergies = recorded.length ? recorded.map((a) => a.allergen) : patient.allergies?.trim() ? [patient.allergies.trim()] : []
  const diagnosis = [admission.reason, ...(problems ?? []).map((p) => p.problem as string), ...(ots ?? []).map((o) => `Procedure: ${o.procedure_name}`)]
    .filter((x): x is string => !!x && !!x.trim())
  return renderPdfResponse(request, createElement(DrugChartPdf, {
    chart: buildDrugChart(orders, schedule, istToday()), admission, profile, allergies, diagnosis,
    patient: { full_name: patient.full_name, uhid: patient.uhid, dob: patient.dob, gender: patient.gender },
  }), `Drug-chart_${fileSafe(patient.full_name)}.pdf`)
}
