import { createServiceClient } from '@/lib/supabase/service'
import { planHasModule, type PlanKey, type TenantStatus } from '@/lib/plans'

// Short-lived cache: IPD billing checks run many times per request / cron sweep.
const CACHE_MS = 60_000
const cache = new Map<string, { ok: boolean; at: number }>()

/**
 * Whether a tenant's plan includes IPD (trial includes everything). Every IPD
 * bill is created through autoIpdBill / syncNursingBillLine, which call this, so
 * a hospital on a plan without IPD (e.g. Starter after its trial) never gets IPD
 * charges — from the nightly job, the ward board, orders, OT, blood bank or
 * nursing. Reads the tenant with the service client (tenants isn't readable via
 * RLS for tenant users) so it works in both session and headless contexts.
 */
export async function tenantHasIpd(tenantId: string): Promise<boolean> {
  const hit = cache.get(tenantId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok
  const { data } = await createServiceClient()
    .from('tenants').select('plan, status').eq('id', tenantId).maybeSingle()
  const ok = !!data && planHasModule((data.plan ?? 'starter') as PlanKey, (data.status ?? 'trial') as TenantStatus, 'ipd')
  cache.set(tenantId, { ok, at: Date.now() })
  return ok
}
