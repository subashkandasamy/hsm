export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { getAdmission, getAdmissionNotes } from '@/app/actions/ipd'
import { getWardBoard } from '@/app/actions/wards'
import { getAdmissionDepositStatus } from '@/app/actions/admissionBilling'
import { listNurses, listAssignments } from '@/app/actions/nurseAssignment'
import { listDoctors, listAdmissionSchedules } from '@/app/actions/ot'
import { listProcedureTariffs } from '@/app/actions/tariffs'
import AdmissionDetail from './_components/AdmissionDetail'

interface Props { params: Promise<{ admissionId: string }> }

export default async function AdmissionDetailPage({ params }: Props) {
  const { admissionId } = await params
  const today = new Date().toISOString().split('T')[0]

  const [admission, notes, board, nurses, depositStatus, todayAssignments, otDoctors, otTariffs, otSchedules] = await Promise.all([
    getAdmission(admissionId),
    getAdmissionNotes(admissionId),
    getWardBoard(),
    listNurses(),
    getAdmissionDepositStatus(admissionId),
    listAssignments(admissionId, { from: today, to: today }),
    listDoctors(),
    listProcedureTariffs(),
    listAdmissionSchedules(admissionId),
  ])

  if (!admission) notFound()

  const availableWards = board.map(w => ({
    id: w.id,
    name: w.name,
    is_temp: w.is_temp,
    is_multi_bed: w.room_type_data?.is_multi_bed ?? false,
    room_type_id: w.room_type_data?.id ?? null,
    room_type_name: w.room_type_data?.name ?? null,
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
      otDoctors={otDoctors}
      otTariffs={otTariffs}
      initialOtSchedules={otSchedules}
    />
  )
}
