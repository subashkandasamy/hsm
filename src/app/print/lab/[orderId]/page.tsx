import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLabOrder } from '@/app/actions/lab'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import PrintLabReport from './PrintLabReport'
import type { Patient } from '@/lib/types'

interface Props { params: Promise<{ orderId: string }> }

export default async function PrintLabReportPage({ params }: Props) {
  const { orderId } = await params

  const [order, tenantProfile] = await Promise.all([
    getLabOrder(orderId),
    getTenantProfile(),
  ])

  if (!order) notFound()

  // The lab order only carries id/full_name/uhid — pull demographics for the header.
  const supabase = await createClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id, full_name, uhid, dob, gender, phone')
    .eq('id', order.patient_id)
    .single()

  return (
    <PrintLabReport
      order={order}
      patient={(patient as Patient) ?? null}
      tenantProfile={tenantProfile}
    />
  )
}
