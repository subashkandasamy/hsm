import { notFound } from 'next/navigation'
import { getAdmission, getAdmissionNotes } from '@/app/actions/ipd'
import { getWardBoard } from '@/app/actions/wards'
import AdmissionDetail from './_components/AdmissionDetail'

interface Props { params: Promise<{ admissionId: string }> }

export default async function AdmissionDetailPage({ params }: Props) {
  const { admissionId } = await params
  const [admission, notes, board] = await Promise.all([
    getAdmission(admissionId),
    getAdmissionNotes(admissionId),
    getWardBoard(),
  ])

  if (!admission) notFound()

  const availableWards = board.map(w => ({
    id: w.id,
    name: w.name,
    availableBeds: w.beds.filter(b => b.status === 'available'),
  }))

  return <AdmissionDetail admission={admission} initialNotes={notes} availableWards={availableWards} />
}
