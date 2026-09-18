import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { BatchLabelsPdf, type BatchLabel } from '@/lib/pdf/BatchLabelsPdf'
import { renderPdfResponse } from '@/lib/pdf/render'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = {
  id: string; label_code: string | null; batch_no: string; expiry: string; mrp: number
  qty_available: number; pack_size: number | null; pack_unit: string | null
  brand_name: string | null; storage_location: string | null
  drug_master_id: string | null; drug_id: string | null
  master: { name: string; generic_name: string | null; form: string | null; strength: string | null } | null
  drug: { name: string; generic_name: string | null; form: string | null; strength: string | null } | null
}

/**
 * GET /print/batch-labels/pdf?ids=a,b  |  ?receipt=<id>   [&copies=N|packs]
 *
 * One 50 × 25 mm sticker per box. `copies=packs` prints one per pack received,
 * which is what actually goes onto the shelf.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const ids = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const receipt = url.searchParams.get('receipt')
  const copiesParam = url.searchParams.get('copies') ?? '1'
  if (!ids.length && !receipt) return new Response('Nothing to label', { status: 400 })

  const supabase = await createClient()
  const select = `id, label_code, batch_no, expiry, mrp, qty_available, pack_size, pack_unit,
                  brand_name, storage_location, drug_master_id, drug_id,
                  master:drug_master(name, generic_name, form, strength),
                  drug:drugs(name, generic_name, form, strength)`
  const query = supabase.from('drug_batches').select(select).order('expiry')
  const { data } = receipt ? await query.eq('receipt_id', receipt) : await query.in('id', ids.slice(0, 200))

  const rows = (data ?? []) as unknown as Row[]
  // Row security already limits this to the caller's own hospital.
  const labelled = rows.filter((r) => r.label_code)
  if (!labelled.length) return new Response('These batches have no label code yet', { status: 404 })

  const labels: BatchLabel[] = labelled.map((r) => {
    const info = r.master ?? r.drug
    const packs = r.pack_size && r.pack_size > 1 ? Math.ceil(r.qty_available / r.pack_size) : r.qty_available
    const copies = copiesParam === 'packs' ? Math.min(packs, 60) : Math.min(Math.max(parseInt(copiesParam, 10) || 1, 1), 60)
    return {
      labelCode: r.label_code!,
      brand: r.brand_name ?? info?.name ?? 'Medicine',
      generic: r.brand_name ? (info?.name ?? null) : (info?.generic_name ?? null),
      strength: info?.strength ?? null,
      form: info?.form ?? null,
      batchNo: r.batch_no,
      expiry: r.expiry,
      mrp: Number(r.mrp ?? 0),
      packSize: r.pack_size,
      packUnit: r.pack_unit,
      storage: r.storage_location,
      copies,
    }
  })

  return renderPdfResponse(request, createElement(BatchLabelsPdf, { labels }), 'Stock-labels.pdf')
}
