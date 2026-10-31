'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess, requireModule } from '@/lib/server-utils'
import { encounterInsurance } from '@/lib/billing/insuranceShare'
import type { AdmissionAdvance, AdmissionAdvanceRefund, AdmissionFinancials, AdvanceDepositRequest, AdvanceReceiptData } from '@/lib/types'
import { istToday } from '@/lib/istDate'

type SimpleResult = { success: true } | { success: false; error: string }

// ---- Advance suggestion (read-only helper) ----

export async function suggestAdvance(params: {
  wardId: string
  procedureTariffId?: string | null
  estimatedNights: number
}): Promise<{ wardCharge: number; procedureCharge: number; total: number }> {
  const { wardId, procedureTariffId, estimatedNights } = params
  const supabase = await createClient()

  const { data: ward } = await supabase
    .from('wards').select('daily_rate').eq('id', wardId).single()
  const wardCharge = ((ward?.daily_rate as number) ?? 0) * Math.max(1, estimatedNights)

  let procedureCharge = 0
  if (procedureTariffId) {
    const { data: tariff } = await supabase
      .from('procedure_tariffs').select('default_price').eq('id', procedureTariffId).single()
    procedureCharge = (tariff?.default_price as number) ?? 0
  }

  return { wardCharge, procedureCharge, total: wardCharge + procedureCharge }
}

// ---- Record advance ----

export async function recordAdvance(params: {
  admissionId: string
  amount: number
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
}): Promise<{ success: true; advanceId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:advance')

  const { admissionId, amount, method } = params
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('admission_advances').insert({
    id,
    tenant_id: actor.tenant_id,
    admission_id: admissionId,
    amount,
    method,
    received_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'record', 'admission_advance', id, { admissionId, amount, method })
  return { success: true, advanceId: id }
}

// ---- Financial summary — single source of truth ----

export async function getAdmissionFinancials(
  admissionId: string
): Promise<AdmissionFinancials> {
  const supabase = await createClient()

  // Total advances received
  const { data: advances } = await supabase
    .from('admission_advances')
    .select('amount')
    .eq('admission_id', admissionId)
  const totalAdvance = (advances ?? []).reduce((s, a) => s + (a.amount as number), 0)

  // Total advance refunds issued
  const { data: refunds } = await supabase
    .from('admission_advance_refunds')
    .select('amount')
    .eq('admission_id', admissionId)
  const totalRefunded = (refunds ?? []).reduce((s, r) => s + (r.amount as number), 0)

  // Sum all bills for this admission
  const { data: bills } = await supabase
    .from('bills')
    .select('id, total, paid')
    .eq('admission_id', admissionId)
    .not('status', 'eq', 'cancelled')
  const totalBilled = (bills ?? []).reduce((s, b) => s + (b.total as number), 0)
  const totalPaid   = (bills ?? []).reduce((s, b) => s + (b.paid as number), 0)

  // Advance actually applied: only count payments with method='advance' against admission bills.
  // Using totalPaid would be wrong — cash/card payments also increase totalPaid and would
  // incorrectly reduce the unusedAdvance balance.
  const billIds = (bills ?? []).map((b) => b.id as string)
  let advanceApplied = 0
  let insuranceSettled = 0
  if (billIds.length > 0) {
    const { data: advPayments } = await supabase
      .from('payments')
      .select('amount, method')
      .in('bill_id', billIds)
      .in('method', ['advance', 'insurance'])
    for (const p of advPayments ?? []) {
      if (p.method === 'advance') advanceApplied += (p.amount as number)
      else if (p.method === 'insurance') insuranceSettled += (p.amount as number)
    }
  }

  // Insurance credit against the patient's balance. Pre-settlement this is the
  // eligibility-approved receivable (pre-auth lets the patient leave without
  // paying); post-settlement it reflects what was actually received unless the
  // shortfall was written off — see claimInsuranceCredit for the full rule.
  // Only the insurance credit not yet received offsets the balance — settled money
  // is already in totalPaid (see encounterInsurance).
  const ins = await encounterInsurance(supabase, { admissionId, billIds })
  const insuranceApproved = ins.outstanding

  const advanceSpent  = totalAdvance - totalRefunded
  const balanceDue    = Math.max(0, totalBilled - totalPaid)
  const unusedAdvance = Math.max(0, advanceSpent - advanceApplied)
  const patientBalanceDue = Math.max(0, balanceDue - insuranceApproved)

  return {
    totalAdvance, totalBilled, totalPaid, balanceDue, unusedAdvance,
    insuranceApproved, insuranceSettled, patientBalanceDue,
  }
}

// ---- Apply advance credit to a specific bill ----

export async function applyAdvanceToBill(
  billId: string,
  admissionId: string
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:advance')

  const supabase = await createClient()

  // One locking RPC does the whole thing: it takes the admission (the resource
  // two concurrent applies actually contend for, since the advance balance is
  // derived from its rows), then the bill, confirms the bill belongs to that
  // admission — both ids arrive from the browser — recomputes the balance from
  // `payments` rather than the drift-prone bills.paid, and posts the payment.
  const { data: result, error: rpcErr } = await supabase.rpc('apply_advance_to_bill', {
    p_bill_id: billId,
    p_admission_id: admissionId,
  })
  if (rpcErr) return { success: false, error: rpcErr.message }

  const res = result as { ok: boolean; error?: string; applied?: number }
  if (!res?.ok) return { success: false, error: res?.error ?? 'Could not apply the advance' }

  await logAudit(actor.id, 'apply_advance', 'bill', billId, { amount: res.applied, admissionId })
  return { success: true }
}

// ---- Advance deposit requests (pending obligations at the billing counter) ----

export async function getAdmissionDepositStatus(
  admissionId: string
): Promise<AdvanceDepositRequest | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('advance_deposit_requests')
    .select('*')
    .eq('admission_id', admissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as AdvanceDepositRequest | null
}

function flattenDepositRows(data: unknown[]): AdvanceDepositRequest[] {
  return (data as Array<Record<string, unknown>>).map((row) => {
    const adm = row.adm as Record<string, unknown> | null
    return {
      ...(row as unknown as AdvanceDepositRequest),
      patient_id: (adm?.patient_id as string) ?? '',
      patient:    adm?.patient as AdvanceDepositRequest['patient'],
      admission: adm ? {
        admitted_at: adm.admitted_at as string,
        ward:        adm.ward as { name: string } | undefined,
        bed:         adm.bed  as { bed_no: string } | undefined,
      } : undefined,
    }
  })
}

const DEPOSIT_SELECT = `
  *,
  adm:admissions(
    patient_id,
    patient:patients(full_name, uhid),
    admitted_at,
    ward:wards(name),
    bed:beds(bed_no)
  )
`

export async function listPendingAdvanceDeposits(): Promise<AdvanceDepositRequest[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('advance_deposit_requests')
    .select(DEPOSIT_SELECT)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return flattenDepositRows(data ?? [])
}

export async function listAllAdvanceDeposits(): Promise<AdvanceDepositRequest[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('advance_deposit_requests')
    .select(DEPOSIT_SELECT)
    .order('created_at', { ascending: false })
  return flattenDepositRows(data ?? [])
}

export async function collectAdvanceDeposit(
  requestId: string,
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
): Promise<{ success: true; advanceId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:advance')

  const supabase = await createClient()
  const { data: req } = await supabase
    .from('advance_deposit_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (!req) return { success: false, error: 'Deposit request not found' }
  if ((req.status as string) !== 'pending')
    return { success: false, error: 'This deposit has already been collected' }

  const advanceId = crypto.randomUUID()

  // Claim the request FIRST, conditional on it still being pending, and only
  // credit the advance if this call is the one that won. Crediting first and
  // flipping afterwards meant a double-click — or two counters — could both
  // pass the check above and credit the deposit twice.
  const { data: claimed } = await supabase
    .from('advance_deposit_requests')
    .update({
      status:       'collected',
      method,
      advance_id:   advanceId,
      collected_by: actor.id,
      collected_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('id')
  if (!claimed || claimed.length === 0)
    return { success: false, error: 'This deposit has already been collected' }

  const { error: advErr } = await supabase.from('admission_advances').insert({
    id:           advanceId,
    tenant_id:    req.tenant_id,
    admission_id: req.admission_id,
    amount:       req.amount,
    method,
    received_by:  actor.id,
  })
  if (advErr) {
    // Hand the request back so the counter can try again, rather than leaving
    // it marked collected with no advance behind it.
    await supabase.from('advance_deposit_requests').update({
      status: 'pending', advance_id: null, collected_by: null, collected_at: null,
    }).eq('id', requestId)
    return { success: false, error: advErr.message }
  }

  await logAudit(actor.id, 'collect_advance_deposit', 'admission_advance', advanceId, {
    requestId, method,
  })
  return { success: true, advanceId }
}

// ---- Batch advance balance for billing page (efficient: 4 queries, not N per admission) ----

export type AdvanceSummaryEntry = {
  totalCollected: number
  totalApplied: number
  netBalance: number
  admissionStatus: string | null
  hasRefundBill: boolean
}

export async function listAdvanceSummariesBatch(
  admissionIds: string[]
): Promise<Record<string, AdvanceSummaryEntry>> {
  if (!admissionIds.length) return {}
  const supabase = await createClient()

  const result: Record<string, AdvanceSummaryEntry> = {}
  for (const id of admissionIds) result[id] = { totalCollected: 0, totalApplied: 0, netBalance: 0, admissionStatus: null, hasRefundBill: false }

  const [
    { data: advances },
    { data: refunds },
    { data: admissions },
    { data: refundBills },
  ] = await Promise.all([
    supabase.from('admission_advances').select('admission_id, amount').in('admission_id', admissionIds),
    supabase.from('admission_advance_refunds').select('admission_id, amount').in('admission_id', admissionIds),
    supabase.from('admissions').select('id, status').in('id', admissionIds),
    supabase.from('bills').select('admission_id').in('admission_id', admissionIds).eq('bill_source', 'advance_refund'),
  ])

  for (const a of advances ?? []) {
    const aid = a.admission_id as string
    if (result[aid]) result[aid].totalCollected += a.amount as number
  }
  for (const r of refunds ?? []) {
    const aid = r.admission_id as string
    if (result[aid]) result[aid].totalCollected -= r.amount as number
  }
  for (const adm of admissions ?? []) {
    const aid = adm.id as string
    if (result[aid]) result[aid].admissionStatus = adm.status as string
  }
  for (const rb of refundBills ?? []) {
    const aid = rb.admission_id as string
    if (result[aid]) result[aid].hasRefundBill = true
  }

  // Bills for these admissions → bill_id map for advance payment lookup
  const { data: bills } = await supabase
    .from('bills').select('id, admission_id').in('admission_id', admissionIds).neq('status', 'cancelled')
  const billIdToAdmission = new Map<string, string>()
  for (const b of bills ?? []) billIdToAdmission.set(b.id as string, b.admission_id as string)
  const billIds = [...billIdToAdmission.keys()]

  if (billIds.length > 0) {
    const { data: payments } = await supabase
      .from('payments').select('bill_id, amount').in('bill_id', billIds).eq('method', 'advance')
    for (const p of payments ?? []) {
      const aid = billIdToAdmission.get(p.bill_id as string)
      if (aid && result[aid]) result[aid].totalApplied += p.amount as number
    }
  }

  for (const id of admissionIds) {
    result[id].netBalance = result[id].totalCollected - result[id].totalApplied
  }
  return result
}

// ---- Advance refund ----

export async function recordAdvanceRefund(params: {
  admissionId: string
  amount: number
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
}): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:advance')

  const { admissionId, amount, method } = params
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' }

  const supabase = await createClient()

  // The unused balance is recomputed and the refund written inside one row lock
  // on the admission. Read-then-write let two concurrent refunds each see the
  // same unused advance and each pay it out.
  const { data: result, error: rpcErr } = await supabase.rpc('refund_admission_advance', {
    p_admission_id: admissionId,
    p_amount: amount,
    p_method: method,
  })
  if (rpcErr) return { success: false, error: rpcErr.message }

  const res = result as { ok: boolean; error?: string; id?: string }
  if (!res?.ok || !res.id) {
    return { success: false, error: res?.error ?? 'Could not record the refund' }
  }

  await logAudit(actor.id, 'refund', 'admission_advance', res.id, { admissionId, amount, method })
  return { success: true, refundId: res.id }
}

// ---- Read advances and refunds ----

export async function listAdmissionAdvances(
  admissionId: string
): Promise<AdmissionAdvance[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('admission_advances')
    .select('*, receiver:profiles(id, full_name)')
    .eq('admission_id', admissionId)
    .order('received_at', { ascending: false })
  return (data ?? []) as unknown as AdmissionAdvance[]
}

export async function listAdmissionsWithOutstandingBalance(): Promise<Array<{
  id: string; patient_name: string; ward_name: string; admitted_at: string; balanceDue: number
}>> {
  const supabase = await createClient()

  const { data: admissions } = await supabase
    .from('admissions')
    .select(`id, admitted_at, patient:patients(full_name), ward:wards(name)`)
    .eq('status', 'admitted')
    .order('admitted_at', { ascending: false })

  const result = []
  for (const a of admissions ?? []) {
    const financials = await getAdmissionFinancials(a.id)
    if (financials.balanceDue > 0) {
      result.push({
        id: a.id,
        patient_name: (a.patient as unknown as { full_name: string } | null)?.full_name ?? '',
        ward_name: (a.ward as unknown as { name: string } | null)?.name ?? '',
        admitted_at: a.admitted_at as string,
        balanceDue: financials.balanceDue,
      })
    }
  }
  return result
}

export async function getAdmissionAdvanceReceipt(
  admissionId: string
): Promise<AdvanceReceiptData | null> {
  const actor = await getActorProfile()
  const supabase = await createClient()

  const { data: adm } = await supabase
    .from('admissions')
    .select('id, ip_no, admitted_at, combined_bill_no, patient:patients(full_name, uhid, phone), ward:wards(name), bed:beds(bed_no)')
    .eq('id', admissionId)
    .single()
  if (!adm) return null

  const { data: advances } = await supabase
    .from('admission_advances')
    .select('id, amount, method, received_at, receiver:profiles(id, full_name)')
    .eq('admission_id', admissionId)
    .order('received_at', { ascending: true })

  const { data: tenantRow } = await supabase
    .from('tenants').select('name').eq('id', actor.tenant_id).single()
  const tenantName = (tenantRow?.name as string | null) ?? 'Hospital'

  type ARow = { full_name: string; uhid: string; phone: string | null }
  const p = (adm.patient as unknown as ARow | null)
  if (!p) return null

  const payments = ((advances ?? []) as unknown as Array<{
    id: string; amount: number; method: string; received_at: string
    receiver: { full_name: string } | null
  }>).map((a) => ({
    id: a.id,
    received_at: a.received_at,
    amount: a.amount,
    method: a.method,
    receiverName: a.receiver?.full_name ?? null,
  }))

  return {
    tenantName,
    patient: { full_name: p.full_name, uhid: p.uhid, phone: p.phone },
    admission: {
      id: admissionId,
      ip_no: (adm.ip_no as string | null) ?? null,
      admitted_at: adm.admitted_at as string,
      ward: (adm.ward as unknown as { name: string } | null)?.name ?? null,
      bed: (adm.bed as unknown as { bed_no: string } | null)?.bed_no ?? null,
      combined_bill_no: (adm.combined_bill_no as string | null) ?? null,
    },
    payments,
    totalCollected: payments.reduce((s, pmt) => s + pmt.amount, 0),
  }
}

// ---- Issue advance refund as a negative bill ----

export async function issueAdvanceRefundBill(params: {
  admissionId: string
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
  reference?: string
}): Promise<{ success: true; billId: string } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const supabase = await createClient()
  const { admissionId, method, reference } = params

  // 1. Admission must be discharged
  const { data: adm } = await supabase.from('admissions').select('status, patient_id').eq('id', admissionId).single()
  if (!adm) return { success: false, error: 'Admission not found' }
  if ((adm.status as string) !== 'discharged') return { success: false, error: 'Patient must be discharged before issuing a refund' }

  // 2. No existing refund bill for this admission.
  // Cancelled ones don't count — step 5 voids rather than deletes on failure
  // precisely so a retry stays possible, and the old guard ignored status and
  // blocked it. It also used maybeSingle(), which errors on two or more rows
  // and left `existing` null, so the guard failed OPEN in the one case it
  // most needed to hold. A partial unique index (0242) now backs it up.
  const { data: existing, error: existErr } = await supabase
    .from('bills').select('id')
    .eq('admission_id', admissionId)
    .eq('bill_source', 'advance_refund')
    .not('status', 'eq', 'cancelled')
    .limit(1)
  if (existErr) return { success: false, error: existErr.message }
  if (existing && existing.length > 0)
    return { success: false, error: 'A refund bill has already been issued for this admission' }

  // 3. Calculate refund amount
  const financials = await getAdmissionFinancials(admissionId)
  const refundAmount = Math.round(financials.unusedAdvance * 100) / 100
  if (refundAmount <= 0) return { success: false, error: 'No excess advance to refund' }

  // 4. Get next bill number
  const { data: billNoData } = await supabase.rpc('get_next_bill_no')
  if (!billNoData) return { success: false, error: 'Failed to generate bill number' }
  const billNo = billNoData as string

  const billId = crypto.randomUUID()
  const today = istToday()

  // 5. Create negative bill (amount is negative — money going out)
  const { error: billErr } = await supabase.from('bills').insert({
    id:            billId,
    tenant_id:     actor.tenant_id,
    patient_id:    adm.patient_id as string,
    admission_id:  admissionId,
    bill_no:       billNo,
    billing_date:  today,
    subtotal:      -refundAmount,
    discount:      0,
    tax:           0,
    total:         -refundAmount,
    paid:          -refundAmount,
    status:        'paid',
    bill_source:   'advance_refund',
    created_by:    actor.id,
  })
  if (billErr) return { success: false, error: billErr.message }

  // 6. Create the single line item
  const { error: itemErr } = await supabase.from('bill_items').insert({
    id:          crypto.randomUUID(),
    tenant_id:   actor.tenant_id,
    bill_id:     billId,
    source:      'manual',
    description: 'Excess Advance Refund',
    qty:         1,
    unit_price:  -refundAmount,
    amount:      -refundAmount,
  })
  if (itemErr) {
    // Void, don't delete (invoice series) — and so a retry isn't blocked as "already issued".
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
    return { success: false, error: itemErr.message }
  }

  // 7. Record outgoing payment entry for audit trail
  const { error: payErr } = await supabase.from('payments').insert({
    id:          crypto.randomUUID(),
    tenant_id:   actor.tenant_id,
    bill_id:     billId,
    amount:      -refundAmount,
    method,
    reference:   reference ?? null,
    received_by: actor.id,
  })
  if (payErr) {
    await supabase.from('bills').update({ status: 'cancelled' }).eq('id', billId)
    return { success: false, error: payErr.message }
  }

  await logAudit(actor.id, 'refund', 'bill', billId, { admissionId, refundAmount, method })
  return { success: true, billId }
}
