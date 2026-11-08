'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { getPrepayRules, rulesFromRow, DEFAULT_PREPAY, PREPAY_COLUMNS, type PayGateService, type PrepayRules } from '@/lib/payGate'

type SimpleResult = { success: true } | { success: false; error: string }

const SERVICES: readonly PayGateService[] = ['consultation', 'lab', 'radiology', 'pharmacy', 'blood']

/** PostgREST's answers when the table does not exist yet — migration 0265 not applied. */
const isMissingTable = (code?: string) => code === '42P01' || code === 'PGRST205'
const NOT_APPLIED = 'This setting needs a database update that has not been applied yet (migration 0265). Until then every service is paid for first, as before.'

/** The pay-before rules for the settings page, and whether they could be read at all. */
export async function getBillingRules(): Promise<{ rules: PrepayRules; readable: boolean }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('billing_settings').select(PREPAY_COLUMNS).eq('tenant_id', actor.tenant_id).maybeSingle()
  if (error) {
    console.error('[billingSettings] read failed:', error.message)
    return { rules: { ...DEFAULT_PREPAY }, readable: false }
  }
  return { rules: rulesFromRow(data), readable: true }
}

/** Change which services wait for payment. Only the services named are changed. */
export async function updatePrepayRules(input: Partial<Record<PayGateService, boolean>>): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')

  const changes: Partial<PrepayRules> = {}
  for (const s of SERVICES) {
    const v = (input as Record<string, unknown>)[s]
    if (v === undefined) continue
    if (typeof v !== 'boolean') return { success: false, error: `Invalid value for ${s}` }
    changes[s] = v
  }
  if (!Object.keys(changes).length) return { success: false, error: 'Nothing to change' }

  const supabase = await createClient()
  const before = await getPrepayRules(supabase, actor.tenant_id)
  const after: PrepayRules = { ...before, ...changes }

  const { error } = await supabase.from('billing_settings').upsert({
    tenant_id:           actor.tenant_id,
    prepay_consultation: after.consultation,
    prepay_lab:          after.lab,
    prepay_radiology:    after.radiology,
    prepay_pharmacy:     after.pharmacy,
    prepay_blood:        after.blood,
    updated_at:          new Date().toISOString(),
    updated_by:          actor.id,
  }, { onConflict: 'tenant_id' })
  if (error) return { success: false, error: isMissingTable(error.code) ? NOT_APPLIED : error.message }

  await logAudit(actor.id, 'update', 'billing_settings', actor.tenant_id, { prepay_before: before, prepay_after: after })
  return { success: true }
}

/**
 * Whether this hospital makes a service wait for payment — for a screen that
 * shows "awaiting payment" so it says exactly what its gate will do. Any
 * logged-in member of staff may ask; the row is read through RLS, so it is
 * always the caller's own hospital.
 */
export async function getPayFirst(service: PayGateService): Promise<boolean> {
  if (!SERVICES.includes(service)) return true
  const actor = await getActorProfile()
  const supabase = await createClient()
  return (await getPrepayRules(supabase, actor.tenant_id))[service]
}
