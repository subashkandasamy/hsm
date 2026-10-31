import { createServiceClient } from '@/lib/supabase/service'
import { planHasModule, type PlanKey, type TenantStatus } from '@/lib/plans'

// Short-lived cache: these checks run many times per request / cron sweep.
const CACHE_MS = 60_000
const cache = new Map<string, { ok: boolean; at: number }>()

/**
 * Whether a tenant's plan includes a module, read from the database rather than
 * from request headers (trial includes everything).
 *
 * `hasModule` in server-utils reads `x-tenant-plan` off the request, which only
 * exists when a signed-in user's request has passed through the proxy. Headless
 * callers have no such header: the nightly cron, and every `/api/device/*`
 * route, which the proxy deliberately skips because a connector carries a
 * bearer token and no cookie. Those callers must ask the database, which is
 * what this does — with the service client, since `tenants` is not readable
 * through RLS by tenant users.
 */
export async function tenantHasModule(tenantId: string, moduleKey: string): Promise<boolean> {
  const key = `${tenantId}:${moduleKey}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok
  const { data } = await createServiceClient()
    .from('tenants').select('plan, status').eq('id', tenantId).maybeSingle()
  const ok = !!data && planHasModule(
    (data.plan ?? 'starter') as PlanKey,
    (data.status ?? 'trial') as TenantStatus,
    moduleKey,
  )
  cache.set(key, { ok, at: Date.now() })
  return ok
}
