'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireModule, requireWriteAccess } from '@/lib/server-utils'
import type { IpdBillingConfig, IpdCustomCharge } from '@/lib/types'

type SimpleResult = { success: true } | { success: false; error: string }

export async function getIpdConfig(): Promise<IpdBillingConfig | null> {
  const supabase = await createClient()
  const actor = await getActorProfile()
  const { data } = await supabase
    .from('ipd_billing_config')
    .select('*')
    .eq('tenant_id', actor.tenant_id)
    .maybeSingle()
  return data as IpdBillingConfig | null
}

export async function updateIpdConfig(
  input: Partial<Omit<IpdBillingConfig, 'tenant_id' | 'updated_at'>>
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  const supabase = await createClient()
  const { error } = await supabase
    .from('ipd_billing_config')
    .upsert({ tenant_id: actor.tenant_id, ...input, updated_at: new Date().toISOString() })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'ipd_billing_config', actor.tenant_id, input)
  return { success: true }
}

export async function getAdvancePercentage(): Promise<number> {
  const supabase = await createClient()
  const actor = await getActorProfile()
  const { data } = await supabase
    .from('tenants')
    .select('advance_percentage')
    .eq('id', actor.tenant_id)
    .single()
  return (data?.advance_percentage as number) ?? 50
}

export async function setAdvancePercentage(percent: number): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  if (percent < 0 || percent > 100)
    return { success: false, error: 'Percentage must be between 0 and 100' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tenants')
    .update({ advance_percentage: percent })
    .eq('id', actor.tenant_id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'advance_percentage', actor.tenant_id, { percent })
  return { success: true }
}

// ---- Custom daily charge line items ----------------------------------------

export async function listCustomCharges(): Promise<IpdCustomCharge[]> {
  const supabase = await createClient()
  const actor = await getActorProfile()
  const { data } = await supabase
    .from('ipd_custom_charges')
    .select('*')
    .eq('tenant_id', actor.tenant_id)
    .order('created_at', { ascending: true })
  return (data ?? []) as IpdCustomCharge[]
}

export async function createCustomCharge(
  name: string,
  amount: number
): Promise<{ success: true; charge: IpdCustomCharge } | { success: false; error: string }> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  if (!name.trim()) return { success: false, error: 'Name is required' }
  if (amount < 0)   return { success: false, error: 'Amount cannot be negative' }

  const id = crypto.randomUUID()
  const supabase = await createClient()
  const { error } = await supabase.from('ipd_custom_charges').insert({
    id,
    tenant_id: actor.tenant_id,
    name:      name.trim(),
    amount,
  })
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'create', 'ipd_custom_charge', id, { name, amount })
  const { data } = await supabase.from('ipd_custom_charges').select('*').eq('id', id).single()
  return { success: true, charge: data as IpdCustomCharge }
}

export async function updateCustomCharge(
  id: string,
  input: Partial<{ name: string; amount: number; is_active: boolean }>
): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  if (input.name !== undefined && !input.name.trim())
    return { success: false, error: 'Name is required' }
  if (input.amount !== undefined && input.amount < 0)
    return { success: false, error: 'Amount cannot be negative' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('ipd_custom_charges')
    .update(input)
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'update', 'ipd_custom_charge', id, input)
  return { success: true }
}

export async function deleteCustomCharge(id: string): Promise<SimpleResult> {
  await requireWriteAccess()
  await requireModule('ipd')
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'ipd:config')

  const supabase = await createClient()
  const { error } = await supabase
    .from('ipd_custom_charges')
    .delete()
    .eq('id', id)
  if (error) return { success: false, error: error.message }

  await logAudit(actor.id, 'delete', 'ipd_custom_charge', id, {})
  return { success: true }
}
