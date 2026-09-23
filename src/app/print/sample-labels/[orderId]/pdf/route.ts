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

  // Read the tubes rather than recompute them. They were worked out once, in
  // NABL's draw order, and their barcodes are already on glass — deriving them
  // again from list position is how a reprint disagrees with the first print.
  await supabase.rpc('ensure_lab_samples', { p_order_id: orderId })
  const { data: sampleRows } = await supabase
    .from('lab_samples')
    .select(`tube_no, barcode, tube:lab_tube_types(label, closure),
             items:lab_sample_items(test:lab_tests_catalog(name, code))`)
    .eq('lab_order_id', orderId)
    .order('tube_no')

  type SRow = {
    tube_no: number; barcode: string
    tube: { label: string; closure: string | null } | null
    items: Array<{ test: { name: string; code: string | null } | null }>
  }
  const tubes: SampleTube[] = ((sampleRows ?? []) as unknown as SRow[]).map((r) => ({
    sampleType: r.tube?.label ?? 'Sample',
    closure: r.tube?.closure ?? null,
    barcode: r.barcode,
    tests: (r.items ?? []).map((i) => i.test?.code?.trim() || i.test?.name || 'Test'),
  }))
  if (tubes.length === 0) return new Response('This order has no tests', { status: 404 })

  return renderPdfResponse(request, createElement(SampleLabelsPdf, {
    data: {
      accessionNo: order.accession_no,
      priority: order.priority,
      printedAt: new Date().toISOString(),
      encounter: order.admission?.ip_no ?? (order.visit_id ? 'OPD' : null),
      patient: order.patient,
      tubes,
    },
  }), `Sample-labels_${order.accession_no}.pdf`)
}
