import { notFound } from 'next/navigation'
import { getAdmission, getAdmissionNotes } from '@/app/actions/ipd'
import { getWardBoard } from '@/app/actions/wards'
import {
  getAdmissionFinancials,
  listAdmissionAdvances,
  getAdmissionDepositStatus,
} from '@/app/actions/admissionBilling'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import { listNurses, listAssignments } from '@/app/actions/nurseAssignment'
import AdmissionDetail from './_components/AdmissionDetail'

interface Props { params: Promise<{ admissionId: string }> }

export default async function AdmissionDetailPage({ params }: Props) {
  const { admissionId } = await params
  const today = new Date().toISOString().split('T')[0]

  const [admission, notes, board, financials, advances, procedureTariffs, nurses, depositStatus, todayAssignments] = await Promise.all([
    getAdmission(admissionId),
    getAdmissionNotes(admissionId),
    getWardBoard(),
    getAdmissionFinancials(admissionId),
    listAdmissionAdvances(admissionId),
    listProcedureTariffs(),
    listNurses(),
    getAdmissionDepositStatus(admissionId),
    listAssignments(admissionId, { from: today, to: today }),
  ])

  if (!admission) notFound()

  const availableWards = board.map(w => ({
    id: w.id,
    name: w.name,
    availableBeds: w.beds.filter(b => b.status === 'available'),
  }))

  return (
    <AdmissionDetail
      admission={admission}
      initialNotes={notes}
      availableWards={availableWards}
      financials={financials}
      initialAdvances={advances}
      procedureTariffs={procedureTariffs}
      nurses={nurses}
      today={today}
      depositStatus={depositStatus}
      todayAssignments={todayAssignments}
    />
  )
}
