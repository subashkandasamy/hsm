import { notFound } from 'next/navigation'
import { getVisit, getPatientVisits } from '@/app/actions/opd'
import { getPatient } from '@/app/actions/patients'
import { listLabCatalog } from '@/app/actions/lab'
import { listRadiologyCatalog } from '@/app/actions/radiology'
import { listDrugs } from '@/app/actions/pharmacy'
import { listAllergies } from '@/app/actions/allergies'
import { getDentalChart, listTreatmentHistory, listDueRecalls } from '@/app/actions/dental'
import { resolveVisitTemplate } from '@/lib/clinicalTemplates'
import ConsultationWorkspace from './_components/ConsultationWorkspace'

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

  const [patient, pastVisits, labCatalog, radiologyCatalog, drugs, allergies] = await Promise.all([
    getPatient(visit.patient_id),
    getPatientVisits(visit.patient_id),
    listLabCatalog(),
    listRadiologyCatalog(),
    listDrugs(),
    listAllergies(visit.patient_id),
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
    />
  )
}
