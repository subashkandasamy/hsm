import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createRateLimiter, clientKey } from '@/lib/rateLimit'

// Public, unauthenticated search over the GLOBAL drug catalogue only
// (drug_master + drug_brands — public reference data). Powers the marketing
// Schedule/medicine lookup tool. Never touches tenant data.
//
// Unauthenticated and four queries deep, so the exposure is cost, not data
// (F-11). Four things hold that down, in rough order of how much they do:
//
//  1. The response is CDN-cached for a day — but the cache key is the query
//     string, so `Paracetamol`, `paracetamol` and `paracetamol ` were three
//     entries and three trips to the database for one question. `q` is now
//     normalised before use, which is the single biggest reduction here and
//     costs nothing.
//  2. `q` is length-capped. Without it, one request could ask for four ILIKE
//     scans against a multi-kilobyte pattern.
//  3. The molecule columns are fetched in the first query instead of being
//     re-fetched by a later one, so the common case makes three queries, not
//     four.
//  4. A per-IP rate limit, which is deliberately last in this list: it is
//     per-instance and best-effort, and `lib/rateLimit.ts` says so.

export const runtime = 'nodejs'

/** Long enough for any real drug or brand name; short enough to be cheap. */
const MAX_Q = 64

// 30 requests/minute is far above a person typing in a search box (the client
// debounces) and far below what a loop can do.
const limiter = createRateLimiter({ name: 'drug-search', limit: 30, windowMs: 60_000 })

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
  const limit = limiter(clientKey(req.headers))
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests' }, {
      status: 429,
      // Never cache a 429: the CDN would then serve the refusal to everyone
      // who shares that edge, turning a per-caller brake into an outage.
      headers: { 'Retry-After': String(limit.retryAfter), 'Cache-Control': 'no-store' },
    })
  }

  const raw = req.nextUrl.searchParams.get('q') ?? ''
  // `_` and `\\` join the stripped set: `_` is a single-character LIKE wildcard,
  // so `amox_cillin` quietly matched more than it claimed, and backslash is
  // LIKE's escape character. Stripping rather than escaping them, because the
  // pattern is interpolated into an `.or()` filter where `,` `(` `)` are
  // structural — this is a search box, and a wildcard the user did not ask for
  // is worth less than a filter that parses predictably.
  const cleaned = raw
    .slice(0, MAX_Q)
    .replace(/[,()*%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (cleaned.length < 2) return NextResponse.json({ results: [] })
  const pat = `*${cleaned}*`
  const LIMIT = 20

  const supabase = createServiceClient()

  // The molecule columns are selected here rather than re-read later: these rows
  // are already being found, and the old second pass fetched the same ones again.
  const MOL_COLS = 'id, name, generic_name, form, strength, schedule'
  const [{ data: nameHits }, { data: brandHits }] = await Promise.all([
    supabase.from('drug_master').select(MOL_COLS).eq('is_active', true)
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

  type Mol = { id: string; name: string; generic_name: string | null; form: string | null; strength: string | null; schedule: string | null }
  const known = new Map<string, Mol>(((nameHits ?? []) as Mol[]).map(m => [m.id, m]))
  // Only the molecules reached via a brand match are still missing. When the
  // query matched molecule names (the common case) this list is empty and the
  // query below is skipped entirely.
  const missing = ids.filter(id => !known.has(id))

  const [{ data: extraMols }, { data: sample }] = await Promise.all([
    missing.length
      ? supabase.from('drug_master').select(MOL_COLS).in('id', missing)
      : Promise.resolve({ data: [] as Mol[] }),
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

  const molMap = known
  for (const m of (extraMols ?? []) as Mol[]) molMap.set(m.id, m)
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
