/**
 * Doses given from an SOS (as-needed) order — KMCH's drug chart "STAT
 * (PRN/SOS) ORDER" table: date, drug, dose, time, route, given by, checked by.
 *
 * An SOS order has no planned dose slots (src/app/actions/ipdTreatment.ts
 * makeSlots), so each dose is written when it is given: one ipd_admin_schedule
 * row, already 'given'. The drug chart, the ICU day sheet and the A3 print read
 * it like any other dose. The round uses the same path when insulin is given by
 * the sliding scale, so the sugar chart and the drug chart never disagree.
 *
 * Server-only helpers (they take the caller's Supabase client and actor); the
 * permission checks stay in the server actions that call them.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertTreatmentStarted } from '@/app/actions/ipdDeclaration'

type Actor = { id: string; tenant_id: string }
export type SosDosePlan = {
  ok: true; orderId: string; admissionId: string; givenAt: Date
  checkedBy: string | null; notes: string | null; label: string
}

/** The second person who checked the dose: a different, active nurse / doctor / admin of this hospital. */
export async function resolveChecker(supabase: SupabaseClient, actor: Actor, checkedBy?: string | null): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (!checkedBy) return { ok: true, id: null }
  if (checkedBy === actor.id) return { ok: false, error: 'The person who checks the dose cannot be the one giving it.' }
  const { data: checker } = await supabase.from('profiles').select('id, role, is_active')
    .eq('id', checkedBy).eq('tenant_id', actor.tenant_id).maybeSingle()
  if (!checker?.is_active || !['nurse', 'doctor', 'admin'].includes(checker.role as string)) {
    return { ok: false, error: 'Choose a nurse or doctor of this hospital to check the dose.' }
  }
  return { ok: true, id: checker.id as string }
}

/** The pharmacy has dispensed this order (oxygen needs no pharmacy). */
export async function pharmacyDispensed(supabase: SupabaseClient, orderId: string, orderType: string | null | undefined): Promise<boolean> {
  if (!orderType || orderType === 'oxygen') return true
  const { data } = await supabase.from('ipd_pharmacy_requests').select('status').eq('order_id', orderId).neq('status', 'cancelled')
  return (data ?? []).some((r) => (r.status as string) === 'dispensed')
}

/** Everything checked before anything is written — so a refused dose leaves nothing half-saved. */
export async function planSosDose(supabase: SupabaseClient, actor: Actor, orderId: string, input: {
  given_at?: string | Date | null; dose?: string | null; checked_by?: string | null; notes?: string | null
}): Promise<SosDosePlan | { ok: false; error: string }> {
  const { data: order } = await supabase.from('ipd_medication_orders')
    .select('id, admission_id, type, status, frequency_type, drug_name, dose, dose_unit, route, created_at')
    .eq('id', orderId).maybeSingle()
  if (!order) return { ok: false, error: 'Order not found' }
  if (order.frequency_type !== 'sos') return { ok: false, error: 'Only an SOS (as needed) order is given this way — scheduled doses are marked on their slot.' }
  if (order.status !== 'active') return { ok: false, error: 'This order has been stopped.' }

  const gate = await assertTreatmentStarted(order.admission_id as string, { allowDischarged: true })
  if (!gate.success) return { ok: false, error: gate.error }

  const givenAt = input.given_at ? new Date(input.given_at) : new Date()
  if (Number.isNaN(givenAt.getTime())) return { ok: false, error: 'Not a valid time' }
  if (givenAt.getTime() > Date.now() + 2 * 60_000) return { ok: false, error: 'The time given is in the future' }
  if (givenAt.getTime() < new Date(order.created_at as string).getTime() - 5 * 60_000) return { ok: false, error: 'That is before the drug was ordered' }
  const { data: adm } = await supabase.from('admissions').select('status, discharged_at').eq('id', order.admission_id).maybeSingle()
  if (adm?.status !== 'admitted' && (!adm?.discharged_at || givenAt.getTime() > new Date(adm.discharged_at as string).getTime())) {
    return { ok: false, error: 'This patient has been discharged — only a dose given before discharge can be charted.' }
  }

  if (!(await pharmacyDispensed(supabase, orderId, order.type as string))) {
    return { ok: false, error: 'Pharmacy has not dispensed this medication yet. The dose cannot be charted as given until it is dispensed.' }
  }
  const checker = await resolveChecker(supabase, actor, input.checked_by)
  if (!checker.ok) return checker

  const dose = input.dose?.trim().slice(0, 60) || (order.dose != null ? `${order.dose} ${order.dose_unit ?? ''}`.trim() : null)
  const notes = [dose, input.notes?.trim().slice(0, 200) || null].filter(Boolean).join(' — ') || null
  return {
    ok: true, orderId, admissionId: order.admission_id as string, givenAt,
    checkedBy: checker.id, notes, label: [order.drug_name, order.route].filter(Boolean).join(' '),
  }
}

/** Write the planned dose: one schedule row, already given. */
export async function writeSosDose(supabase: SupabaseClient, actor: Actor, plan: SosDosePlan): Promise<{ ok: true; scheduleId: string } | { ok: false; error: string }> {
  const id = crypto.randomUUID()
  const at = plan.givenAt.toISOString()
  const { error } = await supabase.from('ipd_admin_schedule').insert({
    id, tenant_id: actor.tenant_id, order_id: plan.orderId, admission_id: plan.admissionId,
    due_at: at, status: 'given', given_at: at, given_by: actor.id, given_notes: plan.notes, checked_by: plan.checkedBy,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, scheduleId: id }
}
