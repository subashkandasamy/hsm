import { createElement } from 'react'
import { listAllergies } from '@/app/actions/allergies'
import { getAdmission } from '@/app/actions/ipd'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import { renderPdfResponse } from '@/lib/pdf/render'
import { WristbandPdf } from '@/lib/pdf/WristbandPdf'
import type { Patient } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /print/wristband/:admissionId/pdf — 101.6 × 25.4 mm inpatient wristband.
export async function GET(request: Request, { params }: { params: Promise<{ admissionId: string }> }) {
  const { admissionId } = await params
  const [adm, profile] = await Promise.all([getAdmission(admissionId), getTenantProfile()])
  if (!adm || !adm.patient) return new Response('Admission not found', { status: 404 })
  const patient = adm.patient as Pick<Patient, 'full_name' | 'uhid' | 'dob' | 'gender' | 'blood_group' | 'allergies'>
  const recorded = await listAllergies(adm.patient_id)
  // Structured allergy list first; fall back to the free-text field on the patient.
  const allergies = recorded.length ? recorded.map((a) => a.allergen) : patient.allergies?.trim() ? [patient.allergies.trim()] : []

  return renderPdfResponse(request, createElement(WristbandPdf, {
    data: {
      hospital: profile?.name ?? '',
      patient: { full_name: patient.full_name, uhid: patient.uhid, dob: patient.dob ?? null, gender: patient.gender ?? null, blood_group: patient.blood_group ?? null },
      ipNo: adm.ip_no ?? '',
      admittedAt: adm.admitted_at,
      ward: adm.ward?.name ?? null,
      bed: adm.bed?.bed_no ?? null,
      doctor: adm.doctor?.full_name ?? null,
      allergies,
    },
  }), `Wristband_${adm.ip_no ?? patient.uhid}.pdf`)
}
