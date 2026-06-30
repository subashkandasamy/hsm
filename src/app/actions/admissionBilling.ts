'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile } from '@/lib/server-utils'
import type { AdmissionAdvance, AdmissionAdvanceRefund, AdmissionFinancials } from '@/lib/types'

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
    .select('total, paid')
    .eq('admission_id', admissionId)
    .not('status', 'eq', 'cancelled')
  const totalBilled = (bills ?? []).reduce((s, b) => s + (b.total as number), 0)
  const totalPaid   = (bills ?? []).reduce((s, b) => s + (b.paid as number), 0)

  const advanceSpent = totalAdvance - totalRefunded
  const balanceDue = Math.max(0, totalBilled - totalPaid)
  const unusedAdvance = Math.max(0, advanceSpent - totalPaid)

  return { totalAdvance, totalBilled, totalPaid, balanceDue, unusedAdvance }
}

// ---- Apply advance credit to a specific bill ----

export async function applyAdvanceToBill(
  billId: string,
  admissionId: string
): Promise<SimpleResult> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:advance')

  const supabase = await createClient()

  const { data: bill } = await supabase
    .from('bills').select('total, paid, status').eq('id', billId).single()
  if (!bill) return { success: false, error: 'Bill not found' }
  if (bill.status === 'paid' || bill.status === 'cancelled')
    return { success: false, error: 'Bill is already paid or cancelled' }

  const financials = await getAdmissionFinancials(admissionId)
  const remaining = financials.unusedAdvance
  if (remaining <= 0) return { success: true } // no advance to apply

  const billBalance = (bill.total as number) - (bill.paid as number)
  const applyAmount = Math.min(remaining, billBalance)
  if (applyAmount <= 0) return { success: true }

  const { error: payErr } = await supabase.from('payments').insert({
    id: crypto.randomUUID(),
    tenant_id: actor.tenant_id,
    bill_id: billId,
    amount: applyAmount,
    method: 'advance',
    received_by: actor.id,
  })
  if (payErr) return { success: false, error: payErr.message }

  const newPaid = (bill.paid as number) + applyAmount
  const newStatus = newPaid >= (bill.total as number) ? 'paid' : 'partial'
  await supabase.from('bills').update({ paid: newPaid, status: newStatus }).eq('id', billId)

  await logAudit(actor.id, 'apply_advance', 'bill', billId, { amount: applyAmount, admissionId })
  return { success: true }
}

// ---- Generate daily bills for all admitted patients (called by cron/scheduler) ----

export async function generateDailyAdmissionBills(): Promise<{
  processed: number
  errors: string[]
}> {
  const supabase = await createClient()
  const errors: string[] = []
  let processed = 0

  const { data: admissions } = await supabase
    .from('admissions')
    .select('id, patient_id, tenant_id, ward_id, admitted_at, ward:wards(daily_rate, name)')
    .eq('status', 'admitted')

  for (const admission of admissions ?? []) {
    const ward = admission.ward as unknown as { daily_rate: number; name: string } | null
    const rate = ward?.daily_rate ?? 0
    if (rate === 0) continue

    // Generate bill number
    const { data: billNoData, error: billNoErr } = await supabase.rpc('get_next_bill_no')
    if (billNoErr || !billNoData) {
      errors.push(`${admission.id}: failed to get bill number`)
      continue
    }

    const billId = crypto.randomUUID()
    const today = new Date().toISOString().split('T')[0]

    const { error: billErr } = await supabase.from('bills').insert({
      id: billId,
      tenant_id: admission.tenant_id,
      patient_id: admission.patient_id,
      admission_id: admission.id,
      bill_no: billNoData as string,
      subtotal: rate,
      discount: 0,
      tax: 0,
      total: rate,
      paid: 0,
      status: 'unpaid',
      created_by: null,
    })
    if (billErr) {
      errors.push(`${admission.id}: ${billErr.message}`)
      continue
    }

    await supabase.from('bill_items').insert({
      id: crypto.randomUUID(),
      tenant_id: admission.tenant_id,
      bill_id: billId,
      source: 'bed',
      ref_id: admission.id,
      description: `Bed charge — ${ward?.name ?? 'Ward'} (${today})`,
      qty: 1,
      unit_price: rate,
      amount: rate,
    })

    // Immediately apply any available advance credit
    await applyAdvanceToBill(billId, admission.id).catch(() => {})
    processed++
  }

  return { processed, errors }
}

// ---- Advance refund ----

export async function recordAdvanceRefund(params: {
  admissionId: string
  amount: number
  method: 'cash' | 'card' | 'upi' | 'bank_transfer'
}): Promise<{ success: true; refundId: string } | { success: false; error: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:advance')

  const { admissionId, amount, method } = params
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' }

  const financials = await getAdmissionFinancials(admissionId)
  if (amount > financials.unusedAdvance) {
    return {
      success: false,
      error: `Cannot refund ₹${amount} — only ₹${financials.unusedAdvance.toFixed(2)} unused advance available`,
    }
  }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('admission_advance_refunds').insert({
    id,
    tenant_id: actor.tenant_id,
    admission_id: admissionId,
    amount,
    method,
    refunded_by: actor.id,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'refund', 'admission_advance', id, { admissionId, amount, method })
  return { success: true, refundId: id }
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
