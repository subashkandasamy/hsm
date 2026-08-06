import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

// Public, unauthenticated search over the GLOBAL drug catalogue only
// (drug_master + drug_brands — public reference data). Powers the marketing
// Schedule/medicine lookup tool. Never touches tenant data.

export const runtime = 'nodejs'

type Brand = { name: string; mrp: number | null }
type Result = {
  generic: string
  schedule: string | null
  form: string | null
  strength: string | null
  brands: Brand[]
  priceMin: number | null
  priceMax: number | null
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('q') ?? ''
  const cleaned = raw.replace(/[,()*%]/g, ' ').trim()
  if (cleaned.length < 2) return NextResponse.json({ results: [] })
  const pat = `*${cleaned}*`
  const LIMIT = 20

  const supabase = createServiceClient()

  const [{ data: nameHits }, { data: brandHits }] = await Promise.all([
    supabase.from('drug_master').select('id').eq('is_active', true)
      .or(`name.ilike.${pat},generic_name.ilike.${pat}`).order('name').limit(LIMIT),
    supabase.from('drug_brands').select('drug_master_id, brand_name, mrp_per_pack')
      .ilike('brand_name', pat).limit(200),
  ])

  const ordered: string[] = []
  for (const id of [
    ...((nameHits ?? []).map(r => r.id as string)),
    ...((brandHits ?? []).map(r => r.drug_master_id as string).filter(Boolean)),
  ]) if (id && !ordered.includes(id)) ordered.push(id)
  const ids = ordered.slice(0, LIMIT)
  if (!ids.length) return NextResponse.json({ results: [] })

  const [{ data: mols }, { data: sample }] = await Promise.all([
    supabase.from('drug_master').select('id, name, generic_name, form, strength, schedule').in('id', ids),
    supabase.from('drug_brands').select('drug_master_id, brand_name, mrp_per_pack').in('drug_master_id', ids).limit(400),
  ])

  type BR = { drug_master_id: string; brand_name: string; mrp_per_pack: number | null }
  const byMol = new Map<string, Brand[]>()
  for (const b of [...((sample ?? []) as BR[]), ...((brandHits ?? []) as BR[])]) {
    if (!b.drug_master_id) continue
    const arr = byMol.get(b.drug_master_id) ?? []
    if (!arr.some(x => x.name === b.brand_name)) arr.push({ name: b.brand_name, mrp: b.mrp_per_pack })
    byMol.set(b.drug_master_id, arr)
  }

  const molMap = new Map((mols ?? []).map(m => [m.id as string, m]))
  const results: Result[] = []
  for (const id of ids) {
    const m = molMap.get(id); if (!m) continue
    const brands = (byMol.get(id) ?? []).sort((a, b) => (a.mrp ?? 1e9) - (b.mrp ?? 1e9))
    const mrps = brands.map(b => b.mrp).filter((n): n is number => typeof n === 'number')
    results.push({
      generic: m.name as string,
      schedule: (m.schedule as string | null) ?? null,
      form: (m.form as string | null) ?? null,
      strength: (m.strength as string | null) ?? null,
      brands: brands.slice(0, 12),
      priceMin: mrps.length ? Math.min(...mrps) : null,
      priceMax: mrps.length ? Math.max(...mrps) : null,
    })
  }

  return NextResponse.json({ results }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  })
}
