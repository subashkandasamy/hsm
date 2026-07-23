import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRadiologyOrder, getRadiologyImageUrl } from '@/app/actions/radiology'
import { getTenantProfile } from '@/app/actions/tenantProfile'
import PrintRadiologyReport from './PrintRadiologyReport'
import type { Patient } from '@/lib/types'

interface Props { params: Promise<{ orderId: string }> }

export default async function PrintRadiologyReportPage({ params }: Props) {
  const { orderId } = await params

  const [order, tenantProfile, image] = await Promise.all([
    getRadiologyOrder(orderId),
    getTenantProfile(),
    getRadiologyImageUrl(orderId),
  ])

  if (!order) notFound()

  const supabase = await createClient()
  const { data: patient } = await supabase
    .from('patients')
    .select('id, full_name, uhid, dob, gender, phone')
    .eq('id', order.patient_id)
    .single()

  return (
    <PrintRadiologyReport
      order={order}
      patient={(patient as Patient) ?? null}
      tenantProfile={tenantProfile}
      imageUrl={image.url}
      imageIsPdf={image.isPdf}
    />
  )
}
