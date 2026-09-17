import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SampleLabelsPdf, type SampleTube } from '@/lib/pdf/SampleLabelsPdf'
import { renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = {
  id: string; accession_no: string; priority: 'stat' | 'routine'; visit_id: string | null
  patient: { full_name: string; uhid: string; dob: string | null; gender: string | null } | null
  admission: { ip_no: string } | null
  items: Array<{ test: { name: string; code: string | null; sample_type: string | null } | null }>
}

// GET /print/sample-labels/:orderId/pdf — one 50 × 25 mm tube label per sample type.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('lab_orders')
    .select(`id, accession_no, priority, visit_id,
             patient:patients(full_name, uhid, dob, gender),
             admission:admissions(ip_no),
             items:lab_order_items(test:lab_tests_catalog(name, code, sample_type))`)
    .eq('id', orderId)
    .maybeSingle()
  const order = data as unknown as Row | null
  if (!order || !order.patient) return new Response('Lab order not found', { status: 404 })

  // One tube per sample type, in the order tests were added.
  const tubes = new Map<string, SampleTube>()
  for (const it of order.items ?? []) {
    const type = it.test?.sample_type?.trim() || 'Sample'
    const tube = tubes.get(type.toLowerCase()) ?? { sampleType: type, tests: [] }
    tube.tests.push(it.test?.code?.trim() || it.test?.name || 'Test')
    tubes.set(type.toLowerCase(), tube)
  }
  if (tubes.size === 0) return new Response('This order has no tests', { status: 404 })

  return renderPdfResponse(request, createElement(SampleLabelsPdf, {
    data: {
      accessionNo: order.accession_no,
      priority: order.priority,
      printedAt: new Date().toISOString(),
      encounter: order.admission?.ip_no ?? (order.visit_id ? 'OPD' : null),
      patient: order.patient,
      tubes: [...tubes.values()],
    },
  }), `Sample-labels_${order.accession_no}.pdf`)
}
