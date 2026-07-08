import { notFound } from 'next/navigation'
import { getAdmission, getAdmissionNotes } from '@/app/actions/ipd'
import { listOrders, listSchedule, listIpdLabOrders, listIpdRadiologyOrders } from '@/app/actions/ipdTreatment'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import PrintAdmission from './PrintAdmission'

interface Props { params: Promise<{ admissionId: string }> }

export default async function PrintAdmissionPage({ params }: Props) {
  const { admissionId } = await params

  const [admission, notes, orders, schedule, labOrders, radOrders, tenantProfile] = await Promise.all([
    getAdmission(admissionId),
    getAdmissionNotes(admissionId),
    listOrders(admissionId),
    listSchedule(admissionId),
    listIpdLabOrders(admissionId),
    listIpdRadiologyOrders(admissionId),
    getTenantProfile(),
  ])

  if (!admission) notFound()

  return (
    <PrintAdmission
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admission={admission as any}
      notes={notes}
      orders={orders}
      schedule={schedule}
      labOrders={labOrders}
      radOrders={radOrders}
      tenantProfile={tenantProfile}
    />
  )
}
