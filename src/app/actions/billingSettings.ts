'use server'

import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac'
import { getActorProfile, requireWriteAccess } from '@/lib/server-utils'
import { getPrepayRules, rulesFromRow, DEFAULT_PREPAY, PREPAY_COLUMNS, type PayGateService, type PrepayRules } from '@/lib/payGate'
import { loadCollectionSetup } from '@/lib/billing/collectionPlan'
import { isDepartmentKey } from '@/lib/billing/collectionAccounts'
import type { InsuranceBankAccount } from '@/lib/types'

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

// ── Collection accounts (0267) ──────────────────────────────────────────────

export interface CollectionSetup {
  /** The UPI id on the hospital profile: where everything goes unless a department is pointed elsewhere. */
  main: { vpa: string | null; payeeName: string }
  accounts: InsuranceBankAccount[]
  /** department → account id. Missing = main. */
  routes: Record<string, string>
}

/** The accounts and which department goes where, for the settings page. */
export async function getCollectionSetup(): Promise<{ setup: CollectionSetup | null; error?: string }> {
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  const supabase = await createClient()
  try {
    const s = await loadCollectionSetup(supabase, actor.tenant_id)
    return { setup: { main: { vpa: s.main.vpa, payeeName: s.main.payeeName }, accounts: s.accounts, routes: s.routes } }
  } catch (e) {
    console.error('[billingSettings] collection setup read failed:', (e as Error).message)
    return { setup: null, error: 'The accounts cannot be loaded yet — a database update for this section (migration 0267) still needs to be applied.' }
  }
}

/** Point a department at an account, or back at the main account (accountId null). */
export async function setDepartmentAccount(department: string, accountId: string | null): Promise<SimpleResult> {
  await requireWriteAccess()
  const actor = await getActorProfile()
  await requirePermission(actor.role, 'settings:write')
  if (!isDepartmentKey(department)) return { success: false, error: 'Unknown department' }
  if (accountId !== null && (typeof accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(accountId))) {
    return { success: false, error: 'Unknown account' }
  }

  const supabase = await createClient()
  const { data: before } = await supabase.from('collection_account_routes')
    .select('account_id').eq('tenant_id', actor.tenant_id).eq('department', department).maybeSingle()

  if (accountId === null) {
    const { error } = await supabase.from('collection_account_routes')
      .delete().eq('tenant_id', actor.tenant_id).eq('department', department)
    if (error) return { success: false, error: error.message }
  } else {
    const { data: acct } = await supabase.from('insurance_bank_accounts')
      .select('id, is_active').eq('id', accountId).eq('tenant_id', actor.tenant_id).maybeSingle()
    if (!acct) return { success: false, error: 'That account was not found' }
    if (!acct.is_active) return { success: false, error: 'That account is inactive. Make it active first.' }
    // .select() so a write RLS refused is not reported as saved.
    const { data, error } = await supabase.from('collection_account_routes').upsert({
      tenant_id: actor.tenant_id, department, account_id: accountId,
      updated_at: new Date().toISOString(), updated_by: actor.id,
    }, { onConflict: 'tenant_id,department' }).select('department')
    if (error) return { success: false, error: error.message }
    if (!data?.length) return { success: false, error: 'Not saved — only an active admin can change this.' }
  }

  await logAudit(actor.id, 'update', 'collection_account_route', department, {
    department, account_before: before?.account_id ?? 'main', account_after: accountId ?? 'main',
  })
  return { success: true }
}
