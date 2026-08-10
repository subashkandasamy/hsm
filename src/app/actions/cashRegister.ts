'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import type { CashMovement, CashSummary, DayBook, ShiftSummary, CashShiftClose } from '@/lib/types'

// NOTE: day boundaries use UTC to stay consistent with the rest of the app
// (dashboard "today", daily billing all key off UTC dates).
function dayBounds(date: string): { from: string; to: string } {
  const from = `${date}T00:00:00.000Z`
  const next = new Date(`${date}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return { from, to: next.toISOString() }
}

function bucketKey(method: string): 'cash' | 'card' | 'upi' | 'bank' | 'insurance' | null {
  if (method === 'cash') return 'cash'
  if (method === 'card') return 'card'
  if (method === 'upi') return 'upi'
  if (method === 'bank_transfer') return 'bank'
  if (method === 'insurance') return 'insurance'
  return null
}

/** Fetches all money movements (bill payments, advances, refunds) in a window. */
async function fetchMovements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: { from: string; to: string; cashierId?: string | null },
): Promise<CashMovement[]> {
  const { from, to, cashierId } = opts
  const movements: CashMovement[] = []

  // 1. Bill payments (exclude 'advance' — that's credit application, not cash in)
  let pq = supabase
    .from('payments')
    .select('id, amount, method, received_at, received_by, receiver:profiles(full_name), bill:bills(bill_no, patient:patients(full_name))')
    .gte('received_at', from).lt('received_at', to)
    .neq('method', 'advance')
  if (cashierId) pq = pq.eq('received_by', cashierId)
  const { data: pays } = await pq
  for (const p of pays ?? []) {
    const bill = p.bill as unknown as { bill_no: string; patient: { full_name: string } | null } | null
    const receiver = p.receiver as unknown as { full_name: string } | null
    movements.push({
      id: p.id as string,
      time: p.received_at as string,
      kind: 'payment',
      reference: bill?.bill_no ?? 'Bill',
      patientName: bill?.patient?.full_name ?? '—',
      method: p.method as string,
      cashierId: (p.received_by as string | null) ?? null,
      cashierName: receiver?.full_name ?? 'Unknown',
      amount: p.amount as number,
    })
  }

  // 2. Advance deposits collected
  let aq = supabase
    .from('admission_advances')
    .select('id, amount, method, received_at, received_by, receiver:profiles(full_name), admission:admissions(patient:patients(full_name))')
    .gte('received_at', from).lt('received_at', to)
  if (cashierId) aq = aq.eq('received_by', cashierId)
  const { data: advs } = await aq
  for (const a of advs ?? []) {
    const adm = a.admission as unknown as { patient: { full_name: string } | null } | null
    const receiver = a.receiver as unknown as { full_name: string } | null
    movements.push({
      id: a.id as string,
      time: a.received_at as string,
      kind: 'advance',
      reference: 'Advance deposit',
      patientName: adm?.patient?.full_name ?? '—',
      method: a.method as string,
      cashierId: (a.received_by as string | null) ?? null,
      cashierName: receiver?.full_name ?? 'Unknown',
      amount: a.amount as number,
    })
  }

  // 3. Advance refunds paid out (money out — negative)
  let rq = supabase
    .from('admission_advance_refunds')
    .select('id, amount, method, refunded_at, refunded_by, refunder:profiles(full_name), admission:admissions(patient:patients(full_name))')
    .gte('refunded_at', from).lt('refunded_at', to)
  if (cashierId) rq = rq.eq('refunded_by', cashierId)
  const { data: refs } = await rq
  for (const r of refs ?? []) {
    const adm = r.admission as unknown as { patient: { full_name: string } | null } | null
    const refunder = r.refunder as unknown as { full_name: string } | null
    movements.push({
      id: r.id as string,
      time: r.refunded_at as string,
      kind: 'refund',
      reference: 'Advance refund',
      patientName: adm?.patient?.full_name ?? '—',
      method: r.method as string,
      cashierId: (r.refunded_by as string | null) ?? null,
      cashierName: refunder?.full_name ?? 'Unknown',
      amount: -(r.amount as number),
    })
  }

  movements.sort((x, y) => x.time.localeCompare(y.time))
  return movements
}

function summarize(movs: CashMovement[]): CashSummary {
  const s: CashSummary = { cash: 0, card: 0, upi: 0, bank: 0, insurance: 0, refunds: 0, net: 0, count: movs.length }
  for (const m of movs) {
    const k = bucketKey(m.method)
    if (k) s[k] += m.amount
    if (m.kind === 'refund') s.refunds += Math.abs(m.amount)
  }
  s.net = s.cash + s.card + s.upi + s.bank + s.insurance
  return s
}

export async function getDayBook(params: { date: string; cashierId?: string | null }): Promise<DayBook> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  const { from, to } = dayBounds(params.date)
  const movements = await fetchMovements(supabase, { from, to, cashierId: params.cashierId ?? null })

  const byCashier = new Map<string, { name: string; cash: number; card: number; upi: number; bank: number; total: number }>()
  for (const m of movements) {
    const id = m.cashierId ?? 'unknown'
    const cur = byCashier.get(id) ?? { name: m.cashierName, cash: 0, card: 0, upi: 0, bank: 0, total: 0 }
    const k = bucketKey(m.method)
    if (k === 'cash') cur.cash += m.amount
    else if (k === 'card') cur.card += m.amount
    else if (k === 'upi') cur.upi += m.amount
    else if (k === 'bank') cur.bank += m.amount
    cur.total += m.amount
    byCashier.set(id, cur)
  }

  return {
    date: params.date,
    movements,
    summary: summarize(movements),
    perCashier: [...byCashier.entries()].map(([cashierId, v]) => ({ cashierId, ...v })),
  }
}

/** Open-window summary for the current cashier since their last shift-close. */
export async function getShiftSummary(): Promise<ShiftSummary> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()

  const { data: last } = await supabase
    .from('cash_shift_closes')
    .select('to_time')
    .eq('cashier_id', actor.id)
    .order('to_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  const now = new Date()
  const startOfToday = `${now.toISOString().split('T')[0]}T00:00:00.000Z`
  const fromTime = (last?.to_time as string | null) ?? startOfToday
  const toTime = now.toISOString()

  const movements = await fetchMovements(supabase, { from: fromTime, to: toTime, cashierId: actor.id })
  const s = summarize(movements)
  return {
    fromTime,
    toTime,
    expectedCash: s.cash,
    cardTotal: s.card,
    upiTotal: s.upi,
    bankTotal: s.bank,
    paymentCount: s.count,
    lastCloseAt: (last?.to_time as string | null) ?? null,
  }
}

export async function closeShift(
  input: { counted_cash: number; notes?: string | null },
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const counted = Number(input.counted_cash)
  if (!Number.isFinite(counted) || counted < 0) return { success: false, error: 'Enter a valid counted cash amount' }

  // Recompute server-side — never trust the client figure.
  const summary = await getShiftSummary()
  const supabase = await createClient()
  const id = crypto.randomUUID()
  const variance = Math.round((counted - summary.expectedCash) * 100) / 100

  const { error } = await supabase.from('cash_shift_closes').insert({
    id,
    tenant_id: actor.tenant_id,
    cashier_id: actor.id,
    from_time: summary.fromTime,
    to_time: summary.toTime,
    expected_cash: summary.expectedCash,
    counted_cash: counted,
    variance,
    card_total: summary.cardTotal,
    upi_total: summary.upiTotal,
    bank_total: summary.bankTotal,
    payment_count: summary.paymentCount,
    notes: input.notes?.trim() || null,
    created_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'shift_close', 'cash_register', id, { expected: summary.expectedCash, counted, variance })
  return { success: true, id }
}

export async function listShiftCloses(params?: { date?: string }): Promise<CashShiftClose[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  let q = supabase
    .from('cash_shift_closes')
    .select('*, cashier:profiles!cash_shift_closes_cashier_id_fkey(id, full_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (params?.date) {
    const { from, to } = dayBounds(params.date)
    q = q.gte('created_at', from).lt('created_at', to)
  }
  const { data } = await q
  return (data ?? []) as unknown as CashShiftClose[]
}

export async function getShiftClose(id: string): Promise<CashShiftClose | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  const { data } = await supabase
    .from('cash_shift_closes')
    .select('*, cashier:profiles!cash_shift_closes_cashier_id_fkey(id, full_name)')
    .eq('id', id)
    .single()
  return data as unknown as CashShiftClose | null
}
