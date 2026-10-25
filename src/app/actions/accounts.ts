'use server'

import { createClient } from '@/lib/supabase/server'
import { getReadClient } from '@/lib/supabase/read-replica'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { getCollectionSummary, SERVICE_BILLS_ONLY } from '@/lib/billing/collections'
import { istDate, istAddDays, istDayBoundsISO, istDayStartISO, istDayEndISO } from '@/lib/istDate'
import type { DayEndSheet, DayEndSourceLine, SalesRegister, SalesRegisterRow, LedgerMapping, OwnerDay } from '@/lib/types'
import { getMovementsInRange } from '@/app/actions/cashRegister'
import { buildTallyXml, saleTotal, type TallySale, type TallyReceipt } from '@/lib/accounting/tally'

/**
 * One day of money, as an accountant reads it.
 *
 * ── Why collected and billed are two separate blocks ───────────────────────
 *
 * They are different measures and they are not meant to agree. A payment is
 * attached to a *bill*, not to a bill *item*, so revenue splits by department
 * exactly and money does not: a single ₹10,000 payment against a consolidated
 * IPD bill cannot be divided between the bed, the lab and the pharmacy without
 * inventing a rule. And an advance has no department at all — it is a deposit
 * taken before anyone knows what will be used.
 *
 * So this returns three facts that are each true on their own — what came in,
 * what was raised, and what is still owed — rather than one blended number
 * that would be wrong in a way nobody could see. The hospital owner asked for
 * "collected separately and yet to collect separately", which is the same
 * conclusion reached from the other end.
 *
 * ── Why the breakdown reconciles ──────────────────────────────────────────
 *
 * The per-department figures are gross line amounts, which sum to the bills'
 * subtotal; discount, tax and rounding are then shown as their own lines down
 * to the billed total. Checked against every non-cancelled bill in the demo
 * tenant: `sum(items.amount) = subtotal` and
 * `subtotal − discount + tax + round_off = total`, with no exceptions. An
 * accountant can therefore add the column up and arrive at the figure printed
 * underneath it, which is the whole point of giving them a sheet.
 */
export async function getDayEndSheet(date: string): Promise<DayEndSheet> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')

  const supabase = await createClient()
  const { from, to } = istDayBoundsISO(date)

  const [collection, billsRes, outstandingRes] = await Promise.all([
    // The shared definition, so this sheet can never disagree with the Cash
    // Book or the Dashboard about what "collected" means.
    getCollectionSummary(supabase, actor.tenant_id, from, to),

    supabase.from('bills')
      .select('id, subtotal, discount, tax, round_off, total, items:bill_items(source, amount)')
      .gte('created_at', from).lt('created_at', to)
      .neq('status', 'cancelled')
      .or(SERVICE_BILLS_ONLY),

    supabase.from('bills')
      .select('total, paid, created_at')
      .in('status', ['unpaid', 'partial'])
      .or(SERVICE_BILLS_ONLY),
  ])

  if (billsRes.error) throw new Error(`Could not read the day's bills: ${billsRes.error.message}`)
  if (outstandingRes.error) throw new Error(`Could not read outstanding bills: ${outstandingRes.error.message}`)

  type BillRow = {
    id: string; subtotal: number; discount: number; tax: number
    round_off: number | null; total: number
    items: Array<{ source: string; amount: number }> | null
  }
  const bills = (billsRes.data ?? []) as unknown as BillRow[]

  const bySource = new Map<string, { amount: number; count: number }>()
  let subtotal = 0, discount = 0, tax = 0, roundOff = 0, billedTotal = 0
  for (const b of bills) {
    subtotal    += Number(b.subtotal ?? 0)
    discount    += Number(b.discount ?? 0)
    tax         += Number(b.tax ?? 0)
    roundOff    += Number(b.round_off ?? 0)
    billedTotal += Number(b.total ?? 0)
    for (const it of b.items ?? []) {
      const cur = bySource.get(it.source) ?? { amount: 0, count: 0 }
      cur.amount += Number(it.amount ?? 0)
      cur.count  += 1
      bySource.set(it.source, cur)
    }
  }

  const sources: DayEndSourceLine[] = [...bySource.entries()]
    .map(([source, v]) => ({ source, amount: round2(v.amount), lines: v.count }))
    .sort((a, b) => b.amount - a.amount)

  // Outstanding is split by when the bill was raised, because "owed from
  // today" and "owed from before" are different problems: one is a patient
  // still at the counter, the other is a debt somebody has to chase.
  let outstandingToday = 0, outstandingEarlier = 0, outstandingCount = 0
  for (const b of (outstandingRes.data ?? []) as Array<{ total: number; paid: number; created_at: string }>) {
    const due = Math.max(0, Number(b.total) - Number(b.paid))
    if (due <= 0) continue
    outstandingCount++
    if (b.created_at >= from && b.created_at < to) outstandingToday += due
    else outstandingEarlier += due
  }

  return {
    date,
    collected: {
      total:        collection.total,
      billPayments: collection.billPayments,
      advances:     collection.advances,
      refunds:      collection.refunds,
      byMethod:     await collectedByMethod(supabase, actor.tenant_id, from, to),
    },
    billed: {
      bills:    bills.length,
      sources,
      subtotal: round2(subtotal),
      discount: round2(discount),
      tax:      round2(tax),
      roundOff: round2(roundOff),
      total:    round2(billedTotal),
    },
    outstanding: {
      today:    round2(outstandingToday),
      earlier:  round2(outstandingEarlier),
      total:    round2(outstandingToday + outstandingEarlier),
      bills:    outstandingCount,
    },
  }
}

/**
 * Cash in, split by how it arrived.
 *
 * `advance` is excluded for the same reason `getCollectionSummary` excludes
 * it: applying a deposit already counted is not money arriving twice. The
 * deposits themselves come from `admission_advances`, which carries its own
 * method, and are added to the same buckets.
 */
async function collectedByMethod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string, from: string, to: string,
): Promise<Record<string, number>> {
  const [pays, advs] = await Promise.all([
    supabase.from('payments').select('amount, method').eq('tenant_id', tenantId)
      .gte('received_at', from).lt('received_at', to).neq('method', 'advance'),
    supabase.from('admission_advances').select('amount, method').eq('tenant_id', tenantId)
      .gte('received_at', from).lt('received_at', to),
  ])
  if (pays.error) throw new Error(`Could not read payments: ${pays.error.message}`)
  if (advs.error) throw new Error(`Could not read advances: ${advs.error.message}`)

  const out: Record<string, number> = {}
  for (const r of [...(pays.data ?? []), ...(advs.data ?? [])] as Array<{ amount: number; method: string | null }>) {
    const k = (r.method ?? 'other').toLowerCase()
    out[k] = round2((out[k] ?? 0) + Number(r.amount))
  }
  return out
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// ── The sales register ──────────────────────────────────────────────────────

/**
 * Every bill raised in a range, with who it was for and who ordered it.
 *
 * This is the dataset every later export is rendered from — the CSV, and the
 * Tally vouchers after it. Nothing here is shaped for a particular accounting
 * package, because the next hospital's auditor will not use the same one; the
 * rendering is somebody else's job and this is the fact.
 *
 * ── Why the doctor takes three joins ───────────────────────────────────────
 *
 * `bills` has a foreign key to `admissions` but not to `visits` or
 * `appointments`: `visits` is range-partitioned on `visit_date`, so the
 * constraint had to go. PostgREST can therefore embed the admission but not
 * the other two, and they are fetched and merged here instead — the same
 * pattern `listPendingPrescriptions` uses, and for the same reason.
 *
 * The three routes are also three different meanings of "doctor": who the
 * patient saw, who they were booked with, and who admitted them. For a
 * revenue report they are the same question — whose work produced this bill —
 * so they fold into one column, preferring the most specific.
 */
export async function getSalesRegister(params: {
  from: string
  to: string
  source?: string | null
  doctorId?: string | null
  /** 'all' (default), 'unpaid' — anything still owed — or 'paid'. */
  status?: 'all' | 'unpaid' | 'paid'
  limit?: number
}): Promise<SalesRegister> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()

  const from = istDayStartISO(params.from)
  const to   = istDayEndISO(params.to)
  // A screen shows a page; a file holds everything. The ceiling exists only
  // so one mistyped date cannot pull a decade into memory.
  const cap  = Math.min(params.limit ?? 500, 20000)

  let q = supabase.from('bills')
    .select(`id, bill_no, created_at, billing_date, subtotal, discount, tax, round_off,
             total, paid, status, visit_id, appointment_id, admission_id,
             patient:patients(full_name, uhid),
             admission:admissions(admitting_doctor_id),
             items:bill_items(source, amount, ref_id)`)
    .gte('created_at', from).lt('created_at', to)
    .neq('status', 'cancelled')
    .or(SERVICE_BILLS_ONLY)
    .order('created_at', { ascending: false })

  if (params.status === 'unpaid') q = q.in('status', ['unpaid', 'partial'])
  else if (params.status === 'paid') q = q.eq('status', 'paid')

  const { data, error } = await q
  if (error) throw new Error(`Could not read the sales register: ${error.message}`)

  type Raw = {
    id: string; bill_no: string | null; created_at: string; billing_date: string | null
    subtotal: number; discount: number; tax: number; round_off: number | null
    total: number; paid: number; status: string
    visit_id: string | null; appointment_id: string | null; admission_id: string | null
    patient: { full_name: string; uhid: string } | null
    admission: { admitting_doctor_id: string | null } | null
    items: Array<{ source: string; amount: number; ref_id: string | null }> | null
  }
  const raw = (data ?? []) as unknown as Raw[]

  // ── Resolve the doctor ──────────────────────────────────────────────────
  const visitIds = [...new Set(raw.map((b) => b.visit_id).filter(Boolean) as string[])]
  const apptIds  = [...new Set(raw.map((b) => b.appointment_id).filter(Boolean) as string[])]

  const [visitRes, apptRes] = await Promise.all([
    visitIds.length
      ? supabase.from('visits').select('id, doctor_id').in('id', visitIds)
      : Promise.resolve({ data: [], error: null }),
    apptIds.length
      ? supabase.from('appointments').select('id, doctor_id').in('id', apptIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (visitRes.error) throw new Error(`Could not read visits: ${visitRes.error.message}`)
  if (apptRes.error) throw new Error(`Could not read appointments: ${apptRes.error.message}`)

  const visitDoctor = new Map((visitRes.data ?? []).map((v) => [v.id as string, v.doctor_id as string | null]))
  const apptDoctor  = new Map((apptRes.data ?? []).map((a) => [a.id as string, a.doctor_id as string | null]))

  // ── And for a bill with no encounter at all ─────────────────────────────
  //
  // A walk-in scan or blood test has no visit, no appointment and no
  // admission — somebody arrives with a slip, pays, and leaves. The bill then
  // has nothing to join through and the doctor column read "—", which puts a
  // hole in doctor-wise revenue exactly where a hospital earns without a
  // consultation.
  //
  // The order itself knows: `lab_orders.ordered_by` and
  // `radiology_orders.ordered_by`. Reached through the bill line's `ref_id`,
  // which is what links a charge back to the thing that produced it.
  const orderRefs = new Map<string, string[]>()   // table -> ref ids
  for (const b of raw) {
    if (b.visit_id || b.appointment_id || b.admission_id) continue
    for (const it of b.items ?? []) {
      const table = it.source === 'lab' ? 'lab_orders'
        : it.source === 'radiology' ? 'radiology_orders' : null
      if (!table) continue
      const refs = orderRefs.get(table) ?? []
      refs.push(it.ref_id ?? '')
      orderRefs.set(table, refs)
    }
  }
  const orderDoctor = new Map<string, string | null>()   // ref id -> doctor
  await Promise.all([...orderRefs.entries()].map(async ([table, refs]) => {
    const ids = [...new Set(refs.filter(Boolean))]
    if (!ids.length) return
    const { data } = await supabase.from(table as 'lab_orders')
      .select('id, ordered_by').in('id', ids)
    for (const o of data ?? []) orderDoctor.set(o.id as string, o.ordered_by as string | null)
  }))

  const doctorIdOf = (b: Raw): string | null =>
    (b.visit_id ? visitDoctor.get(b.visit_id) ?? null : null)
    ?? (b.appointment_id ? apptDoctor.get(b.appointment_id) ?? null : null)
    ?? b.admission?.admitting_doctor_id
    ?? (b.items ?? []).map((it) => orderDoctor.get(it.ref_id ?? '')).find(Boolean)
    ?? null

  const doctorIds = [...new Set(raw.map(doctorIdOf).filter(Boolean) as string[])]
  const { data: docs } = doctorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', doctorIds)
    : { data: [] }
  const doctorName = new Map((docs ?? []).map((d) => [d.id as string, d.full_name as string]))

  // ── Shape, filter, total ────────────────────────────────────────────────
  const all: SalesRegisterRow[] = raw.map((b) => {
    const did = doctorIdOf(b)
    const bySource = new Map<string, number>()
    for (const it of b.items ?? []) {
      bySource.set(it.source, round2((bySource.get(it.source) ?? 0) + Number(it.amount)))
    }
    const balance = round2(Math.max(0, Number(b.total) - Number(b.paid)))
    return {
      id: b.id,
      date: istDate(b.created_at),
      billNo: b.bill_no ?? '—',
      patientName: b.patient?.full_name ?? '—',
      uhid: b.patient?.uhid ?? '',
      doctorId: did,
      doctorName: did ? doctorName.get(did) ?? '—' : '—',
      sources: [...bySource.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([source, amount]) => ({ source, amount })),
      subtotal: round2(Number(b.subtotal ?? 0)),
      discount: round2(Number(b.discount ?? 0)),
      tax:      round2(Number(b.tax ?? 0)),
      roundOff: round2(Number(b.round_off ?? 0)),
      total:    round2(Number(b.total ?? 0)),
      paid:     round2(Number(b.paid ?? 0)),
      balance,
      status:   b.status,
    }
  })

  // Filtered here rather than in the query: `source` lives on the bill's items
  // and `doctor` on a table PostgREST cannot reach from here, so neither can
  // be a `where` clause without a second round trip per bill.
  const filtered = all.filter((r) =>
    (!params.source   || r.sources.some((s) => s.source === params.source)) &&
    (!params.doctorId || r.doctorId === params.doctorId))

  const totals = filtered.reduce((t, r) => ({
    subtotal: round2(t.subtotal + r.subtotal),
    discount: round2(t.discount + r.discount),
    tax:      round2(t.tax + r.tax),
    total:    round2(t.total + r.total),
    paid:     round2(t.paid + r.paid),
    balance:  round2(t.balance + r.balance),
  }), { subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, balance: 0 })

  return {
    from: params.from,
    to: params.to,
    rows: filtered.slice(0, cap),
    matched: filtered.length,
    truncated: filtered.length > cap,
    totals,
    // The filter lists come from the range itself, so a hospital is never
    // offered a department it does not run or a doctor who has left.
    doctors: [...new Set(all.map((r) => r.doctorId).filter(Boolean) as string[])]
      .map((id) => ({ id, name: doctorName.get(id) ?? '—' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    sources: [...new Set(all.flatMap((r) => r.sources.map((s) => s.source)))].sort(),
  }
}

// ── Ledger names ────────────────────────────────────────────────────────────

/**
 * What this hospital calls each income head and each payment method.
 *
 * Needed by every export and owned by none of them. A CSV an accountant opens
 * in Excel wants the ledger name in a column just as much as a Tally voucher
 * wants it in a tag, and neither can be guessed: there is no universal chart
 * of accounts, and a name that does not already exist in the company's books
 * is a rejected import whatever the software.
 */
export async function getLedgerMappings(): Promise<LedgerMapping[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ledger_mappings').select('kind, key, ledger_name').order('kind').order('key')
  if (error) throw new Error(`Could not read ledger names: ${error.message}`)
  return (data ?? []) as LedgerMapping[]
}

export async function saveLedgerMapping(params: {
  kind: 'source' | 'method' | 'account'; key: string; ledgerName: string
}): Promise<{ success: boolean; error?: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  const supabase = await createClient()

  const name = params.ledgerName.trim()
  // Clearing the box removes the mapping rather than storing an empty name —
  // an empty ledger is worse than none, because an exporter would write it out
  // and the import would fail on a blank.
  if (!name) {
    const { error } = await supabase.from('ledger_mappings').delete()
      .eq('tenant_id', actor.tenant_id).eq('kind', params.kind).eq('key', params.key)
    return error ? { success: false, error: error.message } : { success: true }
  }

  const { error } = await supabase.from('ledger_mappings').upsert({
    tenant_id: actor.tenant_id, kind: params.kind, key: params.key,
    ledger_name: name, updated_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,kind,key' })
  return error ? { success: false, error: error.message } : { success: true }
}

// ── The file ────────────────────────────────────────────────────────────────

/**
 * The register the accountant is looking at, as a file.
 *
 * Same functions, same filters — the rows are produced by `getSalesRegister`
 * and `getMovementsInRange`, not by a second query shaped for export. That is
 * not tidiness: the reason the old "Daily Collection" CSV could download an
 * empty file for months is that nothing on screen showed what it should have
 * contained, so there was nothing to notice. What is downloaded here is what
 * was read.
 *
 * CSV rather than a vendor format, because the next hospital's auditor will
 * not use the same package as this one's, and a spreadsheet is the only thing
 * every package imports — and the only thing that works for an accountant who
 * has no package at all.
 */
export async function exportRegisterCsv(params: {
  book: 'sales' | 'receipts'
  from: string
  to: string
  source?: string | null
  doctorId?: string | null
  status?: 'all' | 'unpaid' | 'paid'
}): Promise<{ filename: string; csv: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')

  const ledgers = await getLedgerMappings()
  const ledgerOf = (kind: 'source' | 'method', key: string) =>
    ledgers.find((l) => l.kind === kind && l.key === key)?.ledger_name ?? ''

  const stamp = `${params.from}_to_${params.to}`

  if (params.book === 'sales') {
    // A high ceiling rather than the screen's: a file is read by a machine or
    // an accountant scrolling, and truncating it silently would be the same
    // fault as the empty download it replaces.
    const reg = await getSalesRegister({ ...params, limit: 20000 })
    const head = [
      'Date', 'Bill No', 'Patient', 'UHID', 'Doctor', 'Departments', 'Ledger',
      'Subtotal', 'Discount', 'Tax', 'Round Off', 'Total', 'Received', 'Owed', 'Status',
    ]
    const rows = reg.rows.map((r) => {
      // The ledger follows the biggest line on the bill. A bill spanning
      // departments has no single income head, and inventing a split here
      // would be a rule nobody asked for — the department column still shows
      // every one of them.
      const main = r.sources[0]?.source ?? ''
      return [
        r.date, r.billNo, r.patientName, r.uhid, r.doctorName,
        r.sources.map((s) => s.source).join(' + '),
        ledgerOf('source', main),
        r.subtotal, r.discount, r.tax, r.roundOff, r.total, r.paid, r.balance, r.status,
      ]
    })
    return { filename: `sales-register_${stamp}.csv`, csv: toCsv(head, rows) }
  }

  const { movements } = await getMovementsInRange({ from: params.from, to: params.to })
  const head = ['Date', 'Time', 'Reference', 'Patient', 'Kind', 'Method', 'Ledger', 'Received By', 'Amount']
  const rows = movements.map((m) => [
    istDate(m.time),
    new Date(m.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }),
    m.reference, m.patientName, m.kind, m.method, ledgerOf('method', m.method),
    m.cashierName, m.amount,
  ])
  return { filename: `receipts-register_${stamp}.csv`, csv: toCsv(head, rows) }
}

/**
 * Rows to a file a spreadsheet will open without argument.
 *
 * The BOM is not decoration: without it Excel on Windows reads the file as
 * the system codepage, and every ₹ and every Tamil name in it turns to
 * mojibake on the one machine the accountant actually uses.
 */
function toCsv(head: string[], rows: Array<Array<string | number>>): string {
  const cell = (v: string | number): string => {
    if (typeof v === 'number') return String(v)
    const t = v.replace(/"/g, '""')
    return /[",\n\r]/.test(t) ? `"${t}"` : t
  }
  // No byte-order mark here, although Excel on Windows needs one. A leading
  // U+FEFF does not survive the trip: it is stripped somewhere between this
  // string literal and the browser — measured, not assumed, by logging the
  // first code point on arrival, which was `D`. So the mark is written as
  // actual bytes where the file is assembled, in RegisterTab.
  //
  // CRLF because the file is for a spreadsheet, and Excel is the one reader
  // that still minds.
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

// ── Tally ───────────────────────────────────────────────────────────────────

/**
 * The register as Tally vouchers.
 *
 * Built from the same `getSalesRegister` and `getMovementsInRange` the screen
 * and the CSV use. Tally is a rendering, not a destination: a second query
 * shaped for one accounting package is how two reports start disagreeing, and
 * the next hospital's auditor will be using something else.
 *
 * ── It refuses rather than guesses ─────────────────────────────────────────
 *
 * Every ledger named in a voucher has to exist already in the hospital's
 * books. An unmapped income head or payment method therefore stops the export
 * and says which one is missing, instead of writing a plausible name that
 * Tally silently drops into its Exceptions report — where a hospital would
 * find it, if at all, weeks later while reconciling.
 *
 * ── Per bill, or a day at a time ───────────────────────────────────────────
 *
 * Per-bill gives one Sales voucher per bill with a bill reference, so Tally
 * keeps the hospital's "yet to collect" by itself and a Receipt closes it.
 * Consolidated gives one Sales voucher per day, which is far fewer rows for a
 * busy month and gives that up — a single voucher cannot carry one reference
 * per bill. The choice is the accountant's; the default is per-bill, because
 * losing outstanding silently would be the worse surprise.
 */
export async function exportTallyXml(params: {
  from: string
  to: string
  mode: 'per_bill' | 'consolidated'
  source?: string | null
  doctorId?: string | null
}): Promise<{ filename: string; xml: string; sales: number; receipts: number }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')

  const ledgers = await getLedgerMappings()
  const ledgerOf = (kind: 'source' | 'method' | 'account', key: string) =>
    ledgers.find((l) => l.kind === kind && l.key === key)?.ledger_name ?? null

  const party = ledgerOf('account', 'debtors')
  if (!party) {
    throw new Error(
      'Set a ledger name for "Money owed by patients" on the Ledger names tab first — '
      + 'every Sales voucher needs an account to post the debit to.')
  }

  const [reg, { movements }] = await Promise.all([
    getSalesRegister({ ...params, limit: 20000 }),
    getMovementsInRange({ from: params.from, to: params.to }),
  ])

  // Fail loudly and specifically, before writing anything.
  const missingSources = [...new Set(reg.rows.flatMap((r) => r.sources.map((s) => s.source)))]
    .filter((s) => !ledgerOf('source', s))
  const missingMethods = [...new Set(movements.map((m) => m.method))]
    .filter((m) => !ledgerOf('method', m))
  if (missingSources.length || missingMethods.length) {
    const bits = [
      missingSources.length ? `income heads: ${missingSources.join(', ')}` : null,
      missingMethods.length ? `payment methods: ${missingMethods.join(', ')}` : null,
    ].filter(Boolean).join('; ')
    throw new Error(`No ledger name set for ${bits}. Fill those in on the Ledger names tab — `
      + 'a guessed name is a voucher Tally rejects.')
  }

  const sales: TallySale[] = []

  if (params.mode === 'per_bill') {
    for (const r of reg.rows) {
      sales.push({
        date: r.date,
        voucherNo: r.billNo,
        narration: `${r.patientName}${r.uhid ? ` (${r.uhid})` : ''}`
          + `${r.doctorName && r.doctorName !== '—' ? ` — ${r.doctorName}` : ''}`,
        credits: r.sources.map((s) => ({ ledger: ledgerOf('source', s.source)!, amount: s.amount })),
        partyLedger: party,
        billRef: r.billNo,
      })
    }
  } else {
    // One voucher per day, income heads summed. The bill reference goes,
    // which is the trade the accountant chose.
    const byDay = new Map<string, Map<string, number>>()
    for (const r of reg.rows) {
      const day = byDay.get(r.date) ?? new Map<string, number>()
      for (const s of r.sources) day.set(s.source, round2((day.get(s.source) ?? 0) + s.amount))
      byDay.set(r.date, day)
    }
    for (const [date, heads] of [...byDay.entries()].sort()) {
      sales.push({
        date,
        voucherNo: `DAY-${date.replace(/-/g, '')}`,
        narration: `Consolidated sales for ${date}`,
        credits: [...heads.entries()].map(([source, amount]) => ({ ledger: ledgerOf('source', source)!, amount })),
        partyLedger: party,
        billRef: null,
      })
    }
  }

  // A refund is money going out, so it is not a Receipt. Left out of this file
  // rather than posted with a negative sign, which Tally would take as a
  // receipt of minus the amount and quietly corrupt the day.
  const receipts: TallyReceipt[] = movements
    .filter((m) => m.amount > 0)
    .map((m) => ({
      date: istDate(m.time),
      voucherNo: m.reference || m.id.slice(0, 8),
      narration: `${m.patientName} — ${m.kind === 'advance' ? 'advance' : 'bill payment'}`,
      debitLedger: ledgerOf('method', m.method)!,
      partyLedger: party,
      amount: m.amount,
      // An advance is not against a bill yet, so it has no reference to close.
      billRef: m.kind === 'payment' && m.reference ? m.reference : null,
    }))

  const xml = buildTallyXml(sales.filter((s) => saleTotal(s) > 0), receipts)
  return {
    filename: `tally-vouchers_${params.from}_to_${params.to}.xml`,
    xml,
    sales: sales.length,
    receipts: receipts.length,
  }
}

// ── The owner's day ─────────────────────────────────────────────────────────

/**
 * How the hospital ran on a given day, for the person who owns it.
 *
 * Deliberately not the Accounts register with fewer rows. A table answers
 * *what exactly happened*; this answers *is today normal*, which is the only
 * question somebody glancing at a screen on the way past is actually asking.
 * That is why almost every figure carries a comparison: ₹48,200 on its own is
 * a digit, and ₹48,200 against an average Saturday of ₹51,000 is something to
 * act on.
 *
 * The money comes from `getDayEndSheet` rather than being computed again, so
 * the owner's screen and the accountant's sheet can never disagree. The one
 * time a hospital is shown two answers to the same question it stops
 * believing either, and that cannot be undone by fixing it afterwards.
 *
 * **The comparison is the same weekday, averaged over the four before it.**
 * A hospital's week is not flat — an OPD Saturday looks nothing like a
 * Tuesday — so comparing against yesterday or against a rolling mean would
 * report a difference that is only the day of the week.
 */
export async function getOwnerDay(date: string): Promise<OwnerDay> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'dashboard:read')
  const supabase = await createClient()
  const { from, to } = istDayBoundsISO(date)

  // The four previous same-weekdays, for every comparison on the screen.
  const priorDays = [7, 14, 21, 28].map((n) => istAddDays(date, -n))

  // ── The materialized views need the service client, and their own filter ──
  //
  // They are granted to service_role alone, because a materialized view cannot
  // carry row-level security: it aggregates every tenant in the database into
  // one table and reachability is the only boundary there is. Reading one
  // through the ordinary client returns nothing — silently, unless the error
  // is checked, which is why every one of these is checked below.
  //
  // And because the service client bypasses RLS, `tenant_id` has to be filtered
  // here by hand. Leaving it off does not fail; it quietly mixes other
  // hospitals' numbers into this one's.
  const rd = getReadClient()

  const [sheet, trendRes, counts, priorCounts, beds, attention] = await Promise.all([
    getDayEndSheet(date),
    rd.from('mv_daily_revenue_by_tenant')
      .select('day, total_amount')
      .eq('tenant_id', actor.tenant_id)
      .gte('day', istAddDays(date, -29)).lte('day', date)
      .order('day'),
    countsFor(supabase, actor.tenant_id, from, to),
    Promise.all(priorDays.map(async (d) => {
      const b = istDayBoundsISO(d)
      return countsFor(supabase, actor.tenant_id, b.from, b.to)
    })),
    rd.from('mv_bed_occupancy_by_tenant')
      .select('total_beds, occupied_beds').eq('tenant_id', actor.tenant_id).maybeSingle(),
    attentionFor(supabase, rd, actor.tenant_id, date),
  ])

  if (trendRes.error) throw new Error(`Could not read the trend: ${trendRes.error.message}`)
  if (beds.error) throw new Error(`Could not read bed occupancy: ${beds.error.message}`)

  // Days with no money have no row in the view, so the series is filled in —
  // a line that skips its quiet days draws a hospital busier than it was.
  const byDay = new Map((trendRes.data ?? []).map((r) => [r.day as string, Number(r.total_amount)]))
  const trend: Array<{ day: string; amount: number }> = []
  for (let i = 29; i >= 0; i--) {
    const d = istAddDays(date, -i)
    trend.push({ day: d, amount: byDay.get(d) ?? 0 })
  }

  const priorCollected = priorDays.map((d) => byDay.get(d) ?? 0)
  const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0

  const totalBeds = Number(beds.data?.total_beds ?? 0)
  const occupied  = Number(beds.data?.occupied_beds ?? 0)

  return {
    date,
    collected:   { ...sheet.collected, usualForThisWeekday: avg(priorCollected) },
    billed:      sheet.billed,
    outstanding: sheet.outstanding,
    trend,
    activity: (Object.keys(counts) as Array<keyof DayCounts>).map((k) => ({
      key: k,
      count: counts[k],
      usualForThisWeekday: avg(priorCounts.map((p) => p[k])),
    })),
    beds: { total: totalBeds, occupied, percent: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0 },
    attention,
  }
}

interface DayCounts {
  consultations: number
  emergency: number
  admissions: number
  discharges: number
  labTests: number
  scans: number
  surgeries: number
}

/** What the hospital did in a window — the activity half of the picture. */
async function countsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string, from: string, to: string,
): Promise<DayCounts> {
  const head = { count: 'exact' as const, head: true }
  const [appt, er, adm, dis, lab, rad, ot] = await Promise.all([
    supabase.from('appointments').select('id', head).eq('tenant_id', tenantId).gte('scheduled_at', from).lt('scheduled_at', to),
    supabase.from('emergency_cases').select('id', head).eq('tenant_id', tenantId).gte('arrived_at', from).lt('arrived_at', to),
    supabase.from('admissions').select('id', head).eq('tenant_id', tenantId).gte('admitted_at', from).lt('admitted_at', to),
    supabase.from('admissions').select('id', head).eq('tenant_id', tenantId).gte('discharged_at', from).lt('discharged_at', to),
    // Items, not orders: one order routinely carries several tests, and a lab
    // that ran forty orders of three tests did not run forty tests.
    supabase.from('lab_order_items').select('id', head).eq('tenant_id', tenantId).gte('created_at', from).lt('created_at', to),
    supabase.from('radiology_orders').select('id', head).eq('tenant_id', tenantId).gte('ordered_at', from).lt('ordered_at', to),
    supabase.from('ot_schedules').select('id', head).eq('tenant_id', tenantId).gte('scheduled_start', from).lt('scheduled_start', to),
  ])
  return {
    consultations: appt.count ?? 0,
    emergency:     er.count ?? 0,
    admissions:    adm.count ?? 0,
    discharges:    dis.count ?? 0,
    labTests:      lab.count ?? 0,
    scans:         rad.count ?? 0,
    surgeries:     ot.count ?? 0,
  }
}

/** The two things worth interrupting an owner for. */
async function attentionFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rd: ReturnType<typeof getReadClient>,
  tenantId: string,
  date: string,
): Promise<OwnerDay['attention']> {
  const cutoff = istDayStartISO(istAddDays(date, -30))
  const [stale, stock] = await Promise.all([
    supabase.from('bills').select('total, paid')
      .in('status', ['unpaid', 'partial']).lt('created_at', cutoff).or(SERVICE_BILLS_ONLY),
    // Service-role client, so the tenant filter is ours to apply.
    rd.from('mv_lowstock_alerts_by_tenant')
      .select('low_stock_count').eq('tenant_id', tenantId).maybeSingle(),
  ])
  if (stale.error) throw new Error(`Could not read unpaid bills: ${stale.error.message}`)
  if (stock.error) throw new Error(`Could not read stock alerts: ${stock.error.message}`)
  const rows = (stale.data ?? []) as Array<{ total: number; paid: number }>
  const owed = rows.reduce((s, b) => s + Math.max(0, Number(b.total) - Number(b.paid)), 0)
  return {
    staleBills: rows.length,
    staleAmount: round2(owed),
    lowStock: Number(stock.data?.low_stock_count ?? 0),
  }
}
