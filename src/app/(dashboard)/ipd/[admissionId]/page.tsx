import { notFound } from 'next/navigation'
import { getAdmission, getAdmissionNotes } from '@/app/actions/ipd'
import { getWardBoard } from '@/app/actions/wards'
import { getAdmissionDepositStatus } from '@/app/actions/admissionBilling'
import { listNurses, listAssignments } from '@/app/actions/nurseAssignment'
import AdmissionDetail from './_components/AdmissionDetail'

interface Props { params: Promise<{ admissionId: string }> }

export default async function AdmissionDetailPage({ params }: Props) {
  const { admissionId } = await params
  const today = new Date().toISOString().split('T')[0]

  const [admission, notes, board, nurses, depositStatus, todayAssignments] = await Promise.all([
    getAdmission(admissionId),
    getAdmissionNotes(admissionId),
    getWardBoard(),
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
      nurses={nurses}
      today={today}
      depositStatus={depositStatus}
      todayAssignments={todayAssignments}
    />
  )
}
