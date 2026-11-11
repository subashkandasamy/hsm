export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getVisit, getPatientVisits } from '@/app/actions/opd'
import { getInitialAssessment } from '@/app/actions/initialAssessment'
import { getPatient } from '@/app/actions/patients'
import { listLabCatalog, listLabOrders } from '@/app/actions/lab'
import { listRadiologyCatalog, listRadiologyOrders } from '@/app/actions/radiology'

import { listAllergies } from '@/app/actions/allergies'
import { getDentalChart, listTreatmentHistory, listDueRecalls } from '@/app/actions/dental'
import { getPaediatricAssessment } from '@/app/actions/pediatrics'
import { getObgynContext } from '@/app/actions/obstetrics'
import { getWardBoard } from '@/app/actions/wards'
import { resolveVisitTemplate } from '@/lib/clinicalTemplates'
import { getActorProfile } from '@/lib/server-utils'
import { createClient } from '@/lib/supabase/server'
import ConsultationWorkspace from './_components/ConsultationWorkspace'
import type { ProcedureTariff } from '@/lib/types'
import type { PlanKey, TenantStatus } from '@/lib/plans'
import { DOCTOR_FILTER } from '@/lib/doctors'

interface Props { params: Promise<{ visitId: string }> }

export default async function OpdVisitPage({ params }: Props) {
  const { visitId } = await params

  const hdrs = await headers()
  const tenantPlan   = (hdrs.get('x-tenant-plan')   ?? 'starter') as PlanKey
  const tenantStatus = (hdrs.get('x-tenant-status') ?? 'trial')   as TenantStatus

  const visit = await getVisit(visitId)
  if (!visit) notFound()

  let template: import('@/lib/types').ClinicalTemplate = 'general'
  // An ER visit uses the ER Initial Evaluation, not the attending doctor's
  // department template (a gynaecologist on ER duty used to get the obgyn form).
  if (visit.type !== 'emergency') try {
    template = await resolveVisitTemplate({
      id: visit.id,
      appointment_id: visit.appointment_id,
      doctor_id: visit.doctor_id,
    })
  } catch (e) {
    console.error('[OpdVisitPage] resolveVisitTemplate failed, falling back to general:', e)
  }

  const [supabase, actor] = await Promise.all([createClient(), getActorProfile()])

  const [patient, pastVisits, labCatalog, radiologyCatalog, labOrders, radiologyOrders, allergies,
         wards, doctorsRes, tariffsRes, tenantRes, generalRes] = await Promise.all([
    getPatient(visit.patient_id),
    getPatientVisits(visit.patient_id),
    listLabCatalog(),
    listRadiologyCatalog(),
    listLabOrders({ visitId }),
    listRadiologyOrders({ visitId }),
    listAllergies(visit.patient_id),
    getWardBoard(),
    supabase.from('profiles').select('id, full_name').or(DOCTOR_FILTER).eq('is_active', true),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).not('category', 'in', '(general,emergency)').order('name'),
    supabase.from('tenants').select('advance_percentage').eq('id', actor.tenant_id).single(),
    supabase.from('procedure_tariffs').select('default_price').eq('category', 'general').eq('is_active', true).limit(1).maybeSingle(),
  ])

  if (!patient) notFound()

  const history = pastVisits.filter((v) => v.id !== visitId)

  // Fetch specialty data only when needed
  let dentalTeeth   = null
  let dentalTx      = null
  let dentalRecalls = null
  if (template === 'dental') {
    try {
      ;[dentalTeeth, dentalTx, dentalRecalls] = await Promise.all([
        getDentalChart(patient.id),
        listTreatmentHistory(patient.id),
        listDueRecalls(),
      ])
    } catch (e) {
      console.error('[OpdVisitPage] dental data fetch failed:', e)
    }
  }

  const paediatricAssessment = template === 'paediatrics'
    ? await getPaediatricAssessment(patient.id, visit.id).catch((e) => { console.error('[OpdVisitPage] paediatric assessment failed:', e); return null })
    : null
  const obgynContext = template === 'obgyn'
    ? await getObgynContext(patient.id, visit.id).catch((e) => { console.error('[OpdVisitPage] obgyn context failed:', e); return null })
    : null

  // The ER case this visit belongs to — the patient's case still on the board
  // (one at most, 0258); else, for a closed visit, the case that arrived last
  // before the visit opened (five minutes' margin). Then its Initial Evaluation.
  let erEvaluation: import('@/app/actions/initialAssessment').AssessmentView | null = null
  if (visit.type === 'emergency') {
    const { data: active } = await supabase.from('emergency_cases').select('id')
      .eq('patient_id', visit.patient_id).in('status', ['waiting', 'in_treatment']).limit(1).maybeSingle()
    const { data: earlier } = active ? { data: null } : await supabase.from('emergency_cases').select('id')
      .eq('patient_id', visit.patient_id)
      .lte('arrived_at', new Date(new Date(visit.created_at).getTime() + 5 * 60_000).toISOString())
      .order('arrived_at', { ascending: false }).limit(1).maybeSingle()
    const ec = active ?? earlier
    if (ec) erEvaluation = await getInitialAssessment({ emergencyCaseId: ec.id as string }).catch((e) => {
      console.error('[OpdVisitPage] initial assessment failed:', e); return null
    })
  }

  const admitWards = (wards as import('@/lib/types').WardWithBeds[]).map((w) => ({
    id: w.id,
    name: w.name,
    is_temp: w.is_temp,
    is_multi_bed: w.room_type_data?.is_multi_bed ?? false,
    room_type_id: w.room_type_data?.id ?? null,
    room_type_name: w.room_type_data?.name ?? null,
    availableBeds: (w.beds ?? []).filter((b) => b.status === 'available').map((b) => ({ id: b.id, bed_no: b.bed_no })),
  }))

  return (
    <ConsultationWorkspace
      visit={visit}
      patient={patient}
      history={history}
      labCatalog={labCatalog}
      radiologyCatalog={radiologyCatalog}
      labOrders={labOrders}
      radiologyOrders={radiologyOrders}
      allergies={allergies}
      clinicalTemplate={template}
      dentalTeeth={dentalTeeth}
      dentalTreatments={dentalTx}
      dentalRecalls={dentalRecalls}
      admitDoctors={(doctorsRes.data ?? []) as { id: string; full_name: string }[]}
      admitWards={admitWards}
      admitTariffs={(tariffsRes.data ?? []) as ProcedureTariff[]}
      admitGeneralTariffPrice={(generalRes.data?.default_price as number) ?? undefined}
      admitAdvancePercentage={(tenantRes.data?.advance_percentage as number) ?? 50}
      plan={tenantPlan}
      tenantStatus={tenantStatus}
      paediatricAssessment={paediatricAssessment}
      obgynContext={obgynContext}
      erEvaluation={erEvaluation}
    />
  )
}
