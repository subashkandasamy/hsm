import type { createClient } from '@/lib/supabase/server'

type Supa = Awaited<ReturnType<typeof createClient>>

type LinkedBill = { id: string; status: string; visit_id: string | null; admission_id: string | null }

// Resolve the bill that a lab/radiology order (or pharmacy dispense) belongs to,
// via its bill_items. A single order can produce MULTIPLE bill_items sharing the
// same ref_id — e.g. a lab order bills one line per test — so a `.single()` /
// `.maybeSingle()` lookup silently returns null on >1 row and the payment gate
// gets bypassed. All those items point at the same bill, so we dedupe by bill
// and prefer an active (non-cancelled) one; re-billing after a cancellation can
// leave stale items with the same ref_id pointing at a cancelled bill.
export async function resolveServiceBill(
  supabase: Supa,
  source: 'lab' | 'radiology' | 'pharmacy' | 'blood',
  refId: string,
): Promise<LinkedBill | null> {
  const { data: items } = await supabase
    .from('bill_items')
    .select('bill:bills(id, status, visit_id, admission_id)')
    .eq('ref_id', refId)
    .eq('source', source)

  const byId = new Map<string, LinkedBill>()
  for (const it of items ?? []) {
    // PostgREST types a to-one embed loosely; at runtime `bill` is a single row.
    const b = (it as unknown as { bill: LinkedBill | null }).bill
    if (b) byId.set(b.id, b)
  }
  const bills = [...byId.values()]
  if (!bills.length) return null
  return bills.find((b) => b.status !== 'cancelled') ?? bills[0]
}

// True if the given bill's encounter has an eligibility-approved (cashless)
// insurance claim — meaning the service may proceed without a cash payment, the
// same way startVisit lets a cashless consultation begin. Keyed off
// eligibility_status — the provisional pre-auth approval — not settlement.
//
// A claim can be scoped to the OPD visit, the IPD admission, or a single bill
// (e.g. a pre-visit consultation). Crucially, an approval raised against ONE
// bill of a visit/admission covers the WHOLE encounter — so we resolve every
// bill sharing this bill's visit/admission and match a claim against any of
// them, not just this bill's own scope columns. Without this, a cashless
// approval on the consultation bill wouldn't lift the gate for the visit's
// later lab/radiology/pharmacy bills.
export async function isBillCashlessCovered(
  supabase: Supa,
  bill: { id: string; visit_id: string | null; admission_id: string | null },
): Promise<boolean> {
  const billIds = new Set<string>([bill.id])

  if (bill.visit_id) {
    const { data } = await supabase.from('bills').select('id').eq('visit_id', bill.visit_id)
    for (const b of data ?? []) billIds.add(b.id as string)
  }
  if (bill.admission_id) {
    const { data } = await supabase.from('bills').select('id').eq('admission_id', bill.admission_id)
    for (const b of data ?? []) billIds.add(b.id as string)
  }

  const scopes = [`bill_id.in.(${[...billIds].join(',')})`]
  if (bill.visit_id) scopes.push(`visit_id.eq.${bill.visit_id}`)
  if (bill.admission_id) scopes.push(`admission_id.eq.${bill.admission_id}`)

  const { count } = await supabase
    .from('insurance_claims')
    .select('id', { count: 'exact', head: true })
    .or(scopes.join(','))
    .eq('eligibility_status', 'approved')
  return (count ?? 0) > 0
}

/**
 * The batched form of isBillCashlessCovered, for a worklist.
 *
 * Same rule, same scopes — an approval raised against one bill of a visit or
 * admission covers the whole encounter — but resolved in three queries instead
 * of three per row. Used to tell a screen which orders are genuinely waiting on
 * money; it must agree exactly with the single-bill check, because a screen
 * that wrongly says "awaiting payment" stops a collection that should have gone
 * ahead.
 */
export async function billsCashlessCovered(
  supabase: Supa,
  bills: Array<{ id: string; visit_id: string | null; admission_id: string | null }>,
): Promise<Set<string>> {
  const covered = new Set<string>()
  if (!bills.length) return covered

  const visitIds = [...new Set(bills.map((b) => b.visit_id).filter(Boolean))] as string[]
  const admIds = [...new Set(bills.map((b) => b.admission_id).filter(Boolean))] as string[]

  // Every bill sharing an encounter with one of ours — an approval on the
  // consultation bill lifts the gate for the visit's later lab bills.
  const sibling = new Map<string, string[]>()   // encounter key -> bill ids
  const allBillIds = new Set(bills.map((b) => b.id))
  if (visitIds.length) {
    const { data } = await supabase.from('bills').select('id, visit_id').in('visit_id', visitIds)
    for (const b of data ?? []) {
      const k = `v:${b.visit_id}`
      sibling.set(k, [...(sibling.get(k) ?? []), b.id as string])
      allBillIds.add(b.id as string)
    }
  }
  if (admIds.length) {
    const { data } = await supabase.from('bills').select('id, admission_id').in('admission_id', admIds)
    for (const b of data ?? []) {
      const k = `a:${b.admission_id}`
      sibling.set(k, [...(sibling.get(k) ?? []), b.id as string])
      allBillIds.add(b.id as string)
    }
  }

  const scopes: string[] = [`bill_id.in.(${[...allBillIds].join(',')})`]
  if (visitIds.length) scopes.push(`visit_id.in.(${visitIds.join(',')})`)
  if (admIds.length) scopes.push(`admission_id.in.(${admIds.join(',')})`)

  const { data: claims } = await supabase
    .from('insurance_claims')
    .select('bill_id, visit_id, admission_id')
    .or(scopes.join(','))
    .eq('eligibility_status', 'approved')

  const okBill = new Set((claims ?? []).map((c) => c.bill_id as string).filter(Boolean))
  const okVisit = new Set((claims ?? []).map((c) => c.visit_id as string).filter(Boolean))
  const okAdm = new Set((claims ?? []).map((c) => c.admission_id as string).filter(Boolean))

  for (const b of bills) {
    const sibs = [
      ...(b.visit_id ? sibling.get(`v:${b.visit_id}`) ?? [] : []),
      ...(b.admission_id ? sibling.get(`a:${b.admission_id}`) ?? [] : []),
      b.id,
    ]
    if (sibs.some((id) => okBill.has(id))
      || (b.visit_id && okVisit.has(b.visit_id))
      || (b.admission_id && okAdm.has(b.admission_id))) {
      covered.add(b.id)
    }
  }
  return covered
}
