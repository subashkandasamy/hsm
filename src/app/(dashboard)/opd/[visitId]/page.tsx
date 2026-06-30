import { notFound } from 'next/navigation'
import { getVisit, getPatientVisits } from '@/app/actions/opd'
import { getPatient } from '@/app/actions/patients'
import { listLabCatalog } from '@/app/actions/lab'
import { listRadiologyCatalog } from '@/app/actions/radiology'
import { listDrugs } from '@/app/actions/pharmacy'
import { listAllergies } from '@/app/actions/allergies'
import { getDentalChart, listTreatmentHistory, listDueRecalls } from '@/app/actions/dental'
import { listWards } from '@/app/actions/wards'
import { resolveVisitTemplate } from '@/lib/clinicalTemplates'
import { getActorProfile } from '@/lib/server-utils'
import { createClient } from '@/lib/supabase/server'
import ConsultationWorkspace from './_components/ConsultationWorkspace'
import type { ProcedureTariff } from '@/lib/types'

interface Props { params: Promise<{ visitId: string }> }

export default async function OpdVisitPage({ params }: Props) {
  const { visitId } = await params

  const visit = await getVisit(visitId)
  if (!visit) notFound()

  let template: import('@/lib/types').ClinicalTemplate = 'general'
  try {
    template = await resolveVisitTemplate({
      id: visit.id,
      appointment_id: visit.appointment_id,
      doctor_id: visit.doctor_id,
    })
  } catch (e) {
    console.error('[OpdVisitPage] resolveVisitTemplate failed, falling back to general:', e)
  }

  const [supabase, actor] = await Promise.all([createClient(), getActorProfile()])

  const [patient, pastVisits, labCatalog, radiologyCatalog, drugs, allergies,
         wards, doctorsRes, tariffsRes, tenantRes, generalRes] = await Promise.all([
    getPatient(visit.patient_id),
    getPatientVisits(visit.patient_id),
    listLabCatalog(),
    listRadiologyCatalog(),
    listDrugs(),
    listAllergies(visit.patient_id),
    listWards(),
    supabase.from('profiles').select('id, full_name').eq('role', 'doctor').eq('is_active', true),
    supabase.from('procedure_tariffs').select('*').eq('is_active', true).neq('category', 'general').order('name'),
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

  const admitWards = (wards as import('@/lib/types').WardWithBeds[]).map((w) => ({
    id: w.id,
    name: w.name,
    availableBeds: (w.beds ?? []).filter((b) => b.status === 'available').map((b) => ({ id: b.id, bed_no: b.bed_no })),
  }))

  return (
    <ConsultationWorkspace
      visit={visit}
      patient={patient}
      history={history}
      labCatalog={labCatalog}
      radiologyCatalog={radiologyCatalog}
      drugs={drugs}
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
    />
  )
}
