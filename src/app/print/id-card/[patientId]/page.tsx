import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintCard from './PrintCard'
import type { Patient } from '@/lib/types'

interface Props { params: Promise<{ patientId: string }> }

export default async function PrintIdCardPage({ params }: Props) {
  const { patientId } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('patients')
    .select('id, full_name, uhid, dob, gender, blood_group')
    .eq('id', patientId)
    .single()

  if (!data) notFound()

  return <PrintCard patient={data as Patient} />
}
