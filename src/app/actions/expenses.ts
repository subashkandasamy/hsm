'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { DOCUMENT_UPLOAD, checkUploadName, checkUploadSize } from '@/lib/upload/allowedFiles'
import { hospitalFileLink, queueForHospitalComputer } from '@/lib/localFiles'
import { istToday } from '@/lib/istDate'
import { pageAll } from '@/lib/supabase/pageAll'
import { pageWindow, type Paged } from '@/lib/paging'
import {
  STARTER_CATEGORIES, isExpenseMethod, methodLabel,
  type Expense, type ExpenseReport, type ExpenseTotal,
} from '@/lib/expenses'

/**
 * Day-to-day expenses (0308). Recording and seeing them goes with taking
 * payments (billing:write — admin, accountant, receptionist, and a role given
 * "Billing & cash book"; not a doctor, who may only view bills); the report and
 * cancelling are admin and accountant (billing:manage). The database holds the same line (RLS + a
 * trigger that allows nothing but cancelling).
 */

const BUCKET = 'documents'
const SIGNED_URL_EXPIRY = 60 * 60
const YMD = /^\d{4}-\d{2}-\d{2}$/

const SELECT = `id, expense_date, category, amount, paid_to, method, reference, notes, bill_path, no_bill_reason,
  created_at, cancelled_at, cancel_reason,
  recorder:profiles!expenses_created_by_fkey(full_name),
  canceller:profiles!expenses_cancelled_by_fkey(full_name)`

type Row = {
  id: string; expense_date: string; category: string; amount: number | string; paid_to: string | null
  method: string; reference: string | null; notes: string | null; bill_path: string | null
  no_bill_reason: string | null; created_at: string; cancelled_at: string | null; cancel_reason: string | null
  recorder: { full_name: string } | null; canceller: { full_name: string } | null
}

/** What the page is sent: the bill's storage path stays on the server. */
function toExpense(r: Row): Expense {
  return {
    id: r.id, expense_date: r.expense_date, category: r.category, amount: Number(r.amount),
    paid_to: r.paid_to, method: (isExpenseMethod(r.method) ? r.method : 'cash'), reference: r.reference,
    notes: r.notes, has_bill: !!r.bill_path, no_bill_reason: r.no_bill_reason, created_at: r.created_at,
    recorded_by: r.recorder?.full_name ?? 'Unknown', cancelled_at: r.cancelled_at,
    cancelled_by: r.canceller?.full_name ?? null, cancel_reason: r.cancel_reason,
  }
}

const clean = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

/** A one-time link to upload the bill (photo or PDF) straight to storage. */
export async function getExpenseBillUploadUrl(
  filename: string, sizeBytes?: number,
): Promise<{ success: true; signedUrl: string; filePath: string } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')
  const checked = checkUploadName(filename, DOCUMENT_UPLOAD)
  if (!checked.ok) return { success: false, error: checked.error }
  const tooBig = checkUploadSize(sizeBytes, DOCUMENT_UPLOAD)
  if (tooBig) return { success: false, error: tooBig.error }

  const filePath = `tenants/${actor.tenant_id}/expenses/${crypto.randomUUID()}.${checked.ext}`
  const { data, error } = await createServiceClient().storage.from(BUCKET).createSignedUploadUrl(filePath)
  if (error || !data) return { success: false, error: error?.message ?? 'Could not prepare the upload' }
  return { success: true, signedUrl: data.signedUrl, filePath }
}

export interface NewExpense {
  expenseDate: string
  category: string
  amount: number
  paidTo?: string | null
  method: string
  reference?: string | null
  notes?: string | null
  /** From getExpenseBillUploadUrl, after the upload finished. */
  billPath?: string | null
  /** Instead of a bill: why there is none. */
  noBillReason?: string | null
}

export async function addExpense(input: NewExpense): Promise<{ success: true; expense: Expense } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const date = typeof input.expenseDate === 'string' && YMD.test(input.expenseDate) ? input.expenseDate : null
  if (!date) return { success: false, error: 'Enter the date of the expense' }
  if (date > istToday()) return { success: false, error: 'The date cannot be in the future' }
  const category = clean(input.category, 60)
  if (!category) return { success: false, error: 'Choose or type a category' }
  const amount = Math.round(Number(input.amount) * 100) / 100
  if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Enter the amount paid' }
  if (amount >= 10_000_000) return { success: false, error: 'That amount is too large — check it' }
  if (!isExpenseMethod(input.method)) return { success: false, error: 'Choose how it was paid' }

  // A bill this hospital uploaded for an expense, or a reason there is none.
  const billPath = clean(input.billPath, 300)
  const noBillReason = clean(input.noBillReason, 200)
  if (billPath && !billPath.startsWith(`tenants/${actor.tenant_id}/expenses/`)) return { success: false, error: 'That bill upload is not valid — upload it again' }
  if (!billPath && !noBillReason) return { success: false, error: 'Upload the bill, or tick "No bill" and say why' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('expenses').insert({
    tenant_id: actor.tenant_id,
    expense_date: date,
    category,
    amount,
    paid_to: clean(input.paidTo, 120),
    method: input.method,
    reference: clean(input.reference, 80),
    notes: clean(input.notes, 500),
    bill_path: billPath,
    no_bill_reason: billPath ? null : noBillReason,
    created_by: actor.id,
  }).select(SELECT).single()
  if (error || !data) return { success: false, error: error?.message ?? 'Could not save the expense' }

  const row = data as unknown as Row
  await logAudit(actor.id, 'create', 'expense', row.id, { amount, category, method: input.method, bill: !!billPath, date })
  // Moves to the hospital computer if this hospital keeps uploads there (0275).
  if (billPath) await queueForHospitalComputer(actor.tenant_id, BUCKET, billPath, 'expense_bill')
  return { success: true, expense: toExpense(row) }
}

/** The Expenses tab: newest first, a page at a time, with the categories to offer. */
export async function listExpenses(opts: { page?: number; size?: number } = {}): Promise<Paged<Expense> & { categories: string[] }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')
  const supabase = await createClient()
  const { page, size, from, to } = pageWindow(opts.page, opts.size)
  const [{ data, count }, used] = await Promise.all([
    supabase.from('expenses').select(SELECT, { count: 'exact' })
      .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
      .range(from, to),
    pageAll<{ category: string }>((f, t) => supabase.from('expenses').select('category').order('id').range(f, t)),
  ])
  // Their own words first-class: the starter list, then anything they have typed.
  const seen = new Map<string, string>()
  for (const c of [...STARTER_CATEGORIES, ...used.map((u) => u.category)]) {
    const k = c.trim().toLowerCase()
    if (k && !seen.has(k)) seen.set(k, c.trim())
  }
  return {
    rows: ((data ?? []) as unknown as Row[]).map(toExpense),
    total: count ?? 0, page, size,
    categories: [...seen.values()],
  }
}

/** A short-lived link to the bill — from the cloud, or the hospital computer once it has moved. */
export async function getExpenseBillUrl(id: string): Promise<{ success: true; url: string; where?: 'hospital' | 'internet' } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')
  const supabase = await createClient()
  const { data } = await supabase.from('expenses').select('bill_path').eq('id', id).maybeSingle()
  const path = data?.bill_path as string | null | undefined
  if (!path) return { success: false, error: 'This expense has no bill' }

  const kept = await hospitalFileLink(actor.tenant_id, BUCKET, path)
  if (kept.state === 'computer') {
    if (!kept.url || !kept.where) return { success: false, error: 'This bill is kept on the hospital computer, which cannot be reached right now.' }
    return { success: true, url: kept.url, where: kept.where }
  }
  const { data: signed, error } = await createServiceClient().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY)
  if (error || !signed) return { success: false, error: error?.message ?? 'Could not open the bill' }
  return { success: true, url: signed.signedUrl }
}

/** Never deleted: cancelled with a reason, kept in the list, left out of every total. */
export async function cancelExpense(id: string, reason: string): Promise<{ success: true; expense: Expense } | { success: false; error: string }> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  const why = clean(reason, 200)
  if (!why) return { success: false, error: 'Say why it is being cancelled' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('expenses')
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: actor.id, cancel_reason: why })
    .eq('id', id).is('cancelled_at', null)
    .select(SELECT).maybeSingle()
  if (error) return { success: false, error: error.message }
  if (!data) return { success: false, error: 'Already cancelled, or not found' }
  const row = data as unknown as Row
  await logAudit(actor.id, 'cancel', 'expense', id, { reason: why, amount: Number(row.amount) })
  return { success: true, expense: toExpense(row) }
}

/** The Reports tab: every expense dated in the range, and totals that leave cancelled ones out. */
export async function getExpenseReport(params: { from: string; to: string }): Promise<{ success: true; report: ExpenseReport } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:manage')
  if (!YMD.test(params.from) || !YMD.test(params.to)) return { success: false, error: 'Choose the dates' }
  if (params.from > params.to) return { success: false, error: 'The start date is after the end date' }
  const supabase = await createClient()
  const all = await pageAll<Row>((f, t) => supabase.from('expenses').select(SELECT)
    .gte('expense_date', params.from).lte('expense_date', params.to)
    .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
    .range(f, t) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>)
  const rows = all.map(toExpense)
  const live = rows.filter((r) => !r.cancelled_at)

  const group = (keyOf: (e: Expense) => string, labelOf: (k: string) => string): ExpenseTotal[] => {
    const m = new Map<string, ExpenseTotal>()
    for (const e of live) {
      const k = keyOf(e)
      const t = m.get(k) ?? { key: k, label: labelOf(k), amount: 0, count: 0 }
      t.amount = Math.round((t.amount + e.amount) * 100) / 100
      t.count++
      m.set(k, t)
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount)
  }
  return {
    success: true,
    report: {
      from: params.from, to: params.to, rows,
      total: Math.round(live.reduce((s, e) => s + e.amount, 0) * 100) / 100,
      count: live.length,
      withBill: live.filter((e) => e.has_bill).length,
      withoutBill: live.filter((e) => !e.has_bill).length,
      byCategory: group((e) => e.category, (k) => k),
      byMethod: group((e) => e.method, methodLabel),
      byStaff: group((e) => e.recorded_by, (k) => k),
    },
  }
}
