import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrintLabels from './PrintLabels'

interface Props { params: Promise<{ orderId: string }> }

export default async function PrintSampleLabelsPage({ params }: Props) {
  const { orderId } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('lab_orders')
    .select(`
      id, ordered_at,
      patient:patients(id, full_name, uhid),
      items:lab_order_items(test:lab_tests_catalog(name, sample_type))
    `)
    .eq('id', orderId)
    .single()

  if (!data) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <PrintLabels order={data as any} />
}
