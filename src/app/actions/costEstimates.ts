'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { CostEstimateSchema } from '@/lib/schemas'
import type { CostEstimate } from '@/lib/types'

type CreateResult = { success: true; id: string } | { success: false; error: string }
type SimpleResult = { success: true } | { success: false; error: string }

function totalsFor(items: { qty: number; unit_price: number }[]): number {
  return items.reduce((s, i) => s + i.qty * i.unit_price, 0)
}

export async function listEstimates(): Promise<CostEstimate[]> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  const { data } = await supabase
    .from('cost_estimates')
    .select('*, patient:patients(id, full_name, uhid, phone)')
    .order('created_at', { ascending: false })
    .limit(500)
  return (data ?? []) as unknown as CostEstimate[]
}

export async function getEstimate(id: string): Promise<CostEstimate | null> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:read')
  const supabase = await createClient()
  const { data } = await supabase
    .from('cost_estimates')
    .select('*, patient:patients(id, full_name, uhid, phone), items:cost_estimate_items(*)')
    .eq('id', id)
    .single()
  return data as unknown as CostEstimate | null
}

export async function createEstimate(input: Record<string, unknown>): Promise<CreateResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const parsed = CostEstimateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data: noData, error: noErr } = await supabase.rpc('get_next_estimate_no')
  if (noErr || !noData) return { success: false, error: 'Failed to generate estimate number' }

  const id = crypto.randomUUID()
  const subtotal = totalsFor(d.items)

  const { error: estErr } = await supabase.from('cost_estimates').insert({
    id,
    tenant_id: actor.tenant_id,
    estimate_no: noData as string,
    patient_id: d.patient_id ?? null,
    patient_name: d.patient_name?.trim() || null,
    patient_phone: d.patient_phone?.trim() || null,
    admission_id: d.admission_id ?? null,
    room_type: d.room_type?.trim() || null,
    estimated_days: d.estimated_days ?? null,
    validity_date: d.validity_date || null,
    notes: d.notes?.trim() || null,
    subtotal,
    total: subtotal,
    status: 'draft',
    created_by: actor.id,
  })
  if (estErr) return { success: false, error: estErr.message }

  const { error: itemErr } = await supabase.from('cost_estimate_items').insert(
    d.items.map((i) => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      estimate_id: id,
      category: i.category,
      description: i.description,
      qty: i.qty,
      unit_price: i.unit_price,
      amount: i.qty * i.unit_price,
    })),
  )
  if (itemErr) {
    await supabase.from('cost_estimates').delete().eq('id', id)
    return { success: false, error: itemErr.message }
  }

  await logAudit(actor.id, 'create', 'cost_estimate', id, { estimate_no: noData, subtotal })
  return { success: true, id }
}

export async function updateEstimate(id: string, input: Record<string, unknown>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')

  const parsed = CostEstimateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data: existing } = await supabase.from('cost_estimates').select('status').eq('id', id).single()
  if (!existing) return { success: false, error: 'Estimate not found' }
  if ((existing.status as string) === 'final') return { success: false, error: 'A finalised estimate cannot be edited' }

  const subtotal = totalsFor(d.items)
  const { error: updErr } = await supabase.from('cost_estimates').update({
    patient_id: d.patient_id ?? null,
    patient_name: d.patient_name?.trim() || null,
    patient_phone: d.patient_phone?.trim() || null,
    admission_id: d.admission_id ?? null,
    room_type: d.room_type?.trim() || null,
    estimated_days: d.estimated_days ?? null,
    validity_date: d.validity_date || null,
    notes: d.notes?.trim() || null,
    subtotal,
    total: subtotal,
  }).eq('id', id)
  if (updErr) return { success: false, error: updErr.message }

  // Replace line items wholesale.
  await supabase.from('cost_estimate_items').delete().eq('estimate_id', id)
  const { error: itemErr } = await supabase.from('cost_estimate_items').insert(
    d.items.map((i) => ({
      id: crypto.randomUUID(),
      tenant_id: actor.tenant_id,
      estimate_id: id,
      category: i.category,
      description: i.description,
      qty: i.qty,
      unit_price: i.unit_price,
      amount: i.qty * i.unit_price,
    })),
  )
  if (itemErr) return { success: false, error: itemErr.message }

  await logAudit(actor.id, 'update', 'cost_estimate', id, { subtotal })
  return { success: true }
}

export async function finalizeEstimate(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')
  const supabase = await createClient()
  const { error } = await supabase.from('cost_estimates').update({ status: 'final' }).eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'finalize', 'cost_estimate', id)
  return { success: true }
}

export async function deleteEstimate(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'billing:write')
  const supabase = await createClient()
  const { error } = await supabase.from('cost_estimates').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  await logAudit(actor.id, 'delete', 'cost_estimate', id)
  return { success: true }
}
